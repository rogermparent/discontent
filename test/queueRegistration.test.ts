// @vitest-environment node
//
// Epic 37, 37b review: a slot lock or waiter file this process has just
// created is registered as its own *before* the file exists, and dropped
// only *after* the file is gone. Otherwise a look from this same process —
// another waiter's poll, a snapshot — landing in between sees a record with
// this process's pid and nonce but no registration, judges it a previous
// process's and takes it over: a double grant, or a waiter deleted.
//
// The window is a few microseconds, so these tests open it on purpose:
// `node:fs/promises` is wrapped (`vi.mock`) and a test hook runs a competing
// look at the exact filesystem step — after `tryCreateLock`'s `link` (its
// temp file's removal), after a waiter file's `rename` into place, and at
// the slot lock's removal on release.

import path from "node:path";
import { mkdtemp, rm as realRm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsHooks = vi.hoisted(() => ({
  /** Runs once, before `rm` of a path it matches. */
  beforeRm: undefined as
    { match: RegExp; run: (target: string) => Promise<void> } | undefined,
  /** Runs once, after `rename` to a path it matches. */
  afterRename: undefined as
    { match: RegExp; run: (target: string) => Promise<void> } | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const rm: typeof actual.rm = async (target, options) => {
    const hook = fsHooks.beforeRm;
    if (hook && hook.match.test(String(target))) {
      fsHooks.beforeRm = undefined;
      await hook.run(String(target));
    }
    return actual.rm(target, options);
  };
  const rename: typeof actual.rename = async (from, to) => {
    await actual.rename(from, to);
    const hook = fsHooks.afterRename;
    if (hook && hook.match.test(String(to))) {
      fsHooks.afterRename = undefined;
      await hook.run(String(to));
    }
  };
  return { ...actual, default: { ...actual, rm, rename }, rm, rename };
});

import { lockHeldBy } from "@discontent/cms/git/fileLock";
import {
  acquire,
  currentHolder,
  liveWaiters,
  queueSnapshot,
  resourceDirectory,
  slotLockPath,
  SLOT_ID_KEY,
} from "../websites/recipe-website/editor/controller/jobs/queue";
import {
  maybeReleaseGpu,
  readHookState,
} from "../websites/recipe-website/editor/controller/jobs/gpuHooks";
import { withResource } from "../websites/recipe-website/editor/controller/jobs/queue";

let dir: string;
let queue: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "queue-registration-"));
  queue = join(dir, "queue");
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("RECIPE_QUEUE_DIR", queue);
  vi.stubEnv("RECIPE_QUEUE_POLL_MS", "10");
  vi.stubEnv("RECIPE_GPU_ACQUIRE_CMD", "");
  vi.stubEnv("RECIPE_GPU_RELEASE_CMD", "");
});

afterEach(async () => {
  fsHooks.beforeRm = undefined;
  fsHooks.afterRename = undefined;
  vi.unstubAllEnvs();
  await realRm(dir, { recursive: true, force: true });
});

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("this process's own fresh records (37b review)", () => {
  it("never takes over a slot lock it has just created: a poll between the link and the grant", async () => {
    const gpuDir = resourceDirectory("gpu", queue);
    const lockPath = slotLockPath(gpuDir);
    const seen: { holder?: string; snapshot?: string } = {};
    /* `tryCreateLock` removes its temp file after the `link`: the lock exists. */
    fsHooks.beforeRm = {
      match: new RegExp(`^${escape(lockPath)}\\..+\\.new$`),
      run: async () => {
        seen.holder = (await currentHolder(gpuDir))?.owner?.holderId;
        seen.snapshot = (await queueSnapshot("gpu", queue)).holder?.holderId;
      },
    };
    const grant = await acquire("gpu", { dir: queue });
    try {
      expect(seen.holder).toBeDefined();
      expect(seen.snapshot).toBe(seen.holder);
      /* Still ours: the look neither moved it aside nor deleted it. */
      expect(await lockHeldBy(lockPath, SLOT_ID_KEY, seen.holder!)).toBe(true);
    } finally {
      await grant.release();
    }
  });

  it("never deletes a waiter file it has just written: a poll between the rename and the registration", async () => {
    const gpuDir = resourceDirectory("gpu", queue);
    const waiters = path.join(gpuDir, "waiters");
    let written: string | undefined;
    let live: string[] | undefined;
    fsHooks.afterRename = {
      match: new RegExp(`^${escape(waiters)}/[0-9A-Z]+\\.json$`),
      run: async (target) => {
        written = path.basename(target, ".json");
        live = (await liveWaiters(gpuDir)).map((entry) => entry.waiterId);
      },
    };
    const grant = await acquire("gpu", { dir: queue });
    await grant.release();
    expect(written).toBeDefined();
    expect(live).toEqual([written]);
    /* Queued, not waved through as an unwritable queue dir. */
    expect(grant.passThrough).toBe(false);
  });

  it("holds the release hook's slot as its own until the lock is gone", async () => {
    const file = join(dir, "hooks.log");
    vi.stubEnv("RECIPE_GPU_RELEASE_CMD", `echo release >> "${file}"`);
    vi.stubEnv("RECIPE_GPU_IDLE_MS", "60000");
    await withResource("gpu", { dir: queue }, async () => undefined);
    expect((await readHookState(queue)).active).toBe(true);

    const gpuDir = resourceDirectory("gpu", queue);
    const lockPath = slotLockPath(gpuDir);
    const looks: (string | undefined)[] = [];
    const look = async () => {
      looks.push((await currentHolder(gpuDir))?.owner?.purpose);
    };
    /* Just after the release hook's lock is created … */
    fsHooks.beforeRm = {
      match: new RegExp(`^${escape(lockPath)}\\..+\\.new$`),
      run: async () => {
        await look();
        /* … and just before it is removed. */
        fsHooks.beforeRm = {
          match: new RegExp(`^${escape(lockPath)}$`),
          run: look,
        };
      },
    };
    expect(await maybeReleaseGpu(queue, { force: true })).toBe(true);
    expect(looks).toEqual(["release hook", "release hook"]);
    expect(await currentHolder(gpuDir)).toBeNull();
  });
});
