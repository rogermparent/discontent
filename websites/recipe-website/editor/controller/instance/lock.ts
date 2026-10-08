/**
 * A cross-process lock on one content repository's sync (epic 28, D4).
 *
 * The runner serialises runs inside one process; this stops two processes
 * (a `next dev` and a `next start` on the same checkout, or the CLI's
 * `recipes git sync` while the editor syncs) merging at once. `O_EXCL`
 * create of `.git/discontent-sync.lock` holding the pid; a lock whose pid is
 * gone, or older than `staleMs`, is taken over.
 */
import { open, readFile, rm, stat } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";

const LOCK_NAME = "discontent-sync.lock";

async function lockPath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      LOCK_NAME,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class LockBusyError extends Error {
  constructor(public readonly holder: number | null) {
    super(
      `Another process${holder ? ` (pid ${holder})` : ""} is syncing this repository.`,
    );
  }
}

export async function withRepoLock<T>(
  contentDirectory: string,
  fn: () => Promise<T>,
  { staleMs = 15 * 60_000 }: { staleMs?: number } = {},
): Promise<T> {
  const path = await lockPath(contentDirectory);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(`${process.pid}\n`);
      } finally {
        await handle.close();
      }
      try {
        return await fn();
      } finally {
        await rm(path, { force: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = Number(
        (await readFile(path, "utf8").catch(() => "")).trim(),
      );
      const age =
        Date.now() - (await stat(path).catch(() => ({ mtimeMs: 0 }))).mtimeMs;
      const stale =
        !Number.isFinite(holder) ||
        holder <= 0 ||
        !alive(holder) ||
        age > staleMs;
      if (!stale || attempt > 0) {
        throw new LockBusyError(Number.isFinite(holder) ? holder : null);
      }
      await rm(path, { force: true });
    }
  }
  throw new LockBusyError(null);
}
