const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

interface SerpApiReference {
  title?: string;
  link?: string;
  source?: string;
  snippet?: string;
  index?: number;
}

interface SerpApiAiModeResponse {
  reconstructed_markdown?: string;
  references?: SerpApiReference[];
  subsequent_request_token?: string;
}

/** A resolved link for a source name. `exact` is false when SerpApi only gave us
 * a bare root domain (e.g. "zillow.com") rather than the actual page it drew from —
 * in that case `url` points to a site-scoped search instead of pretending to be
 * the exact listing. */
export interface ResolvedSource {
  url: string;
  exact: boolean;
}

export interface AiModeResult {
  /** Research text with bare source URLs swapped for "[Source: Name]" tags. */
  taggedText: string;
  /** Source name -> resolved link, so the frontend can link out without an LLM inventing URLs. */
  nameToUrl: Record<string, ResolvedSource>;
  /** Pass this back in the next call to continue the same AI Mode conversation. */
  subsequentRequestToken: string | null;
  /** Company names that look like generic ad/licensing disclosures (e.g. "X | NMLS #1234")
   * rather than a fact about this specific property — real estate sites commonly bury these
   * in page footers, and Google AI Mode occasionally folds them into its answer as if they
   * were the property's actual lender/owner. */
  suspectEntities: string[];
}

/**
 * Asks Google AI Mode (via SerpApi) to research a specific address, pulling from
 * sources like Redfin, Realtor.com, Zillow, and county records the way a person
 * would if they searched it themselves. Starts a continuable conversation so
 * follow-up questions (see askFollowUp) keep this same context.
 */
export async function researchAddress(address: string): Promise<AiModeResult> {
  const query = [
    `${address} property details.`,
    "Number of bedrooms/rooms, square footage, year built,",
    "current owner name(s), mortgage lender (mortgagee),",
    "heating and cooling system type, most recent annual property tax amount,",
    "and distance to the nearest fire hydrant and nearest fire station.",
    "Check sources like Redfin, Realtor.com, Zillow, and county property records.",
  ].join(" ");

  return callAiMode({ q: query, address, continuable: true });
}

/**
 * Asks a follow-up question inside an existing AI Mode conversation, so the
 * assistant already knows which property is being discussed. `address` is only
 * used to build "search this site for the address" fallback links.
 */
export async function askFollowUp(
  question: string,
  subsequentRequestToken: string,
  address: string,
): Promise<AiModeResult> {
  return callAiMode({ q: question, address, continuable: true, subsequentRequestToken });
}

async function callAiMode(params: {
  q: string;
  address: string;
  continuable?: boolean;
  subsequentRequestToken?: string;
}): Promise<AiModeResult> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_KEY is not configured.");
  }

  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set("engine", "google_ai_mode");
  url.searchParams.set("q", params.q);
  url.searchParams.set("api_key", apiKey);
  if (params.continuable) {
    url.searchParams.set("continuable", "true");
  }
  if (params.subsequentRequestToken) {
    url.searchParams.set("subsequent_request_token", params.subsequentRequestToken);
  }

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpApi request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: SerpApiAiModeResponse = await res.json();

  const markdown = data.reconstructed_markdown;
  if (!markdown || markdown.trim().length === 0) {
    throw new Error("Google AI Mode returned no usable content for this query.");
  }

  const { taggedText, nameToUrl } = tagInlineSources(markdown, data.references, params.address);
  const suspectEntities = detectDisclaimerEntities(markdown, data.references);

  return {
    taggedText,
    nameToUrl,
    subsequentRequestToken: data.subsequent_request_token ?? null,
    suspectEntities,
  };
}

