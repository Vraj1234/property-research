interface SourceChipProps {
  name: string;
  url: string | null;
  /** True = a real deep link to the page this fact came from. False = we only had
   * a root domain, so this instead points at a site-scoped search for the address. */
  exact: boolean;
}

/** A small clickable pill linking out to the source of a fact. Renders as plain
 * (non-clickable) text if we couldn't resolve any link for it. */
export function SourceChip({ name, url, exact }: SourceChipProps) {
  const className =
    "inline-flex items-center gap-1 rounded-full bg-brass/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-brass transition-colors duration-150";

  if (!url) {
    return <span className={className}>{name}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={exact ? `Open the ${name} page this came from` : `Search ${name} for this address`}
      className={`${className} hover:bg-brass hover:text-parchment`}
    >
      {name}
      <span aria-hidden="true" className="text-[9px]">
        {exact ? "↗" : "🔍"}
      </span>
    </a>
  );
}
