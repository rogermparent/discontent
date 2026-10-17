/**
 * The editor instance's background work (epic 28): started once per server
 * process from `src/instrumentation.ts`.
 *
 * Every role:
 * - **watches the content repository's refs** (`watchRefs`), and
 * - **reindexes when HEAD moved without the editor** (D12): a push received
 *   from the workstation, a `git commit` in a shell, a CLI write. The
 *   editor's own commits advance the index stamp, so they never trigger it
 *   (the stamp is re-read after a short settle, since it lands just after
 *   HEAD moves);
 * - **reindexes once at start when the index version moved** (epic 39 D1):
 *   the indexes were built by code whose declared specs differ from this
 *   process's, or by code from before the version stamp.
 *
 * Every rebuild and every sync here runs as a job (epic 39 D2: `reindex`,
 * `git-sync`) in the repository's line (`jobs/repo.ts`), so `/jobs` shows
 * them beside imports.
 *
 * A **workstation** with mirrors in its settings also runs the **sync
 * runner** (D4): at startup, after every HEAD move that was not its own, on
 * a mirror's ping (through `/api/git/sync`) and on "Sync now" — one
 * `gitSync` per mirror, serialised in-process and locked across processes,
 * with a desktop notification when a mirror needs a person (D5) — and,
 * since epic 39 (D5), a POST to `RECIPE_NOTIFY_URL` when set, and a daily
 * reminder while a conflict or a dirty mirror stands (`attention.ts`). After
 * each sync it also tells the mirror's editor when a conflict starts or
 * clears (39 D4, `standing.ts`).
 *
 * A **mirror** with `WORKSTATION_URL`/`WORKSTATION_SYNC_TOKEN` **pings** the
 * workstation after every HEAD move and at startup.
 *
 * Off under TEST_MODE (Playwright's server) unless `INSTANCE_EVENTS=on`, and
 * off with `INSTANCE_EVENTS=off` anywhere. The state lives on `globalThis` so
 * a dev server's module reloads never stack a second watcher.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import { readHead, readIndexFreshness } from "@discontent/cms/git/indexStamp";
import { readSyncState } from "@discontent/cms/git/syncState";
import simpleGit from "simple-git";
import { watchRefs, type RefWatcher } from "@discontent/cms/git/watchRefs";
import {
  getEditorRole,
  type EditorRole,
} from "recipe-website-common/config/role";
import { readSettings } from "../../src/settings";
import { updateAnnexedWorktree } from "../curation/annex";
import { advanceStampPastUnindexed } from "../curation/unindexed";
import { currentIndexVersion } from "../indexVersion";
import { jobContext, type JobRun } from "../jobs/context";
import { outsideQueue, repoResource } from "../jobs/queue";
import { gitSync, type SyncResult } from "../curation/sync";
import { LockBusyError, withRepoLock } from "./lock";
import { mirrorTargets } from "./mirrors";
import { noteAttention, REMINDER_CHECK_MS } from "./attention";
import { pingWorkstation, workstationConfig, type PingState } from "./pinger";
import { refreshEditor } from "./refresh";
import { pushSiteSettings } from "./siteSettings";
import { pushStanding } from "./standing";
import { createCoalescedTask, type CoalescedTask } from "./coalesce";
import { createSyncRunner, type SyncRunner, type SyncTrigger } from "./runner";

export interface Instance {
  role: EditorRole;
  contentDirectory: string;
  runner?: SyncRunner<SyncResult[]>;
  pinger?: SyncRunner<PingState>;
  watcher?: RefWatcher;
  /** D12's reindex; kicked after every sync in case one was deferred. */
  reindexIfForeign?: CoalescedTask;
  /** Run `fn` exclusively with every other sync in this process. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  /** 39d, D5: the hourly look for a reminder that is due (workstation). */
  reminderTimer?: ReturnType<typeof setInterval>;
  close(): void;
}

interface InstanceGlobal {
  __discontentInstance?: Instance;
  __discontentInstanceStarting?: Promise<Instance | undefined>;
}

const g = globalThis as InstanceGlobal;

export function getInstance(): Instance | undefined {
  return g.__discontentInstance;
}

