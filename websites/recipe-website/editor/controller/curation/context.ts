/**
 * The one argument every curation function takes first.
 *
 * There is no `getContentDirectory()` anywhere under `controller/curation/`
 * and there cannot be one: `packages/cms/fs/getContentDirectory.ts` evaluates
 * its module-scope `contentDirectory` const at import time and reads
 * `CONTENT_DIRECTORY` verbatim, so a process that sets the env after importing
 * the engine gets the wrong directory with no error at all (T16). Threading it
 * explicitly is also what lets 22d's API routes reuse this layer per request,
 * and what lets `test/curation.test.ts` drive it against a tmpdir.
 *
 * `author` is only ever the git `--author` of the commit a write makes. The
 * *committer* identity comes from the content repository itself, which is why
 * `author.ts` preflights it separately.
 */
import path from "node:path";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";

export interface Author {
  name: string;
  email: string;
}

export interface CurationContext {
  /** Absolute path to the content directory every engine call is given. */
  contentDirectory: string;
  author?: Author;
}

/** Where a recipe is served in both apps. */
export const RECIPE_URL_BASE = "/recipe";
/** Where a group is served in both apps. */
export const GROUP_URL_BASE = "/group";

export function recipePath(ctx: CurationContext, slug: string): string {
  return path.join(
    ctx.contentDirectory,
    recipeContentConfig.dataDirectory,
    slug,
    recipeContentConfig.dataFilename,
  );
}

export function groupPath(ctx: CurationContext, slug: string): string {
  return path.join(
    ctx.contentDirectory,
    groupContentConfig.dataDirectory,
    slug,
    groupContentConfig.dataFilename,
  );
}

export function recipeUrl(slug: string): string {
  return `${RECIPE_URL_BASE}/${slug}`;
}

export function groupUrl(slug: string): string {
  return `${GROUP_URL_BASE}/${slug}`;
}
