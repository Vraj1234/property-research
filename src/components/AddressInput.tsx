"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateAddress } from "@/lib/validateAddress";
import type { AddressSuggestion } from "@/lib/types";

interface AddressInputProps {
  /** `verified` is true when the address came from the autocomplete dropdown
   * (already a real, complete address from the geocoder), so the caller can
   * skip re-guessing at whether it "looks" complete. */
  onSearch: (address: string, verified: boolean) => void;
  isSearching: boolean;
}

const AUTOCOMPLETE_DEBOUNCE_MS = 300;

export function AddressInput({ onSearch, isSearching }: AddressInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [incompleteReason, setIncompleteReason] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, AUTOCOMPLETE_DEBOUNCE_MS);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data: { suggestions: AddressSuggestion[] }) => {
        if (!cancelled) {
          setSuggestions(data.suggestions ?? []);
          setIsOpen(true);
          setActiveIndex(-1);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(label: string) {
    setQuery(label);
    setIsOpen(false);
    setSuggestions([]);
    setIncompleteReason(null);
    onSearch(label, true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const validation = validateAddress(trimmed);
    if (!validation.isComplete) {
      setIncompleteReason(validation.reason);
      setIsOpen(false);
      return;
    }

    setIncompleteReason(null);
    setIsOpen(false);
    onSearch(trimmed, false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].label);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="group relative flex items-center border-b-2 border-ink/70 focus-within:border-clay transition-colors duration-200">
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-ink/40 pr-3 select-none">
            01
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (incompleteReason) setIncompleteReason(null);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setIsOpen(true)}
            placeholder="123 Main St, Seattle, WA"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-transparent py-4 text-xl sm:text-2xl font-serif text-ink placeholder:text-ink/30 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="ml-3 shrink-0 rounded-full bg-ink px-5 py-2.5 font-sans text-sm font-medium text-parchment transition-all duration-200 hover:bg-clay hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:bg-ink disabled:hover:translate-y-0"
          >
            {isSearching ? "Researching…" : "Research"}
          </button>
        </div>
      </form>

      {incompleteReason && (
        <p className="mt-2 flex items-start gap-2 font-sans text-sm text-clay">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-clay" />
          {incompleteReason}
        </p>
      )}

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-lg border border-line bg-parchment shadow-[0_12px_32px_-8px_rgba(23,21,18,0.25)] animate-rise">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lon}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s.label)}
                className={`block w-full px-4 py-3 text-left text-sm font-sans transition-colors duration-150 ${
                  i === activeIndex ? "bg-ink text-parchment" : "text-ink hover:bg-ink/5"
                } ${i !== suggestions.length - 1 ? "border-b border-line/70" : ""}`}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
