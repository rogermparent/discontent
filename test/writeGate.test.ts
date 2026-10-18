// @vitest-environment node
//
// 41b, 40-Tf5: the write gate (`packages/cms/fs/writeGate.ts`) and the
// Playwright reset built on it. The harness's `resetData` holds the server's
// writes (`/settings/test-hold-writes`), removes `test-content`, copies the
// fixture over it, and releases (`/settings/test-invalidate-cache`). These
// tests run that sequence against a write still in flight — the previous
// test's late aggregate — and show the reset waits for it rather than racing
// it, and that a write arriving while the hold is in force is refused rather
// than deferred into the next test's fixture. Scratch directories only.

import { spawnSync } from "node:child_process";
import {
  copy,
  mkdtemp,
  outputFile,
  pathExists,
  readdir,
  readFile,
  rm,
} from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContentWritesHeldError,
  contentWritesInFlight,
  holdContentWrites,
  pauseContentWrites,
  releaseContentWrites,
  trackContentWrite,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";
import { outsideWriteLock, withWriteLock } from "@discontent/cms/git/writeLock";

import { GET as holdWritesRoute } from "../websites/recipe-website/editor/src/app/(editor)/(settings)/settings/test-hold-writes/route";
import { GET as invalidateCacheRoute } from "../websites/recipe-website/editor/src/app/(editor)/(settings)/settings/test-invalidate-cache/route";

let root: string;
let content: string;
let fixture: string;
/** Holds a test took, released in `afterEach` should the test not have. */
let holds: string[];
/** Pauses a test took, reopened in `afterEach` likewise. */
let pauses: (() => void)[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "write-gate-"));
  content = join(root, "test-content");
  fixture = join(root, "fixture");
  await outputFile(join(fixture, "notes", "data", "a", "note.json"), "{}");
  await copy(fixture, content);
  holds = [];
  pauses = [];
});