function enabled(): boolean {
  const flag = process.env.INSTANCE_EVENTS?.toLowerCase();
  if (flag === "off" || flag === "0" || flag === "false") return false;
  if (process.env.TEST_MODE) return flag === "on" || flag === "1";
  return true;
}

/** A promise chain: `exclusive` callers run one after another. */
function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** Syncs in progress in this process; D12's reindex waits them out. */
let activeSyncs = 0;

/**
 * A sync whose merge found the write lock held past its wait answers `busy`
 * (34d). The holder's own commit usually triggers the next sync, but a holder
 * that moves no HEAD (a rebuild, a write that changed nothing) would leave
 * the mirror's commits unmerged until the next trigger — so the runner is
 * asked again after `BUSY_RETRY_MS`, up to `BUSY_RETRY_LIMIT` times in a row.
 */
export const BUSY_RETRY_MS = 15_000;
export const BUSY_RETRY_LIMIT = 5;
let busyRetries = 0;
let busyRetryTimer: ReturnType<typeof setTimeout> | undefined;

function retryAfterBusy(outcome: SyncResult["outcome"]): void {
  if (outcome !== "busy") {
    busyRetries = 0;
    return;
  }
  if (busyRetryTimer || busyRetries >= BUSY_RETRY_LIMIT) return;
  busyRetries += 1;
  /*
   * Scheduled from inside the sync's job, in the repository's line: the
   * timer starts outside it, so the retried sync waits in line like any
   * other (a released hold no longer counts either — M1 — but this one
   * need not rely on that).
   */
  busyRetryTimer = outsideQueue(() =>
    setTimeout(() => {
      busyRetryTimer = undefined;
      getInstance()?.runner?.request("change");
    }, BUSY_RETRY_MS),
  );
  (busyRetryTimer as { unref?: () => void }).unref?.();
}

/**
 * How long a stale stamp must stay stale before D12 calls it foreign. The
 * editor's own commit moves HEAD first and advances the stamp just after
 * (`advanceIndexedHead`); on the Pi that gap can outlast the watcher's
 * debounce, and the editor rebuilt its indexes after its own writes.
 */
export const FOREIGN_SETTLE_MS = 2000;

/**
 * D12: rebuild the indexes if HEAD moved without the editor. A stale stamp is
 * re-read after `settleMs`, so a commit the editor is still finishing is not
 * mistaken for a foreign one. Answers whether it rebuilt.
 *
 * Epic 39 D1: also when the indexes were built by other code — the index
 * version (`currentIndexVersion`) differs from the one the last full rebuild
 * wrote, or none was written (the first start after 39b). That is what the
 * check at start catches after a deploy or `pnpm workstation update` that
 * moved a spec: one rebuild, as a `reindex` job (D2) in the repository's
 * line, and the version is written with the HEAD stamp. Both stale at once
 * is still one rebuild.
 */
export async function reindexWhenForeign(
  contentDirectory: string,
  { settleMs = FOREIGN_SETTLE_MS }: { settleMs?: number } = {},
): Promise<boolean> {
  const version = currentIndexVersion();
  let freshness = await readIndexFreshness(contentDirectory, { version });
  if (!freshness.stale && !freshness.versionStale) return false;
  if (freshness.stale) {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    freshness = await readIndexFreshness(contentDirectory, { version });
    if (!freshness.stale && !freshness.versionStale) return false;
  }
  /*
   * Commits that touch only the shopping list or the inventory (another
   * device's ticks, synced in) change nothing an index or a page cache holds
   * (35c review): move the stamp, skip the rebuild and the refresh. Not when
   * the code that built the indexes changed: then everything rebuilds.
   */
  if (
    !freshness.versionStale &&
    (await advanceStampPastUnindexed(contentDirectory))
  ) {
    console.info(
      "[instance] HEAD moved outside the editor in shopping/ or inventory/ only; no reindex",
    );
    return false;
  }
  const reason = freshness.versionStale
    ? freshness.indexedVersion
      ? `index version changed (${freshness.indexedVersion} → ${version})`
      : "no index version recorded yet"
    : "HEAD moved outside the editor";
  console.info(`[instance] ${reason}; reindexing`);
  const { runSpec } = await import("../jobs/kinds");
  /*
   * The job re-reads freshness once it has the line (39b review, L3): a
   * deploy's `POST /api/reindex` or a sync's merge just ahead of it may
   * have rebuilt already, and then it records "already fresh" and stops.
   * A failure is the job's (`failed` on `/jobs`) and is not retried here:
   * the next HEAD move asks again, and the stale-index banner says so.
   */
  const result = await runSpec({
    kind: "reindex",
    contentDirectory,
    trigger: "instance",
    reason,
  });
  if (result.skipped) return false;
  await refreshEditor();
  return true;
}

