import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { readHolidayAlmanac } from "../../controller/data/readHolidays";
import {
  readTagBoardPage,
  readTermPageSlugs,
  readTermPageSlugsWithAliases,
  resolveTermAlias,
  resolveTermPage,
} from "../../controller/data/readTermPage";
import { tagTermReads } from "../../controller/data/readTagTerms";
import { facetTermsFromTree } from "../../util/facets";
import { TermPicture } from "../Homepage/TermPicture";
import { TagAliasRedirect } from "./AliasRedirect";
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
 *
 * **Signed-in controls** (43a's rule, 43t): the editor's two routes take
 * `signedIn` from their route files, which read the session — this module is
 * shared with the export and cannot import the editor's `auth`. A guest sees
 * no New term, Feature, Edit or Add a narrower term; the server actions and
 * the forms still refuse without a session either way.
 */

/**
 * `/tags` (43t, canvas B): the facet board — and beside it the Holidays,
 * whose pictures (the record's, else the newest recipe photo, else the
 * monogram: the almanac's rule, 42e) are rendered here on the server.
 */
async function boardPage(actions?: ReactNode) {
  const [board, almanac] = await Promise.all([
    readTagBoardPage(),
    readHolidayAlmanac(),
  ]);
  const pictures: Record<string, ReactNode> = {};
  for (const entry of almanac ?? []) {
    pictures[entry.slug] = (
      <TermPicture
        slug={entry.slug}
        label={entry.label}
        summary={{ image: entry.image, recipeImage: entry.recipeImage }}
        width={96}
        height={96}
        sizes="48px"
        small
      />
    );
  }
  return <TagIndexPage board={board} pictures={pictures} actions={actions} />;
}

/** `/tags` on the export. */
export async function tagIndexRoute() {
  return boardPage();
}

/**
 * The editor's `/tags` (31e): the same board, plus a **New term** link to
 * `/tags/new` for a signed-in editor.
 */
export async function editorTagIndexRoute({
  signedIn = false,
}: { signedIn?: boolean } = {}) {
  return boardPage(
    signedIn ? (
      <Link
        href="/tags/new"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Plus aria-hidden />
        New term
      </Link>
    ) : undefined,
  );
}

/** `/tags/[tag]` — one term: its record, its recipes, then its groups. */
export async function tagRoute({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const [term, tree] = await Promise.all([
    resolveTermPage(tag),
    tagTermReads.tree.read(),
  ]);
  /*
   * An unknown tag is a 404, not an empty tag page — and "unknown" now means
   * *no carrier and no record*. Each folded value only holds slugs something
   * actually carries, and the tree only slugs someone has defined, so a slug
   * missing from all three means the URL is wrong — unless a record lists
   * it as an alias (32i): then the page sends the reader on. A static file
   * cannot answer with a 3xx, so the export's page is a redirect page.
   */
  if (!term) {
    const target = await resolveTermAlias(tag);
    if (!target) notFound();
    return <TagAliasRedirect alias={tag} target={target} />;
  }
  return <TagPage term={term} terms={facetTermsFromTree(tree)} />;
}

/**
 * The editor's `/tags/[tag]` — the same page, plus the affordances a read-only
 * export has no use for, for a signed-in editor, top right (43t).
 *
 * **Feature** (24c): the target is a slug, the form takes one, and `?term=`
 * preselects it exactly as `?group=` does. **Edit** (31e): the term form at
 * `/tags/<slug>/edit`, which updates the record — or, for a term that so far
 * lives only on its carriers, creates one at this slug. **Add a narrower
 * term** (35p): `/tags/new?parent=<slug>`, the parent preselected — shown
 * only for a term with a record, the only kind that can be a parent.
 *
 * Its own export rather than a prop on `tagRoute`, because a Next page module
 * exports a function and cannot pass it arguments — the editor's route file
 * wraps this one with the session, and the export's re-exports the plain one.
 */
export async function editorTagRoute(
  {
    params,
  }: {
    params: Promise<{ tag: string }>;
  },
  { signedIn = false }: { signedIn?: boolean } = {},
) {
  const { tag } = await params;
  const [term, tree] = await Promise.all([
    resolveTermPage(tag),
    tagTermReads.tree.read(),
  ]);
  if (!term) {
    /* An alias (32i): a real redirect, which the editor's server can send. */
    const target = await resolveTermAlias(tag);
    if (target) redirect(`/tags/${target.slug}`);
    notFound();
  }
  /*
   * Only a record can be a parent (`assertParent`), so a term that lives
   * only on its carriers offers no narrower term until Edit gives it one.
   */
  const hasRecord = Boolean(tree?.[term.slug]);
  const action = buttonVariants({ variant: "ghost", size: "sm" });
  return (
    <TagPage
      term={term}
      terms={facetTermsFromTree(tree)}
      signedIn={signedIn}
      actions={
        signedIn ? (
          <>
            <Link
              href={`/featured-recipe/new?term=${term.slug}`}
              className={action}
            >
              Feature
            </Link>
            <Link href={`/tags/${term.slug}/edit`} className={action}>
              Edit
            </Link>
            {hasRecord && (
              <Link
                href={`/tags/new?parent=${encodeURIComponent(term.slug)}`}
                className={action}
              >
                Add a narrower term
              </Link>
            )}
          </>
        ) : undefined
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
  if (!term) {
    const target = await resolveTermAlias(tag);
    return { title: target?.label ?? tag };
  }
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

/**
 * The export's params (32i): `generateTagStaticParams` plus every alias that
 * is not a term of its own, so `/tags/<alias>` is emitted as a redirect page.
 * The editor keeps the plain list and answers an alias on demand with a real
 * redirect, so nothing is prerendered there that would bake one in.
 */
export async function generateExportTagStaticParams(): Promise<
  { tag: string }[]
> {
  const slugs = await readTermPageSlugsWithAliases();
  if (slugs.length === 0) return [{ tag: "_" }];
  return slugs.map((tag) => ({ tag }));
}
