import OpenAI from "openai";
import type { PropertyField, PropertyReport, SourceRef } from "./types";
import type { ResolvedSource } from "./serpapi";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/** What the LLM actually produces — source *names* only. URLs are resolved
 * afterward from real reference data so the model can never invent a link. */
interface DraftField {
  value: string | null;
  note: string | null;
  sourceNames: string[];
}

interface DraftReport {
  rooms: DraftField;
  squareFootage: DraftField;
  yearBuilt: DraftField;
  owners: DraftField;
  mortgagee: DraftField;
  heatingCooling: DraftField;
  propertyTax: DraftField;
  distanceToFireHydrant: DraftField;
  distanceToFireStation: DraftField;
  summary: string;
}

const FIELD_SCHEMA = {
  type: "object",
  properties: {
    rooms: fieldSchema(),
    squareFootage: fieldSchema(),
    yearBuilt: fieldSchema(),
    owners: fieldSchema(),
    mortgagee: fieldSchema(),
    heatingCooling: fieldSchema(),
    propertyTax: fieldSchema(),
    distanceToFireHydrant: fieldSchema(),
    distanceToFireStation: fieldSchema(),
    summary: {
      type: "string",
      description: "One short plain-language paragraph summarizing the property, 2-3 sentences max.",
    },
  },
  required: [
    "rooms",
    "squareFootage",
    "yearBuilt",
    "owners",
    "mortgagee",
    "heatingCooling",
    "propertyTax",
    "distanceToFireHydrant",
    "distanceToFireStation",
    "summary",
  ],
  additionalProperties: false,
} as const;

function fieldSchema() {
  return {
    type: "object",
    properties: {
      value: {
        type: ["string", "null"],
        description: "The extracted value in plain, human-readable form, or null if truly nothing relevant was found.",
      },
      note: {
        type: ["string", "null"],
        description:
          "Extra context: partial/adjacent facts when the exact value isn't available (e.g. managing entity name, sale price/date, loan amount/rate), or a short reason like 'not publicly listed'. Only mention restricted access if the source text itself says so.",
      },
      sourceNames: {
        type: "array",
        items: { type: "string" },
        description:
          "Every distinct [Source: X] tag name attached to sentences this fact (value or note) was drawn from. Can be more than one. Empty array if nothing was usable.",
      },
    },
    required: ["value", "note", "sourceNames"],
    additionalProperties: false,
  };
}

const SYSTEM_PROMPT = `You are a data-extraction assistant for a home-research tool.
You will be given raw research text about a specific property (pulled from Google AI Mode,
which itself draws on sites like Redfin, Realtor.com, Zillow, and county records). Paragraphs
are tagged inline like "[Source: Zillow]" showing where that sentence came from.

Extract only the fields defined in the schema. Rules:
- Use only information present in the given text. Never invent or guess values.
- Never say a fact is "masked" or "hidden" unless the text explicitly says access is
  restricted/paywalled/private. Even then, still pull any adjacent facts that ARE given —
  e.g. for "owners", a managing/operating LLC name still counts as a value; for "mortgagee",
  a loan amount, interest rate, or sale date still belongs in "note" even if the lender's
  name itself isn't disclosed. Prefer partial real data over a generic "not available" note.
- If truly nothing relevant is in the text, set "value" to null and "note" to a short
  plain-language reason (e.g. "not publicly listed").
- Keep values short and human-readable (e.g. "3 bed / 2 bath", "1,840 sq ft", "Built in 1998").
- For "owners", list the name(s)/entity exactly as found, comma-separated if multiple.
- For distances, include units as given (e.g. "0.4 miles").
- For "sourceNames", list the name from inside each [Source: X] tag whose sentence contributed
  to this field's value or note — just "X" itself (e.g. from "[Source: Zillow]" use "Zillow",
  never "Source: Zillow" or the brackets). If a fact draws on two different tagged sentences,
  include both names.
- Do not include raw URLs or the literal "[Source: ...]" text inside "value" or "note".
- Be skeptical of names that look like ad/licensing boilerplate rather than a stated fact
  about THIS property — e.g. text with "NMLS #", a footnote marker, or a trademark/licensing
  disclaimer is almost always a site's generic sponsor disclosure, not this property's actual
  lender or owner. If a fact looks like that kind of boilerplate, do not use it as the value;
  treat it the same as if nothing was found.`;

