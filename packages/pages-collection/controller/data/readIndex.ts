import { readListPage, type ListPage } from "@discontent/cms/content/listPage";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { pageContentConfig } from "../pageContentConfig";
import type { PageEntryKey, PageEntryValue } from "../types";

export interface PageIndexEntry extends PageEntryValue {
  slug: string;
  date: number;
}

export interface ReadPageIndexResult {
  pages: PageIndexEntry[];
  total: number;
  more: boolean;
}

/**
 * Read the page index, newest first.
 *
 * This replaces a `collectFiles` tree walk that called `getPageBySlug` on every
 * page and spread the whole record — so listing page *names* read every page's
 * full markdown body off disk, in both editors and in the export app's
 * `generateStaticParams`. Ordering is free here: the index key is `[date, slug]`
 * and LMDB iterates in key order.
 */
export default async function getPages(options?: {
  limit?: number;
  offset?: number;
  contentDirectory?: string;
}): Promise<ReadPageIndexResult> {
  const { entries, total, more } = await readContentIndex<
    PageEntryValue,
    PageEntryKey,
    PageIndexEntry
  >({
    config: pageContentConfig,
    limit: options?.limit,
    offset: options?.offset,
    reverse: true,
    contentDirectory: options?.contentDirectory,
    map: ({ key, value }) => ({ ...value, date: key[0], slug: key[1] }),
  });

  return { pages: entries, total, more };
}

/** Rows per page of the editors' pages list. */
export const PAGES_LIST_PER_PAGE = 20;

/**
 * One page of the editors' pages list (F6b/F6c): page 1 is the newest; null
 * past the end. See `@discontent/cms/content/listPage`.
 */
export function getPagesListPage(
  page: number,
  options?: { perPage?: number; contentDirectory?: string },
): Promise<ListPage<PageIndexEntry> | null> {
  return readListPage(
    page,
    options?.perPage ?? PAGES_LIST_PER_PAGE,
    async ({ limit, offset }) => {
      const { pages, more } = await getPages({
        limit,
        offset,
        contentDirectory: options?.contentDirectory,
      });
      return { entries: pages, more };
    },
  );
}
