// @vitest-environment node
//
// The `link()` lock primitive under the write lock (34-D6), extracted for
// epic 37's queue slots (`packages/cms/git/fileLock.ts`). The write lock's
// own behaviour stays covered by `writeLock.test.ts`.

import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "fs/promises";
import { hostname, tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LockTimeoutError,
  PROCESS_NONCE,
  acquireLock,
  isLockStale,
  lockHeldBy,
  ownPidNamespace,
  processGone,
  processIdentity,
  readLockFile,
  releaseLock,
  startLockHeartbeat,
  tryCreateLock,
} from "@discontent/cms/git/fileLock";

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "file-lock-"));
  path = join(dir, "slot.lock");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pid that is certainly dead: a child that has already exited and been reaped. */
function deadPid(): number {
  const child = spawnSync("sh", ["-c", "echo $$"]);
  return Number(String(child.stdout).trim());
}

function owner(id: string, extra: Record<string, unknown> = {}) {
  return { id, ...processIdentity(), startedAt: Date.now(), ...extra };
}

describe("fileLock", () => {
  it("creates the lock whole, refuses a second, and leaves no temp file", async () => {
    expect(await tryCreateLock(path, owner("a"), "a")).toBe(true);
    expect(await tryCreateLock(path, owner("b"), "b")).toBe(false);
    const state = await readLockFile(path, "id");
    expect(state?.owner).toMatchObject({
      id: "a",
      pid: process.pid,
      host: hostname(),
      nonce: PROCESS_NONCE,
    });
    expect(await readdir(dir)).toEqual(["slot.lock"]);
  });

  it("releases only while the file holds the owner's id", async () => {
    await acquireLock(path, owner("a"), {
      idKey: "id",
      deadline: Date.now() + 1000,
      staleMs: 60_000,
    });
    await releaseLock(path, "id", "b");
    expect(await lockHeldBy(path, "id", "a")).toBe(true);
    await releaseLock(path, "id", "a");
    expect(await readLockFile(path, "id")).toBeNull();
  });

  it("waits for a live holder, then takes the lock once it is released", async () => {
    await acquireLock(path, owner("a"), {
      idKey: "id",
      deadline: Date.now() + 1000,
      staleMs: 60_000,
    });
    const second = acquireLock(path, owner("b"), {
      idKey: "id",
      deadline: Date.now() + 5000,
      staleMs: 60_000,
      ownHold: () => true,
    });
    await sleep(100);
    expect(await lockHeldBy(path, "id", "a")).toBe(true);
    await releaseLock(path, "id", "a");
    await expect(second).resolves.toEqual({ tookOver: false });
    expect(await lockHeldBy(path, "id", "b")).toBe(true);
  });

  it("gives up at the deadline with the holder's state", async () => {
    await acquireLock(path, owner("a", { op: "holding" }), {
      idKey: "id",
      deadline: Date.now() + 1000,
      staleMs: 60_000,
    });
    const error = await acquireLock(path, owner("b"), {
      idKey: "id",
      deadline: Date.now() + 150,
      staleMs: 60_000,
      ownHold: () => true,
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(LockTimeoutError);
    expect((error as LockTimeoutError).state?.owner).toMatchObject({
      id: "a",
      op: "holding",
    });
  });

  it("takes over a lock whose holder is dead on this host", async () => {
    await writeFile(
      path,
      JSON.stringify({
        id: "dead",
        pid: deadPid(),
        host: hostname(),
        pidns: ownPidNamespace(),
      }),
    );
    const result = await acquireLock(path, owner("b"), {
      idKey: "id",
      deadline: Date.now() + 1000,
      staleMs: 60_000,
    });
    expect(result.tookOver).toBe(true);
    expect(await lockHeldBy(path, "id", "b")).toBe(true);
    /* The stale file was moved aside and removed. */
    expect(await readdir(dir)).toEqual(["slot.lock"]);
  });

  it("judges another host or pid namespace by mtime alone", async () => {
    const elsewhere = {
      id: "x",
      pid: deadPid(),
      host: "elsewhere",
      pidns: ownPidNamespace(),
    };
    expect(processGone(elsewhere)).toBeUndefined();
    expect(
      processGone({ ...elsewhere, host: hostname(), pidns: "pid:[1]" }),
    ).toBeUndefined();
    await writeFile(path, JSON.stringify(elsewhere));
    const fresh = (await readLockFile(path, "id"))!;
    expect(isLockStale(fresh, { staleMs: 60_000 })).toBe(false);
    const then = new Date(Date.now() - 120_000);
    await utimes(path, then, then);
    const old = (await readLockFile(path, "id"))!;
    expect(isLockStale(old, { staleMs: 60_000 })).toBe(true);
  });

  it("reads this process's pid with another nonce as a previous process's", () => {
    const self = processIdentity();
    expect(processGone(self)).toBe(false);
    expect(processGone({ ...self, nonce: "someone-else" })).toBe(true);
    expect(processGone(self, () => false)).toBe(true);
    expect(processGone(self, () => true)).toBe(false);
  });

  it("keeps one nonce per process, however many copies of the module load", async () => {
    vi.resetModules();
    const again = await import("@discontent/cms/git/fileLock");
    /* A second copy of the module, as a second Next bundle would hold. */
    expect(again.processIdentity).not.toBe(processIdentity);
    expect(again.PROCESS_NONCE).toBe(PROCESS_NONCE);
    expect(again.processIdentity().nonce).toBe(PROCESS_NONCE);
    /* So another copy judges this copy's records as this live process's. */
    expect(again.processGone(processIdentity())).toBe(false);
  });

  it("judges a file that is not a record by its mtime", async () => {
    await writeFile(path, "not json");
    const state = (await readLockFile(path, "id"))!;
    expect(state.owner).toBeNull();
    expect(isLockStale(state, { staleMs: 60_000 })).toBe(false);
  });

  it("heartbeats the mtime while the file holds the id, and stops", async () => {
    await tryCreateLock(path, owner("a"), "a");
    const then = new Date(Date.now() - 30_000);
    await utimes(path, then, then);
    const stop = startLockHeartbeat(path, "id", "a", 20);
    /* Polled, not slept: a loaded machine may be slow to fire the timer. */
    await vi.waitFor(
      async () => {
        expect(Date.now() - (await stat(path)).mtimeMs).toBeLessThan(5_000);
      },
      { timeout: 10_000, interval: 25 },
    );
    stop();
    /* A heartbeat for another id never touches it. */
    await utimes(path, then, then);
    const other = startLockHeartbeat(path, "id", "b", 20);
    await sleep(200);
    other();
    expect(Date.now() - (await stat(path)).mtimeMs).toBeGreaterThan(20_000);
    expect(JSON.parse(await readFile(path, "utf8")).id).toBe("a");
  });

  it("says once when a beat finds the lock taken from it, and never after it stopped", async () => {
    await tryCreateLock(path, owner("a"), "a");
    const lost: (string | undefined)[] = [];
    const stop = startLockHeartbeat(path, "id", "a", 20, {
      onLost: (state) => lost.push((state?.owner as { id?: string })?.id),
    });
    await sleep(60);
    expect(lost).toEqual([]);
    /*
     * Taken over while this holder was suspended: another id holds it now.
     * Swapped in with one rename (37c): `rm` then create left a gap in which
     * a beat under load read no lock at all, and reported that loss first.
     */
    await tryCreateLock(`${path}.b`, owner("b"), "b");
    await rename(`${path}.b`, path);
    await vi.waitFor(() => expect(lost).toEqual(["b"]), {
      timeout: 10_000,
      interval: 20,
    });
    await sleep(100);
    expect(lost).toEqual(["b"]);
    stop();
    /* A holder that let go and stopped its beat: no loss reported. */
    await rm(path);
    await tryCreateLock(path, owner("c"), "c");
    const quiet: unknown[] = [];
    const stopC = startLockHeartbeat(path, "id", "c", 20, {
      onLost: (state) => quiet.push(state),
    });
    stopC();
    await rm(path);
    await sleep(100);
    expect(quiet).toEqual([]);
  }, 20_000);

  it("refuses a lock without an id", async () => {
    await expect(tryCreateLock(path, owner(""), "")).rejects.toThrow(
      /non-empty string/,
    );
    await expect(
      acquireLock(path, owner("a"), {
        idKey: "missing",
        deadline: Date.now() + 1_000,
        staleMs: 60_000,
      }),
    ).rejects.toThrow(/missing must be a non-empty string/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("stops waiting when the signal aborts", async () => {
    await tryCreateLock(path, owner("a"), "a");
    const controller = new AbortController();
    const waiting = acquireLock(path, owner("b"), {
      idKey: "id",
      deadline: Date.now() + 10_000,
      staleMs: 60_000,
      ownHold: () => true,
      signal: controller.signal,
    });
    await sleep(50);
    controller.abort(new Error("cancelled"));
    await expect(waiting).rejects.toThrow("cancelled");
  });
});
