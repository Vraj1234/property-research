import { NextRequest, NextResponse } from "next/server";
import type { AddressSuggestion } from "@/lib/types";

export const runtime = "nodejs";

// Free address autocomplete via OpenStreetMap's Nominatim — no API key required.
// We proxy server-side because Nominatim's usage policy requires a real
// identifying User-Agent, which browsers won't let us set from client JS.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "parcel-property-lookup/1.0 (contact: vrajr@uw.edu)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const results: Array<{ display_name: string; lat: string; lon: string }> = await res.json();

    const suggestions: AddressSuggestion[] = results.map((r) => ({
      label: r.display_name,
      lat: r.lat,
      lon: r.lon,
    }));

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[geocode]", err);
    return NextResponse.json({ suggestions: [] });
  }
}
