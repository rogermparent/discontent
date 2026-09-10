import { resolve } from "path";

import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";

/**
 * Where projects live on disk.
 *
 * Two things here are load-bearing:
 *
 * 1. The content directory is resolved **per call**, not captured in a
 *    module-level const. This module used to import the eagerly-evaluated
 *    `contentDirectory`, which is computed at import time — so the
 *    `contentDirectory` argument could never actually take effect, and anything
 *    setting CONTENT_DIRECTORY after the module graph loaded silently wrote to
 *    the wrong tree.
 *
 * 2. Slugs are confined to the tree via the shared `resolveWithin` helper. This
 *    file used to carry that logic inline; it turned out to be a *class* of bug
 *    rather than a one-off — pages, menus and both sites' upload routes had the
 *    same shape — so the implementation now lives in one place.
 */
export function getProjectsBaseDirectory(contentDirectory?: string): string {
  return resolve(contentDirectory ?? getContentDirectory(), "projects", "data");
}

/**
 * Resolve a slug to its project directory, refusing to escape the projects tree.
 */
export function getProjectDirectory(
  slug: string,
  contentDirectory?: string,
): string {
  return resolveWithin(
    getProjectsBaseDirectory(contentDirectory),
    slug,
    "project slug",
  );
}

export function getProjectFilePath(basePath: string): string {
  return resolve(basePath, "project.json");
}

/*
 * `getProjectUploadsDirectory` used to live here, returning
 * `<projects/data/<slug>>/uploads`. That contradicted
 * `projectContentConfig.uploadsDirectory` ("uploads/project"), which is what
 * @discontent/cms actually writes to and reads from — so one of the two was
 * simply wrong. Nothing ever called it, which is how the disagreement survived.
 * The config wins; `controller/uploadUrl.ts` derives the public URL from it, so
 * there is one spelling of the layout rather than two.
 */
