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
import type { ContentWriteResult } from "@discontent/cms/content/types";
import path from "node:path";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";

export interface Author {
  name: string;
  email: string;
}

/**
 * One write, as the engine described it.
 *
 * `createContent`/`updateContent`/`deleteContent` each return a
 * `ContentWriteResult` naming exactly which pagination pages, aggregates and
 * dependents moved — the input `revalidateContentWrite` needs, and the thing
 * this layer used to throw away because a CLI has no cache to invalidate (fact
 * 2). It is reported rather than returned so the CLI's JSON contract is
 * unchanged: a caller that does not set `onWrite` sees exactly what 22c
 * shipped.
 */
export interface ContentWriteEvent {
  /** `recipes`, `groups`, … — the key `successConfigFor` is keyed by. */
  contentType: string;
  kind: "create" | "update" | "delete";
  result: ContentWriteResult;
  slug: string;
  /** Set only when an update moved the slug; the old URL needs expiring too. */
  previousSlug?: string;
}

export interface CurationContext {
  /** Absolute path to the content directory every engine call is given. */
  contentDirectory: string;
  author?: Author;
  /**
   * Called after every successful write, with the engine's own result.
   *
   * The seat the API routes fill with `revalidateContentWrite` (D9), and the
   * whole reason a write through the editor needs no "Settings → Maintenance →
   * Reload" afterwards. Synchronous and fire-and-forget: `revalidatePath` and
   * `revalidateTag` are both synchronous in Next, and a curation function must
   * not fail a write that already landed on disk because a cache hint threw.
   */
  onWrite?: (event: ContentWriteEvent) => void;
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
