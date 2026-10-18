// @vitest-environment node
//
// 41b, 40-Tf5: the write gate (`packages/cms/fs/writeGate.ts`) and the
// Playwright reset built on it. The harness's `resetData` holds the server's
// writes (`/settings/test-hold-writes`), removes `test-content`, copies the
// fixture over it, and releases (`/settings/test-invalidate-cache`). These
// tests run that sequence against a write still in flight — the previous
// test's late aggregate — and show the reset waits for it rather than racing
// it. Scratch directories only.

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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  contentWritesInFlight,
  holdContentWrites,
  pauseContentWrites,
  releaseContentWrites,
  trackContentWrite,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";
import { withWriteLock } from "@discontent/cms/git/writeLock";

import { GET as holdWritesRoute } from "../websites/recipe-website/editor/src/app/(editor)/(settings)/settings/test-hold-writes/route";

let root: string;
let content: string;
let fixture: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "write-gate-"));
  content = join(root, "test-content");
  fixture = join(root, "fixture");
  await outputFile(join(fixture, "notes", "data", "a", "note.json"), "{}");
  await copy(fixture, content);
});

afterEach(async () => {
  delete process.env.TEST_MODE;
  delete process.env.CONTENT_DIRECTORY;
  releaseContentWrites(content);
  await rm(root, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const hold = holdWritesRoute().then((response) => {
      held = true;
      return response;
    });
    await sleep(50);
    expect(held).toBe(false); // still waiting on the write

    release.resolve();
    const response = await hold;
    expect(response.status).toBe(200);
    await write.done;
    expect(contentWritesInFlight(content)).toBe(0);

    // No ENOTEMPTY, no EEXIST: nothing is writing while the fixture goes in.
    await replaceContent();
    expect(await files(content)).toEqual(["notes/data/a/note.json"]);
    expect(releaseContentWrites(content)).toBe(true);
  });

  it("a write that arrives during the reset waits for the release, then runs against the new corpus", async () => {
    const resume = await pauseContentWrites(content);
    const order: string[] = [];
    const write = withWriteLock(content, "create notes/b", async () => {
      order.push("write");
      await outputFile(join(content, "notes", "data", "b", "note.json"), "{}");
    });
    await sleep(50);
    expect(order).toEqual([]);

    await replaceContent();
    order.push("reset");
    resume();
    await write;

    expect(order).toEqual(["reset", "write"]);
    expect(await files(content)).toEqual([
      "notes/data/a/note.json",
      "notes/data/b/note.json",
    ]);
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
    const pausing = pauseContentWrites(content, { timeoutMs: 2_000 });
    release.resolve();
    const resume = await pausing; // would time out on a deadlock
    await outer;
    expect(await pathExists(join(content, "inner"))).toBe(true);
    resume();
  });

  it("covers a git repository's writes the same way", async () => {
    spawnSync("git", ["init", "-q"], { cwd: content });
    const release = deferred();
    const write = lateAggregateWrite(release.promise);
    await write.started;

    let paused = false;
    const pausing = pauseContentWrites(content).then((resume) => {
      paused = true;
      return resume;
    });
    await sleep(50);
    expect(paused).toBe(false);
    release.resolve();
    const resume = await pausing;
    await write.done;
    await rm(join(content, "recipes"), { recursive: true });
    resume();
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

  it("a hold whose release never comes ends by itself", async () => {
    await holdContentWrites(content, { holdMs: 50 });
    const order: string[] = [];
    const write = trackContentWrite(content, "late", async () => {
      order.push("write");
    });
    await sleep(10);
    expect(order).toEqual([]);
    await write; // released by the hold's own timer
    expect(order).toEqual(["write"]);
    expect(releaseContentWrites(content)).toBe(false);
  });
});
