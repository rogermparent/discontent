import slugify from "@sindresorhus/slugify";

/**
 * A group's default slug: its name, slugified.
 *
 * Falls back to a date stamp when the name slugifies to nothing — a name that
 * is entirely punctuation or non-Latin script does, and an empty slug would
 * write the data file to the type's own directory. The fallback is the same
 * shape `createFeaturedRecipeSlug` produces, for the same reason: it is unique
 * enough to be a slug and readable enough to be recognized in a URL.
 */
export default function createDefaultGroupSlug({
  name,
  date,
}: {
  name?: string;
  date?: number;
}) {
  const fromName = slugify(name ?? "");
  if (fromName) return fromName;

  const dateObj = new Date(date ?? Date.now());
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getSeconds()).padStart(2, "0");
  return `group-${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}
