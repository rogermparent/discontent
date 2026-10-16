// @vitest-environment node
//
// 38a review: `settings.json` is written atomically, and a read-modify-write
// (`updateSettings`) holds a lock, so two writers never lose each other's
// keys and a reader never sees a truncated file. Also the staples action
// that prompted it (`saveMakeStaples`).

import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readSettings,
  updateSettings,
  writeSettings,
} from "@discontent/cms/settings";
import { auth } from "./stub_auth.js";
import { resetRevalidatedPaths, revalidatedPaths } from "./stub_cache.js";
import { saveMakeStaples } from "../websites/recipe-website/editor/controller/actions/makeStaples";

let dir: string;
let previous: string | undefined;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "settings-store-"));
  previous = process.env.SETTINGS_DIRECTORY;
  process.env.SETTINGS_DIRECTORY = dir;
});
afterEach(async () => {
  if (previous === undefined) delete process.env.SETTINGS_DIRECTORY;
  else process.env.SETTINGS_DIRECTORY = previous;
  await rm(dir, { recursive: true, force: true });
});

const file = () => join(dir, "settings.json");

describe("writeSettings", () => {
  it("never shows a reader a truncated file", async () => {
    const big = (n: number) => ({
      round: n,
      theme: { notes: "x".repeat(200_000) },
    });
    await writeSettings(big(0));
    let writing = true;
    const writer = (async () => {
      for (let n = 1; n <= 30; n += 1) await writeSettings(big(n));
      writing = false;
    })();
    let reads = 0;
    while (writing) {
      const raw = await readFile(file(), "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
      reads += 1;
    }
    await writer;
    expect(reads).toBeGreaterThan(0);
    expect(await readdir(dir)).toEqual(["settings.json"]);
    expect((await readSettings<{ round: number }>()).round).toBe(30);
  });
});

describe("updateSettings", () => {
  it("loses no key to a concurrent update", async () => {
    await writeSettings({ theme: { accent: "teal" }, mirrors: ["pi"] });
    await Promise.all(
      Array.from({ length: 12 }, (_, n) =>
        updateSettings<Record<string, unknown>>(async (current) => {
          /* Widen the window a lost update would need. */
          await new Promise((resolve) => setTimeout(resolve, 2));
          return { ...current, [`key${n}`]: n };
        }),
      ),
    );
    const settings = await readSettings<Record<string, unknown>>();
    expect(settings).toMatchObject({
      theme: { accent: "teal" },
      mirrors: ["pi"],
    });
    for (let n = 0; n < 12; n += 1) expect(settings[`key${n}`]).toBe(n);
    /* The lock is gone, and so is every temp file. */
    expect(await readdir(dir)).toEqual(["settings.json"]);
  });

  it("writes nothing when the update answers undefined", async () => {
    await writeSettings({ footerNote: "hi" });
    const before = await stat(file());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await updateSettings(() => undefined)).toEqual({ footerNote: "hi" });
    expect((await stat(file())).mtimeMs).toBe(before.mtimeMs);
  });

  it("starts from {} without a file, and refuses one that does not parse", async () => {
    expect(await updateSettings(() => ({ a: 1 }))).toEqual({ a: 1 });
    await writeFile(file(), '{"theme": {"acc');
    await expect(updateSettings(() => ({ b: 2 }))).rejects.toThrow();
    /* Left as it was, not overwritten with `{ b: 2 }`. */
    expect(await readFile(file(), "utf8")).toBe('{"theme": {"acc');
  });
});

describe("saveMakeStaples (38a)", () => {
  beforeEach(() => {
    auth.mockResolvedValue({ user: { email: "owner@example.com" } });
    resetRevalidatedPaths();
  });
  afterEach(() => {
    auth.mockReset();
  });

  it("keeps every other key, revalidates /make, and skips an unchanged list", async () => {
    await writeSettings({ theme: { accent: "teal" }, mirrors: ["pi"] });
    expect(await saveMakeStaples([" salt ", "ice"])).toEqual({ ok: true });
    expect(await readSettings()).toEqual({
      theme: { accent: "teal" },
      mirrors: ["pi"],
      makeStaples: ["salt", "ice"],
    });
    expect(revalidatedPaths).toContainEqual({ path: "/make", type: undefined });

    const before = await stat(file());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await saveMakeStaples(["salt", "ice"])).toEqual({ ok: true });
    expect((await stat(file())).mtimeMs).toBe(before.mtimeMs);

    expect(await saveMakeStaples(null)).toEqual({ ok: true });
    expect(await readSettings()).toEqual({
      theme: { accent: "teal" },
      mirrors: ["pi"],
    });
  });

  it("refuses a list past the limits, and a signed-out caller", async () => {
    expect(await saveMakeStaples(Array(201).fill("salt"))).toEqual({
      error: "Invalid staples list",
    });
    expect(await saveMakeStaples(["x".repeat(201)])).toEqual({
      error: "Invalid staples list",
    });
    auth.mockResolvedValue(null);
    expect(await saveMakeStaples(["salt"])).toEqual({
      error: "Authentication required",
    });
  });
});
