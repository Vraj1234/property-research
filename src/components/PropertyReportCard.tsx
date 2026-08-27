import type { PropertyField, PropertyReport } from "@/lib/types";
import { SourceChip } from "./SourceChip";

interface PropertyReportCardProps {
  address: string;
  report: PropertyReport;
  generatedAt: string;
}

const FIELD_ROWS: Array<{ key: keyof PropertyReport; label: string }> = [
  { key: "rooms", label: "Rooms" },
  { key: "squareFootage", label: "Square Footage" },
  { key: "yearBuilt", label: "Year Built" },
  { key: "owners", label: "Owner(s) of Record" },
  { key: "mortgagee", label: "Mortgagee" },
  { key: "heatingCooling", label: "Heating / Cooling" },
  { key: "propertyTax", label: "Property Tax" },
  { key: "distanceToFireHydrant", label: "Nearest Fire Hydrant" },
  { key: "distanceToFireStation", label: "Nearest Fire Station" },
];

function Field({ label, field }: { label: string; field: PropertyField }) {
  const hasValue = Boolean(field.value);
  return (
    <div className="border-b border-line/70 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:px-6 sm:py-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</dt>
      <dd
        className={`mt-2 font-serif text-lg leading-snug ${
          hasValue ? "text-ink" : "italic text-ink/35"
        }`}
      >
        {hasValue ? field.value : field.note ?? "Not found"}
      </dd>
      {field.sources.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {field.sources.map((source) => (
            <SourceChip key={source.name} name={source.name} url={source.url} exact={source.exact} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PropertyReportCard({ address, report, generatedAt }: PropertyReportCardProps) {
  const date = new Date(generatedAt);
  const formattedDate = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-white/60 shadow-[0_24px_60px_-20px_rgba(23,21,18,0.35)]">
      <header className="flex flex-col gap-3 border-b border-line bg-ink px-6 py-6 text-parchment sm:px-10 sm:py-8">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-parchment/50">
          <span>02</span>
          <span className="h-px flex-1 bg-parchment/20" />
          <span>Property Dossier</span>
        </div>
        <h2 className="font-serif text-2xl leading-tight sm:text-3xl">{address}</h2>
        <p className="font-sans text-sm text-parchment/60">Compiled {formattedDate}</p>
      </header>

      <div className="border-b border-line px-6 py-6 sm:px-10">
        <p className="font-serif text-lg italic leading-relaxed text-ink/80">{report.summary}</p>
      </div>

      <dl className="grid grid-cols-1 px-6 sm:grid-cols-3 sm:px-10">
        {FIELD_ROWS.map(({ key, label }) => (
          <Field key={key} label={label} field={report[key] as PropertyField} />
        ))}
      </dl>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/40 sm:px-10">
        <span className="h-1.5 w-1.5 rounded-full bg-moss" />
        Sourced via Google AI Mode. Owner, mortgagee, and tax figures can be wrong or outdated
        — confirm anything you rely on against official county records before acting on it.
      </footer>
    </section>
  );
}
