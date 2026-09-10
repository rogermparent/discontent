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
 * and only one of them holds the cache. Nothing here can invalidate it — that
 * is what 22d's `POST /api/revalidate` and `--notify` are for — so the honest
 * move is to say so on stderr every time.
 */
export const STALE_EDITOR_HINT =
  "A running editor is stale until Settings → Maintenance → Reload.";

export function createLocalBackend(ctx: CurationContext): CuratorBackend {
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
      return STALE_EDITOR_HINT;
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
