/**
 * Which commit the indexes were last rebuilt from.
 *
 * The indexes are derived from the data files, and nothing used to record
 * *which* data files: a push that landed on a non-bare content repository
 * (`receive.denyCurrentBranch updateInstead` — the Pi editor) moved HEAD and
 * the working tree underneath a running editor, which went on serving the old
 * indexes with no sign anything had happened. The stamp is that sign. A full
 * rebuild writes the HEAD it indexed; `readIndexFreshness` compares it with the
 * HEAD there is now.
 *
 * ## Where it lives
 *
 * Inside the repository's git directory (`git rev-parse --git-path`), not in the
 * content tree. Git never tracks anything there, so no content repository needs
 * a `.gitignore` line for it, and a fresh clone — which has no indexes either —
 * correctly reads as stale.
 *
 * ## Why a commit advances it
 *
 * Every write the engine makes is a commit, and every one of those keeps the
 * indexes current incrementally. So a commit made *through the engine* moves
 * HEAD without making the indexes stale, and `commitChanges` advances the stamp
 * — but only when the stamp named the HEAD the commit was made on top of. A
 * stamp that was already behind stays behind: an incremental write does not
 * repair a corpus that changed underneath it.
 *
 * ## The index version (epic 39, D1)
 *
 * The HEAD stamp says *which files* the indexes describe; the version stamp,
 * `.git/discontent-index-version` beside it, says *which code* built them.
 * `computeIndexVersion(registry)` hashes what the registry **declares** about
 * every index it owns — each type's identity and directories, its
 * `indexVersion`, the fields its references borrow, and the spec hash of
 * every pagination index and aggregate (taxonomies included, through
 * `aggregatesOf`) — plus `ENGINE_INDEX_FORMAT`. Declared versions, never
 * function source: source text differs between a minified build and a dev
 * server (F16), and a comment-only edit must not rebuild every instance at
 * its next start. A full rebuild writes it; an instance that starts with a
 * different one (or none, the first start after this landed) rebuilds once.
 */
