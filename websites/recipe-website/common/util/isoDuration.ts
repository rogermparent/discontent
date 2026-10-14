/**
 * ISO 8601 durations, both ways. The importer reads schema.org's `PT1H30M`
 * into the minutes a recipe stores; the export's JSON-LD writes them back
 * (26d). Kept apart from the importer so the export's page bundle does not
 * pull in its HTML parsing.
 */

/* One component's number: digits, optionally a fraction (ISO allows `.` or `,`). */
const NUM = "(\\d+(?:[.,]\\d+)?)";

/*
 * `P[nY][nM][nW][nD][T[nH][nM][nS]]`, case-insensitive and unanchored — a
 * duration found inside a longer string is read, as the old `PT…` pattern
 * did. The `T` is what tells months (before it) from minutes (after it).
 * Groups: 1 years, 2 months, 3 weeks, 4 days, 5 hours, 6 minutes, 7 seconds.
 */
const DURATION = new RegExp(
  `P(?:${NUM}Y)?(?:${NUM}M)?(?:${NUM}W)?(?:${NUM}D)?` +
    `(?:T(?:${NUM}H)?(?:${NUM}M)?(?:${NUM}S)?)?`,
  "gi",
);

function componentValue(text: string | undefined): number {
  return text ? Number(text.replace(",", ".")) : 0;
}

/**
 * An ISO 8601 duration → whole minutes, or undefined when there is none.
 *
 * - `PT1H30M` → 90, `PT90M` → 90, `P1DT2H` → 1560, and Food Network's
 *   `P0Y0M0DT1H15M0.000S` → 75. Lowercase is read too.
 * - Weeks and days convert exactly (a day is 1440 minutes).
 * - Years and months have no fixed length, and a recipe has no use for
 *   them: zeros (Food Network's `P0Y0M`) are ignored, and a non-zero year
 *   or month makes the whole duration undefined rather than a guess — a
 *   `P20M` is more likely a site's mistaken minutes than 20 months.
 * - Seconds (fractions allowed) round the total *up* to the next whole
 *   minute, so a short step never reads as zero: `PT1H30M45S` → 91,
 *   `PT30S` → 1. Fractional hours and minutes are read the same way.
 * - A `P`/`PT` with no components, or no duration at all, is undefined.
 */
export function parseDurationToMinutes(
  duration: string | undefined,
): number | undefined {
  if (!duration || typeof duration !== "string") return undefined;
  for (const match of duration.matchAll(DURATION)) {
    const parts = match.slice(1);
    if (parts.every((part) => part === undefined)) continue;
    const [years, months, weeks, days, hours, minutes, seconds] =
      parts.map(componentValue);
    if (years || months) return undefined;
    const total =
      (weeks * 7 + days) * 24 * 60 + hours * 60 + minutes + seconds / 60;
    if (!Number.isFinite(total)) return undefined;
    /* The epsilon keeps float noise (0.1 h = 6.000000000000001) from adding a minute. */
    return total > 0 ? Math.ceil(total - 1e-9) : 0;
  }
  return undefined;
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
