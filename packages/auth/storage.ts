import { statSync } from "node:fs";
import { join } from "node:path";
import { open, type RootDatabase } from "lmdb";
import type { BetterAuthOptions } from "better-auth";

type SecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;

/**
 * Better Auth's `secondaryStorage` on an LMDB environment (47e): sessions,
 * the per-user session lists, verification rows and the sign-in rate limiter's
 * counters.
 *
 * **Where.** `<settings directory>/auth` — beside `settings.json`, per
 * instance, never in the content repo. So a session is never committed, never
 * synced to the Pi with the content, and no reindex, `git pull`, revert or
 * sync touches it (they work on the content directory and its indexes). On the
 * Pi the settings directory is the `~/recipe-editor/settings` volume, so
 * sessions survive a redeploy.
 *
 * **TTL.** LMDB has none, so each value is stored as `{v, e}` — the value and
 * its expiry in epoch milliseconds (`null`: none). A read past `e` answers
 * "absent" and removes the row; a sweep of expired rows runs at most once a
 * minute on a write, so counters and dead sessions do not pile up.
 *
 * **Atomicity.** `getAndDelete` and `increment` each run in one synchronous
 * LMDB write transaction, which LMDB serialises across processes too (a
 * `next start` and a script may share the env).
 */
interface Entry {
  v: string | number;
  e: number | null;
}

export interface AuthStorage extends SecondaryStorage {
  /**
   * Remove every stored session of `userId`, and its session list — whether
   * or not the list still names them. "Sign out everywhere" calls Better
   * Auth's `revokeSessions` first; this sweep is the guarantee, because
   * `revokeSessions` only deletes the sessions on the list (Better Auth fixed
   * sessions missing from it only in 1.7.16, after the version pinned here).
   */
  sweepUserSessions(userId: string): Promise<number>;
  /** Remove every expired row now (normally done at most once a minute). */
  prune(): Promise<number>;
}

const PRUNE_INTERVAL_MS = 60_000;

type Db = RootDatabase<Entry, string>;

interface OpenEnv {
  db: Db;
  /** `dev:ino` of `data.mdb` when it was opened. */
  signature: string | null;
}

/*
 * One environment per path per process, kept on `globalThis` so `next dev`'s
 * module reloads reuse it instead of mapping the file again.
 */
const OPEN_KEY = Symbol.for("@discontent/auth/lmdb-envs");
function openEnvironments(): Map<string, OpenEnv> {
  const holder = globalThis as unknown as Record<symbol, Map<string, OpenEnv>>;
  holder[OPEN_KEY] ??= new Map();
  return holder[OPEN_KEY];
}

function signatureOf(path: string): string | null {
  try {
    const stats = statSync(join(/*turbopackIgnore: true*/ path, "data.mdb"));
    return `${stats.dev}:${stats.ino}`;
  } catch {
    return null;
  }
}

/** How long a replaced environment stays open for a read already in it. */
const RETIRE_GRACE_MS = 5_000;

/*
 * The environment for `path`, reopened when its file is no longer the one
 * mapped — the settings directory was removed and made again (the Playwright
 * suites reset `test-settings` before every test; a person might clear it).
 * Without this the process would keep writing sessions into an unlinked file
 * nobody else can see. The check is one `stat` per call, the same rule the
 * engine's `environmentCache` uses for the content indexes.
 */
function openDatabase(path: string): Db {
  const envs = openEnvironments();
  const current = envs.get(path);
  if (current && current.signature === signatureOf(path)) return current.db;
  if (current) {
    const retired = current.db;
    setTimeout(() => {
      void retired.close().catch(() => {});
    }, RETIRE_GRACE_MS).unref?.();
  }
  const db = open<Entry, string>({
    path: /*turbopackIgnore: true*/ path,
    compression: false,
  });
  envs.set(path, { db, signature: signatureOf(path) });
  return db;
}

/** Close every environment this module opened (tests). */
export async function closeAuthStorages(): Promise<void> {
  const envs = openEnvironments();
  const all = [...envs.values()];
  envs.clear();
  await Promise.all(all.map(({ db }) => db.close()));
}

function isLive(entry: Entry | undefined, now: number): entry is Entry {
  return !!entry && (entry.e === null || entry.e > now);
}

function expiryFor(ttlSeconds: number | undefined, now: number): number | null {
  return ttlSeconds && ttlSeconds > 0 ? now + ttlSeconds * 1000 : null;
}

export function lmdbSecondaryStorage(
  path: string,
  { now = Date.now }: { now?: () => number } = {},
): AuthStorage {
  const database = () => openDatabase(path);
  let lastPrune = 0;

  async function prune(): Promise<number> {
    const store = database();
    const at = now();
    lastPrune = at;
    const expired: string[] = [];
    for (const { key, value } of store.getRange({})) {
      if (!isLive(value, at)) expired.push(key);
    }
    for (const key of expired) await store.remove(key);
    return expired.length;
  }

  function maybePrune() {
    if (now() - lastPrune < PRUNE_INTERVAL_MS) return;
    void prune().catch(() => {
      /* A failed sweep only delays cleanup; the reads still honour expiry. */
    });
  }

  return {
    async get(key) {
      const store = database();
      const entry = store.get(key);
      if (!entry) return null;
      if (!isLive(entry, now())) {
        await store.remove(key);
        return null;
      }
      return entry.v;
    },

    async set(key, value, ttl) {
      const at = now();
      await database().put(key, { v: value, e: expiryFor(ttl, at) });
      maybePrune();
    },

    async delete(key) {
      await database().remove(key);
    },

    async getAndDelete(key) {
      const store = database();
      const at = now();
      const entry = store.transactionSync(() => {
        const found = store.get(key);
        if (found) store.removeSync(key);
        return found;
      });
      return isLive(entry, at) ? entry.v : null;
    },

    async increment(key, ttl) {
      const store = database();
      const at = now();
      const count = store.transactionSync(() => {
        const found = store.get(key);
        if (!isLive(found, at) || typeof found.v !== "number") {
          store.putSync(key, { v: 1, e: expiryFor(ttl, at) });
          return 1;
        }
        const next = found.v + 1;
        /* The TTL is set on creation only: a fixed window. */
        store.putSync(key, { v: next, e: found.e });
        return next;
      });
      maybePrune();
      return count;
    },

    async sweepUserSessions(userId) {
      const store = database();
      const doomed: string[] = [];
      for (const { key, value } of store.getRange({})) {
        if (typeof value?.v !== "string" || !value.v.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(value.v) as {
            session?: { userId?: unknown };
          };
          if (parsed?.session?.userId === userId) doomed.push(key);
        } catch {
          /* Not a session row. */
        }
      }
      doomed.push(`active-sessions-${userId}`);
      for (const key of doomed) await store.remove(key);
      return doomed.length - 1;
    },

    prune,
  };
}
