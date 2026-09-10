import { resolve } from "path";

import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";

/**
 * Where menus live on disk.
 *
 * Menus are deliberately **not** on the generic content pipeline: they are two
 * or three fixed-slug singletons ("header", "footer") with no date, so an index
 * would buy nothing, and the update action doubles as create — which the
 * `menus.spec` flow depends on. What they did share with every other collection
 * were the two bugs fixed here:
 *
 * 1. The content directory is resolved **per call**, not captured at import time.
 * 2. Slugs are confined to the tree — `deleteMenu` hands its slug to a recursive
 *    `rm`.
 */
export function getMenusBaseDirectory(contentDirectory?: string): string {
  return resolve(contentDirectory ?? getContentDirectory(), "menus");
}

export function getMenuDirectory(
  slug: string,
  contentDirectory?: string,
): string {
  return resolveWithin(
    getMenusBaseDirectory(contentDirectory),
    slug,
    "menu slug",
  );
}

export function getMenuFilePath(basePath: string): string {
  return resolve(basePath, "menu.json");
}

export function getMenuUploadsDirectory(basePath: string): string {
  return resolve(basePath, "uploads");
}
