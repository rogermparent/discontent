import { ulid } from "@discontent/cms/util/ulid";

/**
 * A featured entry's default slug: a lowercase ULID for its date (epic 34,
 * D9).
 *
 * It used to be the date to the second (`2026-10-13-09-30-00`), so two
 * features made in the same second resolved to one slug and the second was a
 * 409 (23-T26) — a curator featuring a burst had to pass explicit slugs. A
 * ULID is unique per call (monotonic within a millisecond, 80 random bits
 * otherwise), so slug-less features never collide.
 *
 * Ordering is unchanged: the featured index key is `[date, slug]`, so entries
 * sort by `date` and the slug only breaks ties — and a ULID's first ten
 * characters encode the date it was made for, so ties break by time too.
 * Lowercase because a slug is a URL segment and every other slug is.
 *
 * Not deterministic, so a form must not render it as a placeholder (the server
 * and the browser would disagree): the featured form says "auto" and the
 * action fills the slug in.
 */
export default function createDefaultFeaturedRecipeSlug({
  date,
}: {
  date: number;
}) {
  return ulid(ulidDate(date)).toLowerCase();
}

/** `date` as `ulid` takes it: whole milliseconds since 1970; now otherwise. */
export function ulidDate(date: number | undefined): number {
  const time = Math.trunc(date ?? Number.NaN);
  return Number.isFinite(time) && time >= 0 && time < 2 ** 48
    ? time
    : Date.now();
}
