/**
 * The in-process backend: curation functions bound to one `CurationContext`.
 *
 * Deliberately thin. Everything of substance is in `controller/curation/`,
 * which 22d's API routes will call the same way; what lives here is the three
 * things only a *local* caller has to do — preflight the committer identity
 * before a write (fact 8), warn that a running editor is now stale, and close
 * the LMDB environments this process opened (T16).
 */
import { assertCommitIdentity } from "../../controller/curation/author";
import type { CurationContext } from "../../controller/curation/context";
import * as groups from "../../controller/curation/groups";
import { importAndCreate } from "../../controller/curation/importRecipe";
import * as recipes from "../../controller/curation/recipes";
import { reindex } from "../../controller/curation/reindex";
import { searchRecipes } from "../../controller/curation/search";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import type { CuratorBackend } from "./types";

/**
 * A CLI write and a running `next dev` are two processes over one directory,
 * and only one of them holds the cache. Nothing in *this* process can
 * invalidate it, so the honest move is to say so on stderr every time.
 *
 * 22d gives it an escape hatch rather than removing it: `--notify` posts
 * `/api/revalidate` and replaces this line with `Notified <origin>`. The
 * suggestion is only added when `--notify` was not passed, so a run that tried
 * and failed is not told to try the thing it just did.
 */
export const STALE_EDITOR_HINT =
  "A running editor is stale until Settings → Maintenance → Reload.";

/** Shown once, to a caller who has not discovered `--notify` yet. */
const NOTIFY_SUGGESTION =
  " Pass --notify --editor-url <url> to invalidate it automatically.";

export interface NotifyTarget {
  url: string;
  token?: string;
}

export interface LocalBackendOptions extends CurationContext {
  /**
   * Where to send `POST /api/revalidate` after a successful write.
   *
   * Set by `--notify`. Without it a local write leaves a running editor serving
   * what it had, because invalidating a Next cache from outside the Next
   * process is not a thing — which is what the hint above says.
   */
  notify?: NotifyTarget;
}

/**
 * Tell a running editor its caches are wrong.
 *
 * Failure is a **warning, not an error**: the write already landed on disk and
 * is committed. Turning "the editor was not running" into a non-zero exit would
 * make a correct write look failed, and would leave a scripted caller retrying
 * something it must not repeat.
 */
async function notifyEditor({ url, token }: NotifyTarget): Promise<string> {
  const target = new URL("/api/revalidate", url);
  const response = await fetch(target, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(
      `${target.origin} answered ${response.status} ${response.statusText}`.trim(),
    );
  }
  return `Notified ${target.origin}`;
}

export function createLocalBackend({
  notify,
  ...ctx
}: LocalBackendOptions): CuratorBackend {
  const guard = async () => {
    await assertCommitIdentity(ctx.contentDirectory);
  };

  return {
    kind: "local",

    async importRecipe(url, options = {}) {
      if (!options.dryRun) await guard();
      return importAndCreate(ctx, url, options);
    },
    async createRecipe(raw, options = {}) {
      await guard();
      return recipes.createRecipe(ctx, raw, options);
    },
    async updateRecipe(slug, raw) {
      await guard();
      return recipes.updateRecipe(ctx, slug, raw);
    },
    getRecipe: (slug) => recipes.getRecipe(ctx, slug),
    listRecipes: (options) => recipes.listRecipes(ctx, options),
    searchRecipes: (query, options) => searchRecipes(ctx, query, options),
    async deleteRecipe(slug) {
      await guard();
      return recipes.deleteRecipe(ctx, slug);
    },

    async createGroup(raw, options = {}) {
      await guard();
      return groups.createGroup(ctx, raw, options);
    },
    async addGroupItem(group, recipe, options = {}) {
      await guard();
      return groups.addItem(ctx, group, recipe, options);
    },
    async removeGroupItem(group, recipe) {
      await guard();
      return groups.removeItem(ctx, group, recipe);
    },
    async setGroupItems(group, items, options = {}) {
      await guard();
      return groups.setItems(ctx, group, items, options);
    },
    getGroup: (slug) => groups.getGroup(ctx, slug),
    listGroups: (options) => groups.listGroups(ctx, options),
    async deleteGroup(slug) {
      await guard();
      return groups.deleteGroup(ctx, slug);
    },

    /* `rebuildIndex` writes LMDB only and never commits: no identity needed. */
    reindex: (contentType) => reindex(ctx, contentType),

    async afterWrite() {
      if (!notify) return STALE_EDITOR_HINT + NOTIFY_SUGGESTION;
      try {
        return await notifyEditor(notify);
      } catch (error) {
        return `warning: could not notify ${notify.url}: ${
          error instanceof Error ? error.message : String(error)
        }\n${STALE_EDITOR_HINT}`;
      }
    },

    /*
     * LMDB environments are cached per process (`lmdb/environmentCache.ts`) and
     * a mapping outlives the last read. Closing on the way out is what keeps a
     * spawned CLI from leaving a lock file another process then trips over
     * (T3/T16).
     */
    close: closeCachedEnvironments,
  };
}
