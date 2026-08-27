import OpenAI from "openai";

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

const SYSTEM_PROMPT = `You clean up raw Google AI Mode output for direct display to a user.
Rules:
- Keep the same structure, headings, wording, and level of detail as the input. Do not
  reorganize it into a different schema and do not summarize it away.
- Wrap the single headline number/value in each bullet in ==double equals== so it can be
  visually highlighted — e.g. "Square Footage: ==7,290 sq. ft.==", "Year Built: ==2014==",
  "Most Recent Annual Property Tax: ==$47,802==". Only the specific number/value itself,
  not the surrounding sentence. Skip this for bullets that have no single headline value
  (e.g. free-text explanations).
- Trim meandering filler: if a sentence just restates the property name/description without
  adding a new fact, cut it — keep one clean intro sentence, no more.
- Remove the trailing "### References" citation dump entirely.
- Remove inline citation clutter: bracketed numbers like "[1]" and bare parenthetical
  URLs like "(https://example.com/)" used only as citations.
- Keep genuinely useful inline links (e.g. "[County Recorder's Office](url)") as
  actual markdown links — do not strip those.
- Remove trailing chat-prompt filler like "Would you like help with X, Y, or Z?" and
  any follow-up question lists at the end.
- Un-escape markdown escape characters (e.g. "\\-" -> "-", "\\(" -> "(").
- Never invent or add information that wasn't in the input.
Output clean markdown only, nothing else.`;

/** Lightly reformats raw Google AI Mode markdown for display — used by both the
 * initial /api/raw-test search and its /api/raw-test/chat follow-ups, so both
 * share identical formatting (highlighted values, real links, no citation clutter). */
export async function cleanRawMarkdown(rawMarkdown: string): Promise<string> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawMarkdown },
    ],
  });

  const cleaned = completion.choices[0]?.message?.content?.trim();
  if (!cleaned) {
    throw new Error("OpenAI returned an empty response while cleaning up the answer.");
  }
  return cleaned;
}