/**
 * Sync one mirror on the workstation, the way every trigger does — as a
 * `git-sync` job (39b, epic 39 D2): in the repository's line, then inside
 * the process mutex and the sync lock, with the ssh preflight read off the
 * remote's URL. Used by the runner, `/api/git/sync` and Sync now. Answers
 * the sync's result with the job's id as `job` (a sync that merged nothing
 * in and needs no look leaves no record — `syncWorthRecording`; the id is
 * then a job that no longer exists, answered 404 / `not_found`).
 */
export async function syncMirror(
  contentDirectory: string,
  remote: string | undefined,
  triggers: readonly SyncTrigger[] = ["manual"],
): Promise<SyncResult & { job: string }> {
  const { runSpec } = await import("../jobs/kinds");
  return runSpec({
    kind: "git-sync",
    contentDirectory,
    ...(remote ? { remote } : {}),
    triggers: [...triggers],
  });
}

/* --- the git-sync job's work ------------------------------------------- */

/** Syncs outside a running instance (TEST_MODE), one at a time. */
const fallbackExclusive = createMutex();

/** The instance's mutex when it runs this repository, else the fallback. */
function exclusiveFor(contentDirectory: string): Instance["exclusive"] {
  const instance = getInstance();
  return instance && sameDirectory(instance.contentDirectory, contentDirectory)
    ? instance.exclusive
    : fallbackExclusive;
}

function sameDirectory(a: string, b: string): boolean {
  return repoResource(a) === repoResource(b);
}

/**
 * A sync that lost the sync lock to another process's (39b review, L1):
 * `busy`, with one skipped `preflight` step naming the holder. Nothing was
 * fetched or written, and the sync state file is left to the winner, which
 * records its own attempt; `state` is the remote's record as it stands, with
 * this attempt's outcome. Not worth a row on `/jobs` (`syncWorthRecording`).
 */
async function lockRaceResult(
  contentDirectory: string,
  remote: string | undefined,
  error: LockBusyError,
): Promise<SyncResult> {
  const git = simpleGit({ baseDir: contentDirectory });
  const status = await git.status().catch(() => null);
  const name = remote ?? status?.tracking?.split("/")[0] ?? "";
  const previous = name
    ? (await readSyncState(contentDirectory))[name]
    : undefined;
  const message = `${error.message} This sync did nothing; that one records its own.`;
  return {
    remote: name,
    branch: status?.current ?? "",
    outcome: "busy",
    message,
    pulled: 0,
    pushed: 0,
    steps: [{ step: "preflight", status: "skipped", detail: error.message }],
    head: (await readHead(contentDirectory)) ?? "",
    state: {
      ...previous,
      remote: name,
      lastAttempt: new Date().toISOString(),
      outcome: "busy",
      message,
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
    },
  };
}

/**
 * One sync, as the `git-sync` job runs it (`jobs/kinds.ts`), already in the
 * repository's line: the sync's steps go into the job's log as they ended
 * (`sync.<step>`), and the merge's rebuild as `reindex.<type>` steps.
 */
