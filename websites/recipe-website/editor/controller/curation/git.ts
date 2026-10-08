/**
 * The content repository's history, read and rewound from plain Node (23d/D19).
 *
 * Everything here used to live in `controller/actions/sync.ts`, which is a
 * `"use server"` module — so a route handler, the CLI and the MCP registry
 * could not call any of it (T22), and the only surface git had was the `/git`
 * page's own form actions. This module is the same `simple-git` calls with the
 * three things that made them unreachable taken out: no `auth()`, no
 * `getContentDirectory()` (T16 — the directory arrives in `ctx`), no
 * `revalidatePath`. `sync.ts` now delegates to it and keeps only the
 * page-shaped wrappers (D22), which is why `git.spec.ts` is the gate for this
 * refactor and passes unchanged.
 *
 * ## What a seat may and may not do
 *
 * Reads are unguarded except for their own input checks. Writes preflight:
 * `requireRepo` always, and `requireCleanTree` for revert and restore, because
 * both make a commit and a dirty tree would fold whatever a human left
 * half-done in `/git` into it. **Push is deliberately not clean-tree-guarded**
 * — the page pushes a dirty tree today and `git.spec.ts` relies on it (T47);
 * sending committed history upstream does not depend on the working tree.
 *
 * ## Wire strings reach git's argv
 *
 * `hash`, `rev`, `path` and `slug` all end up as arguments to a git process, so
 * each is checked *before* any git call (T45): a hash is hex, a rev or a path
 * may not begin with `-` (which git would read as an option), and a slug is one
 * path segment. `curation/schema.ts` types these as bare strings, so the checks
 * are this module's own rather than the schema's.
 *
 * ## After a rewind
 *
 * A revert or a restore moves data files the engine did not write, so every
 * index is stale and no `ContentWriteResult` describes what moved. The pair is
 * `reindex(ctx)` — Node-safe, in this process — plus `ctx.onBulkChange?.()`,
 * which is the Next-only half a route supplies (D20); `revalidateDerivedState`
 * cannot be imported here and the D8 boundary test enforces that.
 */
import path from "path";
import { access, stat } from "fs-extra";
import simpleGit, {
  type DefaultLogFields,
  type SimpleGit,
  type StatusResult,
} from "simple-git";
import { getUploadsBaseDirectory } from "@discontent/cms/content/filesystem";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import {
  readIndexFreshness,
  type IndexFreshness,
} from "@discontent/cms/git/indexStamp";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type { CurationContext } from "./context";
import { isMirror, mirrorRefusal } from "recipe-website-common/config/role";
import {
  BadRevisionError,
  DirtyTreeError,
  ForbiddenError,
  GitConflictError,
  NotARepoError,
  NotFoundError,
  ValidationError,
} from "./errors";
import { reindex } from "./reindex";

/* --- page DTOs (moved here from the `/git` page, D19) -------------------- */

export interface CommitSummary {
  hash: string;
  message: string;
  author_name: string;
  date: string;
}

