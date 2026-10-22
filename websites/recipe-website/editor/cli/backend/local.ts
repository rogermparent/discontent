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
import { gitSync } from "../../controller/curation/sync";
import { CurationError } from "../../controller/curation/errors";
import { LockBusyError, withRepoLock } from "../../controller/instance/lock";
import * as groups from "../../controller/curation/groups";
import * as holidays from "../../controller/curation/holidays";
import {
  setRecipeImage,
  setTermImage,
} from "../../controller/curation/recipeImage";
import * as inventory from "../../controller/curation/inventory";
import * as recipes from "../../controller/curation/recipes";
import * as shopping from "../../controller/curation/shopping";
import { listTags, searchRecipes } from "../../controller/curation/search";
import * as terms from "../../controller/curation/terms";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { absoluteLink } from "./link";
import type { JobSpec } from "../../controller/jobs/kinds";
import type { CuratorBackend, SeatRun } from "./types";

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

/**
 * Shown once, to a caller who has not set the invalidation up yet.
 *
 * Both halves are true of both callers: `resolveNotify` turns notification on
 * from `RECIPE_EDITOR_URL` alone, which is what the MCP tools have (`.mcp.json`
 * passes it through and there are no flags out there), and the CLI additionally
 * takes the two flags.
 */
const NOTIFY_SUGGESTION =
  " Set RECIPE_EDITOR_URL (or pass --notify --editor-url <url>) to invalidate it automatically.";

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

  /* The editor a link is made absolute on (41i, Di5). */
  const editorUrl = () => notify?.url ?? process.env.RECIPE_EDITOR_URL;

  /**
   * A seat's job (44c, Ec1): inside the caller's own job when it hands one
   * (the editor's agent — the seat's steps nest under its tool call, its
   * cancel is the run's), else a job of its own, cancelled with the caller's
   * `signal` when it hands only that.
   */
  async function runSeat<S extends JobSpec>(
    spec: S,
    run: SeatRun | undefined,
    { withCtx = true }: { withCtx?: boolean } = {},
  ) {
    const { runSpec, runSpecInline } =
      await import("../../controller/jobs/kinds");
    if (run?.job) {
      return runSpecInline(spec, {
        ...(withCtx ? { ctx } : {}),
        job: run.signal ? { ...run.job, signal: run.signal } : run.job,
      });
    }
    return runSpec(spec, {
      ...(withCtx ? { ctx } : {}),
      ...(run?.signal ? { signal: run.signal } : {}),
    });
  }

  return {
    kind: "local",

    /*
     * The import seats load the page parsers (`hast-util-*`, `mdast-util-*`)
     * when called, not with this module: every other command skips ~0.35 s
     * of startup that way (35q). Each runs as a job (epic 37): the job
     * registry is loaded with it, and the result carries `job`.
     */
    async importRecipe(url, options = {}, run) {
      if (!options.dryRun) await guard();
      const { corpusOf } = await import("../../controller/jobs/kinds");
      return runSeat(
        { kind: "import-url", ...corpusOf(ctx), url, options },
        run,
      );
    },
    async importText(text, options = {}, run) {
      if (!options.dryRun) await guard();
      const { corpusOf } = await import("../../controller/jobs/kinds");
      const { source, ...rest } = options;
      return runSeat(
        {
          kind: "import-text",
          ...corpusOf(ctx),
          text,
          ...(source ? { source } : {}),
          options: rest,
        },
        run,
      );
    },
    /*
     * 38e: the photos go into the job store first — the spec names them
     * there, so `recipes jobs retry` reads them again — after the vision
     * model is known to be configured (`usage` otherwise).
     */
    async importPhotos(files, options = {}, run) {
      const { assertPhotoImport } = await import("../../controller/llm/vision");
      assertPhotoImport();
      const { checkPhotoOptions } =
        await import("../../controller/curation/importPhoto");
      checkPhotoOptions(options);
      if (!options.dryRun) await guard();
      const { corpusOf } = await import("../../controller/jobs/kinds");
      const { jobsDirectory } = await import("../../controller/jobs/location");
      const { storePhotos } = await import("../../controller/jobs/photos");
      const photos = await storePhotos(jobsDirectory(), files);
      const { source, ...rest } = options;
      return runSeat(
        {
          kind: "import-photo",
          ...corpusOf(ctx),
          photos,
          ...(source ? { source } : {}),
          options: rest,
        },
        run,
      );
    },
    /* Reads a page and nothing else: no identity, no write. */
    async inspect(url, options = {}, run) {
      return runSeat(
        {
          kind: "inspect",
          url,
          ...(options.llm ? { llm: options.llm } : {}),
        },
        run,
        { withCtx: false },
      );
    },
    async inspectList(url, run) {
      const { corpusOf } = await import("../../controller/jobs/kinds");
      return runSeat({ kind: "inspect-list", ...corpusOf(ctx), url }, run);
    },
    async importList(url, options, run) {
      if (!options.dryRun) await guard();
      const { corpusOf } = await import("../../controller/jobs/kinds");
      return runSeat(
        { kind: "import-list", ...corpusOf(ctx), url, options },
        run,
      );
    },
    async createRecipe(raw, { dryRun, ...options } = {}) {
      if (dryRun) return recipes.previewCreateRecipe(ctx, raw);
      await guard();
      return recipes.createRecipe(ctx, raw, options);
    },
    async updateRecipe(slug, raw, { dryRun } = {}) {
      if (dryRun) return recipes.previewUpdateRecipe(ctx, slug, raw);
      await guard();
      return recipes.updateRecipe(ctx, slug, raw);
    },
    async setRecipeImage(slug, input) {
      await guard();
      return setRecipeImage(ctx, slug, input);
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

    listTerms: (options) => terms.listTerms(ctx, options),
    getTerm: (slug) => terms.getTerm(ctx, slug),
    async createTerm(raw) {
      await guard();
      return terms.createTerm(ctx, raw);
    },
    async updateTerm(slug, raw) {
      await guard();
      return terms.updateTerm(ctx, slug, raw);
    },
    async setTermImage(slug, input) {
      await guard();
      return setTermImage(ctx, slug, input);
    },
    async deleteTerm(slug, options = {}) {
      await guard();
      return terms.deleteTerm(ctx, slug, options);
    },
    async renameTerm(slug, raw) {
      await guard();
      return terms.renameTerm(ctx, slug, raw);
    },
    async mergeTerm(slug, raw) {
      await guard();
      return terms.mergeTerm(ctx, slug, raw);
    },
    async assignTerm(slug, raw) {
      await guard();
      return terms.assignTerm(ctx, slug, raw);
    },

    /*
     * `rebuildIndex` writes LMDB only and never commits: no identity needed.
     * A `reindex` job (epic 39 D2), so the editor's `/jobs` shows a CLI
     * rebuild too, with its per-type steps, and it waits in the
     * repository's line behind a sync instead of racing it.
     */
    async reindex(contentType) {
      const { runSpec, corpusOf } = await import("../../controller/jobs/kinds");
      return runSpec(
        {
          kind: "reindex",
          ...corpusOf(ctx),
          ...(contentType ? { contentType } : {}),
          trigger: inProcess ? "mcp" : "local",
        },
        { ctx },
      );
    },

    getInventory: () => inventory.readInventory(ctx),
    async patchInventory(raw) {
      await guard();
      return inventory.patchInventory(ctx, raw);
    },
    async setInventory(raw) {
      await guard();
      return inventory.setInventory(ctx, raw);
    },
    /* `link` on the editor this checkout serves, when it says where (41i,
     * Di5): `--notify`'s URL, else `RECIPE_EDITOR_URL` (`.mcp.json`, the
     * CLI's `editor/.env`). */
    async inventoryMakeable(options) {
      const result = await inventory.makeable(ctx, options ?? {});
      return {
        ...result,
        link: absoluteLink(
          result.link,
          notify?.url ?? process.env.RECIPE_EDITOR_URL,
        ),
      };
    },

    /* `link` on this checkout's editor, as `inventoryMakeable`'s (42h). */
    async holidayList(options) {
      const result = await holidays.holidayList(ctx, options);
      return { ...result, link: absoluteLink(result.link, editorUrl()) };
    },
    async holidayGet(slug, options) {
      const result = await holidays.holidayGet(ctx, slug, options);
      return { ...result, link: absoluteLink(result.link, editorUrl()) };
    },

    getShopping: (options) => shopping.readShoppingView(ctx, options),
    async addToShopping(raw) {
      await guard();
      return shopping.addToShopping(ctx, raw);
    },
    async patchShopping(raw) {
      await guard();
      return shopping.patchShopping(ctx, raw);
    },
    async clearShopping(raw) {
      await guard();
      return shopping.clearShopping(ctx, raw ?? {});
    },
    getShoppingSettings: () => shopping.getShoppingSettings(ctx),
    async updateShoppingSettings(raw) {
      await guard();
      return shopping.updateShoppingSettings(ctx, raw);
    },

    gitStatus: (options) => git.gitStatus(ctx, options),
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
    gitFetch: (options) => git.gitFetch(ctx, options),
    /* A pull can make a merge commit, so it preflights like revert does. */
    async gitPull(options) {
      await guard();
      return git.gitPull(ctx, options);
    },
    /* A sync can merge, so it preflights the identity like a pull. */
    /*
     * Under the same repository sync lock the editor's instance takes
     * (`instance/lock.ts`, 34d), so a CLI or MCP sync never runs beside the
     * workstation's: the merge was already serialised by the write lock, the
     * fetch and push were not. Another sync running is `busy` — retry shortly.
     */
    async gitSync(options) {
      await guard();
      try {
        return await withRepoLock(ctx.contentDirectory, () =>
          gitSync(ctx, options),
        );
      } catch (error) {
        if (error instanceof LockBusyError) {
          throw new CurationError("busy", `${error.message} Retry shortly.`);
        }
        throw error;
      }
    },

    /*
     * The job store (37c): this machine's (`jobsDirectory()`), loaded only
     * when asked (35q). In the editor (`inProcess`, MCP over HTTP) it is the
     * editor's own store. A retry runs here, with this backend's context,
     * and is awaited — a CLI's process would end under it otherwise.
     */
    async listJobs(options) {
      const { listJobSummaries } = await import("../../controller/jobs/views");
      return listJobSummaries(options);
    },
    async getJob(id, options = {}) {
      const { getJobView } = await import("../../controller/jobs/views");
      return getJobView(id, options);
    },
    async cancelJob(id) {
      const { cancelJobById } = await import("../../controller/jobs/views");
      return cancelJobById(id);
    },
    async retryJob(id, { fresh = false } = {}) {
      const { retryJobById, requireJob } =
        await import("../../controller/jobs/views");
      const { retrySpecFor, specWrites } =
        await import("../../controller/jobs/kinds");
      /* Another content directory's job is refused before anything else. */
      const spec = await retrySpecFor(await requireJob(id), ctx);
      /* A retry that writes needs a committer, as the import it replays. */
      if (specWrites(spec)) await guard();
      return retryJobById(id, ctx, { wait: !inProcess, fresh });
    },

    /*
     * The editor's agent (44c), run here: a committer first, as any write,
     * then the run as a job of this process's store, followed through its
     * own files until it ends. The wait between reads also ends when the
     * run does, so the answer is not a poll late. A Ctrl-C cancels it with
     * the process's other jobs (`index.ts`), and the follow reads its end.
     */
    async runAgent(input, { onProgress, pollMs } = {}) {
      await guard();
      const [
        { startAgentRun, getAgentRunView },
        { followAgentRun, agentFollowMs },
      ] = await Promise.all([
        import("../../controller/agent/runs"),
        import("../../controller/agent/follow"),
      ]);
      const started = await startAgentRun(ctx, input);
      const settled = started.done.then(
        () => undefined,
        () => undefined,
      );
      const every = pollMs ?? agentFollowMs();
      return followAgentRun(
        (from, transcriptFrom) =>
          getAgentRunView(started.job, { from, transcriptFrom }),
        {
          ...(onProgress ? { onProgress } : {}),
          wait: async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([
              settled,
              new Promise((resolve) => {
                timer = setTimeout(resolve, every);
              }),
            ]);
            clearTimeout(timer);
            return true;
          },
        },
      );
    },

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