export async function runMirrorSync(
  contentDirectory: string,
  remote: string | undefined,
  job: JobRun = {},
): Promise<SyncResult> {
  const { log } = jobContext(job);
  const settings = await readSettings();
  const targets = await mirrorTargets(
    contentDirectory,
    remote ? [remote] : (settings.mirrors ?? []),
  );
  const target = remote
    ? targets.find((candidate) => candidate.remote === remote)
    : targets[0];
  return exclusiveFor(contentDirectory)(async () => {
    activeSyncs += 1;
    try {
      const result = await log.step(
        "sync",
        { remote: remote ?? target?.remote },
        async (step) => {
          const synced = await withRepoLock(contentDirectory, () =>
            gitSync(
              { contentDirectory, onBulkChange: () => void refreshEditor() },
              {
                ...(remote
                  ? { remote }
                  : target
                    ? { remote: target.remote }
                    : {}),
                ...(target?.sshHost
                  ? { mirror: { sshHost: target.sshHost, dir: target.dir } }
                  : {}),
                job,
              },
            ),
          ).catch((error: unknown) => {
            /* L1: another process's sync holds the lock — `busy`, not a failure. */
            if (!(error instanceof LockBusyError)) throw error;
            return lockRaceResult(
              contentDirectory,
              remote ?? target?.remote,
              error,
            );
          });
          for (const entry of synced.steps) {
            (entry.status === "failed" ? log.warn : log.info)(
              `sync.${entry.step}`,
              entry.detail,
              { status: entry.status },
            );
          }
          step.set({
            outcome: synced.outcome,
            pulled: synced.pulled,
            pushed: synced.pushed,
          });
          return synced;
        },
      );
      /* D7: a mirror that is in step gets the site settings too. */
      if (
        target &&
        (result.outcome === "nothing" || result.outcome === "synced")
      ) {
        const sent = await pushSiteSettings(contentDirectory, target);
        /* A failure is logged when it changes, not on every sync: a mirror
         * on an older image answered 404 to each one until redeployed. */
        if (
          sent.status === "sent" ||
          (sent.status === "failed" && !sent.repeated)
        ) {
          console.info(
            `[sync] ${target.remote} site settings: ${sent.status}` +
              (sent.status === "failed" ? ` — ${sent.error}` : ""),
          );
        }
      }
      /*
       * 39d, D4: the mirror's editor hears when a conflict starts or clears,
       * whichever trigger found it — a ping's answer says it too, but the
       * workstation's own syncs answer no one. Logged like the settings.
       */
      const record = result.remote || target?.remote;
      /*
       * Not after `unreachable` (39d review): the mirror's editor is down
       * too, most likely, and each sync would wait out the send. The
       * mirror's startup ping asks anyway, and the next reachable sync sends.
       */
      if (record && result.outcome !== "unreachable") {
        const told = await pushStanding(
          contentDirectory,
          target?.remote === record ? target : { remote: record },
        );
        if (
          told.status === "sent" ||
          (told.status === "failed" && !told.repeated)
        ) {
          console.info(
            `[sync] ${record} told of the standing state: ${told.status}` +
              (told.status === "failed" ? ` — ${told.error}` : ""),
          );
        }
      }
      /*
       * 39d, D5: a person hears of a new state (or a reminder that is due)
       * only from a running instance — never from a test server's or a
       * script's sync, which would pop notifications on the desk.
       */
      const instance = getInstance();
      if (
        record &&
        instance &&
        sameDirectory(instance.contentDirectory, contentDirectory)
      ) {
        await noteAttention(contentDirectory, record);
      }
      retryAfterBusy(result.outcome);
      return result;
    } finally {
      activeSyncs -= 1;
      /*
       * A HEAD move that arrived mid-sync gets its re-check now — outside
       * this job's hold on the repository's line, which is let go as soon
       * as this returns; the rebuild waits in line like any other.
       */
      outsideQueue(() => void getInstance()?.reindexIfForeign?.kick());
    }
  });
}

export async function startInstance(): Promise<Instance | undefined> {
  if (g.__discontentInstance) return g.__discontentInstance;
  if (g.__discontentInstanceStarting) return g.__discontentInstanceStarting;
  if (!enabled()) return undefined;
  g.__discontentInstanceStarting = start().finally(() => {
    g.__discontentInstanceStarting = undefined;
  });
  return g.__discontentInstanceStarting;
}

