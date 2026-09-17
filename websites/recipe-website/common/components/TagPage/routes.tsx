import { notFound } from "next/navigation";
import { groupTagReads } from "../../controller/data/readGroupTagIndex";
import { recipeTagReads } from "../../controller/data/readRecipeTagIndex";
import { TagIndexPage, TagPage } from "./shared";

/**
 * The `/tags` and `/tags/[tag]` route handlers, defined once and re-exported by
 * all four route files.
 *
 * Every one of them reads folded values, so a request that renders a tag page
 * costs two cache lookups rather than a corpus scan — and the export builds
 * every tag page from a single read of each.
 *
 * **Two carriers, one vocabulary** (24b/D4). Recipes and groups each declare
 * the same `tag` taxonomy, so each has its own `tags` / `by-tag` pair under its
 * own cache tag, and the union happens *here*, at read time. That is the shape
 * the whole epic turns on: a third carrier is a third read and no new derived
 * state, and tagging a group does not invalidate a page that lists only
 * recipes.
 */

/** `/tags` — the full tag list, both carriers' counts summed. */
export async function tagIndexRoute() {
  const [recipeTerms, groupTerms] = await Promise.all([
    recipeTagReads.terms.read(),
    groupTagReads.terms.read(),
  ]);

  /*
   * Recipes first, so a slug both carry prints the recipes' label — the corpus
   * is overwhelmingly recipes, and one label has to win a slug collision
   * somewhere (F8's first-label-wins rule, applied across carriers instead of
   * within one).
   */
  const merged = new Map<string, { label: string; count: number }>();
  for (const term of recipeTerms ?? []) {
    merged.set(term.slug, { label: term.label, count: term.count });
  }
  for (const term of groupTerms ?? []) {
    const existing = merged.get(term.slug);
    if (existing) existing.count += term.count;
    else merged.set(term.slug, { label: term.label, count: term.count });
  }

  const tags = [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([slug, { label, count }]) => ({ slug, label, count }));
  return <TagIndexPage tags={tags} />;
}

/** `/tags/[tag]` — one tag's recipes, then its groups. */
export async function tagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const [byRecipeTag, byGroupTag] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
  ]);
  const recipes = byRecipeTag?.[tag];
  const groups = byGroupTag?.[tag];
  /*
   * An unknown tag is a 404, not an empty tag page — and "unknown" now means
   * *neither* carrier has the slug. Each folded value only holds slugs
   * something actually carries, so a group-only tag is a real page and a slug
   * missing from both means the URL is wrong.
   */
  if (!recipes && !groups) notFound();
  return (
    <TagPage
      label={recipes?.label ?? groups?.label ?? tag}
      recipes={recipes?.items ?? []}
      groups={groups?.items ?? []}
    />
  );
}

/**
 * Every tag page the export should emit — the union of both carriers' keys.
 *
 * Never empty. `output: "export"` rejects a dynamic route whose params come
 * back empty — "Page … is missing generateStaticParams()" — and a corpus with
 * no tags at all is the common case for a new site and the actual state of the
 * `many-recipes` fixture. One placeholder param is emitted instead, and
 * `tagRoute` answers it with `notFound()` exactly as it would at runtime, which
 * is the same guard `createPaginatedIndexRoute` uses for numbered pages (T10).
 */
export async function generateTagStaticParams(): Promise<{ tag: string }[]> {
  const [byRecipeTag, byGroupTag] = await Promise.all([
    recipeTagReads.byTerm.read(),
    groupTagReads.byTerm.read(),
  ]);
  const slugs = new Set([
    ...Object.keys(byRecipeTag ?? {}),
    ...Object.keys(byGroupTag ?? {}),
  ]);
  if (slugs.size === 0) return [{ tag: "_" }];
  return [...slugs].map((tag) => ({ tag }));
}
