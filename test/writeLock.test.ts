// @vitest-environment node
//
// The engine's cross-process write lock (epic 34, D6):
// `packages/cms/git/writeLock.ts`. Scratch repositories only; the
// cross-process behaviour under real load is `concurrentWrites.test.ts`'s.

import { spawnSync } from "node:child_process";
import { hostname } from "node:os";
import {
  mkdtemp,
  pathExists,
  readFile,
  readJson,
  rm,
  stat,
  utimes,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentWriteId,
  RepositoryBusyError,
  withWriteLock,
  writeLockPath,
  type WriteLockHolder,
} from "@discontent/cms/git/writeLock";

let dir: string;
let lockFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "write-lock-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  lockFile = await writeLockPath(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pid that is certainly dead: a child that has already exited. */
function deadPid(): number {
  const child = spawnSync("sh", ["-c", "echo $$"]);
  return Number(String(child.stdout).trim());
}

async function plant(holder: Partial<WriteLockHolder>, ageMs = 0) {
  const full: WriteLockHolder = {
    writeId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
    pid: process.pid,
    host: "elsewhere",
    op: "planted write",
    startedAt: Date.now() - ageMs,
    ...holder,
  };
  await writeFile(lockFile, JSON.stringify(full));
  if (ageMs) {
    const then = new Date(Date.now() - ageMs);
    await utimes(lockFile, then, then);
  }
  return full;
}

