/** A clickable source attached to a fact. url is null if we couldn't resolve any link for it.
 * exact is false when the link is a site-scoped search fallback rather than the real page
 * (SerpApi often only gives us a source's root domain, not the specific page it read). */
export interface SourceRef {
  name: string;
  url: string | null;
  exact: boolean;
}

/** A single researched fact about a property, with a plain-language note when it's unavailable. */
export interface PropertyField {
  value: string | null;
  note: string | null;
  sources: SourceRef[];
}

/** The structured report shape the frontend renders. Every field is optional-safe via PropertyField. */
export interface PropertyReport {
  rooms: PropertyField;
  squareFootage: PropertyField;
  yearBuilt: PropertyField;
  owners: PropertyField;
  mortgagee: PropertyField;
  heatingCooling: PropertyField;
  propertyTax: PropertyField;
  distanceToFireHydrant: PropertyField;
  distanceToFireStation: PropertyField;
  summary: string;
}

export interface AddressSuggestion {
  label: string;
  lat: string;
  lon: string;
}

export interface PropertySearchResponse {
  address: string;
  report: PropertyReport;
  generatedAt: string;
  /** Lets the frontend continue this exact Google AI Mode conversation via /api/property-chat. */
  subsequentRequestToken: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  sources?: SourceRef[];
}

export interface ChatResponse {
  answer: string;
  sources: SourceRef[];
  subsequentRequestToken: string | null;
}
