import type { PaginatedIndexReads } from "./createPaginatedIndexRoute";

export interface CreatePaginatedJsonRouteOptions<TItem> {
  reads: PaginatedIndexReads<TItem>;
  /**
   * The URL number of page 0 — the *oldest* page. Must match the HTML routes'
   * offset for the same index, or a numbered deep link would seed the client
   * list from a different page than the server rendered.
   */
  firstPageNumber?: number;
}

interface NumberedRouteContext {
  params: Promise<{ page: string }>;
}

/**
 * A 404 with a body, rather than `notFound()`.
 *
 * A route handler has no error boundary to throw into, and under
 * `output: "export"` the status is not preserved anyway — the body is what
 * gets written to disk. So the body has to be the signal: a client that walks
 * off the end of the keyspace parses this and sees no `items`, whether it is
 * talking to a server or to a file on a CDN.
 */
function pageNotFound(): Response {
  return Response.json({ error: "Page not found" }, { status: 404 });
}

/**
 * The JSON twin of `createPaginatedIndexRoute` — the same index, addressed by
 * the same URLs, answered as data instead of HTML.
 *
 * It exists so a client can keep walking a list the server started rendering.
 * `PaginationPage` was shaped for both audiences at P1 (`types.ts:262`, whose
 * `olderPage` / `newerPage` comments name `getNextPageParam` outright), so
 * there is no projection here and no second payload shape to keep in step:
 * these handlers serve the identical object the renderer was handed.
 *
 * Validation is duplicated from the HTML factory deliberately rather than
 * shared. The two differ in exactly one respect — how they say "no" — and
 * hoisting eight lines to hide that difference behind a parameter would cost
 * more than it saves.
 *
 * @example
 * ```ts
 * const json = createPaginatedJsonRoute({ reads: recipePages });
 * export const GET = json.numbered;
 * export const generateStaticParams = json.generateStaticParams;
 * ```
 */
export function createPaginatedJsonRoute<TItem>({
  reads,
  firstPageNumber = 1,
}: CreatePaginatedJsonRouteOptions<TItem>) {
  /**
   * The head page — the same fold the landing renders, as JSON.
   *
   * Its `olderPage` is `headPage - 2`, skipping the page folded into the
   * landing, so a client seeded here and walking `olderPage` sees every item
   * exactly once. That property is `readHead`'s, not this route's; it is noted
   * because the infinite list depends on it.
   */
  async function head(): Promise<Response> {
    return Response.json(await reads.readHead());
  }

  /**
   * One numbered page. Only `0 … headPage - 2` exist, checked against
   * `numberedPages` for the same reason the HTML route does: the head and the
   * page folded into it are reachable through the landing, and serving them
   * here too would put the same items at two URLs.
   */
  async function numbered(
    _request: Request,
    { params }: NumberedRouteContext,
  ): Promise<Response> {
    const { page: raw } = await params;
    /*
     * Digits only: `Number` would accept "1e1", " 2" and "0x3", and a negative
     * would land inside the array-index range check below by accident.
     */
    if (!/^\d+$/.test(raw)) return pageNotFound();

    const pageIndex = Number(raw) - firstPageNumber;
    const meta = await reads.readMeta();
    if (!meta.numberedPages.includes(pageIndex)) return pageNotFound();

    const page = await reads.readPage(pageIndex);
    if (!page) return pageNotFound();

    return Response.json(page);
  }

  /**
   * The numbered chunks to bake, from one O(1) meta read.
   *
   * Never empty, for the reason the HTML factory documents at length:
   * `output: export` rejects a dynamic route whose params come back empty. The
   * emitted param names a page that does not exist, and `numbered` answers it
   * with the 404 body — which is a perfectly good thing to write to disk here,
   * since a client walking `olderPage` never asks for it.
   */
  async function generateStaticParams(): Promise<{ page: string }[]> {
    const { numberedPages } = await reads.readMeta();
    if (numberedPages.length === 0) return [{ page: String(firstPageNumber) }];
    return numberedPages.map((pageIndex) => ({
      page: String(pageIndex + firstPageNumber),
    }));
  }

  return { head, numbered, generateStaticParams };
}

export default createPaginatedJsonRoute;
