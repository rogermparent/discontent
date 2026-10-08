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
 *   HEAD moves).
 *
 * A **workstation** with mirrors in its settings also runs the **sync
 * runner** (D4): at startup, after every HEAD move that was not its own, on
 * a mirror's ping (through `/api/git/sync`) and on "Sync now" — one
 * `gitSync` per mirror, serialised in-process and locked across processes,
 * with a desktop notification when a mirror needs a person (D5).
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
import type { MirrorSyncState } from "@discontent/cms/git/syncState";
import { watchRefs, type RefWatcher } from "@discontent/cms/git/watchRefs";
import {
  getEditorRole,
  type EditorRole,
} from "recipe-website-common/config/role";
import { readSettings } from "../../src/settings";
import { reindex } from "../curation/reindex";
import { gitSync, type SyncResult } from "../curation/sync";
import { LockBusyError, withRepoLock } from "./lock";
import { mirrorTargets } from "./mirrors";
import { attentionKey, attentionText, desktopNotify } from "./notify";
import { pingWorkstation, workstationConfig, type PingState } from "./pinger";
import { refreshEditor } from "./refresh";
import { pushSiteSettings } from "./siteSettings";
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
 */
export async function reindexWhenForeign(
  contentDirectory: string,
  { settleMs = FOREIGN_SETTLE_MS }: { settleMs?: number } = {},
): Promise<boolean> {
  if (!(await readIndexFreshness(contentDirectory)).stale) return false;
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  if (!(await readIndexFreshness(contentDirectory)).stale) return false;
  console.info("[instance] HEAD moved outside the editor; reindexing");
  await reindex({ contentDirectory });
  await refreshEditor();
  return true;
}

/**
 * Sync one mirror on the workstation, the way every trigger does: inside the
 * process mutex and the repository lock, with the ssh preflight read off the
 * remote's URL. Used by the runner and by `/api/git/sync`.
 */
export async function syncMirror(
  contentDirectory: string,
  remote: string | undefined,
  exclusive: Instance["exclusive"],
): Promise<SyncResult> {
  const settings = await readSettings();
  const targets = await mirrorTargets(
    contentDirectory,
    remote ? [remote] : (settings.mirrors ?? []),
  );
  const target = remote
    ? targets.find((candidate) => candidate.remote === remote)
    : targets[0];
  return exclusive(async () => {
    activeSyncs += 1;
    try {
      const result = await withRepoLock(contentDirectory, () =>
        gitSync(
          { contentDirectory, onBulkChange: () => void refreshEditor() },
          {
            ...(remote ? { remote } : target ? { remote: target.remote } : {}),
            ...(target?.sshHost
              ? { mirror: { sshHost: target.sshHost, dir: target.dir } }
              : {}),
          },
        ),
      );
      /* D7: a mirror that is in step gets the site settings too. */
      if (
        target &&
        (result.outcome === "nothing" || result.outcome === "synced")
      ) {
        const sent = await pushSiteSettings(contentDirectory, target);
        if (sent.status === "sent" || sent.status === "failed") {
          console.info(
            `[sync] ${target.remote} site settings: ${sent.status}` +
              (sent.status === "failed" ? ` — ${sent.error}` : ""),
          );
        }
      }
      return result;
    } finally {
      activeSyncs -= 1;
      /* A HEAD move that arrived mid-sync gets its re-check now. */
      void getInstance()?.reindexIfForeign?.kick();
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

  /* --- D4/D5: the workstation's runner ---------------------------------- */
  const attention = new Map<string, string | null>();
  function notifyIfNew(state: MirrorSyncState) {
    const key = attentionKey(state);
    const previous = attention.get(state.remote) ?? null;
    attention.set(state.remote, key);
    if (key && key !== previous) {
      const { title, body } = attentionText(state);
      desktopNotify(title, body);
    }
  }

  async function runAll(triggers: SyncTrigger[]): Promise<SyncResult[]> {
    const settings = await readSettings();
    const targets = await mirrorTargets(contentDirectory, settings.mirrors);
    const results: SyncResult[] = [];
    for (const target of targets) {
      try {
        const result = await syncMirror(
          contentDirectory,
          target.remote,
          exclusive,
        );
        console.info(
          `[sync] ${target.remote} (${triggers.join(",")}): ${result.outcome}` +
            (result.message ? ` — ${result.message}` : ""),
        );
        notifyIfNew(result.state);
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
  }
  if (role === "mirror" && workstationConfig()) {
    instance.pinger = createSyncRunner({
      run: () => pingWorkstation(contentDirectory),
      debounceMs: 2000,
    });
  }

  instance.watcher = await watchRefs(contentDirectory, {
    onChange: async (head) => {
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
