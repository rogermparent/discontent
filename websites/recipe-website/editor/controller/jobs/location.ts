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
import { tmpdir } from "node:os";
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
