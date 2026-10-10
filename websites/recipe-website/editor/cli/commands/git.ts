/**
 * The `git` sub-table — the content repository's history from the terminal
 * (23d/D23).
 *
 * Five reads and three writes (plus 27b's `fetch` and `pull`), and the split in how they *print* is the whole
 * design: `log` is a row table because a person scans it, `show` and `diff`
 * print the raw patch because that is what a pager and `grep` want, and `file`
 * prints JSON because its answer is a record rather than prose. With `--json`
 * every one of them still emits exactly one object, as everywhere else.
 *
 * `revert` and `restore` are `write: true`, so a local run gets the
 * stale-editor hint afterwards. `push` is not: nothing local changed, so the
 * hint would be a lie (T50).
 */
import { UsageError } from "../../controller/curation/errors";
import { formatJsonBlock, formatRows } from "../output";
import type {
  DiffResult,
  FetchResult,
  FileAtResult,
  GitLogResult,
  GitWriteResult,
  PullResult,
  PushResult,
  ShowResult,
  SyncResult,
  SyncStatus,
} from "../backend/types";
import { confirm } from "./delete";
import {
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

/** The types the git seats address, as the wire spells them (`term`: 31c). */
const TYPES = ["recipe", "group", "featured", "term"];

function requireType(value: string | undefined, command: string): string {
  if (!value) throw new UsageError(`${command} needs <type>.`);
  if (!TYPES.includes(value)) {
    throw new UsageError(
      `Unknown type "${value}". Known types: ${TYPES.join(", ")}`,
    );
  }
  return value;
}

/** "ahead 1, behind 2 (diverged) — fetched 2026-10-07T…" */
function aheadBehind(result: {
  ahead: number;
  behind: number;
  diverged: boolean;
  fetchedAt?: string;
}): string {
  return `ahead ${result.ahead}, behind ${result.behind}${
    result.diverged ? " (diverged — a pull will merge)" : ""
  }${result.fetchedAt ? ` — as of the fetch at ${result.fetchedAt}` : " — never fetched"}`;
}

const gitStatus: CommandDef<SyncStatus> = {
  name: "git status",
  usage: "recipes git status [--fetch]",
  options: {
    fetch: { type: "boolean" },
  },
  run: ({ backend, options }) =>
    backend.gitStatus(booleanOption(options, "fetch") ? { fetch: true } : {}),
  format(result) {
    if (!result.isRepo) return "Not a Git repository.";
    const lines = [
      `branch ${result.branch ?? "(unborn)"}${
        result.upstream ? ` → ${result.upstream}` : " (no upstream)"
      }`,
      aheadBehind(result),
      result.dirty
        ? `${result.dirtyCount} uncommitted change${result.dirtyCount === 1 ? "" : "s"}`
        : "clean",
    ];
    if (result.indexStale) {
      lines.push(
        "indexes stale: HEAD moved without a full rebuild — run `recipes reindex`",
      );
    }
    if (result.merge.inProgress) {
      lines.push(
        `merge in progress: ${result.merge.conflicted.length} conflicted, ${result.merge.resolvedCount} resolved`,
      );
    }
    if (result.remotes.length > 0) {
      lines.push(
        ...result.remotes.map(
          (remote) => `remote ${remote.name}  ${remote.fetchUrl}`,
        ),
      );
    }
    return lines.join("\n");
  },
};

const gitLog: CommandDef<GitLogResult> = {
  name: "git log",
  usage:
    "recipes git log [--type recipe|group|featured|term] [--slug s] [--limit 30] [--offset 0]",
  options: {
    type: { type: "string" },
    slug: { type: "string" },
    limit: { type: "string" },
    offset: { type: "string" },
  },
  async run({ backend, options }) {
    const type = stringOption(options, "type");
    return backend.gitLog({
      ...(type ? { type: requireType(type, "git log") } : {}),
      ...(stringOption(options, "slug")
        ? { slug: stringOption(options, "slug") }
        : {}),
      ...(numberOption(options, "limit") === undefined
        ? {}
        : { limit: numberOption(options, "limit") }),
      ...(numberOption(options, "offset") === undefined
        ? {}
        : { offset: numberOption(options, "offset") }),
    });
  },
  format(result) {
    if (result.commits.length === 0) return "No commits.";
    /*
     * The row table, borrowed whole: a short hash where a slug goes, the
     * subject where a name goes, and the touched paths as the bracketed
     * column tags occupy — which is the one thing this log has that the
     * `/git` page's does not.
     */
    const rows = formatRows(
      result.commits.map((commit) => ({
        slug: commit.hash.slice(0, 7),
        name: commit.message,
        date: Date.parse(commit.date),
        tags: commit.files.length > 0 ? commit.files : undefined,
      })),
    );
    return result.hasMore ? `${rows}\n(more)` : rows;
  },
};

const gitShow: CommandDef<ShowResult> = {
  name: "git show",
  usage: "recipes git show <hash> [--max-chars 50000]",
  options: {
    "max-chars": { type: "string" },
  },
  async run({ backend, positionals, options }) {
    const hash = positionals[0];
    if (!hash) throw new UsageError("git show needs <hash>.");
    const maxChars = numberOption(options, "max-chars");
    return backend.gitShow(hash, maxChars === undefined ? {} : { maxChars });
  },
  format: (result) => result.diff,
};

const gitFile: CommandDef<FileAtResult> = {
  name: "git file",
  usage: "recipes git file <type> <slug> <rev>",
  options: {},
  async run({ backend, positionals }) {
    const [type, slug, rev] = positionals;
    const safeType = requireType(type, "git file");
    if (!slug || !rev) throw new UsageError("git file needs <slug> and <rev>.");
    return backend.gitFileAt({ type: safeType, slug, rev });
  },
  format: (result) => formatJsonBlock(result.content),
};

const gitDiff: CommandDef<DiffResult> = {
  name: "git diff",
  usage: "recipes git diff <from> [<to>] [--path p]",
  options: {
    path: { type: "string" },
  },
  async run({ backend, positionals, options }) {
    const [from, to] = positionals;
    if (!from) throw new UsageError("git diff needs <from>.");
    const path = stringOption(options, "path");
    return backend.gitDiff({
      from,
      ...(to ? { to } : {}),
      ...(path ? { path } : {}),
    });
  },
  format: (result) => result.diff || "No changes.",
};

function formatWrite(result: GitWriteResult): string {
  if (!result.commit) return result.message;
  return [
    `${result.commit.slice(0, 7)} ${result.message}`,
    `  rebuilt: ${result.rebuilt.join(", ")}`,
  ].join("\n");
}

const gitRevert: CommandDef<GitWriteResult> = {
  name: "git revert",
  usage: "recipes git revert <hash> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const hash = positionals[0];
    if (!hash) throw new UsageError("git revert needs <hash>.");
    await confirm(`revert commit ${hash}`, booleanOption(options, "yes"));
    return backend.gitRevert(hash);
  },
  format: formatWrite,
};

