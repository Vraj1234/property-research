import { NextRequest, NextResponse } from "next/server";
import { cleanRawMarkdown } from "@/lib/research";

export const runtime = "nodejs";

/**
 * Researches an address via Google AI Mode (SerpApi) and lightly reformats the
 * answer for display — same structure and wording AI Mode gave, just with
 * citation clutter and chat filler removed and key values highlighted. Starts
 * a continuable conversation so /api/property-chat can ask follow-ups.
 */
export async function POST(req: NextRequest) {
  let body: { address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) {
    return NextResponse.json({ error: "An address is required." }, { status: 400 });
  }

  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    return NextResponse.json({ error: "API key is not configured." }, { status: 500 });
  }

  try {
    const query = [
      `${address} property details.`,
      "Number of bedrooms/rooms, square footage, year built,",
      "current owner name(s), mortgage lender (mortgagee),",
      "heating and cooling system type, most recent annual property tax amount,",
      "and distance to the nearest fire hydrant and nearest fire station.",
      "Check sources like Redfin, Realtor.com, Zillow, and county property records.",
    ].join(" ");

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_ai_mode");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", serpApiKey);
    url.searchParams.set("continuable", "true");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`SerpApi request failed (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data: { reconstructed_markdown?: string; subsequent_request_token?: string } = await res.json();
    if (!data.reconstructed_markdown) {
      throw new Error("Google AI Mode returned no content for this address.");
    }

    const cleaned = await cleanRawMarkdown(data.reconstructed_markdown);

    return NextResponse.json({
      address,
      markdown: cleaned,
      subsequentRequestToken: data.subsequent_request_token ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[raw-test]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
