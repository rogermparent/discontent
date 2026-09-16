/**
 * How an entry point decides which backend it is talking to (D11).
 *
 * This used to be a block inside `cli/index.ts` `main()`, which was fine while
 * the CLI was the only caller. The MCP stdio server (`mcp/server.ts`) is the
 * second one, and mode resolution is exactly the kind of rule that goes wrong
 * by drifting: two copies where one reads `RECIPE_API_URL` and the other does
 * not, or where only one resolves a relative `--content-dir` against
 * `INIT_CWD`, produce a server that quietly writes to a different corpus than
 * the CLI does. One exported function, two callers.
 *
 * The config/create split exists so a caller can *say* what it resolved before
 * it opens anything — `server.ts` prints its mode banner on stderr from the
 * `BackendConfig`, without having to reach inside a constructed backend.
 *
 * ## Empty strings are unset
 *
 * Every environment read goes through `envValue`, which treats `""` as absent.
 * That is not defensive coding, it is the contract `.mcp.json` needs: Claude
 * Code expands `${RECIPE_API_URL:-}` to an empty string when the variable is
 * not set in the launching shell, and a bare `${RECIPE_API_URL}` would arrive
 * as the *literal* placeholder text (T27). So the file writes `${VAR:-}` and
 * this function agrees that empty means "not configured" — otherwise every
 * default launch would resolve to an HTTP backend pointed at `""`.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import path from "node:path";
import process from "node:process";
import { resolveAuthor } from "../../controller/curation/author";
import type { Author } from "../../controller/curation/context";
import { UsageError } from "../../controller/curation/errors";
import { createHttpBackend } from "./http";
import { createLocalBackend, type NotifyTarget } from "./local";
import type { CuratorBackend } from "./types";

export interface BackendOverrides {
  /** `--remote`; beats `RECIPE_API_URL`. */
  remote?: string;
  /** `--content-dir`; beats `CONTENT_DIRECTORY`. */
  contentDir?: string;
  /** `--author`; beats `RECIPE_AUTHOR`. */
  author?: string;
  /** `--notify`. `RECIPE_EDITOR_URL` alone is enough without it. */
  notify?: boolean;
  /** `--editor-url`; beats `RECIPE_EDITOR_URL`. */
  editorUrl?: string;
}

export type BackendConfig =
  | { kind: "http"; baseUrl: string; token?: string }
  | {
      kind: "local";
      contentDirectory: string;
      author?: Author;
      notify?: NotifyTarget;
    };

/** An environment variable's value, with `""` read as "not set" (T27). */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name];
  return raw === undefined || raw === "" ? undefined : raw;
}

export function resolveContentDirectory(
  flag?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = flag || envValue(env, "CONTENT_DIRECTORY");
  /* Nothing said: the engine's own default, which reads the ambient env. */
  if (!raw) return getContentDirectory();
  /*
   * `INIT_CWD` rather than `cwd()`: pnpm runs a package script with the *package*
   * directory as cwd, so `pnpm recipes list --content-dir ./fixtures/x` typed at
   * the repo root would otherwise resolve against `websites/recipe-website/editor`
   * (fact 1).
   */
  return path.resolve(envValue(env, "INIT_CWD") ?? process.cwd(), raw);
}

/**
 * Where a local write should send its revalidation, if anywhere.
 *
 * `--editor-url` > `RECIPE_EDITOR_URL`, and the env var alone is enough — a
 * shell that exports it has already said "there is an editor running here".
 * `--notify` with no URL anywhere is a usage error rather than a silent no-op:
 * the flag's whole purpose is the thing it could not do.
 */
export function resolveNotify(
  notify: boolean,
  editorUrl: string | undefined,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): NotifyTarget | undefined {
  const url = (editorUrl || undefined) ?? envValue(env, "RECIPE_EDITOR_URL");
  if (!notify && !url) return undefined;
  if (!url) {
    throw new UsageError(
      "--notify needs an editor URL: pass --editor-url <url> or set RECIPE_EDITOR_URL.",
    );
  }
  if (!URL.canParse(url)) {
    throw new UsageError(`"${url}" is not a URL.`);
  }
  return { url, token };
}

/**
 * Remote first, because it settles what the rest of the setup means: with
 * `--remote` there is no local content directory, no committer identity to
 * preflight and nothing to notify, since the server revalidated itself.
 */
export function resolveBackendConfig(
  overrides: BackendOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  const remote =
    (overrides.remote || undefined) ?? envValue(env, "RECIPE_API_URL");
  const token = envValue(env, "RECIPE_API_TOKEN");

  if (remote) return { kind: "http", baseUrl: remote, token };

  return {
    kind: "local",
    contentDirectory: resolveContentDirectory(overrides.contentDir, env),
    author: resolveAuthor(overrides.author, env),
    notify: resolveNotify(
      overrides.notify === true,
      overrides.editorUrl,
      token,
      env,
    ),
  };
}

export function createBackend(config: BackendConfig): CuratorBackend {
  return config.kind === "http"
    ? createHttpBackend({ baseUrl: config.baseUrl, token: config.token })
    : createLocalBackend({
        contentDirectory: config.contentDirectory,
        author: config.author,
        notify: config.notify,
      });
}

export function resolveBackend(
  overrides: BackendOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): CuratorBackend {
  return createBackend(resolveBackendConfig(overrides, env));
}
