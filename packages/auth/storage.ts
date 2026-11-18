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
  /**
   * Every live session of `userId` (48d, Account & devices), read the way
   * the sweep finds them — every row, not only the session list — so a
   * session missing from the list (the 1.7.13 behaviour De7 works around)
   * still shows and can still be ended. The token stays in here: it is the
   * session's secret, and the page gets only `id`.
   */
  listUserSessions(userId: string): Promise<StoredSession[]>;
  /**
   * End one session of `userId` by its id: its row goes, and its entry in
   * the session list. Answers whether one went. A session of another user
   * with that id is left alone.
   */
  revokeUserSession(userId: string, sessionId: string): Promise<boolean>;
  /** Remove every expired row now (normally done at most once a minute). */
  prune(): Promise<number>;
  /**
   * `increment`, also answering when the window ends (epoch ms): the
   * per-account and overall sign-in limits (De5) say how long to wait.
   */
  hit(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; resetAt: number | null }>;
}

/** A session row as Account & devices reads it — never its token. */
export interface StoredSession {
  id: string;
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  userAgent: string | null;
  ipAddress: string | null;
}

interface SessionValue {
  session?: {
    id?: unknown;
    userId?: unknown;
    token?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    expiresAt?: unknown;
    userAgent?: unknown;
    ipAddress?: unknown;
  };
}

function epoch(value: unknown): number {
  const time =
    typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** A session row's parsed value, or `undefined` for every other row. */
function sessionOf(value: Entry | undefined): SessionValue["session"] {
  if (typeof value?.v !== "string" || !value.v.startsWith("{")) return;
  try {
    const parsed = JSON.parse(value.v) as SessionValue;
    return parsed?.session && typeof parsed.session === "object"
      ? parsed.session
      : undefined;
  } catch {
    return undefined;
  }
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

  async function hit(key: string, ttl: number | undefined) {
    const store = database();
    const at = now();
    const result = store.transactionSync(() => {
      const found = store.get(key);
      if (!isLive(found, at) || typeof found.v !== "number") {
        const fresh = { v: 1, e: expiryFor(ttl, at) };
        store.putSync(key, fresh);
        return { count: 1, resetAt: fresh.e };
      }
      const next = found.v + 1;
      /* The TTL is set on creation only: a fixed window. */
      store.putSync(key, { v: next, e: found.e });
      return { count: next, resetAt: found.e };
    });
    maybePrune();
    return result;
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
      return (await hit(key, ttl)).count;
    },

    hit,

    async sweepUserSessions(userId) {
      const store = database();
      const doomed: string[] = [];
      for (const { key, value } of store.getRange({})) {
        if (sessionOf(value)?.userId === userId) doomed.push(key);
      }
      doomed.push(`active-sessions-${userId}`);
      for (const key of doomed) await store.remove(key);
      return doomed.length - 1;
    },

    async listUserSessions(userId) {
      const store = database();
      const at = now();
      const found: StoredSession[] = [];
      for (const { value } of store.getRange({})) {
        if (!isLive(value, at)) continue;
        const session = sessionOf(value);
        if (!session || session.userId !== userId) continue;
        const id = text(session.id);
        const expiresAt = epoch(session.expiresAt);
        if (!id || expiresAt <= at) continue;
        found.push({
          id,
          createdAt: epoch(session.createdAt),
          updatedAt: epoch(session.updatedAt),
          expiresAt,
          userAgent: text(session.userAgent),
          ipAddress: text(session.ipAddress),
        });
      }
      return found;
    },

    async revokeUserSession(userId, sessionId) {
      const store = database();
      let token: string | undefined;
      for (const { key, value } of store.getRange({})) {
        const session = sessionOf(value);
        if (session?.userId === userId && session.id === sessionId) {
          token = key;
          break;
        }
      }
      if (!token) return false;
      const doomed = token;
      store.transactionSync(() => {
        store.removeSync(doomed);
        const listKey = `active-sessions-${userId}`;
        const list = store.get(listKey);
        if (typeof list?.v !== "string") return;
        try {
          const entries = JSON.parse(list.v) as { token?: unknown }[];
          const kept = Array.isArray(entries)
            ? entries.filter((entry) => entry?.token !== doomed)
            : [];
          if (kept.length === 0) store.removeSync(listKey);
          else store.putSync(listKey, { v: JSON.stringify(kept), e: list.e });
        } catch {
          /* A list we can't read is Better Auth's to rewrite; the row is gone. */
        }
      });
      return true;
    },

    prune,
  };
}
