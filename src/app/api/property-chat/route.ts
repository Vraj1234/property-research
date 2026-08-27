import { NextRequest, NextResponse } from "next/server";
import { askFollowUp } from "@/lib/serpapi";
import { formatChatReply } from "@/lib/chatFormat";
import type { ChatResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { question?: unknown; subsequentRequestToken?: unknown; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const subsequentRequestToken =
    typeof body.subsequentRequestToken === "string" ? body.subsequentRequestToken : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";

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

  try {
    const result = await askFollowUp(question, subsequentRequestToken, address);
    const { text, sources } = formatChatReply(result.taggedText, result.nameToUrl);

    const payload: ChatResponse = {
      answer: text,
      sources,
      subsequentRequestToken: result.subsequentRequestToken,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error while answering that.";
    console.error("[property-chat]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
