import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PREFERRED_SOURCES,
  PREFERRED_SOURCES_MAX,
  PreferredSourcesError,
  parsePreferredSources,
  preferredSourceKey,
} from "../websites/recipe-website/editor/controller/agent/preferredSourcesCheck";

/*
 * 51g (b03): the preferred recipe sources are a setting. The check keeps
 * registrable domains, deduped in order, at most ten; an empty list is
 * allowed; the store defaults to Sally's when nothing is saved.
 */

describe("parsePreferredSources", () => {
  it("cuts a typed site or page to its registrable domain", () => {
    expect(preferredSourceKey("https://www.Example.com/recipes/x")).toBe(
      "example.com",
    );
    expect(preferredSourceKey("  Sallysbakingaddiction.com ")).toBe(
      "sallysbakingaddiction.com",
    );
    expect(preferredSourceKey("two words")).toBeUndefined();
    expect(preferredSourceKey("")).toBeUndefined();
  });

  it("dedupes keeping the first, skips blanks, and allows an empty list", () => {
    expect(
      parsePreferredSources([
        "a.com",
        "https://www.b.com/x",
        "A.com",
        "  ",
        "b.com",
      ]),
    ).toEqual(["a.com", "b.com"]);
    expect(parsePreferredSources([])).toEqual([]);
  });

  it("refuses what is not a site, and more than ten", () => {
    expect(() => parsePreferredSources("a.com")).toThrow(PreferredSourcesError);
    expect(() => parsePreferredSources([3])).toThrow(PreferredSourcesError);
    expect(() => parsePreferredSources(["not a site"])).toThrow(/not a site/);
    const many = Array.from(
      { length: PREFERRED_SOURCES_MAX + 1 },
      (_, index) => `site${index}.com`,
    );
    expect(() => parsePreferredSources(many)).toThrow(/At most 10/);
    expect(parsePreferredSources(many.slice(0, 10))).toHaveLength(10);
  });

  it("defaults to Sally's", () => {
    expect([...DEFAULT_PREFERRED_SOURCES]).toEqual([
      "sallysbakingaddiction.com",
    ]);
  });
});

describe("the saved list", () => {
  let dir: string;
  const saved = process.env.SETTINGS_DIRECTORY;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "preferred-sources-"));
    process.env.SETTINGS_DIRECTORY = dir;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.SETTINGS_DIRECTORY;
    else process.env.SETTINGS_DIRECTORY = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the default until saved, then what was saved, empty included", async () => {
    const { readPreferredSources, writePreferredSources } =
      await import("../websites/recipe-website/editor/controller/agent/preferredSources");
    expect(await readPreferredSources()).toEqual(["sallysbakingaddiction.com"]);
    expect(
      await writePreferredSources(["https://www.x.com/a", "y.com", "x.com"]),
    ).toEqual(["x.com", "y.com"]);
    expect(await readPreferredSources()).toEqual(["x.com", "y.com"]);
    await writePreferredSources([]);
    expect(await readPreferredSources()).toEqual([]);
    await expect(writePreferredSources(["no way"])).rejects.toMatchObject({
      code: "validation",
    });
    expect(await readPreferredSources()).toEqual([]);
  });
});
