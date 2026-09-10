import slugify from "@sindresorhus/slugify";

/**
 * The URL segment for a tag.
 *
 * Tags are free text — `normalizeTag` lowercases and collapses whitespace but
 * leaves spaces, slashes and punctuation — and a static export path segment can
 * carry none of those.
 *
 * Its own module, tiny and dependency-free, because both sides of the app need
 * it: the `recipesByTag` fold keys the stored value by it, and `tagSearchHref`
 * builds links with it from client components. Importing the aggregate config
 * to reach it would drag a server-side config into the client bundle.
 *
 * The mapping is lossy and deliberately not inverted — a tag page's display
 * label travels with its stored entry rather than being reconstructed from the
 * slug.
 */
export function tagSlug(tag: string): string {
  return slugify(tag);
}

export default tagSlug;
