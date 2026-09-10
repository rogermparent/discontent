import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type { PaginationMetaResult, PaginationPage } from "../types";

/**
 * The subset of `createCachedPaginationReads` a route needs.
 *
 * Structural rather than the factory's own return type: it keeps this module
 * from importing the caching layer, and lets a test hand in three plain
 * functions.
 */
export interface PaginatedIndexReads<TItem> {
  readHead: () => Promise<PaginationPage<TItem>>;
  readPage: (pageIndex: number) => Promise<PaginationPage<TItem> | null>;
  readMeta: () => Promise<PaginationMetaResult>;
}

/** What the renderer is told about the surface it is rendering. */
export interface PaginatedIndexRenderContext {
  /** True for the landing page, which folds the head with the page below it. */
  isLanding: boolean;
}

export interface CreatePaginatedIndexRouteOptions<TItem> {
  reads: PaginatedIndexReads<TItem>;
  render: (
    page: PaginationPage<TItem>,
    context: PaginatedIndexRenderContext,
  ) => ReactNode;
  /**
   * The URL number of page 0 — the *oldest* page. Page ids are internally
   * 0-based and anchored at the oldest item so a create moves nothing; a URL
   * that starts at 0 is merely unidiomatic, so the offset lives here, once,
   * rather than in each adopter's link building.
   */
  firstPageNumber?: number;
}

interface NumberedPageProps {
  params: Promise<{ page: string }>;
}

/**
 * The four route files a paginated index needs, from one config.
 *
 * Every adopter writes the same three things — a landing that reads the head,
 * a numbered page that validates its param against the meta record, and a
 * `generateStaticParams` derived from `numberedPages` — so they are written
 * here instead. The dynamic segment is `[page]`; the param name is fixed
 * because the directory name already is.
 *
 * @example
 * ```ts
 * const routes = createPaginatedIndexRoute({
 *   reads: recipePages,
 *   render: (page, { isLanding }) => (
 *     <RecipeIndexPageWrapper page={page} isLanding={isLanding} />
 *   ),
 * });
 * export default routes.numbered;
 * export const generateStaticParams = routes.generateStaticParams;
 * ```
 */
export function createPaginatedIndexRoute<TItem>({
  reads,
  render,
  firstPageNumber = 1,
}: CreatePaginatedIndexRouteOptions<TItem>) {
  /**
   * The landing page. Always renders, even for an empty corpus — the renderer
   * owns the empty state, since only it knows what to say.
   */
  async function landing(): Promise<ReactNode> {
    return render(await reads.readHead(), { isLanding: true });
  }

  /**
   * One numbered page, addressed by its stable id plus `firstPageNumber`.
   *
   * Only `0 … headPage - 2` exist. The head and the page folded into it are
   * reachable through the landing, so serving them here too would put the same
   * content at two URLs — hence a range check against `numberedPages` rather
   * than against `total`.
   */
  async function numbered({ params }: NumberedPageProps): Promise<ReactNode> {
    const { page: raw } = await params;
    /*
     * Digits only: `Number` would accept "1e1", " 2" and "0x3", and a negative
     * would land inside the array-index range check below by accident.
     */
    if (!/^\d+$/.test(raw)) notFound();

    const pageIndex = Number(raw) - firstPageNumber;
    const meta = await reads.readMeta();
    if (!meta.numberedPages.includes(pageIndex)) notFound();

    const page = await reads.readPage(pageIndex);
    if (!page) notFound();

    return render(page, { isLanding: false });
  }

  /**
   * The numbered routes to prerender, from one O(1) meta read — where the
   * hand-written form loads the entire corpus into an array purely to count it.
   *
   * Never empty. A corpus small enough to fit in the landing fold has no
   * numbered pages at all (`headPage <= 1`), but `output: export` rejects a
   * dynamic route whose params come back empty — "Page … is missing
   * generateStaticParams()" — so one param is emitted regardless. The page it
   * names does not exist, and `numbered` answers it with `notFound()` exactly
   * as it would at runtime; the export writes the 404 body there.
   */
  async function generateStaticParams(): Promise<{ page: string }[]> {
    const { numberedPages } = await reads.readMeta();
    if (numberedPages.length === 0) return [{ page: String(firstPageNumber) }];
    return numberedPages.map((pageIndex) => ({
      page: String(pageIndex + firstPageNumber),
    }));
  }

  return { landing, numbered, generateStaticParams };
}

export default createPaginatedIndexRoute;
