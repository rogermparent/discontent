import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import {
  readTagTree,
  readTagVocabulary,
  readTermPageSlugs,
  resolveTermPage,
} from "../../controller/data/readTermPage";
import { TagIndexPage, TagPage } from "./shared";

/**
 * The `/tags` and `/tags/[tag]` route handlers, defined once and re-exported by
 * all four route files.
 *
 * Every one of them reads folded values, so a request that renders a tag page
 * costs a handful of cache lookups rather than a corpus scan — and the export
 * builds every tag page from a single read of each.
 *
 * **Three sources, one vocabulary** (24b/24c/D4). Recipes and groups each
 * declare the same `tag` taxonomy and each has its own `tags` / `by-tag` pair
 * under its own cache tag; the term *records* are a third content type with a
 * tree of their own. The join happens in `readTermPage.ts`, at read time. That
 * is the shape the whole epic turns on: a fourth carrier is a fourth read and
 * no new derived state, and tagging a group does not invalidate a page that
 * lists only recipes.
 */

/**
 * `/tags` — the hierarchy (31b), then the full tag list, every carrier's counts
 * summed, records included.
 */
export async function tagIndexRoute() {
  const [tags, tree] = await Promise.all([readTagVocabulary(), readTagTree()]);
  return <TagIndexPage tags={tags} tree={tree} />;
}

/**
 * The editor's `/tags` (31e): the same page, plus a **New term** link to
 * `/tags/new`.
 *
 * Shown to everyone who can reach the editor, as every editor affordance is
 * (the group page's Edit, this vocabulary's Feature, the footer's New Recipe):
 * the destination is what asks for a sign-in. Reading the session here would
 * make the index a per-request render for the sake of one link.
 */
export async function editorTagIndexRoute() {
  const [tags, tree] = await Promise.all([readTagVocabulary(), readTagTree()]);
  return (
    <TagIndexPage
      tags={tags}
      tree={tree}
      actions={
        <Link
          href="/tags/new"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          New term
        </Link>
      }
    />
  );
}

/** `/tags/[tag]` — one term: its record, its recipes, then its groups. */
export async function tagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const term = await resolveTermPage(tag);
  /*
   * An unknown tag is a 404, not an empty tag page — and "unknown" now means
   * *no carrier and no record*. Each folded value only holds slugs something
   * actually carries, and the tree only slugs someone has defined, so a slug
   * missing from all three means the URL is wrong.
   */
  if (!term) notFound();
  return <TagPage term={term} />;
}

/**
 * The editor's `/tags/[tag]` — the same page, plus the affordances a read-only
 * export has no use for.
 *
 * **Feature** (24c): the target is a slug, the form takes one, and `?term=`
 * preselects it exactly as `?group=` does. **Edit** (31e): the term form at
 * `/tags/<slug>/edit`, which updates the record — or, for a term that so far
 * lives only on its carriers, creates one at this slug.
 *
 * Its own export rather than a prop on `tagRoute`, because a Next page module
 * exports a function and cannot pass it arguments — the editor's route file
 * re-exports this one and the export's re-exports the plain one.
 */
export async function editorTagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const term = await resolveTermPage(tag);
  if (!term) notFound();
  return (
    <TagPage
      term={term}
      actions={
        <>
          <Link
            href={`/featured-recipe/new?term=${term.slug}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Feature
          </Link>
          <Link
            href={`/tags/${term.slug}/edit`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Edit
          </Link>
        </>
      }
    />
  );
}

/**
 * The tab title and the description search engines print (24c).
 *
 * Its own export rather than folded into `tagRoute`, because Next wants the two
 * as separate module exports — and both route files re-export this beside the
 * page so a term's record actually reaches the document head. A term with no
 * record falls back to the fold's label, so every page that had a title before
 * still has the same one.
 */
export async function generateTagMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const term = await resolveTermPage(tag);
  if (!term) return { title: tag };
  return {
    title: term.label,
    ...(term.description ? { description: term.description } : {}),
  };
}

/**
 * Every tag page the export should emit — the union of all three sources.
 *
 * Never empty. `output: "export"` rejects a dynamic route whose params come
 * back empty — "Page … is missing generateStaticParams()" — and a corpus with
 * no tags at all is the common case for a new site and the actual state of the
 * `many-recipes` fixture. One placeholder param is emitted instead, and
 * `tagRoute` answers it with `notFound()` exactly as it would at runtime, which
 * is the same guard `createPaginatedIndexRoute` uses for numbered pages (T10).
 */
export async function generateTagStaticParams(): Promise<{ tag: string }[]> {
  const slugs = await readTermPageSlugs();
  if (slugs.length === 0) return [{ tag: "_" }];
  return slugs.map((tag) => ({ tag }));
}
