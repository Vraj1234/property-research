"use client";

import { useState, Fragment } from "react";
import { AddressInput } from "@/components/AddressInput";

/** Minimal, safe (no dangerouslySetInnerHTML) markdown-ish renderer: headings,
 * bullets, bold, ==highlighted key values==, and real [text](url) links. Good
 * enough here without pulling in a markdown library. */
function renderMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="space-y-2.5 pl-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2.5 leading-relaxed">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay/70" />
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(
        <h3
          key={i}
          className="mt-8 border-b border-line pb-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-clay first:mt-0"
        >
          {renderInline(trimmed.slice(4))}
        </h3>,
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={i} className="mt-8 font-serif text-xl text-ink first:mt-0">
          {renderInline(trimmed.slice(3))}
        </h2>,
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed.length === 0) {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={i} className="font-serif text-lg italic leading-relaxed text-ink/80">
          {renderInline(trimmed)}
        </p>,
      );
    }
  });
  flushList();

  return blocks;
}

/** Handles **bold**, ==highlighted values==, and [text](url) links inline. */
function renderInline(text: string): React.ReactNode {
  const pattern = /(\*\*[^*]+\*\*|==[^=]+==|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    if (!part) return null;

    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;

    const highlight = part.match(/^==([^=]+)==$/);
    if (highlight) {
      return (
        <mark
          key={i}
          className="rounded-md bg-brass/20 px-1.5 py-0.5 font-mono not-italic font-semibold text-ink"
        >
          {highlight[1]}
        </mark>
      );
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-clay underline decoration-clay/40 underline-offset-2 transition-colors duration-150 hover:text-ink hover:decoration-ink"
        >
          {link[1]}
        </a>
      );
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState("");

  const [token, setToken] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState("");

  async function handleSearch(searchAddress: string) {
    setAddress(searchAddress);
    setStatus("loading");
    setError("");
    setToken(null);
    setChatMessages([]);

    try {
      const res = await fetch("/api/property-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: searchAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");

      setMarkdown(data.markdown);
      setToken(data.subsequentRequestToken ?? null);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || isChatSending || !token) return;

    setChatMessages((prev) => [...prev, { role: "user", text: question }]);
    setChatInput("");
    setIsChatSending(true);
    setChatError("");

    try {
      const res = await fetch("/api/property-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, subsequentRequestToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer that.");

      setChatMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
      setToken(data.subsequentRequestToken ?? token);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsChatSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-clay">
        <span className="h-1.5 w-1.5 rounded-full bg-clay" />
        Property Research
      </div>
      <h1 className="mb-3 font-serif text-4xl leading-tight text-ink">
        Type an address. Get the full picture.
      </h1>
      <p className="mb-10 max-w-md text-sm leading-relaxed text-ink/60">
        Rooms, square footage, ownership, taxes, and fire safety distance — researched live and
        cleaned up for reading, with real sources you can click through.
      </p>

      <div className="mb-10">
        <AddressInput onSearch={handleSearch} isSearching={status === "loading"} />
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-3 font-mono text-sm text-ink/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
          Researching this property…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-clay/40 bg-clay/5 px-5 py-4 font-sans text-sm text-clay">
          {error}
        </div>
      )}

      {status === "success" && (
        <article className="overflow-hidden rounded-2xl border border-line bg-white/60 shadow-[0_24px_60px_-20px_rgba(23,21,18,0.35)]">
          <header className="border-b border-line bg-ink px-6 py-6 text-parchment sm:px-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-parchment/50">
              Property Report
            </p>
            <h2 className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">{address}</h2>
          </header>
          <div className="px-6 py-6 sm:px-10 sm:py-8">{renderMarkdown(markdown)}</div>
        </article>
      )}

      {token && (
        <section className="mt-8 flex flex-col gap-4">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-clay">
            <span className="h-px flex-1 bg-line" />
            <span>Ask Follow-Up Questions</span>
          </div>

          {chatMessages.length > 0 && (
            <div className="flex flex-col gap-3">
              {chatMessages.map((message, i) => (
                <div key={i} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      message.role === "user"
                        ? "rounded-br-sm bg-ink text-parchment"
                        : "w-full rounded-bl-sm border border-line bg-white/60 text-ink"
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-line">{message.text}</p>
                    ) : (
                      <div className="space-y-3">{renderMarkdown(message.text)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isChatSending && (
            <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm border border-line bg-white/60 px-4 py-3 font-mono text-sm text-ink/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
              Thinking…
            </div>
          )}

          {chatError && (
            <div className="rounded-xl border border-clay/40 bg-clay/5 px-4 py-3 font-sans text-sm text-clay">
              {chatError}
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="flex items-center gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={`Ask anything else about ${address.split(",")[0]}…`}
              disabled={isChatSending}
              className="w-full rounded-full border border-line bg-white/60 px-5 py-3 font-sans text-sm text-ink placeholder:text-ink/35 focus:border-clay focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isChatSending || !chatInput.trim()}
              className="shrink-0 rounded-full bg-ink px-5 py-3 font-sans text-sm font-medium text-parchment transition-all duration-200 hover:bg-clay hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:bg-ink disabled:hover:translate-y-0"
            >
              Ask
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