afterEach(async () => {
  delete process.env.TEST_MODE;
  delete process.env.CONTENT_DIRECTORY;
  for (const id of holds) releaseContentWrites(content, id);
  for (const resume of pauses) resume();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hold(options?: Parameters<typeof holdContentWrites>[1]) {
  const id = await holdContentWrites(content, options);
  holds.push(id);
  return id;
}

async function pause(options?: Parameters<typeof pauseContentWrites>[1]) {
  const resume = await pauseContentWrites(content, options);
  pauses.push(resume);
  return resume;
}

/** The recipe editor's two test routes, as the Playwright fixture calls them. */
function invalidateCache(holdId?: string) {
  const query = holdId ? `?hold=${encodeURIComponent(holdId)}` : "";
  return invalidateCacheRoute(
    new Request(`http://localhost/settings/test-invalidate-cache${query}`),
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Every file under `dir`, relative, sorted. */
async function files(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      out.push(...(await files(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

/**
 * A write like the one 40f's CI caught: it lands derived files under
 * `recipes/aggregates/tags` in two steps, the second after `release`.
 */
function lateAggregateWrite(release: Promise<void>) {
  const started = deferred();
  const done = withWriteLock(content, "update recipes/a", async () => {
    await outputFile(
      join(content, "recipes", "aggregates", "tags", "one"),
      "1",
    );
    started.resolve();
    await release;
    await outputFile(
      join(content, "recipes", "aggregates", "tags", "two"),
      "2",
    );
  });
  return { started: started.promise, done };
}

/** `tasks.resetData`'s content half: remove, then copy the fixture. */
async function replaceContent() {
  await rm(content, { recursive: true, force: true });
  await copy(fixture, content);
}

describe("write gate", () => {
  it("control: a reset that does not hold writes lets a late write into the next corpus", async () => {
    const release = deferred();
    const write = lateAggregateWrite(release.promise);
    await write.started;

    await replaceContent();
    release.resolve();
    await write.done;

    // The fixture has no aggregates; the previous test's write leaked one in.
    expect(await files(content)).toEqual([
      "notes/data/a/note.json",
      "recipes/aggregates/tags/two",
    ]);
  });

  it("the reset route waits for a write in flight, and the fixture goes in intact", async () => {
    process.env.TEST_MODE = "true";
    process.env.CONTENT_DIRECTORY = content;

    const release = deferred();
    const write = lateAggregateWrite(release.promise);
    await write.started;
    expect(contentWritesInFlight(content)).toBe(1);

    let held = false;
    const holding = holdWritesRoute().then((response) => {
      held = true;
      return response;
    });
    await sleep(50);
    expect(held).toBe(false); // still waiting on the write

    release.resolve();
    const response = await holding;
    expect(response.status).toBe(200);
    const { hold: id } = (await response.json()) as { hold: string };
    holds.push(id);
    await write.done;
    expect(contentWritesInFlight(content)).toBe(0);

    // No ENOTEMPTY, no EEXIST: nothing is writing while the fixture goes in.
    await replaceContent();
    expect(await files(content)).toEqual(["notes/data/a/note.json"]);

    // The fixture's cache invalidation, naming the hold, releases it.
    const invalidated = await invalidateCache(id);
    expect(await invalidated.json()).toEqual({
      revalidated: true,
      released: true,
    });
    await withWriteLock(content, "next test's write", async () => {});
  });

  it("a write that arrives during the reset is refused, and only the fixture goes in", async () => {
    // 40-Tf5's leak, closed: the previous test's late write must not run
    // after the release either, when the directory is the next fixture.
    const id = await hold();
    const write = withWriteLock(content, "create notes/b", async () => {
      await outputFile(join(content, "notes", "data", "b", "note.json"), "{}");
    });
    const error = await write.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentWritesHeldError);
    expect((error as Error).message).toMatch(
      /Content writes into .* are held for a test reset: "create notes\/b" was refused, not queued\./,
    );

    await replaceContent();
    expect(releaseContentWrites(content, id)).toBe(true);
    await sleep(20);
    expect(await files(content)).toEqual(["notes/data/a/note.json"]);
  });

  it("a write nested in one in flight is not held at a closed gate", async () => {
    const release = deferred();
    const outer = withWriteLock(content, "outer", async () => {
      await release.promise;
      await withWriteLock(content, "inner", async () => {
        await outputFile(join(content, "inner"), "x");
      });
    });
    await sleep(10);
    const pausing = pause({ timeoutMs: 2_000 });
    release.resolve();
    await pausing; // would time out on a deadlock
    await outer;
    // Not refused either: the gate closed while the outer write ran.
    expect(await pathExists(join(content, "inner"))).toBe(true);
  });

  it("covers a git repository's writes the same way", async () => {
    spawnSync("git", ["init", "-q"], { cwd: content });
    const release = deferred();
    const write = lateAggregateWrite(release.promise);
    await write.started;

    let paused = false;
    const pausing = pause().then(() => {
      paused = true;
    });
    await sleep(50);
    expect(paused).toBe(false);
    release.resolve();
    await pausing;
    await write.done;
    await rm(join(content, "recipes"), { recursive: true });
    await expect(
      withWriteLock(content, "late", async () => {}),
    ).rejects.toBeInstanceOf(ContentWritesHeldError);
  });

  it("gives up on a write that never finishes, naming it, and reopens", async () => {
    const never = deferred();
    const stuck = trackContentWrite(
      content,
      "transform image x",
      () => never.promise,
    );
    const error = await pauseContentWrites(content, { timeoutMs: 50 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(WritesStillRunningError);
    expect((error as Error).message).toContain("transform image x");

    // The gate reopened: a new write is not held.
    await trackContentWrite(content, "next", async () => {
      await outputFile(join(content, "next"), "y");
    });
    expect(await readFile(join(content, "next"), "utf8")).toBe("y");
    never.resolve();
    await stuck;
  });

  it("a hold whose release never comes ends by itself, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await hold({ holdMs: 50 });
    await expect(
      trackContentWrite(content, "late", async () => {}),
    ).rejects.toBeInstanceOf(ContentWritesHeldError);
    await sleep(100);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Content write hold ${id} on ${content} ended by itself`,
      ),
    );
    // Open again; the expired hold's id releases nothing.
    await trackContentWrite(content, "after", async () => {});
    expect(releaseContentWrites(content, id)).toBe(false);
  });

  it("refuses work an outsideWriteLock scope schedules from inside a write", async () => {
    // `commit.ts`'s background index flush is scheduled this way: it
    // outlives the write that scheduled it, so it is not a nested write.
    const release = deferred();
    const scheduled = deferred();
    let background!: Promise<unknown>;
    let nested!: Promise<unknown>;
    const outer = withWriteLock(content, "outer", async () => {
      await release.promise;
      background = outsideWriteLock(() =>
        trackContentWrite(content, "flush pending index", async () => {}),
      ).catch((e: unknown) => e);
      nested = trackContentWrite(content, "nested", async () => "ran");
      scheduled.resolve();
      await nested;
    });
    await sleep(10);
    const pausing = pause();
    release.resolve();
    await scheduled.promise;
    expect(await background).toBeInstanceOf(ContentWritesHeldError);
    expect(await nested).toBe("ran");
    await outer;
    await pausing;
  });

  it("refuses work a finished write left running, once that write settles", async () => {
    // writeLock.ts's `hold.active` pattern: the scope a fire-and-forget task
    // inherited no longer lets it through once its write is over.
    const later = deferred();
    let leftover!: Promise<unknown>;
    await withWriteLock(content, "outer", async () => {
      leftover = (async () => {
        await later.promise;
        return trackContentWrite(content, "leftover", async () => "ran");
      })().catch((e: unknown) => e);
    });
    await pause();
    later.resolve();
    expect(await leftover).toBeInstanceOf(ContentWritesHeldError);
  });

  it("a write that throws leaves nothing counted in flight", async () => {
    const boom = new Error("boom");
    await expect(
      trackContentWrite(content, "tracked", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    await expect(
      withWriteLock(content, "locked", async () => {
        await trackContentWrite(content, "nested", async () => {
          throw boom;
        });
      }),
    ).rejects.toBe(boom);
    expect(contentWritesInFlight(content)).toBe(0);
    // So a pause drains at once rather than timing out.
    await pause({ timeoutMs: 50 });
  });

  it("a new hold replaces the one in force; the old id releases nothing", async () => {
    const first = await hold();
    const second = await hold();
    expect(second).not.toBe(first);

    expect(releaseContentWrites(content, first)).toBe(false);
    await expect(
      trackContentWrite(content, "still held", async () => {}),
    ).rejects.toBeInstanceOf(ContentWritesHeldError);

    expect(releaseContentWrites(content, second)).toBe(true);
    await trackContentWrite(content, "open", async () => {});
    expect(releaseContentWrites(content, second)).toBe(false);
  });

  it("the cache invalidation ignores a stale hold id, and releases nothing without one", async () => {
    process.env.TEST_MODE = "true";
    process.env.CONTENT_DIRECTORY = content;
    const id = await hold();

    expect(await (await invalidateCache()).json()).toEqual({
      revalidated: true,
    });
    expect(await (await invalidateCache("01STALE")).json()).toEqual({
      revalidated: true,
      released: false,
    });
    await expect(
      trackContentWrite(content, "still held", async () => {}),
    ).rejects.toBeInstanceOf(ContentWritesHeldError);

    expect(await (await invalidateCache(id)).json()).toEqual({
      revalidated: true,
      released: true,
    });
    expect(await (await invalidateCache(id)).json()).toEqual({
      revalidated: true,
      released: false,
    });
  });

  it("the hold route answers 404 outside TEST_MODE and holds nothing", async () => {
    process.env.CONTENT_DIRECTORY = content;
    const response = await holdWritesRoute();
    expect(response.status).toBe(404);
    await trackContentWrite(content, "open", async () => {});
  });

  it("an image transform refused by a hold renders the placeholder and writes nothing", async () => {
    // The previous test's page, rendering during the reset: no 500, no
    // variant in the fixture going in.
    process.env.CONTENT_DIRECTORY = content;
    vi.resetModules();
    const { getTransformedUploadImageProps } =
      await import("../websites/recipe-website/common/components/UploadImage");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await hold();
    const props = await getTransformedUploadImageProps({
      srcPath: join(content, "recipes", "uploads", "a", "photo.jpg"),
      src: "/uploads/recipe/a/uploads/photo.jpg",
      label: "Recipe image",
      alt: "",
      width: 100,
      height: 100,
    });
    expect(props).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("are held for a test reset"),
    );
    expect(await pathExists(join(content, "transformed-images"))).toBe(false);
  });
});
