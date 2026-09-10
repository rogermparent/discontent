import type { ContentTypeConfig } from "@discontent/cms/content/types";
import buildPageIndexValue from "./buildIndexValue";
import createDefaultSlug from "./createSlug";
import type { Page, PageEntryKey, PageEntryValue } from "./types";

/**
 * Content type configuration for pages.
 *
 * Adopting this is what gives pages git-committed writes, an LMDB index,
 * uploads and slug-conflict handling. The three previous actions in this package
 * were `"use server"` functions with **no auth check at all** — a server action
 * is a POST endpoint, so anyone who could reach either site could create,
 * overwrite, or recursively `rm` any page. That was live on recipe.
 *
 * The data path moves under `pages/data/` (from bare `pages/<slug>/`) so the
 * index can live beside it at `pages/index/`, exactly as projects does.
 */
export const pageContentConfig: ContentTypeConfig<
  Page,
  PageEntryValue,
  PageEntryKey
> = {
  contentType: "pages",
  dataDirectory: "pages/data",
  indexDirectory: "pages/index",
  dataFilename: "page.json",
  uploadsDirectory: "uploads/page",
  buildIndexValue: buildPageIndexValue,
  buildIndexKey: (slug: string, data: Page): PageEntryKey => [data.date, slug],
  createDefaultSlug,
};

export default pageContentConfig;
