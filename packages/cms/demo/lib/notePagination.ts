import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";
import type { NoteIndexKey, NoteIndexValue } from "./notes";

/**
 * What one row of a paginated note list renders. Stored inline in the paged
 * keyspace, so reading a page needs no further lookups.
 */
export interface NoteListItem {
  slug: string;
  title: string;
  date: number;
}

/**
 * Notes by date, newest first.
 *
 * Its own module rather than a field inside `notes.ts`: the content config
 * imports this, and this imports only *types* back, so there is no cycle.
 *
 * `perPage` is small on purpose. At 4, a 14-note fixture spans four pages with
 * a partial head — enough for the tests to see sealing, folding and page
 * removal without a fixture that takes a minute to generate.
 */
export const notesByDate: PaginationIndexConfig<
  NoteIndexValue,
  NoteIndexKey,
  NoteListItem
> = {
  name: "by-date",
  perPage: 4,
  /*
   * The whole of this index's spec hash — declared, not derived.
   *
   * The engine once folded `fn.toString()` in too, which a production build
   * minifies and a dev server does not. An index built by one and read by the
   * other therefore read as stale and rebuilt itself — every page dirty, every
   * time. F16 removed the derived half.
   *
   * Both the fixture generators and the suite run against `next dev` — this
   * comment used to claim the suite ran against `next start`, which was never
   * true of any gated invocation (see F20). The boundary is still crossed, and
   * by two routes that matter: `pnpm e2e-start` builds with webpack and reuses
   * the same `test-content`, and a real deployment crosses it whenever two
   * builds share a content directory.
   *
   * So bump this by hand when `key`, `project` or `filter` changes — nothing
   * else will notice. `test/specVersions.test.ts` fails on any edit here until
   * someone has decided whether it needed a bump.
   */
  version: "1",
  key: ({ value, id }) => [value.date, id],
  project: ({ value, id }) => ({
    slug: id,
    title: value.title,
    date: value.date,
  }),
};
