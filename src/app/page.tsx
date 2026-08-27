"use client";

import { useState } from "react";
import { AddressInput } from "@/components/AddressInput";
import { PropertyReportCard } from "@/components/PropertyReportCard";
import { ChatPanel } from "@/components/ChatPanel";
import type { PropertySearchResponse } from "@/lib/types";

type Status = "idle" | "loading" | "error" | "success";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<PropertySearchResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSearch(address: string, verified: boolean) {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/property-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, verified }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong while researching that address.");
      }

      setResult(data as PropertySearchResponse);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <main className="relative z-10 min-h-screen px-6 py-16 sm:py-24">
      <div className="mx-auto flex max-w-2xl flex-col gap-14">
        <div className="animate-rise flex flex-col gap-4">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-clay">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" />
            Property Research
          </div>
          <h1 className="font-serif text-4xl leading-[1.05] text-ink sm:text-6xl">
            Type an address.
            <br />
            Get the full picture.
          </h1>
          <p className="max-w-md font-sans text-base leading-relaxed text-ink/60">
            Rooms, square footage, ownership, taxes, and fire safety distance — pulled and
            summarized in one search.
          </p>
        </div>

        <AddressInput onSearch={handleSearch} isSearching={status === "loading"} />

        {status === "loading" && (
          <div className="animate-rise flex items-center gap-3 font-mono text-sm text-ink/50">
            <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
            Researching public records and listings…
          </div>
        )}

        {status === "error" && (
          <div className="animate-rise rounded-xl border border-clay/40 bg-clay/5 px-5 py-4 font-sans text-sm text-clay">
            {errorMessage}
          </div>
        )}

        {status === "success" && result && (
          <>
            <PropertyReportCard
              address={result.address}
              report={result.report}
              generatedAt={result.generatedAt}
            />
            <ChatPanel address={result.address} initialToken={result.subsequentRequestToken} />
          </>
        )}
      </div>
    </main>
  );
}
