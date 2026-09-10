import { resolve } from "path";

import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";

/**
 * Where pages live on disk.
 *
 * Two fixes carried over from projects, because both bugs were the same shape:
 *
 * 1. The content directory is resolved **per call**. This module used to import
 *    the eagerly-evaluated `contentDirectory` const, computed at import time, so
 *    the `contentDirectory` argument could never take effect and anything
 *    setting CONTENT_DIRECTORY after the module graph loaded silently addressed
 *    the wrong tree.
 *
 * 2. Slugs are confined to the tree. The delete action hands its slug straight
 *    to a recursive `rm`, and until now nothing stopped `../../` from walking
 *    out of `pages/`.
 *
 * The data path is `pages/data/` (was bare `pages/<slug>/`) so the LMDB index
 * can live beside it at `pages/index/`, matching projects.
 */
export function getPagesBaseDirectory(contentDirectory?: string): string {
  return resolve(contentDirectory ?? getContentDirectory(), "pages", "data");
}

export function getPageDirectory(
  slug: string,
  contentDirectory?: string,
): string {
  return resolveWithin(
    getPagesBaseDirectory(contentDirectory),
    slug,
    "page slug",
  );
}

export function getPageFilePath(basePath: string): string {
  return resolve(basePath, "page.json");
}

export function getPageUploadsDirectory(basePath: string): string {
  return resolve(basePath, "uploads");
}
