/**
 * A `simple-git` that runs with the process's environment plus a few
 * variables of ours (41c).
 *
 * Since simple-git 3.34 its unsafe-operations plugin inspects any env handed
 * to `.env()` and refuses, per category, the variables that make git run
 * another program or read other config: `EDITOR`, `GIT_SSH_COMMAND`,
 * `GIT_CONFIG_GLOBAL` and so on (3.34 the ssh ones, 3.36 the editor ones). A
 * plain `simpleGit()` inherits the same environment without it being looked
 * at; only the calls that add a variable — the author for a revert or merge,
 * a scratch index, sync's ssh keepalives — must spell the whole env out, and
 * so get refused for whatever the person's shell happens to carry (`EDITOR`
 * is in most).
 *
 * - The editor and pager variables are **dropped**. Every command run through
 *   here is non-interactive (`revert --no-edit`, `merge --no-edit`, `reset`,
 *   `status`, `fetch`, `push`) and has no terminal, so git would open neither,
 *   and nothing needs `allowUnsafeEditor` or `allowUnsafePager`.
 * - Any other refused variable the process **inherited** is kept, and its
 *   category allowed, for this git only. That is the environment every plain
 *   call already passes to git, so nothing new is let in: a test's
 *   `GIT_CONFIG_GLOBAL=/dev/null` (the "no committer identity" case), a
 *   desktop's `SSH_ASKPASS`. A variable not in this table that simple-git
 *   learns to refuse later fails loudly here rather than being let through.
 * - What the caller **adds** is allowed only through `unsafe`, named at the
 *   call site with the reason (sync's `GIT_SSH_COMMAND`).
 */
import simpleGit, { type SimpleGit, type SimpleGitOptions } from "simple-git";

type UnsafeFlags = NonNullable<SimpleGitOptions["unsafe"]>;

/** Never needed by a non-interactive git with no terminal. */
const DROPPED = [
  "EDITOR",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "PAGER",
  "GIT_PAGER",
];

/** simple-git's refused env keys (3.36) → the flag that lets one through. */
const INHERITED: Record<string, keyof UnsafeFlags> = {
  GIT_ASKPASS: "allowUnsafeAskPass",
  SSH_ASKPASS: "allowUnsafeAskPass",
  GIT_CONFIG: "allowUnsafeConfigPaths",
  GIT_CONFIG_GLOBAL: "allowUnsafeConfigPaths",
  GIT_CONFIG_SYSTEM: "allowUnsafeConfigPaths",
  GIT_EXEC_PATH: "allowUnsafeConfigPaths",
  PREFIX: "allowUnsafeConfigPaths",
  GIT_CONFIG_COUNT: "allowUnsafeConfigEnvCount",
  GIT_EXTERNAL_DIFF: "allowUnsafeDiffExternal",
  GIT_PROXY_COMMAND: "allowUnsafeGitProxy",
  GIT_TEMPLATE_DIR: "allowUnsafeTemplateDir",
  GIT_SSH: "allowUnsafeSshCommand",
  GIT_SSH_COMMAND: "allowUnsafeSshCommand",
};

/** simple-git matches env keys case-insensitively; so does this. */
function inheritedUnsafe(env: Record<string, string>): UnsafeFlags {
  const unsafe: UnsafeFlags = {};
  for (const key of Object.keys(env)) {
    const flag = INHERITED[key.trim().toUpperCase()];
    if (flag) unsafe[flag] = true;
  }
  return unsafe;
}

/**
 * `simpleGit(options)` running with `process.env` (less the editor and pager
 * variables) plus `added`. `unsafe` is for what `added` itself needs.
 */
export function gitWithEnv(
  options: Partial<SimpleGitOptions>,
  added: Record<string, string>,
  unsafe: UnsafeFlags = {},
  inherited: NodeJS.ProcessEnv = process.env,
): SimpleGit {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (value === undefined) continue;
    if (DROPPED.includes(key.trim().toUpperCase())) continue;
    env[key] = value;
  }
  return simpleGit({
    ...options,
    unsafe: { ...inheritedUnsafe(env), ...unsafe },
  }).env({ ...env, ...added });
}
