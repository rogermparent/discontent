// @vitest-environment node
//
// The legacy "Imported from" migration (27d/D13), on a scratch repository
// copied from a Playwright fixture with one recipe per real-world shape added.
// The shapes are the eight the real content repo held on 2026-10-07.

import { copy, mkdtemp, outputJSON, readJson, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { readIndexFreshness } from "@discontent/cms/git/indexStamp";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { searchRecipes } from "../websites/recipe-website/editor/controller/curation/search";
import {
  migrateImportedFrom,
  parseImportedFrom,
  stripImportedFrom,
} from "../websites/recipe-website/editor/scripts/migrate-imported-from";

const FIXTURE = resolve(
  __dirname,
  "../websites/recipe-website/editor/playwright/fixtures/test-content/make-drinks",
);

const SALLY = "https://sallysbakingaddiction.com/baked-oatmeal";
const YOUTUBE = "https://www.youtube.com/watch?v=abc123";

/** slug → description, one per shape. */
const LEGACY: Record<string, string> = {
  standard: `*Imported from [${SALLY}](${SALLY})*\r\n\r\n---\r\n\r\nOats, baked.`,
  "standard-no-cr": `*Imported from [https://www.imbibemagazine.com/recipe/last-word/](https://www.imbibemagazine.com/recipe/last-word/)*\n\nEqual parts.`,
  youtube: `*Imported from* [*${YOUTUBE}*](${YOUTUBE})\r\n\r\nA baguette.`,
  plain: `Imported from [Lagerstrom](https://example.com/dough)\n\nDough.`,
  bare: `Imported from https://example.org/burgers\n\nSmash them.`,
  "only-line": `*Imported from [https://example.net/x](https://example.net/x)*`,
  "two-links": `*Imported from [https://a.example](https://a.example)* and *https://b.example*\r\nTwo.`,
  "link-and-label": `*Imported from [https://a.example](https://a.example) [Pie](https://b.example)*`,
  malformed: `*Imported from [https://broken.example)*\r\nBroken.`,
};

let contentDirectory: string;
let git: SimpleGit;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "migrate-imported-"));
  await copy(FIXTURE, contentDirectory);
  for (const [slug, description] of Object.entries(LEGACY)) {
    await outputJSON(
      join(contentDirectory, "recipes/data", slug, "recipe.json"),
      { name: slug, description, date: 1_700_000_000_000 },
      { spaces: 2 },
    );
  }
  /* Already cited: never touched, whatever its description says. */
  await outputJSON(
    join(contentDirectory, "recipes/data/cited/recipe.json"),
    {
      name: "cited",
      description: `*Imported from [${SALLY}](${SALLY})*`,
      source: { url: "https://kept.example/" },
      date: 1_700_000_000_000,
    },
    { spaces: 2 },
  );
  git = simpleGit({ baseDir: contentDirectory });
  await git.init();
  await git.addConfig("user.email", "migrate@test.local");
  await git.addConfig("user.name", "Migrate Test");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const read = (slug: string) =>
  readJson(join(contentDirectory, "recipes/data", slug, "recipe.json"));

describe("parseImportedFrom", () => {
  it("reads every shape the real repo had, and refuses the ambiguous ones", () => {
    const first = (slug: string) => LEGACY[slug].split("\n")[0];
    expect(parseImportedFrom(first("standard"))).toEqual({ url: SALLY });
    expect(parseImportedFrom(first("youtube"))).toEqual({ url: YOUTUBE });
    expect(parseImportedFrom(first("plain"))).toEqual({
      url: "https://example.com/dough",
    });
    expect(parseImportedFrom(first("bare"))).toEqual({
      url: "https://example.org/burgers",
    });
    for (const slug of ["two-links", "link-and-label", "malformed"]) {
      expect(parseImportedFrom(first(slug))).toHaveProperty("reason");
    }
  });
});

describe("stripImportedFrom", () => {
  it("drops the line, the blanks after it and the old importer's rule", () => {
    expect(stripImportedFrom(LEGACY.standard)).toBe("Oats, baked.");
    expect(stripImportedFrom(LEGACY.youtube)).toBe("A baguette.");
    expect(stripImportedFrom(LEGACY["only-line"])).toBeUndefined();
  });
});

describe("migrateImportedFrom", () => {
  it("dry-runs without writing, then migrates in one commit and reindexes", async () => {
    const before = String(await git.revparse(["HEAD"])).trim();
    const dry = await migrateImportedFrom(contentDirectory, { dryRun: true });
    expect(dry).toMatchObject({ candidates: 10, dryRun: true });
    expect(dry.migrated).toHaveLength(6);
    expect(dry.skipped.map((skip) => skip.slug).sort()).toEqual([
      "cited",
      "link-and-label",
      "malformed",
      "two-links",
    ]);
    expect(String(await git.revparse(["HEAD"])).trim()).toBe(before);
    expect((await git.status()).isClean()).toBe(true);

    const report = await migrateImportedFrom(contentDirectory);
    expect(report.migrated).toHaveLength(6);
    const log = await git.log();
    expect(log.all).toHaveLength(2);
    expect(log.latest?.message).toBe(
      "Move legacy 'Imported from' lines into source (6 recipes)",
    );
    expect((await git.status()).isClean()).toBe(true);

    expect(await read("standard")).toMatchObject({
      description: "Oats, baked.",
      source: { url: SALLY, name: "sallysbakingaddiction.com" },
    });
    expect(await read("standard-no-cr")).toMatchObject({
      description: "Equal parts.",
      source: { name: "Imbibe" },
    });
    expect((await read("youtube")).source).toEqual({
      url: YOUTUBE,
      name: "YouTube",
    });
    expect(await read("only-line")).not.toHaveProperty("description");
    /* The skipped and the already-cited are byte-for-byte what they were. */
    expect((await read("malformed")).description).toBe(LEGACY.malformed);
    expect((await read("cited")).source).toEqual({
      url: "https://kept.example/",
    });

    /* Reindexed and stamped: `source:` finds them, and nothing reads stale. */
    expect((await readIndexFreshness(contentDirectory)).stale).toBe(false);
    const imbibe = await searchRecipes({ contentDirectory }, "source:imbibe");
    expect(imbibe.recipes.map((row) => row.slug)).toEqual(["standard-no-cr"]);
  });

  it("makes no commit when there is nothing to move", async () => {
    await migrateImportedFrom(contentDirectory);
    const head = String(await git.revparse(["HEAD"])).trim();
    const again = await migrateImportedFrom(contentDirectory);
    expect(again.migrated).toHaveLength(0);
    expect(again.commit).toBeUndefined();
    expect(String(await git.revparse(["HEAD"])).trim()).toBe(head);
  });
});
