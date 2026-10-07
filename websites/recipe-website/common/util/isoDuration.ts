/**
 * ISO 8601 durations, both ways. The importer reads schema.org's `PT1H30M`
 * into the minutes a recipe stores; the export's JSON-LD writes them back
 * (26d). Kept apart from the importer so the export's page bundle does not
 * pull in its HTML parsing.
 */

/** `PT1H30M` → 90. Undefined for anything that is not a `PT…` duration. */
export function parseDurationToMinutes(
  duration: string | undefined,
): number | undefined {
  if (!duration || typeof duration !== "string") return undefined;
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!matches) return undefined;
  const hours = matches[1] ? parseInt(matches[1], 10) : 0;
  const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
  return hours * 60 + minutes;
}

/** 90 → `PT1H30M`, 45 → `PT45M`, 120 → `PT2H`. Undefined unless positive. */
export function minutesToDuration(
  minutes: number | undefined,
): string | undefined {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    return undefined;
  }
  const total = Math.round(minutes);
  if (total <= 0) return undefined;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `PT${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`;
}
