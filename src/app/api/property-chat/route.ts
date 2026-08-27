import { NextRequest, NextResponse } from "next/server";
import { cleanRawMarkdown } from "@/lib/research";

export const runtime = "nodejs";

/** Follow-up questions about a researched property — continues the same Google
 * AI Mode conversation via subsequent_request_token, formatted the same way
 * as the initial /api/property-search answer. */
export async function POST(req: NextRequest) {
  let body: { question?: unknown; subsequentRequestToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const subsequentRequestToken =
    typeof body.subsequentRequestToken === "string" ? body.subsequentRequestToken : "";

  if (!question) {
    return NextResponse.json({ error: "Ask something first." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }
  if (!subsequentRequestToken) {
    return NextResponse.json(
      { error: "Search an address first so there's a property to ask about." },
      { status: 400 },
    );
  }

  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    return NextResponse.json({ error: "API key is not configured." }, { status: 500 });
  }

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_ai_mode");
    url.searchParams.set("q", question);
    url.searchParams.set("api_key", serpApiKey);
    url.searchParams.set("continuable", "true");
    url.searchParams.set("subsequent_request_token", subsequentRequestToken);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`SerpApi request failed (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data: { reconstructed_markdown?: string; subsequent_request_token?: string } = await res.json();
    if (!data.reconstructed_markdown) {
      throw new Error("Google AI Mode returned no content for that question.");
    }

    const cleaned = await cleanRawMarkdown(data.reconstructed_markdown);

    return NextResponse.json({
      answer: cleaned,
      subsequentRequestToken: data.subsequent_request_token ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[raw-test-chat]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