describe("withWriteLock", () => {
  it("lives in the git directory, holds the holder, and is gone after", async () => {
    expect(lockFile).toBe(join(await realGitDir(), "discontent-write.lock"));
    let inside: WriteLockHolder | undefined;
    const value = await withWriteLock(dir, "create note/a", async () => {
      inside = await readJson(lockFile);
      return 42;
    });
    expect(value).toBe(42);
    expect(inside).toMatchObject({
      pid: process.pid,
      host: hostname(),
      op: "create note/a",
    });
    expect(inside!.writeId).toMatch(/^[0-9A-Z]{26}$/);
    expect(await pathExists(lockFile)).toBe(false);
  });

  it("releases on a throw", async () => {
    await expect(
      withWriteLock(dir, "boom", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await pathExists(lockFile)).toBe(false);
  });

  it("just runs outside a repository", async () => {
    const plain = await mkdtemp(join(tmpdir(), "write-lock-plain-"));
    try {
      expect(
        await withWriteLock(plain, "x", async () => currentWriteId()),
      ).toBe(undefined);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });

  it("is re-entrant in one async context, under one write id", async () => {
    const ids: (string | undefined)[] = [];
    await withWriteLock(dir, "outer", async () => {
      ids.push(currentWriteId());
      await withWriteLock(dir, "inner", async () => {
        ids.push(currentWriteId());
        expect((await readJson(lockFile)).op).toBe("outer");
      });
      /* Still held after the inner scope returns. */
      expect(await pathExists(lockFile)).toBe(true);
    });
    expect(ids[0]).toBeDefined();
    expect(ids[1]).toBe(ids[0]);
    expect(currentWriteId()).toBeUndefined();
  });

  it("queues same-process writers first come, first served, one at a time", async () => {
    const events: string[] = [];
    let active = 0;
    const writer = (name: string) =>
      withWriteLock(dir, name, async () => {
        active += 1;
        expect(active).toBe(1);
        events.push(`${name}+`);
        await sleep(20);
        events.push(`${name}-`);
        active -= 1;
      });
    await Promise.all(["a", "b", "c", "d"].map(writer));
    expect(events).toEqual(["a+", "a-", "b+", "b-", "c+", "c-", "d+", "d-"]);
  });

  it("takes over a lock whose holder on this host is dead", async () => {
    await plant({ pid: deadPid(), host: hostname() });
    const started = Date.now();
    await withWriteLock(dir, "takeover", async () => {
      expect((await readJson(lockFile)).op).toBe("takeover");
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("takes over a lock whose heartbeat stopped (older than staleMs)", async () => {
    /* A live pid on another host — only its age can say it is stale. */
    await plant({ host: "uraninite" }, 120_000);
    await withWriteLock(dir, "takeover", async () => {
      expect((await readJson(lockFile)).op).toBe("takeover");
    });
  });

  it("waits for a live holder, then throws RepositoryBusyError naming it", async () => {
    await plant({ host: "uraninite", pid: 4242, op: "term merge" }, 5_000);
    const started = Date.now();
    const error = await withWriteLock(dir, "waiting", async () => "ran", {
      timeoutMs: 300,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(RepositoryBusyError);
    expect(error.holder).toMatchObject({ op: "term merge", pid: 4242 });
    expect(error.message).toMatch(/"term merge" \(pid 4242 on uraninite, \d/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(280);
    /* The holder's lock is untouched. */
    expect((await readJson(lockFile)).op).toBe("term merge");
  });

  it("reads its timeout from DISCONTENT_WRITE_LOCK_TIMEOUT_MS", async () => {
    await plant({ host: "uraninite" });
    const previous = process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS;
    process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS = "150";
    try {
      const started = Date.now();
      await expect(withWriteLock(dir, "x", async () => 1)).rejects.toThrow(
        RepositoryBusyError,
      );
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      if (previous === undefined)
        delete process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS;
      else process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS = previous;
    }
  });

  it("gets the lock once a live holder lets go", async () => {
    const holder = await plant({ host: "uraninite" });
    setTimeout(() => void rm(lockFile, { force: true }), 150);
    const ran = await withWriteLock(dir, "patient", async () => {
      expect((await readJson(lockFile)).writeId).not.toBe(holder.writeId);
      return true;
    });
    expect(ran).toBe(true);
  });

  it("times out a same-process waiter queued behind a long write", async () => {
    let release!: () => void;
    const long = withWriteLock(
      dir,
      "long write",
      () => new Promise<void>((r) => (release = r)),
    );
    await sleep(20);
    const error = await withWriteLock(dir, "queued", async () => 1, {
      timeoutMs: 100,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(RepositoryBusyError);
    expect(error.message).toContain('"long write"');
    release();
    await long;
    /* The queue keeps moving after a waiter gave up. */
    expect(await withWriteLock(dir, "after", async () => 2)).toBe(2);
  });

  it("keeps the mtime fresh with a heartbeat", async () => {
    await withWriteLock(
      dir,
      "slow",
      async () => {
        const old = new Date(Date.now() - 50_000);
        await utimes(lockFile, old, old);
        await sleep(200);
        const age = Date.now() - (await stat(lockFile)).mtimeMs;
        expect(age).toBeLessThan(5_000);
      },
      { heartbeatMs: 40 },
    );
  });

  it("releases only its own lock", async () => {
    await withWriteLock(dir, "mine", async () => {
      /* Somebody judged it stale and took it over mid-write. */
      await plant({ host: "uraninite", op: "usurper" });
    });
    expect((await readJson(lockFile)).op).toBe("usurper");
  });

  it("sweeps private indexes a dead writer left behind", async () => {
    const gitDir = await realGitDir();
    const leftover = join(
      gitDir,
      "discontent-index-01HZZZZZZZZZZZZZZZZZZZZZZZ",
    );
    const pending = join(gitDir, "discontent-index-pending");
    await writeFile(leftover, "x");
    await writeFile(`${leftover}.lock`, "x");
    await writeFile(pending, "keep me\0");
    await withWriteLock(dir, "sweeper", async () => undefined);
    expect(await pathExists(leftover)).toBe(false);
    expect(await pathExists(`${leftover}.lock`)).toBe(false);
    expect(await readFile(pending, "utf8")).toBe("keep me\0");
  });
});

async function realGitDir(): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(join(dir, ".git"));
}