const gitRestore: CommandDef<GitWriteResult> = {
  name: "git restore",
  usage: "recipes git restore <type> <slug> <rev> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const [type, slug, rev] = positionals;
    const safeType = requireType(type, "git restore");
    if (!slug || !rev) {
      throw new UsageError("git restore needs <slug> and <rev>.");
    }
    await confirm(
      `restore ${safeType} "${slug}" to ${rev}`,
      booleanOption(options, "yes"),
    );
    return backend.gitRestore({ type: safeType, slug, rev });
  },
  format: formatWrite,
};

const gitPush: CommandDef<PushResult> = {
  name: "git push",
  usage: "recipes git push [<remote>] [--set-upstream]",
  options: {
    "set-upstream": { type: "boolean" },
  },
  /*
   * Not `write: true`. Nothing in the content directory changed, so a running
   * editor's caches are exactly as correct as they were a moment ago and the
   * stale-editor hint would be noise (T50).
   *
   * The git remote is a positional, as in git itself (27b/T2). It was
   * `--remote r`, which is also the CLI's *global* `--remote <editor URL>`:
   * `parseArgs` merged the two, so `git push --remote uraninite` tried to reach
   * an editor at the URL "uraninite".
   */
  async run({ backend, positionals, options }) {
    const remote = positionals[0];
    return backend.gitPush({
      ...(remote ? { remote } : {}),
      ...(booleanOption(options, "set-upstream") ? { setUpstream: true } : {}),
    });
  },
  format: (result) => `Pushed ${result.branch} to ${result.remote}`,
};

