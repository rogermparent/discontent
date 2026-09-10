import { notFound } from "next/navigation";
import type { TagIndexEntry } from "../../controller/aggregateConfigs";
import { recipeTagIndexReads } from "../../controller/data/readRecipeTagIndex";
import { TagIndexPage, TagPage } from "./shared";

/**
 * The `/tags` and `/tags/[tag]` route handlers, defined once and re-exported by
 * all four route files.
 *
 * Every one of them reads the same folded value, so a request that renders a
 * tag page costs one cache lookup rather than a corpus scan — and the export
 * builds every tag page from a single read of it.
 */

/** `/tags` — the full tag list. */
export async function tagIndexRoute() {
  const byTag: Record<string, TagIndexEntry> =
    (await recipeTagIndexReads.read()) ?? {};
  const tags = Object.entries(byTag).map(([slug, entry]) => ({
    slug,
    label: entry.label,
    count: entry.recipes.length,
  }));
  return <TagIndexPage tags={tags} />;
}

/** `/tags/[tag]` — one tag's recipes. */
export async function tagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const byTag: Record<string, TagIndexEntry> =
    (await recipeTagIndexReads.read()) ?? {};
  const entry = byTag[tag];
  /*
   * An unknown tag is a 404, not an empty tag page. The aggregate only holds
   * slugs something actually carries, so a missing key means the URL is wrong
   * rather than the tag being empty — an empty entry cannot occur, since a tag
   * exists only by virtue of a recipe carrying it.
   */
  if (!entry) notFound();
  return <TagPage tag={entry} />;
}

/**
 * Every tag page the export should emit.
 *
 * Never empty. `output: "export"` rejects a dynamic route whose params come
 * back empty — "Page … is missing generateStaticParams()" — and a corpus with
 * no tags at all is the common case for a new site and the actual state of the
 * `many-recipes` fixture. One placeholder param is emitted instead, and
 * `tagRoute` answers it with `notFound()` exactly as it would at runtime, which
 * is the same guard `createPaginatedIndexRoute` uses for numbered pages.
 */
export async function generateTagStaticParams(): Promise<{ tag: string }[]> {
  const byTag: Record<string, TagIndexEntry> =
    (await recipeTagIndexReads.read()) ?? {};
  const slugs = Object.keys(byTag);
  if (slugs.length === 0) return [{ tag: "_" }];
  return slugs.map((tag) => ({ tag }));
}
