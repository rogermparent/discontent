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
