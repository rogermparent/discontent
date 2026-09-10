/**
 * Duration formatters for the recipe views. Two conventions coexist in the UI
 * and both are exercised by the test suite, so they live here as named exports
 * rather than being re-implemented per component:
 *
 * - `formatDurationLong`  — spelled-out, used by the detail-page InfoCards
 *   (Prep / Cook / Total). e.g. 90 → "1 hr 30 min", 60 → "1 hr", 30 → "30 min".
 * - `formatDurationCompact` — tight, used by the schedule strips and the
 *   interactive editor where space is scarce. e.g. 90 → "1h 30m", 60 → "1h",
 *   30 → "30m".
 *
 * Each reproduces the exact output of the inline copy it replaces.
 */

/** Spelled-out duration, e.g. "1 hr 30 min". Tolerates `undefined` (→ "0 min"). */
export function formatDurationLong(duration: number | undefined): string {
  const durationOrZero = duration || 0;
  const hours = Math.floor(durationOrZero / 60);
  const minutes = durationOrZero % 60;
  return [hours && `${hours} hr`, (minutes || !hours) && `${minutes || 0} min`]
    .filter(Boolean)
    .join(" ");
}

/** Tight duration, e.g. "1h 30m" / "1h" / "30m". */
export function formatDurationCompact(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
