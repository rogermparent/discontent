/**
 * Numbered pages over an offset read, for editor list UIs (F6, epic 35q).
 *
 * The editor lists (pages, projects, resumes) read the content index, newest
 * first, with `limit`/`offset` — values are small (a name, a date), so the read
 * is not what F6 was about. What they lacked was a way to reach row 21: F29
 * found F6 is a *paging affordance* (a page param and links), not a read swap.
 * A pagination keyspace would buy stable page ids, which matter for sealed,
 * cached export pages and not for a dynamic, signed-in editor list; so these
 * pages number from the newest (`1` is the newest `perPage` rows) and a write
 * moves rows between pages, as any offset list does.
 */

/**
 * A `?page=` search param as a page number: 1 when absent, null when it is not
 * a positive integer written plainly (so `?page=02` or `?page=1.5` is not a
 * second spelling of a real page).
 */
export function parseListPage(
  raw: string | string[] | undefined,
): number | null {
  if (raw === undefined) return 1;
  if (Array.isArray(raw)) return null;
  if (!/^[1-9]\d{0,5}$/.test(raw)) return null;
  return Number(raw);
}

export interface ListPage<T> {
  entries: T[];
  /** 1-based, newest first. */
  page: number;
  /** The page before this one (newer rows), or null on page 1. */
  newerPage: number | null;
  /** The page after this one (older rows), or null when there is none. */
  olderPage: number | null;
}

/**
 * Read page `page` (1-based, newest first) of `perPage` rows through `read`.
 * Null for a page past the end — but page 1 always answers, empty or not, so
 * an empty list renders its own "nothing yet" rather than a 404.
 */
export async function readListPage<T>(
  page: number,
  perPage: number,
  read: (options: {
    limit: number;
    offset: number;
  }) => Promise<{ entries: T[]; more: boolean }>,
): Promise<ListPage<T> | null> {
  const { entries, more } = await read({
    limit: perPage,
    offset: (page - 1) * perPage,
  });
  if (page > 1 && entries.length === 0) return null;
  return {
    entries,
    page,
    newerPage: page > 1 ? page - 1 : null,
    olderPage: more ? page + 1 : null,
  };
}
