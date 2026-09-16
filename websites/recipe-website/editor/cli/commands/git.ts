/**
 * The `git` sub-table — the content repository's history from the terminal
 * (23d/D23).
 *
 * Five reads and three writes, and the split in how they *print* is the whole
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
  FileAtResult,
  GitLogResult,
  GitWriteResult,
  PushResult,
  ShowResult,
  SyncStatus,
} from "../backend/types";
import { confirm } from "./delete";
import {
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

/** The three types the git seats address, as the wire spells them. */
const TYPES = ["recipe", "group", "featured"];

function requireType(value: string | undefined, command: string): string {
  if (!value) throw new UsageError(`${command} needs <type>.`);
  if (!TYPES.includes(value)) {
    throw new UsageError(
      `Unknown type "${value}". Known types: ${TYPES.join(", ")}`,
    );
  }
  return value;
}

const gitStatus: CommandDef<SyncStatus> = {
  name: "git status",
  usage: "recipes git status",
  options: {},
  run: ({ backend }) => backend.gitStatus(),
  format(result) {
    if (!result.isRepo) return "Not a Git repository.";
    const lines = [
      `branch ${result.branch ?? "(unborn)"}${
        result.upstream ? ` → ${result.upstream}` : " (no upstream)"
      }`,
      `ahead ${result.ahead}, behind ${result.behind}`,
      result.dirty
        ? `${result.dirtyCount} uncommitted change${result.dirtyCount === 1 ? "" : "s"}`
        : "clean",
    ];
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
    "recipes git log [--type recipe|group|featured] [--slug s] [--limit 30] [--offset 0]",
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
  usage: "recipes git push [--remote r] [--set-upstream]",
  options: {
    remote: { type: "string" },
    "set-upstream": { type: "boolean" },
  },
  /*
   * Not `write: true`. Nothing in the content directory changed, so a running
   * editor's caches are exactly as correct as they were a moment ago and the
   * stale-editor hint would be noise (T50).
   */
  async run({ backend, options }) {
    const remote = stringOption(options, "remote");
    return backend.gitPush({
      ...(remote ? { remote } : {}),
      ...(booleanOption(options, "set-upstream") ? { setUpstream: true } : {}),
    });
  },
  format: (result) => `Pushed ${result.branch} to ${result.remote}`,
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
};

export default gitCommands;