// Matches the near-universal real estate site footer pattern: "Company Name | NMLS #12345"
// (also catches "NMLS# 12345" / "NMLS ID 12345" variants, with or without the "|").
const NMLS_DISCLAIMER = /([A-Z][A-Za-z0-9&.,'’ -]{2,60}?)\s*[|\-]?\s*NMLS\s*(?:#|ID)?\s*\d+/g;

/**
 * Scans the raw markdown and every reference snippet for lender/broker
 * advertising-disclosure boilerplate, so we can keep those company names out
 * of confident fact fields even if Google AI Mode folded them into its answer
 * as if they were a real, property-specific fact.
 */
function detectDisclaimerEntities(markdown: string, references: SerpApiReference[] | undefined): string[] {
  const found = new Set<string>();
  const haystacks = [markdown, ...(references ?? []).map((r) => r.snippet ?? "").filter(Boolean)];

  for (const text of haystacks) {
    for (const match of text.matchAll(NMLS_DISCLAIMER)) {
      const name = match[1]?.replace(/[\s|,.\-]+$/, "").trim();
      if (name && name.length > 1) {
        found.add(name);
      }
    }
  }

  return Array.from(found);
}

/**
 * Decides what to actually link to for a given raw URL. SerpApi's `references`
 * list is inconsistent: sometimes it's just a site's root domain (no deeper URL
 * exists anywhere in the response), sometimes it's a genuinely deep page. And
 * "Google" as a source means an internal AI Mode viewer link tied to this one
 * search session — not a stable page anyone else can open.
 */
function resolveDisplayLink(rawUrl: string, address: string): ResolvedSource {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.replace(/^www\./, "");

  if (hostname === "google.com") {
    return { url: `https://www.google.com/search?q=${encodeURIComponent(address)}`, exact: false };
  }

  const hasRealPath = parsed.pathname.replace(/\/$/, "").length > 0;
  if (hasRealPath) {
    return { url: rawUrl, exact: true };
  }

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:${hostname} ${address}`)}`;
  return { url: searchUrl, exact: false };
}

/**
 * `reconstructed_markdown` cites sources three different ways, and all three
 * need to survive into the tagged output:
 *  1. Inline hyperlinks like "[King County Recorder's Office](https://kingcounty.gov/...)"
 *     — a real, specific deep link Google chose to cite, even when its host
 *     isn't one of the domains in the flat `references` list.
 *  2. Numbered citation markers like "...built in 1800. [1]" — index directly
 *     into `references`, no guessing required.
 *  3. Bare parenthetical citations like "(https://en.wikipedia.org/)" with no
 *     bracket text — resolved by matching hostname against `references`.
 * Older logic only handled #3, which silently dropped real links from #1
 * whenever their hostname wasn't already in the references list.
 */
function tagInlineSources(
  markdown: string,
  references: SerpApiReference[] | undefined,
  address: string,
): { taggedText: string; nameToUrl: Record<string, ResolvedSource> } {
  const refs = references ?? [];
  const hostToSource = new Map<string, string>();
  const nameToUrl: Record<string, ResolvedSource> = {};

  const registerSource = (name: string, rawUrl: string) => {
    if (name in nameToUrl) return; // first URL we see for a name wins — stable enough for a display link
    try {
      nameToUrl[name] = resolveDisplayLink(rawUrl, address);
    } catch {
      // Malformed URL — skip it.
    }
  };

  for (const ref of refs) {
    if (!ref.link || !ref.source) continue;
    try {
      hostToSource.set(new URL(ref.link).hostname.replace(/^www\./, ""), ref.source);
    } catch {
      // Malformed reference link — skip it.
    }
    registerSource(ref.source, ref.link);
  }

  const withoutReferencesSection = markdown.split(/\n###\s*References/i)[0];

  // Pass 1: inline markdown hyperlinks — trust these directly, they're real citations.
  let working = withoutReferencesSection.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (fullMatch, linkText: string, rawUrl: string) => {
      try {
        const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
        const name = hostToSource.get(hostname) ?? hostname;
        registerSource(name, rawUrl);
        return `${linkText} [Source: ${name}]`;
      } catch {
        return linkText;
      }
    },
  );

  // Pass 2: numbered citations ("[1]") that index straight into `references`.
  working = working.replace(/\[(\d{1,3})\](?!\()/g, (fullMatch, indexStr: string) => {
    const ref = refs[Number(indexStr)];
    if (!ref?.source) return "";
    if (ref.link) registerSource(ref.source, ref.link);
    return `[Source: ${ref.source}]`;
  });

  // Pass 3: bare "(https://...)" citations with no bracket text at all.
  working = working.replace(/\(?(https?:\/\/[^\s)]+)\)?/g, (fullMatch, rawUrl: string) => {
    try {
      const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
      const source = hostToSource.get(hostname);
      return source ? `[Source: ${source}]` : "";
    } catch {
      return "";
    }
  });

  return { taggedText: working.trim(), nameToUrl };
}
