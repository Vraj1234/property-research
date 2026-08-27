export interface AddressValidation {
  isComplete: boolean;
  reason: string | null;
}

const STREET_SUFFIXES =
  /\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|ln|lane|ct|court|way|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|sq|square|trl|trail|loop|walk|row)\b/i;

const ZIP = /\b\d{5}(-\d{4})?\b/;

/**
 * Rule-based check for "does this look like a full, searchable street address?"
 * Not a geocoder — just fast, free guardrails so we don't burn a search on
 * something like "Main Street" or "Seattle" with no number/city.
 */
export function validateAddress(raw: string): AddressValidation {
  const address = raw.trim();

  if (address.length < 5) {
    return { isComplete: false, reason: "That's too short to be a full address." };
  }

  // Handles both "123 Main St" and geocoder-style "123, Main St" (Nominatim
  // puts a comma right after the house number).
  const startsWithNumber = /^\d+[a-zA-Z]?\s*,?\s*\S/.test(address);
  if (!startsWithNumber) {
    return {
      isComplete: false,
      reason: "Add the street number (e.g. \"123 Main St\") so we know exactly which property.",
    };
  }

  const hasStreetSuffix = STREET_SUFFIXES.test(address);
  const hasCityOrZip = address.includes(",") || ZIP.test(address);

  if (!hasCityOrZip) {
    return {
      isComplete: false,
      reason: "Add a city and state (or ZIP code) so the search isn't ambiguous.",
    };
  }

  if (!hasStreetSuffix) {
    return {
      isComplete: false,
      reason: "Add the street type (St, Ave, Rd, etc.) so we can match the exact address.",
    };
  }

  return { isComplete: true, reason: null };
}
