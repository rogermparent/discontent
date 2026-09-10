import { readJson } from "fs-extra";
import { getPageDirectory, getPageFilePath } from "../filesystemDirectories";
import type { Page } from "../types";

/**
 * Read one page's full data, including its markdown body.
 *
 * Throws ENOENT for an unknown slug — callers rendering a route must catch and
 * `notFound()`, in the page *and* in generateMetadata, since Next runs them
 * independently and an unguarded metadata call turns a 404 into a 500.
 */
export default async function getPageBySlug(
  slug: string,
  contentDirectory?: string,
): Promise<Page> {
  return readJson(getPageFilePath(getPageDirectory(slug, contentDirectory)));
}