import { access, readFile, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";
import { computeAggregateSpecHash } from "../aggregates/database";
import type { AnyContentTypeConfig } from "../content/types";
import { hashValue } from "../pagination/hash";
import { computeSpecHash } from "../pagination/database";
import { aggregatesOf } from "../taxonomies/aggregates";

const STAMP_NAME = "discontent-indexed-head";
const VERSION_NAME = "discontent-index-version";

/**
 * The engine's half of the index version: bump it when the engine changes
 * what it stores for every site — an index key's layout, a META shape, a
 * keyspace's encoding — so each instance rebuilds once at its next start.
 * A site's own changes bump the declared versions on its configs instead.
 */
export const ENGINE_INDEX_FORMAT = "1";

/** `commit.ts`'s check, repeated here because that module imports this one. */
async function directoryIsGitRepo(contentDirectory: string): Promise<boolean> {
  try {
    await access(join(contentDirectory, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function gitPath(
  contentDirectory: string,
  name: string,
): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      name,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

function stampPath(contentDirectory: string): Promise<string> {
  return gitPath(contentDirectory, STAMP_NAME);
}

/** HEAD's commit, or `null` for a directory that is not a repo or has none. */
export async function readHead(
  contentDirectory: string,
): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  try {
    return String(
      await simpleGit({ baseDir: contentDirectory }).raw([
        "rev-parse",
        "--verify",
        "--quiet",
        "HEAD",
      ]),
    ).trim();
  } catch {
    /* An unborn branch: nothing has been committed yet. */
    return null;
  }
}

/** The commit the last full rebuild indexed, or `null` if none was recorded. */
export async function readIndexedHead(
  contentDirectory: string,
): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  try {
    const value = (
      await readFile(await stampPath(contentDirectory), "utf8")
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Record that the indexes now reflect `head` (HEAD when omitted).
 *
 * A no-op outside a repository and on an unborn branch: there is no commit to
 * name, and an absent stamp already reads as "unknown".
 */
export async function writeIndexedHead(
  contentDirectory: string,
  head?: string | null,
): Promise<void> {
  const value = head ?? (await readHead(contentDirectory));
  if (!value) return;
  await writeFile(await stampPath(contentDirectory), `${value}\n`);
}

/**
 * After a commit made on top of `previousHead`, carry a current stamp forward.
 *
 * Fire-and-forget in spirit: the commit has landed, and failing a write because
 * a bookkeeping file could not be written would be the wrong trade. A stamp
 * left behind only means a "Rebuild indexes" banner that a rebuild clears.
 */
export async function advanceIndexedHead(
  contentDirectory: string,
  previousHead: string | null,
  /* The commit just made; HEAD when omitted. */
  head?: string,
): Promise<void> {
  if (!previousHead) return;
  try {
    if ((await readIndexedHead(contentDirectory)) !== previousHead) return;
    await writeIndexedHead(contentDirectory, head);
  } catch {
    /* See above: never fail a write that already committed. */
  }
}

/**
 * What a site's registry declares about its indexes, as one short hash (D1).
 *
 * Only declarations go in, so the answer is the same in a dev server, a
 * production build and a CLI, and a comment, a rename or a reformatting
 * changes nothing: bumping a config's `version` (or `indexVersion`, or a
 * taxonomy's) is what moves it, as `test/specVersions.test.ts` asks authors
 * to. A reference's `config` thunk is called for the referenced type's name —
 * by the time anything asks for a version, every config module has loaded.
 */
export function computeIndexVersion(
  registry: readonly AnyContentTypeConfig[],
): string {
  return hashValue({
    engine: ENGINE_INDEX_FORMAT,
    types: registry.map((config) => ({
      contentType: config.contentType,
      dataDirectory: config.dataDirectory,
      indexDirectory: config.indexDirectory,
      dataFilename: config.dataFilename,
      indexVersion: config.indexVersion,
      references: config.references?.map((reference) => ({
        type: reference.config().contentType,
        dataField: reference.dataField,
        indexField: reference.indexField,
        fields: [...reference.fields],
      })),
      pagination: config.paginationIndexes?.map((index) =>
        computeSpecHash(
          index as unknown as Parameters<typeof computeSpecHash>[0],
        ),
      ),
      aggregates: aggregatesOf(config).map((aggregate) =>
        computeAggregateSpecHash(
          aggregate as unknown as Parameters<
            typeof computeAggregateSpecHash
          >[0],
        ),
      ),
    })),
  }).slice(0, 16);
}

/** The version the last full rebuild recorded, or `null` if none was. */
export async function readIndexVersion(
  contentDirectory: string,
): Promise<string | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  try {
    const value = (
      await readFile(await gitPath(contentDirectory, VERSION_NAME), "utf8")
    ).trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Record that the indexes were built by `version`. Written by a full rebuild
 * beside the HEAD stamp; a no-op outside a repository.
 */
export async function writeIndexVersion(
  contentDirectory: string,
  version: string,
): Promise<void> {
  if (!(await directoryIsGitRepo(contentDirectory))) return;
  await writeFile(
    await gitPath(contentDirectory, VERSION_NAME),
    `${version}\n`,
  );
}

export interface IndexFreshness {
  /** The commit the last full rebuild indexed; `null` if none was recorded. */
  indexedHead: string | null;
  /** HEAD now; `null` outside a repository or on an unborn branch. */
  head: string | null;
  /**
   * The indexes may not describe the working tree: HEAD moved without a full
   * rebuild (a pull, a push received into this repository, a checkout from a
   * shell), or no rebuild was ever recorded. Always false without a HEAD.
   */
  stale: boolean;
  /**
   * The index version the last full rebuild recorded (D1); `null` if none
   * was — every repository indexed before epic 39.
   */
  indexedVersion: string | null;
  /** The version asked about (the running code's), when one was given. */
  version?: string;
  /**
   * The indexes were built by other code than the version asked about, or
   * no version was recorded. False when no version was given, and — like
   * `stale` — without a HEAD.
   */
  versionStale: boolean;
}

export async function readIndexFreshness(
  contentDirectory: string,
  { version }: { version?: string } = {},
): Promise<IndexFreshness> {
  const head = await readHead(contentDirectory);
  const indexedHead = head ? await readIndexedHead(contentDirectory) : null;
  const indexedVersion = head ? await readIndexVersion(contentDirectory) : null;
  return {
    indexedHead,
    head,
    stale: head !== null && indexedHead !== head,
    indexedVersion,
    ...(version !== undefined ? { version } : {}),
    versionStale:
      version !== undefined && head !== null && indexedVersion !== version,
  };
}
