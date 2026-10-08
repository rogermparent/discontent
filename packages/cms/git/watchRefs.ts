/**
 * Notice when a content repository's HEAD moves, however it moved (epic 28,
 * D4/D12): a commit through the engine, the `recipes` CLI, an agent over MCP,
 * a `git commit` in a shell, a pull, or a push received into the repository
 * (the Pi's `updateInstead`).
 *
 * `fs.watch` (inotify on Linux) on the git directory and on `refs/heads/`,
 * not on files: git writes a ref as `<name>.lock` and renames it into place,
 * and a watch on the old inode would go deaf after the first commit. Events
 * are only a hint — after the debounce the current HEAD is read and compared
 * with the last one seen, so a burst of writes is one callback, a lock file
 * coming and going is none, and an event the kernel coalesced is still
 * caught by the next one.
 *
 * Plain Node: no Next import, so the editor's instrumentation, the CLI or a
 * test can all use it.
 */
import { watch, type FSWatcher } from "fs";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";
import { readHead } from "./indexStamp";

export interface WatchRefsOptions {
  /** Quiet time after the last event before HEAD is read. */
  debounceMs?: number;
  /** Called with the new HEAD and the one before it. Errors are logged. */
  onChange: (head: string, previous: string | null) => void | Promise<void>;
  /** For tests: called after every check, changed or not. */
  onCheck?: (head: string | null) => void;
}

export interface RefWatcher {
  close(): void;
  /** Force a check now (tests, and after a known external event). */
  check(): Promise<void>;
  readonly head: string | null;
}

async function gitDirectory(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-dir",
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

const INTERESTING = /^(HEAD|packed-refs|ORIG_HEAD|FETCH_HEAD)$|\.lock$/;

export async function watchRefs(
  contentDirectory: string,
  { debounceMs = 1500, onChange, onCheck }: WatchRefsOptions,
): Promise<RefWatcher> {
  const gitDir = await gitDirectory(contentDirectory);
  let head = await readHead(contentDirectory);
  let timer: NodeJS.Timeout | undefined;
  let checking: Promise<void> | null = null;
  const watchers: FSWatcher[] = [];

  async function check(): Promise<void> {
    if (checking) {
      await checking;
    }
    checking = (async () => {
      const next = await readHead(contentDirectory).catch(() => head);
      onCheck?.(next);
      if (next && next !== head) {
        const previous = head;
        head = next;
        try {
          await onChange(next, previous);
        } catch (error) {
          console.error("[watchRefs] onChange failed:", error);
        }
      }
    })();
    try {
      await checking;
    } finally {
      checking = null;
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void check();
    }, debounceMs);
    timer.unref?.();
  }

  /* The git directory itself: HEAD, packed-refs, a detached HEAD moving. */
  watchers.push(
    watch(gitDir, { persistent: false }, (_event, filename) => {
      if (!filename || INTERESTING.test(String(filename))) schedule();
    }),
  );
  /* Branch refs. Recursive where the platform supports it (branch names with
   * a `/` live in subdirectories); Linux has had it since Node 19. */
  try {
    watchers.push(
      watch(
        join(gitDir, "refs", "heads"),
        { persistent: false, recursive: true },
        () => schedule(),
      ),
    );
  } catch {
    watchers.push(
      watch(join(gitDir, "refs", "heads"), { persistent: false }, () =>
        schedule(),
      ),
    );
  }

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
    check,
    get head() {
      return head;
    },
  };
}
