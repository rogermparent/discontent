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
 * editor must not do that behind the CLI's back, so only the two variables
 * that say how to *reach* an editor are taken — `RECIPE_API_TOKEN` (the bearer
 * for `--notify` and `--remote`) and `RECIPE_EDITOR_URL` (where `--notify`
 * goes; set alone, it turns notify on, as it does from a shell). Everything
 * else in the file is ignored.
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
 * `RECIPE_ENV_FILE` points elsewhere — a test's own file, so a test never
 * reads or writes the real one.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";

/** `websites/recipe-website/editor/.env`. */
export const EDITOR_ENV_FILE = path.resolve(__dirname, "../.env");

/** The variables taken from the file; see the module comment for why so few. */
export const EDITOR_ENV_KEYS = [
  "RECIPE_API_TOKEN",
  "RECIPE_EDITOR_URL",
] as const;

function unset(value: string | undefined): boolean {
  return value === undefined || value === "";
}

/** The file to read: `RECIPE_ENV_FILE` when set, else `editor/.env`. */
export function editorEnvFile(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.RECIPE_ENV_FILE;
  return unset(override) ? EDITOR_ENV_FILE : path.resolve(override!);
}

/**
 * Copy the allow-listed variables from the file into `env` where `env` has
 * none (or `""`). A missing file is no error — the main checkout has one, a
 * fresh worktree or the Pi's container need not. Answers the names it set,
 * never the values.
 */
export function loadEditorEnv(
  env: NodeJS.ProcessEnv = process.env,
  file: string = editorEnvFile(env),
): string[] {
  if (!existsSync(file)) return [];
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
