import slugify from "@sindresorhus/slugify";
import { ulid } from "@discontent/cms/util/ulid";
import { ulidDate } from "./createFeaturedRecipeSlug";

/** A group's slug from its name alone, or "" when the name slugifies to nothing. */
export function groupSlugFromName(name?: string): string {
  return slugify(name ?? "");
}

/**
 * A group's default slug: its name, slugified.
 *
 * Falls back to `group-<ulid>` when the name slugifies to nothing — a name
 * that is entirely punctuation or non-Latin script does, and an empty slug
 * would write the data file to the type's own directory. The fallback used to
 * be a date stamp to the second, which two such groups made in one second
 * shared (epic 34, D9 — the same fix as featured slugs): a lowercase ULID for
 * `date` is unique per call and still starts with that date.
 *
 * The fallback is not deterministic, so a form shows "auto" for it rather than
 * rendering one (`groupSlugFromName` is the deterministic half).
 */
export default function createDefaultGroupSlug({
  name,
  date,
}: {
  name?: string;
  date?: number;
}) {
  const fromName = groupSlugFromName(name);
  if (fromName) return fromName;
  return `group-${ulid(ulidDate(date)).toLowerCase()}`;
}
