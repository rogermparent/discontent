// @vitest-environment node
//
// The engine's cross-process write lock (epic 34, D6):
// `packages/cms/git/writeLock.ts`. Scratch repositories only; the
// cross-process behaviour under real load is `concurrentWrites.test.ts`'s.

import { spawnSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import { hostname } from "node:os";
import { execa } from "execa";
import {
  mkdirp,
  mkdtemp,
  pathExists,
  readdir,
  readFile,
  readJson,
  rm,
  stat,
  utimes,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  currentWriteId,
  RepositoryBusyError,
  serialInHold,
  withWriteLock,
  writeLockPath,
  writeLockStillHeld,
  type WriteLockHolder,
} from "@discontent/cms/git/writeLock";

const EDITOR_DIR = resolve(__dirname, "../websites/recipe-website/editor");
const HOLDER = resolve(__dirname, "support/lockHolder.ts");

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

  it("keeps call order under load: 20 writers, several rounds (35q)", async () => {
    /*
     * #223's CI saw a, b, d, c: callers once enqueued in the order their
     * lookups (`access`, the git directory) resolved, not in call order.
     */
    for (let round = 0; round < 5; round += 1) {
      const order: number[] = [];
      let active = 0;
      const names = Array.from({ length: 20 }, (_, i) => i);
      await Promise.all(
        names.map((i) =>
          withWriteLock(dir, `w${i}`, async () => {
            active += 1;
            expect(active).toBe(1);
            order.push(i);
            /* A nested write still re-enters rather than queueing. */
            await withWriteLock(dir, `w${i} nested`, async () => undefined);
            await sleep(1);
            active -= 1;
          }),
        ),
      );
      expect(order).toEqual(names);
    }
  });

  it("keeps call order across a fresh directory spelling and a non-repo (35q)", async () => {
    const plain = await mkdtemp(join(tmpdir(), "write-lock-plain-"));
    try {
      const order: string[] = [];
      const writer = (directory: string, name: string) =>
        withWriteLock(directory, name, async () => {
          order.push(name);
          await sleep(5);
        });
      await Promise.all([
        writer(dir, "a"),
        writer(`${dir}/`, "b"),
        writer(plain, "outside"),
        writer(dir, "c"),
      ]);
      /* The non-repo runs at once; the repo's writers keep their order. */
      expect(order.filter((name) => name !== "outside")).toEqual([
        "a",
        "b",
        "c",
      ]);
    } finally {
      await rm(plain, { recursive: true, force: true });
    }
  });

  it("takes over a lock whose holder on this host and pid namespace is dead", async () => {
    await plant({ pid: deadPid(), host: hostname(), pidns: ownNs() });
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
    const old = new Date(Date.now() - 120_000);
    await utimes(leftover, old, old);
    await utimes(`${leftover}.lock`, old, old);
    /* A young one is a live waiter's (or an outside-the-lock status's). */
    const young = join(
      gitDir,
      "discontent-write.lock.01HYYYYYYYYYYYYYYYYYYYYYYY.new",
    );
    await writeFile(young, "{}");
    await withWriteLock(dir, "sweeper", async () => undefined);
    expect(await pathExists(leftover)).toBe(false);
    expect(await pathExists(`${leftover}.lock`)).toBe(false);
    expect(await pathExists(young)).toBe(true);
    expect(await readFile(pending, "utf8")).toBe("keep me\0");
  });

  it("records the pid namespace and a nonce, and leaves no temp file", async () => {
    await withWriteLock(dir, "recorded", async () => {
      const holder = await readJson(lockFile);
      expect(holder.pidns).toBe(ownNs());
      expect(holder.nonce).toMatch(/^[0-9A-Z]{26}$/);
    });
    const names = await readdir(await realGitDir());
    expect(names.filter((name) => name.startsWith("discontent-write"))).toEqual(
      [],
    );
  });

  it("does not judge a same-host pid from another pid namespace (Docker on the Pi)", async () => {
    await plant({ pid: deadPid(), host: hostname(), pidns: "pid:[1]" });
    const error = await withWriteLock(dir, "x", async () => 1, {
      timeoutMs: 200,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(RepositoryBusyError);
  });

  it("takes over its own pid written by another process (a reused pid)", async () => {
    await plant({
      pid: process.pid,
      host: hostname(),
      pidns: ownNs(),
      nonce: "01AAAAAAAAAAAAAAAAAAAAAAAA",
    });
    const started = Date.now();
    await withWriteLock(dir, "reused", async () => {
      expect((await readJson(lockFile)).op).toBe("reused");
    });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("knows whether it still holds the lock", async () => {
    await withWriteLock(dir, "mine", async () => {
      expect(await writeLockStillHeld(dir)).toBe(true);
      await plant({ host: "uraninite", op: "usurper" });
      expect(await writeLockStillHeld(dir)).toBe(false);
    });
    expect(await writeLockStillHeld(dir)).toBe(false);
  });

  it("serialises work inside one hold", async () => {
    const events: string[] = [];
    const step = (name: string) =>
      serialInHold(async () => {
        events.push(`${name}+`);
        await sleep(20);
        events.push(`${name}-`);
      });
    await withWriteLock(dir, "batch", async () => {
      await Promise.all([step("a"), step("b"), step("c")]);
    });
    expect(events).toEqual(["a+", "a-", "b+", "b-", "c+", "c-"]);
  });

  it("sweeps untracked atomic-write temp files older than the stale age", async () => {
    const item = join(dir, "recipes/data/naan");
    await mkdirp(item);
    const old = join(item, ".recipe.json.01HZZZZZZZZZZZZZZZZZZZZZZZ.1.tmp");
    const fresh = join(item, ".recipe.json.01HZZZZZZZZZZZZZZZZZZZZZZZ.2.tmp");
    const other = join(item, ".notes.tmp");
    for (const file of [old, fresh, other]) await writeFile(file, "x");
    const then = new Date(Date.now() - 120_000);
    await utimes(old, then, then);
    await utimes(other, then, then);
    await withWriteLock(dir, "sweeper", async () => undefined);
    expect(await pathExists(old)).toBe(false);
    expect(await pathExists(fresh)).toBe(true);
    /* Not one of ours. */
    expect(await pathExists(other)).toBe(true);
  });

  it("lets exactly one of several processes take over a stale lock at a time", async () => {
    await plant({ pid: deadPid(), host: hostname(), pidns: ownNs() });
    const log = join(dir, "holds.log");
    const runs = await Promise.all(
      ["a", "b", "c"].map((name) =>
        execa("pnpm", ["exec", "tsx", HOLDER, dir, name, "150", log], {
          cwd: EDITOR_DIR,
          reject: false,
        }),
      ),
    );
    for (const run of runs) {
      expect(run.exitCode, run.stderr).toBe(0);
    }
    const lines = (await readFile(log, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(6);
    /* enter/exit strictly alternate: no two holds overlapped. */
    for (let i = 0; i < lines.length; i += 2) {
      const [enter, who] = lines[i].split(" ");
      const [exit, same] = lines[i + 1].split(" ");
      expect([enter, exit]).toEqual(["enter", "exit"]);
      expect(same).toBe(who);
    }
    expect(await pathExists(lockFile)).toBe(false);
  }, 60_000);
});

function ownNs(): string | null {
  try {
    return readlinkSync("/proc/self/ns/pid");
  } catch {
    return null;
  }
}

async function realGitDir(): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  return realpath(join(dir, ".git"));
}