/**
 * Turns raw, source-tagged Google AI Mode research text into a clean, structured
 * property report with real clickable sources (resolved from nameToUrl, never
 * invented by the model).
 */
export async function structureReport(
  address: string,
  taggedResearch: string,
  nameToUrl: Record<string, ResolvedSource>,
  suspectEntities: string[] = [],
): Promise<PropertyReport> {
  const openai = getClient();

  const suspectNote =
    suspectEntities.length > 0
      ? `\n\nThese names were detected in advertising/licensing disclosure boilerplate (e.g. "X | NMLS #12345") elsewhere on the source pages, not stated as a fact about this specific property: ${suspectEntities.join(", ")}. Do not use any of them as a value unless the text independently and clearly ties them to this exact property beyond just naming them.`
      : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Address: ${address}\n\nRaw research text:\n${taggedResearch}${suspectNote}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "property_report",
        strict: true,
        schema: FIELD_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned an empty response while formatting the report.");
  }

  const draft = JSON.parse(raw) as DraftReport;
  const report = resolveReportSources(draft, nameToUrl);
  return redactSuspectValues(report, suspectEntities);
}

/**
 * Deterministic safety net: even if the model ignores the suspect-entity warning,
 * strip any field value that contains one of those names and demote it to a
 * cautionary note instead. Doesn't rely on the LLM cooperating.
 */
function redactSuspectValues(report: PropertyReport, suspectEntities: string[]): PropertyReport {
  if (suspectEntities.length === 0) return report;

  const redactField = (field: PropertyField): PropertyField => {
    if (!field.value) return field;
    const match = suspectEntities.find((entity) => field.value!.toLowerCase().includes(entity.toLowerCase()));
    if (!match) return field;

    return {
      value: null,
      note: `Possible advertising/licensing disclosure ("${match}") picked up by mistake, not a confirmed fact for this property — verify against official records.`,
      sources: field.sources,
    };
  };

  return {
    rooms: redactField(report.rooms),
    squareFootage: redactField(report.squareFootage),
    yearBuilt: redactField(report.yearBuilt),
    owners: redactField(report.owners),
    mortgagee: redactField(report.mortgagee),
    heatingCooling: redactField(report.heatingCooling),
    propertyTax: redactField(report.propertyTax),
    distanceToFireHydrant: redactField(report.distanceToFireHydrant),
    distanceToFireStation: redactField(report.distanceToFireStation),
    summary: report.summary,
  };
}

/** Defensive cleanup in case the model echoes "Source: X" instead of just "X". */
function normalizeSourceName(name: string): string {
  return name.replace(/^source:\s*/i, "").trim();
}

function resolveField(draft: DraftField, nameToUrl: Record<string, ResolvedSource>): PropertyField {
  const sources: SourceRef[] = draft.sourceNames.map((rawName) => {
    const name = normalizeSourceName(rawName);
    const resolved = nameToUrl[name];
    return { name, url: resolved?.url ?? null, exact: resolved?.exact ?? false };
  });
  return { value: draft.value, note: draft.note, sources };
}

function resolveReportSources(draft: DraftReport, nameToUrl: Record<string, ResolvedSource>): PropertyReport {
  return {
    rooms: resolveField(draft.rooms, nameToUrl),
    squareFootage: resolveField(draft.squareFootage, nameToUrl),
    yearBuilt: resolveField(draft.yearBuilt, nameToUrl),
    owners: resolveField(draft.owners, nameToUrl),
    mortgagee: resolveField(draft.mortgagee, nameToUrl),
    heatingCooling: resolveField(draft.heatingCooling, nameToUrl),
    propertyTax: resolveField(draft.propertyTax, nameToUrl),
    distanceToFireHydrant: resolveField(draft.distanceToFireHydrant, nameToUrl),
    distanceToFireStation: resolveField(draft.distanceToFireStation, nameToUrl),
    summary: draft.summary,
  };
}
