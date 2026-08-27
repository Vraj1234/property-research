import type { SourceRef } from "./types";
import type { ResolvedSource } from "./serpapi";

export interface FormattedChatReply {
  text: string;
  sources: SourceRef[];
}

const SOURCE_TAG = /\[Source:\s*([^\]]+)\]/g;

/**
 * Turns a "[Source: X]"-tagged AI Mode reply into a clean chat message: strips
 * the inline tags out of the text and collects them into a deduped, real-URL
 * source list instead (no LLM round trip needed for chat turns).
 */
export function formatChatReply(
  taggedText: string,
  nameToUrl: Record<string, ResolvedSource>,
): FormattedChatReply {
  const seen = new Map<string, SourceRef>();

  const withoutTags = taggedText.replace(SOURCE_TAG, (_match, name: string) => {
    const trimmedName = name.trim();
    if (!seen.has(trimmedName)) {
      const resolved = nameToUrl[trimmedName];
      seen.set(trimmedName, {
        name: trimmedName,
        url: resolved?.url ?? null,
        exact: resolved?.exact ?? false,
      });
    }
    return "";
  });

  const text = withoutTags
    .replace(/\\\s*\n/g, "\n") // trailing "\" hard-break markers -> plain newline
    .replace(/\\([().,-])/g, "$1") // un-escape markdown-escaped punctuation
    .replace(/^#{1,6}\s*/gm, "") // strip heading markers, keep the line
    .replace(/\*\*(.+?)\*\*/g, "$1") // strip bold markers, keep the text
    .replace(/^-\s+/gm, "• ") // bullets
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, sources: Array.from(seen.values()) };
}
