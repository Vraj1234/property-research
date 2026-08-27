"use client";

import { useState } from "react";
import { SourceChip } from "./SourceChip";
import type { ChatMessage, ChatResponse } from "@/lib/types";

interface ChatPanelProps {
  address: string;
  initialToken: string | null;
}

export function ChatPanel({ address, initialToken }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [token, setToken] = useState(initialToken);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isSending || !token) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setIsSending(true);
    setError("");

    try {
      const res = await fetch("/api/property-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, subsequentRequestToken: token, address }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't answer that.");
      }

      const chatResponse = data as ChatResponse;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: chatResponse.answer, sources: chatResponse.sources },
      ]);
      setToken(chatResponse.subsequentRequestToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSending(false);
    }
  }

  if (!token) return null;

  return (
    <section className="animate-rise flex flex-col gap-4">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-clay">
        <span>03</span>
        <span className="h-px flex-1 bg-line" />
        <span>Ask Follow-Up Questions</span>
      </div>

      {messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((message, i) => (
            <ChatBubble key={i} message={message} />
          ))}
        </div>
      )}

      {isSending && (
        <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm border border-line bg-white/60 px-4 py-3 font-mono text-sm text-ink/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
          Thinking…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-clay/40 bg-clay/5 px-4 py-3 font-sans text-sm text-clay">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask anything else about ${address.split(",")[0]}…`}
          disabled={isSending}
          className="w-full rounded-full border border-line bg-white/60 px-5 py-3 font-sans text-sm text-ink placeholder:text-ink/35 focus:border-clay focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="shrink-0 rounded-full bg-ink px-5 py-3 font-sans text-sm font-medium text-parchment transition-all duration-200 hover:bg-clay hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:bg-ink disabled:hover:translate-y-0"
        >
          Ask
        </button>
      </form>
    </section>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 font-sans text-sm leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-ink text-parchment"
            : "rounded-bl-sm border border-line bg-white/60 text-ink"
        }`}
      >
        <p className="whitespace-pre-line">{message.text}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-ink/10 pt-2.5">
            {message.sources.map((source) => (
              <SourceChip key={source.name} name={source.name} url={source.url} exact={source.exact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