export interface RemoteSummary {
  name: string;
  fetchUrl: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

export interface ConflictFile {
  path: string;
  label: string;
}

export interface MergeState {
  /** A merge is underway (MERGE_HEAD exists), so the resolver should be shown. */
  inProgress: boolean;
  /** Files that still need an ours/theirs decision. */
  conflicted: ConflictFile[];
  /** Count of files already resolved (staged) but not yet committed. */
  resolvedCount: number;
}

export interface SyncStatus {
  isRepo: boolean;
  branch?: string;
  detached: boolean;
  /** Upstream tracking ref, e.g. "origin/main". Undefined when none is configured. */
  upstream?: string;
  ahead: number;
  behind: number;
  remotes: RemoteSummary[];
  branches: BranchInfo[];
  merge: MergeState;
  /** Uncommitted working-tree changes are present (outside of a merge). */
  dirty: boolean;
  /** Number of uncommitted changed files (for the warning copy). */
  dirtyCount: number;
  /**
   * Both sides have commits the other lacks, so a pull will make a merge
   * commit rather than fast-forward (27b). As fresh as `fetchedAt`.
   */
  diverged: boolean;
  /**
   * When the remote-tracking refs were last fetched — `FETCH_HEAD`'s mtime, as
   * ISO. `ahead`/`behind` are only as fresh as this; absent if never fetched.
   */
  fetchedAt?: string;
  /**
   * HEAD moved without a full index rebuild — a pull from a shell, a push
   * received into this repository, a checkout behind the editor's back — or no
   * rebuild has been recorded yet (27b/D3). The `/git` page and Settings →
   * Maintenance show a "Rebuild indexes" banner while it is true.
   */
  indexStale: boolean;
  /** The commit the indexes were last fully rebuilt from, when recorded. */
  indexedHead?: string;
  log: CommitSummary[];
  /** More commits exist beyond the first page. */
  hasMore: boolean;
}

/* --- result types -------------------------------------------------------- */

/** A commit, plus the content paths it touched (`--name-only`, repo-relative). */
export type CommitEntry = CommitSummary & { files: string[] };

export interface GitLogResult {
  commits: CommitEntry[];
  hasMore: boolean;
}

export interface ShowResult {
  hash: string;
  diff: string;
  truncated: boolean;
}

export interface DiffResult {
  from: string;
  to: string;
  path?: string;
  diff: string;
  truncated: boolean;
}

export interface FileAtResult {
  type: GitType;
  slug: string;
  rev: string;
  /** The data file's path inside the content directory. */
  path: string;
  /** The data file at `rev`, parsed. */
  content: unknown;
}

export interface GitWriteResult {
  /**
   * The commit this write made, or `null` when there was nothing to do.
   *
   * A restore to the revision the tree already holds is the `null` case: it is
   * not a failure, and an empty commit would be noise in a history a person
   * reads.
   */
  commit: string | null;
  message: string;
  /** The content types whose indexes were rebuilt afterwards. */
  rebuilt: string[];
}

export interface PushResult {
  remote: string;
  branch: string;
}

export interface FetchResult {
  /** The remote fetched, or `null` when every remote was (no upstream set). */
  remote: string | null;
  upstream?: string;
  ahead: number;
  behind: number;
  diverged: boolean;
  fetchedAt?: string;
}

export interface PullResult {
  /** The remote-tracking ref merged, e.g. `uraninite/main`. */
  from: string;
  /** False when there was nothing to bring in. */
  merged: boolean;
  /** HEAD simply moved forward; no merge commit was made. */
  fastForward: boolean;
  /** Commits the pull brought in (the remote's side, not counting a merge commit). */
  newCommits: number;
  head: string;
  /** The content types whose indexes were rebuilt afterwards. */
  rebuilt: string[];
}

/* --- the type table ------------------------------------------------------ */

/**
 * The three content types a curator addresses by slug, under the names the
 * wire uses.
 *
 * Singular and short (`recipe`, not `recipes`) because these are arguments a
 * person and an agent type, and because they name *one item* — `git log --type
 * recipe --slug naan`. The engine's own `contentType` strings stay where they
 * belong, in `reindex`.
 *
 * `pages` is absent on purpose: it is the editor's own furniture, not content a
 * curator restores.
 */
export const GIT_TYPES = {
  recipe: recipeContentConfig,
  group: groupContentConfig,
  featured: featuredRecipeContentConfig,
} as const;

export type GitType = keyof typeof GIT_TYPES;

export const GIT_TYPE_NAMES = Object.keys(GIT_TYPES) as GitType[];

function configFor(type: string): ContentTypeConfig {
  const config = (GIT_TYPES as Record<string, unknown>)[type];
  if (!config || !Object.hasOwn(GIT_TYPES, type)) {
    throw new NotFoundError(
      `Unknown type "${type}". Known types: ${GIT_TYPE_NAMES.join(", ")}`,
    );
  }
  return config as ContentTypeConfig;
}

/* --- validation (T45) ---------------------------------------------------- */

const HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

function assertHash(hash: string): string {
  if (!HASH_PATTERN.test(hash)) {
    throw new ValidationError("Invalid input", [
      {
        path: "hash",
        message: `Expected 7 to 40 hexadecimal characters, got "${hash}"`,
      },
    ]);
  }
  return hash;
}

/**
 * A revision or a pathspec, checked for the one thing that would change what
 * git *does* rather than what it answers: a leading `-` is an option.
 */
function assertArgument(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError("Invalid input", [
      { path: field, message: `A ${field} may not be empty` },
    ]);
  }
  if (trimmed.startsWith("-")) {
    throw new ValidationError("Invalid input", [
      { path: field, message: `A ${field} may not start with "-": ${value}` },
    ]);
  }
  return trimmed;
}

function assertSlug(slug: string): string {
  const value = assertArgument(slug, "slug");
  if (value === "." || value === ".." || /[/\\]/.test(value)) {
    throw new ValidationError("Invalid input", [
      {
        path: "slug",
        message: `A slug is one path segment, got "${slug}"`,
      },
    ]);
  }
  return value;
}

/* --- shared helpers ------------------------------------------------------ */

const LOG_PAGE_SIZE = 30;
const MAX_DIFF_CHARS = 50_000;
const TRUNCATION_MARKER = "\n\n… diff truncated …";

function getGit(contentDirectory: string): SimpleGit {
  return simpleGit({ baseDir: contentDirectory });
}

