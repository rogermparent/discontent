import { open, type Key, type RootDatabase } from "lmdb";
import { statSync } from "fs";
import { resolve } from "path";

/*
 * Opening an LMDB environment maps its file; closing it unmaps. Paying that per
 * call means, during a static export, one map/unmap cycle per
 * `generateStaticParams` *and* per rendered page — for data that cannot change
 * mid-build. Environments are opened once per process instead and handed back
 * from this cache.
 *
 * Extracted from `pagination/database.ts` when aggregates arrived (F10b) rather
 * than copied: the invalidation rule below is subtle enough that two
 * implementations of it would eventually disagree. The content layer joined at
 * F1, which is why nothing anywhere may call `.close()` on what this returns —
 * see `closeCachedEnvironments`.
 */
interface CachedDatabase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: RootDatabase<any, any>;
  /** Identifies the file the environment is mapped to. */
  signature: string;
}

const databaseCache = new Map<string, CachedDatabase>();

/**
 * Environments this cache has stopped handing out but has not closed yet.
 *
 * Closing one the instant its file changed identity is what F24 was: a reader
 * acquires the handle, `await`s, and comes back to an environment a *second*
 * request closed during the yield. `readContentIndex` has exactly that shape —
 * acquire, await the range read, then count — and so do `rebuildIndex`'s corpus
 * scan and both dependent-write passes. LMDB fails it two ways, and only the
 * first is survivable: reads throw `Can not read from a closed database`, which
 * a request turns into a 500, but the abandoned read transaction also leaves a
 * timer that throws `Attempt to reset an invalid read txn` from
 * `processTimers` — outside every try/catch in the process.
 *
 * So a retired environment is kept open for a grace period and closed after it.
 *
 * **Why the grace period is a timer and not a refcount.** A refcount needs a
 * release edge, and there is none to put one on: `getContentDatabase`,
 * `getPaginationDatabase` and `getAggregateDatabase` are synchronous getters
 * that hand the handle to 18 callers, and the hazard is a handle held *between*
 * operations — at that moment nothing is in flight for an operation-level count
 * to see. The only fully general fix is a scoped `withDatabase(fn)` at all 18
 * call sites, several of which hold the handle across a whole corpus scan. That
 * is a much larger change than this defect justifies, and it is written down in
 * §11.4 rather than done here.
 *
 * What the grace period is not is a licence to leak. The three Playwright
 * harnesses swap the content directory on every test, and a mapping retained
 * per swap spends file descriptors against a 1024 default — which is why
 * retirement must still end in a close, and why `test/environmentCache.test.ts`
 * asserts that it does rather than trusting this comment.
 */
const retiredDatabases = new Set<CachedDatabase>();

/**
 * How long a retired environment stays open for readers that already hold it.
 *
 * Long enough to cover any read a request could still be inside — the reads
 * this guards are single-digit milliseconds — and short enough that a suite
 * swapping content directories every couple of seconds holds no more than a
 * generation or two of retired mappings at a time.
 */
const RETIREMENT_GRACE_MS = 5_000;

/**
 * Retire `entry`: stop handing it out, and close it once anything still reading
 * it has had time to finish.
 */
function retire(entry: CachedDatabase): void {
  retiredDatabases.add(entry);
  const timer = setTimeout(() => {
    if (!retiredDatabases.delete(entry)) {
      // `closeCachedEnvironments` already drained it.
      return;
    }
    void entry.db.close().catch(() => {});
  }, RETIREMENT_GRACE_MS);
  /*
   * A pending close must never be the reason a process stays alive — a build
   * that has finished rendering is done, whatever this cache is still holding.
   */
  timer.unref?.();
}

/**
 * Which *file* the environment at this path is mapped to, by device and inode.
 *
 * An open environment holds its data file mapped. Unlinking that file on a
 * POSIX system leaves the mapping perfectly valid and pointing at an inode
 * nothing else can reach, so a cached environment would go on answering from
 * content that is no longer on disk while writes vanished into it. That is not
 * hypothetical here: a content directory is a separate repository that gets
 * replaced wholesale by a sync, and the demo's test harness swaps one out
 * between every test.
 *
 * An empty signature means "no file", which never matches a real one — so a
 * removed directory always reopens.
 */
function fileSignature(path: string): string {
  try {
    const stats = statSync(resolve(path, "data.mdb"));
    return `${stats.dev}:${stats.ino}`;
  } catch {
    return "";
  }
}

/**
 * The environment at `path`, opened once per process.
 *
 * Opening also *creates* the directory, which is why every caller of this is a
 * place a `.gitignore` has to know about (§13).
 *
 * The returned environment is shared, so a caller that closes it hands every
 * later reader in the process a closed environment. Only
 * `closeCachedEnvironments` may close one.
 */
export function openCachedEnvironment<
  TValue = unknown,
  TKey extends Key = Key[],
>(path: string): RootDatabase<TValue, TKey> {
  const cached = databaseCache.get(path);
  if (cached && cached.signature === fileSignature(path)) {
    return cached.db as RootDatabase<TValue, TKey>;
  }
  if (cached) {
    databaseCache.delete(path);
    /*
     * Not closed here. The file it maps no longer exists, but a reader that
     * acquired the handle before the swap is still entitled to finish (F24) —
     * an unlinked file stays perfectly readable through an open mapping, which
     * is the same POSIX behaviour `fileSignature` exists to detect.
     */
    retire(cached);
  }
  const db = open<TValue, TKey>({ path });
  databaseCache.set(path, { db, signature: fileSignature(path) });
  return db;
}

/**
 * Close every cached environment. Nothing in normal operation needs this — the
 * cache is meant to live as long as the process — but tests that build content
 * or derived state in a temporary directory do.
 *
 * Retired environments are drained too: a suite that swapped a content
 * directory and then tore down would otherwise leave one mapping per swap open
 * until a timer nothing is waiting on fires.
 */
export async function closeCachedEnvironments(): Promise<void> {
  const databases = [...databaseCache.values(), ...retiredDatabases];
  databaseCache.clear();
  retiredDatabases.clear();
  await Promise.all(databases.map(({ db }) => db.close()));
}
