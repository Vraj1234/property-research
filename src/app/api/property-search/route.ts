import { NextRequest, NextResponse } from "next/server";
import { researchAddress } from "@/lib/serpapi";
import { structureReport } from "@/lib/openai";
import { validateAddress } from "@/lib/validateAddress";
import type { PropertySearchResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { address?: unknown; verified?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  // True only when the client picked this address from the autocomplete dropdown —
  // i.e. it's already a real, complete address from the geocoder, so we skip the
  // "does this look complete" heuristic instead of re-guessing at something we
  // already know for a fact.
  const isPreVerified = body.verified === true;

  if (!address) {
    return NextResponse.json({ error: "An address is required." }, { status: 400 });
  }
  if (address.length > 300) {
    return NextResponse.json({ error: "That address looks too long." }, { status: 400 });
  }

  if (!isPreVerified) {
    const validation = validateAddress(address);
    if (!validation.isComplete) {
      return NextResponse.json(
        { error: validation.reason, incomplete: true },
        { status: 400 },
      );
    }
  }

  try {
    const research = await researchAddress(address);
    const report = await structureReport(
      address,
      research.taggedText,
      research.nameToUrl,
      research.suspectEntities,
    );

    const payload: PropertySearchResponse = {
      address,
      report,
      generatedAt: new Date().toISOString(),
      subsequentRequestToken: research.subsequentRequestToken,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error while researching this address.";
    console.error("[property-search]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