function messageOf(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Exported for `sync.ts`, whose merge actions all gate on it. */
export async function mergeInProgress(
  contentDirectory: string,
): Promise<boolean> {
  return fileExists(path.join(contentDirectory, ".git", "MERGE_HEAD"));
}

/**
 * `git fetch --prune`, from the remote that matters (27b).
 *
 * An explicit `remote` is fetched as asked. Otherwise the upstream's remote,
 * because that is the one `ahead`/`behind` are measured against; with no
 * upstream, every remote. Answers with the remote fetched, or `null` for "all"
 * or "there were none". `--prune` so a branch deleted on the Pi does not linger
 * here as a remote-tracking ref.
 */
async function fetchRemote(
  git: SimpleGit,
  remote?: string,
): Promise<string | null> {
  if (remote) {
    await git.raw(["fetch", "--prune", remote]);
    return remote;
  }
  const tracking = (await git.status()).tracking?.split("/")[0];
  if (tracking) {
    await git.raw(["fetch", "--prune", tracking]);
    return tracking;
  }
  if ((await git.getRemotes()).length === 0) return null;
  await git.raw(["fetch", "--prune", "--all"]);
  return null;
}

/** When the last fetch ran: `FETCH_HEAD`'s mtime, or undefined if never. */
async function fetchedAtOf(
  contentDirectory: string,
): Promise<string | undefined> {
  try {
    const { mtime } = await stat(
      path.join(contentDirectory, ".git", "FETCH_HEAD"),
    );
    return mtime.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Map a tracked path to a friendly label for the conflict resolver.
 *
 * The upload branch reads `uploads/<type>/<slug>/…`, which is where uploads
 * actually live (`recipeContentConfig.uploadsDirectory`). It used to read
 * `recipes/data/<slug>/<anything>` — a path shape that has never existed, so
 * the branch never fired and an upload conflict fell through to the generic
 * `Upload: <rest>` line. 23d owns the path rule, so it is fixed here.
 */
export function labelForPath(target: string): string {
  const recipeData = /^recipes\/data\/([^/]+)\/recipe\.json$/.exec(target);
  if (recipeData) return `Recipe: ${recipeData[1]}`;
  const groupData = /^groups\/data\/([^/]+)\/group\.json$/.exec(target);
  if (groupData) return `Group: ${groupData[1]}`;
  const typedUpload = /^uploads\/(recipe|group)\/([^/]+)\/.+$/.exec(target);
  if (typedUpload) {
    return `${typedUpload[1] === "recipe" ? "Recipe" : "Group"}: ${typedUpload[2]}`;
  }
  const upload = /^uploads\/(.+)$/.exec(target);
  if (upload) return `Upload: ${upload[1]}`;
  return target;
}

export function toSummary(entry: DefaultLogFields): CommitSummary {
  return {
    hash: entry.hash,
    message: entry.message,
    author_name: entry.author_name,
    date: entry.date,
  };
}

/** What the `/git` page renders as "not tracked with Git". */
export const EMPTY_STATUS: SyncStatus = {
  isRepo: false,
  detached: false,
  ahead: 0,
  behind: 0,
  remotes: [],
  branches: [],
  merge: { inProgress: false, conflicted: [], resolvedCount: 0 },
  dirty: false,
  dirtyCount: 0,
  diverged: false,
  indexStale: false,
  log: [],
  hasMore: false,
};

function truncateDiff(
  diff: string,
  maxChars: number,
): {
  diff: string;
  truncated: boolean;
} {
  if (diff.length <= maxChars) return { diff, truncated: false };
  return {
    diff: `${diff.slice(0, maxChars)}${TRUNCATION_MARKER}`,
    truncated: true,
  };
}

/**
 * The pathspecs one type (optionally one slug) owns: its data directory and its
 * uploads directory, both repo-relative.
 *
 * The uploads side goes through the engine's own `getUploadsBaseDirectory` so
 * that a type which declares no `uploadsDirectory` — featured recipes — gets
 * the engine's default (`uploads/<contentType>/<slug>`) rather than a second
 * guess at it that could drift.
 */
function pathspecsFor(
  config: ContentTypeConfig,
  contentDirectory: string,
  slug?: string,
): string[] {
  const data = slug
    ? path.join(config.dataDirectory, slug)
    : config.dataDirectory;
  const uploads = path.relative(
    contentDirectory,
    getUploadsBaseDirectory(config, slug ?? "", contentDirectory),
  );
  return [data, uploads];
}

function dataPathFor(config: ContentTypeConfig, slug: string): string {
  return path.join(config.dataDirectory, slug, config.dataFilename);
}

/* --- preflights ---------------------------------------------------------- */

async function requireRepo(ctx: CurationContext): Promise<SimpleGit> {
  if (!(await directoryIsGitRepo(ctx.contentDirectory))) {
    throw new NotARepoError(ctx.contentDirectory);
  }
  return getGit(ctx.contentDirectory);
}

/**
 * Refuse to commit on top of somebody else's unfinished work.
 *
 * Both halves matter. A dirty tree would be swept into the revert's commit (or,
 * for a restore, into the `git rm`/`checkout` staging), so a curator's rewind
 * would silently publish whatever a human was editing in `/git`. A sequencer
 * head — `MERGE_HEAD`, `REVERT_HEAD`, `CHERRY_PICK_HEAD` — means git is already
 * mid-operation and would refuse or compound it.
 */
async function requireCleanTree(
  ctx: CurationContext,
  git: SimpleGit,
): Promise<StatusResult> {
  for (const head of ["MERGE_HEAD", "REVERT_HEAD", "CHERRY_PICK_HEAD"]) {
    if (await fileExists(path.join(ctx.contentDirectory, ".git", head))) {
      throw new DirtyTreeError(
        `The content repository is mid-operation (${head} exists) — finish or abort it in /git first.`,
      );
    }
  }
  const status = await git.status();
  if (!status.isClean()) {
    throw new DirtyTreeError(
      `The content repository has ${status.files.length} uncommitted change${
        status.files.length === 1 ? "" : "s"
      } — commit or discard working changes in /git first.`,
    );
  }
  return status;
}

/* --- reads --------------------------------------------------------------- */

/**
 * The cheap sync status the `/git` page renders.
 *
 * The one seat that never throws: `isRepo: false` is a legitimate answer — a
 * deployment that does not track its content with git — and the page's whole
 * empty state is built on it. With `fetch` it is no longer quite that: a fetch
 * that fails (no network, a remote that refuses) throws, because an answer
 * that silently fell back to stale refs would be the thing `fetch` was asked to
 * prevent.
 *
 * `ahead`/`behind` are only as fresh as the last fetch, which is what
 * `fetchedAt` is for; `fetch: true` makes them current first (27b).
 */
export async function gitStatus(
  ctx: CurationContext,
  { fetch = false }: { fetch?: boolean } = {},
): Promise<SyncStatus> {
  const { contentDirectory } = ctx;
  if (!(await directoryIsGitRepo(contentDirectory))) return EMPTY_STATUS;

  const git = getGit(contentDirectory);
  if (fetch) await fetchRemote(git);
  const status = await git.status();
  const inMerge = await mergeInProgress(contentDirectory);
  const remotesRaw = await git.getRemotes(true);
  const remotes = remotesRaw.map((remote) => ({
    name: remote.name,
    fetchUrl: remote.refs.fetch,
  }));
  const branchSummary = await git.branchLocal();
  const branches = Object.values(branchSummary.branches).map((branch) => ({
    name: branch.name,
    current: branch.current,
  }));

  let log: CommitSummary[] = [];
  let hasMore = false;
  try {
    const logResult = await git.log({ maxCount: LOG_PAGE_SIZE + 1 });
    hasMore = logResult.all.length > LOG_PAGE_SIZE;
    log = logResult.all.slice(0, LOG_PAGE_SIZE).map(toSummary);
  } catch {
    /* An unborn branch: a repository with no commits yet. */
  }

  const conflicted = status.conflicted.map((target) => ({
    path: target,
    label: labelForPath(target),
  }));

  const dirtyCount =
    status.created.length +
    status.deleted.length +
    status.modified.length +
    status.not_added.length +
    status.renamed.length;

  const freshness = await readIndexFreshness(contentDirectory);
  const fetchedAt = await fetchedAtOf(contentDirectory);

  return {
    isRepo: true,
    branch: status.current ?? undefined,
    detached: status.detached,
    upstream: status.tracking ?? undefined,
    ahead: status.ahead,
    behind: status.behind,
    remotes,
    branches,
    merge: {
      inProgress: inMerge,
      conflicted,
      resolvedCount: inMerge ? status.staged.length : 0,
    },
    dirty: !inMerge && dirtyCount > 0,
    dirtyCount,
    diverged: status.ahead > 0 && status.behind > 0,
    ...(fetchedAt ? { fetchedAt } : {}),
    indexStale: freshness.stale,
    ...(freshness.indexedHead ? { indexedHead: freshness.indexedHead } : {}),
    log,
    hasMore,
  };
}

/**
 * Whether the indexes describe HEAD (27b/D3).
 *
 * The engine's own `readIndexFreshness`, under the name the plan and the
 * routes use. `stale` is true when HEAD moved without a full rebuild, or when
 * no rebuild was ever recorded; it is false outside a repository.
 */
export function indexFreshness(ctx: CurationContext): Promise<IndexFreshness> {
  return readIndexFreshness(ctx.contentDirectory);
}

export interface GitLogOptions {
  type?: string;
  slug?: string;
  limit?: number;
  offset?: number;
}

/**
 * A page of history, optionally narrowed to one content type or one item.
 *
 * simple-git's **array form**, not its object form: `log({file, maxCount})`
 * emits `--follow` and puts its options *behind* the `--` pathspec separator,
 * so `--name-only` over several paths is not expressible that way at all
 * (T44). The touched files come from simple-git's own parse of `--name-only`
 * (`entry.diff.files[].file`).
 *
 * `limit + 1` commits are asked for and the extra one is dropped: that is how
 * `hasMore` is known without a second count, and it is what the page's "Load
 * more" has always done.
 */
export async function gitLog(
  ctx: CurationContext,
  { type, slug, limit = LOG_PAGE_SIZE, offset = 0 }: GitLogOptions = {},
): Promise<GitLogResult> {
  const git = await requireRepo(ctx);
  const paths: string[] = [];
  if (type !== undefined) {
    const config = configFor(type);
    paths.push(
      ...pathspecsFor(
        config,
        ctx.contentDirectory,
        slug === undefined ? undefined : assertSlug(slug),
      ),
    );
  } else if (slug !== undefined) {
    /* A slug alone would have to be guessed at across three directories. */
    throw new ValidationError("Invalid input", [
      { path: "type", message: "A slug needs a type to look it up under" },
    ]);
  }

  const size = Math.max(1, Math.trunc(limit));
  const args = [
    `--max-count=${size + 1}`,
    `--skip=${Math.max(0, Math.trunc(offset))}`,
    "--name-only",
  ];
  if (paths.length > 0) args.push("--", ...paths);

  let all: (DefaultLogFields & { diff?: { files: { file: string }[] } })[] = [];
  try {
    all = [...(await git.log(args)).all];
  } catch {
    /* An unborn branch has no commits to list — as `gitStatus` also decides. */
    return { commits: [], hasMore: false };
  }

  const hasMore = all.length > size;
  return {
    commits: all.slice(0, size).map((entry) => ({
      ...toSummary(entry),
      files: (entry.diff?.files ?? []).map((file) => file.file),
    })),
    hasMore,
  };
}

/** One commit's diff, as `git show` prints it. */
export async function gitShow(
  ctx: CurationContext,
  hash: string,
  { maxChars = MAX_DIFF_CHARS }: { maxChars?: number } = {},
): Promise<ShowResult> {
  assertHash(hash);
  const git = await requireRepo(ctx);
  const raw = String(await git.show([hash]));
  return { hash, ...truncateDiff(raw, maxChars) };
}

export interface GitFileRef {
  type: string;
  slug: string;
  rev: string;
}

/**
 * One item's data file as it was at `rev`, parsed.
 *
 * The point of the seat is "what did this look like before", which is the
 * question a curator asks *before* deciding to restore. Absent at that
 * revision is `not_found` rather than an empty answer, since "the file was not
 * there" and "the file was empty" are different facts.
 */
export async function gitFileAt(
  ctx: CurationContext,
  { type, slug, rev }: GitFileRef,
): Promise<FileAtResult> {
  const config = configFor(type);
  const safeSlug = assertSlug(slug);
  const safeRev = assertArgument(rev, "rev");
  const git = await requireRepo(ctx);
  const target = dataPathFor(config, safeSlug);

  let raw: string;
  try {
    raw = String(await git.show([`${safeRev}:${target}`]));
  } catch (error) {
    throw new NotFoundError(
      `No ${type} "${safeSlug}" at ${safeRev}: ${messageOf(error)
        .split("\n")[0]
        .trim()}`,
      safeSlug,
    );
  }

  let content: unknown;
  try {
    content = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ValidationError(
      `The ${type} data file at ${safeRev} is not valid JSON: ${messageOf(error)}`,
    );
  }

  return {
    type: type as GitType,
    slug: safeSlug,
    rev: safeRev,
    path: target,
    content,
  };
}

export interface GitDiffOptions {
  from: string;
  to?: string;
  path?: string;
}

/** The diff between two revisions, optionally narrowed to one path. */
export async function gitDiff(
  ctx: CurationContext,
  { from, to = "HEAD", path: target }: GitDiffOptions,
): Promise<DiffResult> {
  const safeFrom = assertArgument(from, "from");
  const safeTo = assertArgument(to, "to");
  const safePath =
    target === undefined ? undefined : assertArgument(target, "path");
  const git = await requireRepo(ctx);
  const args = ["diff", safeFrom, safeTo];
  if (safePath) args.push("--", safePath);
  const raw = String(await git.raw(args));
  return {
    from: safeFrom,
    to: safeTo,
    ...(safePath ? { path: safePath } : {}),
    ...truncateDiff(raw, MAX_DIFF_CHARS),
  };
}

/* --- writes -------------------------------------------------------------- */

/** The author, as git's environment and as `--author` want it. */
function authorEnv(ctx: CurationContext): Record<string, string> {
  if (!ctx.author) return {};
  return {
    GIT_AUTHOR_NAME: ctx.author.name,
    GIT_AUTHOR_EMAIL: ctx.author.email,
  };
}

function authorOption(ctx: CurationContext): Record<string, string> {
  return ctx.author
    ? { "--author": `${ctx.author.name} <${ctx.author.email}>` }
    : {};
}

/**
 * Rebuild every index, then tell the caller's process its caches are wrong.
 *
 * Both halves, in this order, and neither is optional: the data files on disk
 * moved without the engine's knowledge, so the LMDB indexes are stale until
 * `reindex` reprojects them, and a running editor is serving rendered pages
 * from before that until `onBulkChange` fires. `reindex` is Node-safe and lives
 * here; the invalidation cannot (D8), so it arrives through the context.
 */
async function rebuildAfterRewind(ctx: CurationContext): Promise<string[]> {
  const { rebuilt } = await reindex(ctx);
  ctx.onBulkChange?.();
  return rebuilt;
}

/**
 * Undo one commit with a new commit.
 *
 * `git revert` rather than a hand-rolled checkout, because a revert of an older
 * commit is a *patch* — it has to fail loudly when later commits have moved the
 * same lines, and git is the only thing that knows.
 *
 * **Not `commitChanges`** (T46): its `git add <paths>` is handed the paths the
 * reverted commit touched, and a revert of a *create* deletes those paths — so
 * the add fails on a path that is gone from both index and tree. `git revert`
 * makes its own commit instead, which is also how the message comes out as
 * git's own `Revert "<subject>"`.
 *
 * Merge commits are refused: `git revert -m` needs a mainline choice that
 * nothing in this request is in a position to make.
 */
export async function gitRevert(
  ctx: CurationContext,
  hash: string,
): Promise<GitWriteResult> {
  assertHash(hash);
  const git = await requireRepo(ctx);
  await requireCleanTree(ctx, git);

  let resolved: string;
  try {
    resolved = String(
      await git.raw(["rev-parse", "--verify", `${hash}^{commit}`]),
    ).trim();
  } catch {
    throw new BadRevisionError(
      `No commit at "${hash}" in the content repository.`,
    );
  }

  const parents = String(
    await git.raw(["rev-list", "--parents", "-n", "1", resolved]),
  )
    .trim()
    .split(/\s+/);
  if (parents.length > 2) {
    throw new BadRevisionError(
      `${resolved.slice(0, 7)} is a merge commit; reverting one needs a mainline choice that this seat does not make. Use /git.`,
    );
  }

  try {
    await git
      .env({ ...process.env, ...authorEnv(ctx) })
      .raw(["revert", "--no-edit", resolved]);
  } catch (error) {
    /*
     * Leave the tree as it was found. `revert --abort` is the right undo while
     * the sequencer is live; if git refused the revert before starting one it
     * errors, and `reset --hard HEAD` is safe precisely because
     * `requireCleanTree` just proved there was nothing to lose.
     */
    try {
      await git.raw(["revert", "--abort"]);
    } catch {
      await git.raw(["reset", "--hard", "HEAD"]);
    }
    throw new GitConflictError(
      `Reverting ${resolved.slice(0, 7)} conflicts with later commits, so nothing was changed: ${messageOf(error).split("\n")[0].trim()}`,
    );
  }

  const commit = String(await git.revparse(["HEAD"])).trim();
  const message = String(await git.raw(["log", "-1", "--pretty=%s"])).trim();
  return { commit, message, rebuilt: await rebuildAfterRewind(ctx) };
}

export interface GitRestoreRef {
  type: string;
  slug: string;
  rev: string;
}

/**
 * Put one item back the way it was at `rev`.
 *
 * Narrower than a revert and more predictable: a revert replays a patch and can
 * conflict, while this simply makes one item's files match a revision, whatever
 * happened in between. Its scope is the type's two pathspecs — the data
 * directory and the uploads directory — so a restore brings back the images
 * too, which is the difference between a recipe that renders and one that
 * renders broken.
 *
 * `ls-tree` first, because "absent at that revision" is `not_found` and not an
 * empty restore that deletes the item. Then `rm` + `checkout` of exactly the
 * files `ls-tree` named, so a file added *after* `rev` is removed rather than
 * left behind. A staged diff that comes out empty means the tree already
 * matches: `reset --hard` and `{commit: null}`, because an empty commit is
 * noise in a history a person reads.
 */
export async function gitRestore(
  ctx: CurationContext,
  { type, slug, rev }: GitRestoreRef,
): Promise<GitWriteResult> {
  const config = configFor(type);
  const safeSlug = assertSlug(slug);
  const safeRev = assertArgument(rev, "rev");
  const git = await requireRepo(ctx);
  await requireCleanTree(ctx, git);

  const pathspecs = pathspecsFor(config, ctx.contentDirectory, safeSlug);

  let listed: string[];
  try {
    listed = String(
      await git.raw([
        "ls-tree",
        "-r",
        "--name-only",
        safeRev,
        "--",
        ...pathspecs,
      ]),
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new BadRevisionError(
      `Cannot read ${safeRev} in the content repository: ${messageOf(error).split("\n")[0].trim()}`,
    );
  }
  if (listed.length === 0) {
    throw new NotFoundError(
      `${type} ${safeSlug} does not exist at ${safeRev}`,
      safeSlug,
    );
  }

  try {
    await git.raw(["rm", "-r", "--ignore-unmatch", "-q", "--", ...pathspecs]);
    await git.raw(["checkout", safeRev, "--", ...listed]);
  } catch (error) {
    /* Half a restore is worse than none; the tree was clean, so this is safe. */
    await git.raw(["reset", "--hard", "HEAD"]);
    throw new BadRevisionError(
      `Cannot restore ${type} ${safeSlug} from ${safeRev}, so nothing was changed: ${messageOf(error).split("\n")[0].trim()}`,
    );
  }

  const staged = String(
    await git.raw(["diff", "--cached", "--name-only"]),
  ).trim();
  const short = String(await git.revparse(["--short", safeRev])).trim();
  if (!staged) {
    await git.raw(["reset", "--hard", "HEAD"]);
    return {
      commit: null,
      message: `${type} ${safeSlug} already matches ${short}`,
      rebuilt: [],
    };
  }

  const full = String(await git.revparse([safeRev])).trim();
  const message = `Restore ${type} ${safeSlug} to ${short}`;
  await git.commit([message, `From ${full}.`], authorOption(ctx));

  const commit = String(await git.revparse(["HEAD"])).trim();
  return { commit, message, rebuilt: await rebuildAfterRewind(ctx) };
}

export interface GitPushOptions {
  remote?: string;
  setUpstream?: boolean;
}

/**
 * Send the current branch to its remote.
 *
 * The `/git` page's push contract, unchanged: an upstream already configured is
 * a bare `push`, and anything else is `push -u <remote> <branch>`. It makes no
 * local commit and changes nothing on disk, which is why it is the one write
 * with no clean-tree preflight (T47) and why nothing local goes stale
 * afterwards (T50 — no `afterWrite`, no `onBulkChange`).
 *
 * A rejection is `git_conflict` with the page's own sentence: the remote has
 * commits this branch does not, and pulling them is a decision for a person.
 */
export async function gitPush(
  ctx: CurationContext,
  { remote, setUpstream }: GitPushOptions = {},
): Promise<PushResult> {
  /* A mirror never pushes; the workstation pulls from it (epic 28, D1). */
  if (isMirror()) throw new ForbiddenError(mirrorRefusal("pushing"));
  const safeRemote =
    remote === undefined ? undefined : assertArgument(remote, "remote");
  const git = await requireRepo(ctx);
  const status = await git.status();
  const trackingRemote = status.tracking?.split("/")[0];

  try {
    /*
     * A bare `push` only when it would go where the caller asked: an explicit
     * `remote` that is not the tracked one is a `push -u` there, not a silent
     * push somewhere else with the wrong name in the answer.
     */
    if (
      status.tracking &&
      !setUpstream &&
      (safeRemote === undefined || safeRemote === trackingRemote)
    ) {
      await git.raw(["push"]);
      return {
        remote: trackingRemote ?? status.tracking,
        branch: status.current ?? status.tracking,
      };
    }
    const targetRemote = safeRemote ?? "origin";
    const targetBranch = status.current;
    if (!targetBranch) {
      throw new BadRevisionError(
        "Cannot determine the current branch to push.",
      );
    }
    await git.raw(["push", "-u", targetRemote, targetBranch]);
    return { remote: targetRemote, branch: targetBranch };
  } catch (error) {
    if (error instanceof BadRevisionError) throw error;
    const message = messageOf(error);
    if (/rejected|non-fast-forward|fetch first/i.test(message)) {
      throw new GitConflictError(
        "Push rejected — the remote has commits you don't have. Run git pull (or Pull on the editor's Git page) to merge them, then push.",
      );
    }
    throw error;
  }
}

export interface GitFetchOptions {
  remote?: string;
}

/**
 * Bring the remote's refs up to date, and nothing else (27b/D4).
 *
 * The working tree, the branch and the indexes are untouched — only
 * `refs/remotes/*` and `FETCH_HEAD` move — which is why this is the git seat an
 * agent may run unasked, and why a read-scoped token may run it (D6). It does
 * not refuse a dirty tree for the same reason: there is nothing for
 * uncommitted work to collide with.
 *
 * Answers with what the fetch was for: where this branch now stands against
 * its upstream.
 */
export async function gitFetch(
  ctx: CurationContext,
  { remote }: GitFetchOptions = {},
): Promise<FetchResult> {
  const safeRemote =
    remote === undefined ? undefined : assertArgument(remote, "remote");
  const git = await requireRepo(ctx);
  const fetched = await fetchRemote(git, safeRemote);
  const status = await git.status();
  const fetchedAt = await fetchedAtOf(ctx.contentDirectory);
  return {
    remote: fetched,
    ...(status.tracking ? { upstream: status.tracking } : {}),
    ahead: status.ahead,
    behind: status.behind,
    diverged: status.ahead > 0 && status.behind > 0,
    ...(fetchedAt ? { fetchedAt } : {}),
  };
}

export interface GitPullOptions {
  remote?: string;
}

/**
 * Fetch, then merge the upstream into the current branch (27b/D4).
 *
 * **Merge, never rebase**, and through `merge` rather than `pull` so the user's
 * `pull.rebase` cannot change what happens — the `/git` page learned that the
 * hard way (its `--no-rebase` comment). A fast-forward when the branch has
 * nothing of its own, a merge commit when both sides moved.
 *
 * **A conflict is never left behind.** An agent cannot resolve one, and a
 * half-merged tree would block every other write (`dirty_tree`). So on any
 * failure the merge is aborted — the tree was clean going in, which is what
 * makes that safe — and `git_conflict` names the files, for a person to pull
 * from the `/git` page, where the resolver is.
 *
 * On success every index is rebuilt and `onBulkChange` fires, exactly as after
 * a revert: files moved that the engine never wrote. The rebuild also stamps
 * the new HEAD, which is what clears the stale-index banner.
 */
export async function gitPull(
  ctx: CurationContext,
  { remote }: GitPullOptions = {},
): Promise<PullResult> {
  const safeRemote =
    remote === undefined ? undefined : assertArgument(remote, "remote");
  const git = await requireRepo(ctx);
  const status = await requireCleanTree(ctx, git);
  /*
   * On a mirror a pull is only ever a fast-forward: with commits of its own
   * waiting it would merge, and merges happen on the workstation (epic 28, D1).
   */
  if (isMirror() && status.ahead > 0) {
    throw new ForbiddenError(
      mirrorRefusal("merging this mirror's own changes"),
    );
  }
  const trackingRemote = status.tracking?.split("/")[0];

  let from: string;
  if (
    status.tracking &&
    (safeRemote === undefined || safeRemote === trackingRemote)
  ) {
    from = status.tracking;
  } else if (safeRemote && status.current) {
    from = `${safeRemote}/${status.current}`;
  } else {
    throw new ValidationError(
      "No upstream configured: pass `remote`, or set one with git push --set-upstream.",
      [{ path: "remote", message: "No upstream to pull from" }],
    );
  }
  await fetchRemote(git, from.split("/")[0]);

  const before = String(await git.revparse(["HEAD"])).trim();
  const newCommits = Number(
    String(
      await git.raw(["rev-list", "--count", `HEAD..${from}`]).catch(() => ""),
    ).trim() || Number.NaN,
  );
  if (!Number.isFinite(newCommits)) {
    throw new BadRevisionError(
      `${from} does not exist after the fetch — is the branch on the remote?`,
    );
  }
  if (newCommits === 0) {
    return {
      from,
      merged: false,
      fastForward: false,
      newCommits: 0,
      head: before,
      rebuilt: [],
    };
  }

  /*
   * A count, not `merge-base --is-ancestor`: that answers through its exit
   * code alone, and `simple-git`'s `raw` resolves an exit 1 that printed
   * nothing — so every pull read as a fast-forward (T3).
   */
  const fastForward =
    Number(
      String(await git.raw(["rev-list", "--count", `${from}..HEAD`])).trim(),
    ) === 0;

  /*
   * Success is judged by the repository afterwards, not by whether `raw`
   * rejected: a conflicted merge prints its CONFLICT lines on stdout and exits
   * 1, and `simple-git` resolves that (T3) — the first draft of this seat
   * answered `merged: true` with the tree left mid-merge.
   */
  let failure: unknown = null;
  try {
    await git
      .env({ ...process.env, ...authorEnv(ctx) })
      .raw(["merge", "--no-edit", from]);
  } catch (error) {
    failure = error;
  }
  const after = await git.status().catch(() => null);
  if (
    failure !== null ||
    (await mergeInProgress(ctx.contentDirectory)) ||
    (after?.conflicted.length ?? 0) > 0
  ) {
    const conflicted = after?.conflicted ?? [];
    const error = failure ?? new Error("the merge did not complete");
    /*
     * The same rule for the undo: `merge --abort` is tried, and the tree is
     * checked rather than the call trusted. `reset --hard` is safe because
     * `requireCleanTree` proved there was nothing uncommitted to lose.
     */
    await git.raw(["merge", "--abort"]).catch(() => undefined);
    if (
      (await mergeInProgress(ctx.contentDirectory)) ||
      !(await git.status()).isClean()
    ) {
      await git.raw(["reset", "--hard", "HEAD"]);
    }
    throw new GitConflictError(
      conflicted.length > 0
        ? `Pulling ${from} conflicts in ${conflicted.join(", ")}, so nothing was changed. Pull from the editor's Git page to resolve them.`
        : `Pulling ${from} failed, so nothing was changed: ${messageOf(error).split("\n")[0].trim()}`,
    );
  }

  const head = String(await git.revparse(["HEAD"])).trim();
  return {
    from,
    merged: true,
    fastForward,
    newCommits,
    head,
    rebuilt: await rebuildAfterRewind(ctx),
  };
}
