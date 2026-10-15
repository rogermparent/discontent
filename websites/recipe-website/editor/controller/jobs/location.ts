/**
 * Where the job store lives (epic 37, D1). Small and dependency-free: the
 * CLI and the stdio MCP server set their default here at startup, without
 * loading the store (35q's lazy startup).
 *
 * 1. `RECIPE_JOBS_DIR` — absolute, or relative to `INIT_CWD` (else the cwd),
 *    as `RECIPE_ENV_FILE` and `--content-dir` resolve.
 * 2. Under a test runner (`VITEST`) with none set: a directory under the
 *    system temp dir — never the editor's (`test/setupTests.js` gives each
 *    test file its own and removes it).
 * 3. `<root>/test-jobs` under `TEST_MODE` (the Playwright server, beside
 *    `test-content`), else `<root>/jobs`. The root is what `setJobsRoot`
 *    set — the CLI and the stdio MCP server set the editor package's
 *    directory, found from their own module the way `cli/editorEnv.ts`
 *    finds `editor/.env` — else the cwd, which is the editor package for
 *    `next start` / `next dev`.
 *
 * The directory names come from `process.env` rather than literals, for the
 * reason `getContentDirectory` gives: Turbopack constant-folds a literal
 * `resolve("jobs")` into a directory reference and would enumerate the
 * jobs as build inputs.
 */
import { homedir, tmpdir } from "node:os";
import path from "node:path";

let root: string | undefined;

/** The directory `jobs/` (or `test-jobs/`) defaults under: the editor package. */
export function setJobsRoot(directory: string | undefined): void {
  root = directory;
}

export function jobsDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const set = env.RECIPE_JOBS_DIR?.trim();
  if (set) {
    return path.resolve(env.INIT_CWD?.trim() || process.cwd(), set);
  }
  if (env.VITEST) return path.join(tmpdir(), "discontent-jobs-vitest");
  const name = env.TEST_MODE
    ? env.TEST_JOBS_DIR_NAME || "test-jobs"
    : env.JOBS_DIR_NAME || "jobs";
  return path.resolve(root ?? process.cwd(), name);
}

/**
 * Where the queue keeps its state (37b, D4 amended): the slot locks, the
 * waiters and the GPU hooks' state. **Machine-wide, not per checkout** —
 * the queue exists to share one GPU, so a CLI run from a worktree and the
 * workstation's editor (the main checkout) must see one queue even though
 * their job records live apart.
 *
 * 1. `RECIPE_QUEUE_DIR` — absolute, or relative as `RECIPE_JOBS_DIR` is.
 * 2. Under a test runner (`VITEST`) or the Playwright server (`TEST_MODE`):
 *    `<jobs dir>/queue`, so a suite never waits behind — or holds up — the
 *    machine's real imports.
 * 3. `~/.cache/discontent/queue`: one path for every process of the user,
 *    whatever its environment carries. (`$XDG_RUNTIME_DIR` would be tidier
 *    — tmpfs, gone at reboot — but a process started without it, from cron
 *    or a trimmed environment, would silently use another queue. A lock a
 *    reboot leaves behind is freed by the stale rules: its pid is dead, or
 *    its heartbeat is old.) In the Pi's container this is the container's
 *    own home, as its jobs dir is (D8).
 */
interface GpuUseGlobal {
  __discontentGpuUsed?: boolean;
}

/** This process took the `gpu` slot (37b; set by the queue's hooks). */
export function markGpuUsed(): void {
  (globalThis as GpuUseGlobal).__discontentGpuUsed = true;
}

/**
 * Whether this process has used the GPU — here, dependency-free, so the
 * CLI can ask at exit without loading the queue (35q's lazy startup).
 */
export function gpuUsedHere(): boolean {
  return (globalThis as GpuUseGlobal).__discontentGpuUsed === true;
}

export function queueDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const set = env.RECIPE_QUEUE_DIR?.trim();
  if (set) {
    return path.resolve(env.INIT_CWD?.trim() || process.cwd(), set);
  }
  if (env.VITEST || env.TEST_MODE) {
    return path.join(jobsDirectory(env), "queue");
  }
  return path.join(homedir(), ".cache", "discontent", "queue");
}