async function start(): Promise<Instance | undefined> {
  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) return undefined;
  const role = getEditorRole();
  const exclusive = createMutex();

  /* --- D12: reindex when HEAD moved without the editor ------------------ */
  /*
   * Coalesced, never dropped: a HEAD move that lands mid-rebuild (or mid-sync,
   * whose merge rebuilds anyway) is re-checked once the rebuild is done.
   */
  const reindexIfForeign = createCoalescedTask(
    async () => {
      await reindexWhenForeign(contentDirectory);
    },
    { blocked: () => activeSyncs > 0 },
  );

  /*
   * --- D4/D5: the workstation's runner ----------------------------------
   * A person is told by `runMirrorSync` itself (39d: `noteAttention`, once
   * per new state, persisted), so a ping's sync and Sync now tell too.
   */
  async function runAll(triggers: SyncTrigger[]): Promise<SyncResult[]> {
    const settings = await readSettings();
    const targets = await mirrorTargets(contentDirectory, settings.mirrors);
    const results: SyncResult[] = [];
    for (const target of targets) {
      try {
        const result = await syncMirror(
          contentDirectory,
          target.remote,
          triggers,
        );
        console.info(
          `[sync] ${target.remote} (${triggers.join(",")}): ${result.outcome}` +
            (result.message ? ` — ${result.message}` : ""),
        );
        results.push(result);
      } catch (error) {
        if (error instanceof LockBusyError) {
          console.info(`[sync] ${target.remote}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
    return results;
  }

  const instance: Instance = {
    role,
    contentDirectory,
    exclusive,
    reindexIfForeign,
    close() {
      if (busyRetryTimer) clearTimeout(busyRetryTimer);
      busyRetryTimer = undefined;
      if (instance.reminderTimer) clearInterval(instance.reminderTimer);
      instance.watcher?.close();
      instance.runner?.dispose();
      instance.pinger?.dispose();
      g.__discontentInstance = undefined;
    },
  };

  const settings = await readSettings();
  /*
   * Always on a workstation, mirrors or not: the list is read per run, so a
   * mirror added on `/git` is synced without a restart, and a run with none
   * is one settings read.
   */
  if (role === "workstation") {
    instance.runner = createSyncRunner({
      run: runAll,
      headAfterRun: () => readHead(contentDirectory),
    });
    /*
     * 39d, D5: a reminder is due a day after the last word about a conflict
     * or a dirty mirror, sync or no sync; the clock is on disk, so a
     * restart neither repeats nor resets it.
     */
    instance.reminderTimer = setInterval(() => {
      /*
       * Inside the instance's mutex (39d review), so it never runs beside
       * this process's sync; its write is one locked step on the sync state
       * (`updateMirrorState`), so another process's sync recording meanwhile
       * keeps its fields. Neither takes the repository's line or the sync
       * lock: nothing here waits on them, so no order to keep.
       */
      void exclusive(async () => {
        for (const remote of (await readSettings()).mirrors ?? []) {
          await noteAttention(contentDirectory, remote);
        }
      }).catch(() => undefined);
    }, REMINDER_CHECK_MS);
    instance.reminderTimer.unref?.();
  }
  if (role === "mirror" && workstationConfig()) {
    instance.pinger = createSyncRunner({
      run: () => pingWorkstation(contentDirectory),
      debounceMs: 2000,
    });
  }

  instance.watcher = await watchRefs(contentDirectory, {
    onChange: async (head) => {
      /* Annexed content that arrived with a push (28e) becomes real files
       * before the reindex reads them. */
      await updateAnnexedWorktree(contentDirectory);
      await reindexIfForeign();
      instance.runner?.headMoved(head);
      instance.pinger?.request("change");
    },
  });

  g.__discontentInstance = instance;
  console.info(
    `[instance] ${role}: watching ${contentDirectory}` +
      (instance.runner
        ? `; syncing ${settings.mirrors?.join(", ") || "no mirrors yet"}`
        : "") +
      (instance.pinger ? `; pinging ${workstationConfig()?.url}` : ""),
  );

  void reindexIfForeign();
  instance.runner?.request("startup");
  instance.pinger?.request("startup");
  return instance;
}
