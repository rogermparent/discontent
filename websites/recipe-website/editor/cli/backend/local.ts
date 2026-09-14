/**
 * The in-process backend: curation functions bound to one `CurationContext`.
 *
 * Deliberately thin. Everything of substance is in `controller/curation/`,
 * which 22d's API routes will call the same way; what lives here is the three
 * things only a *local* caller has to do — preflight the committer identity
 * before a write (fact 8), warn that a running editor is now stale, and close
 * the LMDB environments this process opened (T16).
 *
 * All three are wrong when the caller is the editor itself, which is what
 * `inProcess` turns off (23e/D25): `mcp/http.ts` builds this per request, in
 * the process that owns those caches.
 */
import { assertCommitIdentity } from "../../controller/curation/author";
import type { CurationContext } from "../../controller/curation/context";
import * as featured from "../../controller/curation/featured";
import * as git from "../../controller/curation/git";
import * as groups from "../../controller/curation/groups";
import { importAndCreate } from "../../controller/curation/importRecipe";
import * as recipes from "../../controller/curation/recipes";
import { reindex } from "../../controller/curation/reindex";
import { listTags, searchRecipes } from "../../controller/curation/search";
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
  /**
   * This backend is being built *inside* the editor, once per request (23e/D25).
   *
   * All three of the local-only jobs above are wrong there, and each is wrong
   * in a way that is invisible until it bites:
   *
   * - **The identity preflight** would demand a committer identity the routes
   *   deliberately do not demand (`author.ts`): a request already authenticated
   *   an author, and every other write route commits without asking. So `guard`
   *   becomes a no-op.
   * - **The stale-editor hint** is a lie in-process — this *is* the process
   *   that owns the caches, and `ctx.onWrite` has just invalidated them. So
   *   `afterWrite` is absent rather than empty (`registry.ts` calls
   *   `backend.afterWrite?.()`), which is what keeps `warnings` undefined over
   *   HTTP (T53).
   * - **`close()`** is `closeCachedEnvironments`, which is process-global: one
   *   request closing it would tear down the *server's* LMDB environments
   *   underneath every other request (T52). So it does nothing.
   *
   * `notify` is ignored for the same reason `afterWrite` goes: there is no
   * other process to tell. `resolve.ts` never sets this, so the CLI and the
   * stdio server are untouched.
   */
  inProcess?: boolean;
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
  inProcess = false,
  ...ctx
}: LocalBackendOptions): CuratorBackend {
  const guard = inProcess
    ? async () => {}
    : async () => {
        await assertCommitIdentity(ctx.contentDirectory);
      };

  const afterWrite = async () => {
    if (!notify) return STALE_EDITOR_HINT + NOTIFY_SUGGESTION;
    try {
      return await notifyEditor(notify);
    } catch (error) {
      return `warning: could not notify ${notify.url}: ${
        error instanceof Error ? error.message : String(error)
      }\n${STALE_EDITOR_HINT}`;
    }
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
    async updateGroup(slug, raw) {
      await guard();
      return groups.updateGroup(ctx, slug, raw);
    },
    async addGroupItem(group, ref, options = {}) {
      await guard();
      return groups.addItem(ctx, group, ref, options);
    },
    async removeGroupItem(group, ref) {
      await guard();
      return groups.removeItem(ctx, group, ref);
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

    listFeatured: (options) => featured.listFeatured(ctx, options),
    async feature(raw) {
      await guard();
      return featured.feature(ctx, raw);
    },
    async unfeature(slug) {
      await guard();
      return featured.unfeature(ctx, slug);
    },

    listTags: () => listTags(ctx),

    /* `rebuildIndex` writes LMDB only and never commits: no identity needed. */
    reindex: (contentType) => reindex(ctx, contentType),

    gitStatus: () => git.gitStatus(ctx),
    gitLog: (options) => git.gitLog(ctx, options),
    gitShow: (hash, options) => git.gitShow(ctx, hash, options),
    gitFileAt: (ref) => git.gitFileAt(ctx, ref),
    gitDiff: (options) => git.gitDiff(ctx, options),
    /*
     * Only the two that commit preflight the identity. `gitPush` sends commits
     * that already exist and makes none of its own, so demanding a committer
     * identity for it would refuse a perfectly good push on a repository
     * configured only to read (T47/T50) — and the reads never commit either.
     */
    async gitRevert(hash) {
      await guard();
      return git.gitRevert(ctx, hash);
    },
    async gitRestore(ref) {
      await guard();
      return git.gitRestore(ctx, ref);
    },
    gitPush: (options) => git.gitPush(ctx, options),

    /*
     * Spread rather than a property that returns `undefined`: the seam declares
     * `afterWrite?()`, `registry.ts` and the CLI both call it with `?.()`, and
     * an in-process write must produce no `warnings` entry at all (T53).
     */
    ...(inProcess ? {} : { afterWrite }),

    /*
     * LMDB environments are cached per process (`lmdb/environmentCache.ts`) and
     * a mapping outlives the last read. Closing on the way out is what keeps a
     * spawned CLI from leaving a lock file another process then trips over
     * (T3/T16) — and is exactly what an in-process backend must never do (T52).
     */
    close: inProcess ? async () => {} : closeCachedEnvironments,
  };
}
