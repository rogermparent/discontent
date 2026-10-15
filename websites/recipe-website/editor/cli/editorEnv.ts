/**
 * The CLI and the stdio MCP server read `editor/.env` (35-D11).
 *
 * `--notify` used to answer 401 from a running editor: the token it needs,
 * `RECIPE_API_TOKEN`, lives in `editor/.env`, which Next loads for the editor
 * and nothing loaded for `pnpm recipes` (epic 34's 34e trap, which blamed "a
 * different token variable"). Both entry points now call `loadEditorEnv`
 * before they resolve a backend.
 *
 * ## An allow-list, not the whole file
 *
 * `.env` is the editor app's file, and some of the variables a person might
 * reasonably put there would change *which corpus* a bare `pnpm recipes`
 * writes to: `RECIPE_API_URL` would turn every command into a remote one,
 * `CONTENT_DIRECTORY` would point it somewhere else. A file meant for the
 * editor must not do that behind the CLI's back, so only variables that say
 * how to *reach* something are taken:
 *
 * - `RECIPE_API_TOKEN` (the bearer for `--notify` and `--remote`) and
 *   `RECIPE_EDITOR_URL` (where `--notify` goes; set alone, it turns notify
 *   on, as it does from a shell) — how to reach the editor (35-D11);
 * - `RECIPE_LLM_URL`, `RECIPE_LLM_MODEL` and `RECIPE_LLM_API` — how to reach
 *   the local model that imports use (epic 36, D1), so `recipes import` and
 *   the stdio MCP server find the model the workstation's editor uses. They
 *   change what an import reads, never which corpus it writes to;
 * - `RECIPE_JOBS_DIR` — where import jobs keep their records (epic 37, D1),
 *   so a CLI import and the editor share one job store when the editor's is
 *   set somewhere other than the default;
 * - `RECIPE_QUEUE_DIR` — where the queue's state is (37b), for the same
 *   reason: the CLI must wait in the editor's queue;
 * - `RECIPE_GPU_ACQUIRE_CMD`, `RECIPE_GPU_RELEASE_CMD`, `RECIPE_GPU_IDLE_MS`
 *   — D6's hooks, which free the GPU of another program for a busy spell:
 *   a CLI import that takes the GPU must run the same hooks the editor does.
 *   They are commands, run by whichever process starts or ends the spell —
 *   the file is the workstation owner's own, as the editor's is.
 *
 * Everything else in the file is ignored.
 *
 * ## The environment wins — and `""` is not set
 *
 * A variable already in the environment is kept. `process.loadEnvFile` has
 * that precedence too, but it counts an empty string as set, and `.mcp.json`
 * hands the MCP server `RECIPE_API_TOKEN: "${RECIPE_API_TOKEN:-}"` — `""`
 * whenever the launching shell has none (T27) — so it would never fill the
 * one variable this exists for. `resolve.ts` already reads `""` as unset
 * (`envValue`); this agrees with it, and parses with `util.parseEnv` instead.
 *
 * ## Where the file is
 *
 * Next to `cli/` and `mcp/`, resolved from this module rather than the cwd
 * (pnpm runs the script from the package directory, an agent from anywhere).
 * `RECIPE_ENV_FILE` points elsewhere; a relative one resolves against
 * `INIT_CWD` (else the cwd), as `--content-dir` does in `resolve.ts`.
 *
 * ## Not under a test runner
 *
 * A test that spawns the CLI or the MCP server hands the child its own
 * environment, `VITEST` included. With `VITEST` set and no `RECIPE_ENV_FILE`,
 * nothing is loaded: otherwise every spawned child in the main checkout would
 * carry the workstation's real token, and a `RECIPE_EDITOR_URL` added to
 * `.env` one day would make the suite POST the live editor. A test that wants
 * the file names one with `RECIPE_ENV_FILE`.
 *
 * ## The token goes where the CLI goes
 *
 * A filled `RECIPE_API_TOKEN` is the bearer for `--remote` / `RECIPE_API_URL`
 * too, not only for `--notify`. The main checkout's token is the
 * workstation's, so `--remote` at another editor (the Pi) with no token in the
 * shell sends it there — a 401 — and the fix is to export that editor's own
 * token, which wins.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";

/** `websites/recipe-website/editor`: where `.env` is, and `jobs/` (epic 37). */
export const EDITOR_DIRECTORY = path.resolve(__dirname, "..");

/** `websites/recipe-website/editor/.env`. */
export const EDITOR_ENV_FILE = path.resolve(EDITOR_DIRECTORY, ".env");

/** The variables taken from the file; see the module comment for why so few. */
export const EDITOR_ENV_KEYS = [
  "RECIPE_API_TOKEN",
  "RECIPE_EDITOR_URL",
  "RECIPE_LLM_URL",
  "RECIPE_LLM_MODEL",
  "RECIPE_LLM_API",
  "RECIPE_JOBS_DIR",
  "RECIPE_QUEUE_DIR",
  "RECIPE_GPU_ACQUIRE_CMD",
  "RECIPE_GPU_RELEASE_CMD",
  "RECIPE_GPU_IDLE_MS",
] as const;

function unset(value: string | undefined): boolean {
  return value === undefined || value === "";
}

/**
 * The file to read: `RECIPE_ENV_FILE` when set (relative to `INIT_CWD`, else
 * the cwd), else `editor/.env` — or none at all under a test runner that did
 * not name one.
 */
export function editorEnvFile(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const override = env.RECIPE_ENV_FILE;
  if (unset(override)) return unset(env.VITEST) ? EDITOR_ENV_FILE : undefined;
  return path.resolve(
    unset(env.INIT_CWD) ? process.cwd() : env.INIT_CWD!,
    override!,
  );
}

/**
 * Copy the allow-listed variables from the file into `env` where `env` has
 * none (or `""`). A missing file is no error — the main checkout has one, a
 * fresh worktree or the Pi's container need not. Answers the names it set,
 * never the values.
 */
export function loadEditorEnv(
  env: NodeJS.ProcessEnv = process.env,
  file: string | undefined = editorEnvFile(env),
): string[] {
  if (!file || !existsSync(file)) return [];
  const parsed = parseEnv(readFileSync(file, "utf8"));
  const loaded: string[] = [];
  for (const key of EDITOR_ENV_KEYS) {
    const value = parsed[key];
    if (unset(value) || !unset(env[key])) continue;
    env[key] = value;
    loaded.push(key);
  }
  return loaded;
}
