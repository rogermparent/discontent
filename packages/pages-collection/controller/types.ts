/**
 * An owner-authored standalone page (/about, /colophon…).
 *
 * `date` already existed on this shape, which is what makes the `[date, slug]`
 * index key available without a content migration.
 */
export interface Page {
  name: string;
  /** Epoch ms. */
  date: number;
  /** Long-form markdown body. */
  content: string;
}

/**
 * What the index carries.
 *
 * `content` is excluded deliberately. The old `readIndex` walked the tree
 * calling `getPageBySlug` on every page and spread the whole record, so the
 * pages list — and, in the export app, `generateStaticParams` — pulled every
 * page's entire markdown body into memory to render a list of names.
 */
export interface PageEntryValue {
  name: string;
}

/** [date, slug] — LMDB orders by key, so this gives date ordering for free. */
export type PageEntryKey = [number, string];