const gitFetch: CommandDef<FetchResult> = {
  name: "git fetch",
  usage: "recipes git fetch [<remote>]",
  options: {},
  /* Not `write: true`: only remote-tracking refs move, never the content. */
  async run({ backend, positionals }) {
    const remote = positionals[0];
    return backend.gitFetch(remote ? { remote } : {});
  },
  format: (result) =>
    [
      `fetched ${result.remote ?? "every remote"}${
        result.upstream ? ` (upstream ${result.upstream})` : ""
      }`,
      aheadBehind(result),
    ].join("\n"),
};

const gitPull: CommandDef<PullResult> = {
  name: "git pull",
  usage: "recipes git pull [<remote>]",
  options: {},
  /*
   * `write: true`: a pull moves the content and rebuilds every index, so a
   * running editor is stale afterwards exactly as after a revert.
   */
  write: true,
  async run({ backend, positionals }) {
    const remote = positionals[0];
    return backend.gitPull(remote ? { remote } : {});
  },
  format(result) {
    if (!result.merged) return `Already up to date with ${result.from}.`;
    return [
      `${result.fastForward ? "Fast-forwarded" : "Merged"} ${result.newCommits} commit${
        result.newCommits === 1 ? "" : "s"
      } from ${result.from} → ${result.head.slice(0, 7)}`,
      `  rebuilt: ${result.rebuilt.join(", ")}`,
    ].join("\n");
  },
};

const gitSync: CommandDef<SyncResult> = {
  name: "git sync",
  usage: "recipes git sync [<remote>] [--ssh-host <host> --mirror-dir <dir>]",
  options: {
    "ssh-host": { type: "string" },
    "mirror-dir": { type: "string" },
  },
  /*
   * Epic 28, D3: fetch the mirror, merge its commits in (a conflict is
   * aborted, never resolved), push ours back. `write: true` because a merge
   * rebuilds every index. `--ssh-host`/`--mirror-dir` add the mirror-dirty
   * preflight (local backend only; a remote editor uses its own settings).
   */
  write: true,
  async run({ backend, positionals, options }) {
    const remote = positionals[0];
    const sshHost = stringOption(options, "ssh-host");
    const dir = stringOption(options, "mirror-dir");
    return backend.gitSync({
      ...(remote ? { remote } : {}),
      ...(sshHost || dir ? { mirror: { sshHost, dir } } : {}),
    });
  },
  format(result) {
    const lines = [
      `${result.outcome}: ${result.branch} ⇄ ${result.remote}` +
        (result.pulled || result.pushed
          ? ` (in ${result.pulled}, out ${result.pushed})`
          : ""),
    ];
    if (result.message) lines.push(`  ${result.message}`);
    for (const step of result.steps) {
      lines.push(
        `  ${step.step}: ${step.status}${step.detail ? ` — ${step.detail}` : ""}`,
      );
    }
    return lines.join("\n");
  },
};

export const gitCommands: Record<string, CommandDef<unknown>> = {
  status: gitStatus,
  log: gitLog,
  show: gitShow,
  file: gitFile,
  diff: gitDiff,
  revert: gitRevert,
  restore: gitRestore,
  push: gitPush,
  fetch: gitFetch,
  pull: gitPull,
  sync: gitSync,
};

export default gitCommands;
