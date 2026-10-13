// @vitest-environment node
//
// Atomic file writes (epic 34, D8): `packages/cms/fs/atomicWrite.ts`.

import { Readable } from "node:stream";
import { chmod, mkdtemp, readdir, readFile, rm, stat } from "fs-extra";
import { tmpdir } from "os";
import { basename, join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  temporaryPathFor,
  writeFileAtomic,
  writeJsonAtomic,
  writeStreamAtomic,
} from "@discontent/cms/fs/atomicWrite";
import { ATOMIC_TEMP } from "@discontent/cms/git/writeLock";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atomic-write-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("atomic writes", () => {
  it("writes outputJSON's bytes and leaves nothing beside the target", async () => {
    const target = join(dir, "a/b/recipe.json");
    await writeJsonAtomic(
      target,
      { name: "Naan", tags: ["bread"] },
      {
        spaces: 2,
      },
    );
    expect(await readFile(target, "utf8")).toBe(
      `${JSON.stringify({ name: "Naan", tags: ["bread"] }, null, 2)}\n`,
    );
    expect(await readdir(join(dir, "a/b"))).toEqual(["recipe.json"]);
  });

  it("keeps the replaced file's mode", async () => {
    const target = join(dir, "run.sh");
    await writeFileAtomic(target, "one");
    await chmod(target, 0o751);
    await writeFileAtomic(target, "two");
    expect((await stat(target)).mode & 0o7777).toBe(0o751);
    expect(await readFile(target, "utf8")).toBe("two");
  });

  it("removes its temp file when the source fails, and keeps the old file", async () => {
    const target = join(dir, "photo.jpg");
    await writeFileAtomic(target, "old");
    const failing = new Readable({
      read() {
        this.destroy(new Error("connection reset"));
      },
    });
    await expect(writeStreamAtomic(target, failing)).rejects.toThrow(
      "connection reset",
    );
    expect(await readFile(target, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["photo.jpg"]);
  });

  it("names temp files the sweep recognises, under 255 bytes however long the name", () => {
    const long = join(dir, `${"é".repeat(127)}.json`);
    const temporary = basename(temporaryPathFor(long));
    expect(Buffer.byteLength(temporary)).toBeLessThan(255);
    expect(temporary).toMatch(ATOMIC_TEMP);
    expect(basename(temporaryPathFor(join(dir, "x.json")))).toMatch(
      /^\.x\.json\.[0-9A-Z]{26}\.\d+\.tmp$/,
    );
    /* Two temp names for one target never collide. */
    expect(temporaryPathFor(long)).not.toBe(temporaryPathFor(long));
  });
});
