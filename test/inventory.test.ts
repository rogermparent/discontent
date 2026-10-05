// @vitest-environment node
//
// The editor's shared inventory (25d): `inventory/on-hand.json` in a real git
// repository, so every write's commit is observable — and the boundary that
// keeps the list out of the static export.

import { mkdtemp, readdir, readFile, readJson, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  INVENTORY_FILE,
  makeable,
  patchInventory,
  readInventory,
  setInventory,
} from "../websites/recipe-website/editor/controller/curation/inventory";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

/** The same ordering `curationGit.test.ts` explains (T49). */
async function initTestRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(directory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

async function messages(): Promise<string[]> {
  return (await git.log()).all.map((entry) => entry.message);
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "inventory-"));
  git = await initTestRepo(contentDirectory);
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
  };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("readInventory", () => {
  it("reads an absent file as an empty list", async () => {
    const result = await readInventory(ctx);
    expect(result.items).toEqual([]);
    expect(result.path).toBe(join(contentDirectory, INVENTORY_FILE));
  });
});

describe("patchInventory", () => {
  it("adds, writes the file sorted and commits once", async () => {
    const result = await patchInventory(ctx, {
      add: ["vodka", "Gnista", "lime"],
    });
    expect(result).toMatchObject({
      items: ["Gnista", "lime", "vodka"],
      added: ["vodka", "Gnista", "lime"],
      removed: [],
      changed: true,
    });
    expect(await readJson(result.path)).toEqual({
      items: ["Gnista", "lime", "vodka"],
    });
    expect(await messages()).toEqual([
      "Update inventory: +vodka +Gnista +lime",
      "Initial commit",
    ]);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("removes case- and accent-insensitively", async () => {
    await patchInventory(ctx, { add: ["Vodka", "Crème de cassis"] });
    const result = await patchInventory(ctx, {
      remove: ["vodka", "creme de cassis", "gin"],
    });
    expect(result).toMatchObject({
      items: [],
      removed: ["Crème de cassis", "Vodka"],
      changed: true,
    });
    expect((await messages())[0]).toBe(
      "Update inventory: −Crème de cassis −Vodka",
    );
  });

  it("writes and commits nothing when the list already says so", async () => {
    await patchInventory(ctx, { add: ["vodka"] });
    const before = await messages();
    const result = await patchInventory(ctx, {
      add: ["VODKA"],
      remove: ["gin"],
    });
    expect(result.changed).toBe(false);
    expect(result.items).toEqual(["vodka"]);
    expect(await messages()).toEqual(before);
  });

  it("removes first, then adds", async () => {
    await patchInventory(ctx, { add: ["vodka"] });
    const result = await patchInventory(ctx, {
      add: ["vodka", "gin"],
      remove: ["vodka"],
    });
    expect(result).toMatchObject({
      items: ["gin", "vodka"],
      added: ["gin"],
      removed: [],
    });
  });

  it("shortens a long commit subject", async () => {
    const items = Array.from({ length: 12 }, (_, i) => `bottle number ${i}`);
    await patchInventory(ctx, { add: items });
    expect((await messages())[0]).toMatch(
      /^Update inventory: \+bottle number 0 .* \(\+\d+ more\)$/,
    );
  });

  it("refuses an empty patch and an over-long item", async () => {
    await expect(patchInventory(ctx, {})).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      patchInventory(ctx, { add: ["x".repeat(81)] }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      patchInventory(ctx, { add: ["vodka"], extra: true }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("setInventory", () => {
  it("replaces the list in one commit", async () => {
    await patchInventory(ctx, { add: ["vodka", "gin"] });
    const result = await setInventory(ctx, { items: ["gin", "tonic water"] });
    expect(result).toMatchObject({
      items: ["gin", "tonic water"],
      added: ["tonic water"],
      removed: ["vodka"],
      changed: true,
    });
    expect((await messages())[0]).toBe("Replace inventory: 2 items");
  });

  it("commits nothing for the same list", async () => {
    await setInventory(ctx, { items: ["gin"] });
    const before = await messages();
    expect((await setInventory(ctx, { items: ["Gin"] })).changed).toBe(false);
    expect(await messages()).toEqual(before);
  });
});

describe("makeable", () => {
  beforeEach(async () => {
    await createRecipe(ctx, {
      name: "Vodka Sour",
      tags: ["drink"],
      ingredients: ["2 oz vodka", "3/4 oz lime juice", "3/4 oz simple syrup"],
    });
    await createRecipe(ctx, {
      name: "Lavender Syrup",
      tags: ["syrup"],
      ingredients: ["1 cup sugar", "1 cup water", "1 tbsp dried lavender"],
    });
    await createRecipe(ctx, {
      name: "Lavender Gnista Tonic",
      tags: ["drink", "zero-proof"],
      ingredients: [
        "1 1/2 oz non-alcoholic aperitif (Gnista)",
        "1/4 oz [lavender syrup](/recipe/lavender-syrup)",
        "Tonic water, to top",
      ],
    });
    await createRecipe(ctx, {
      name: "Hand Pies",
      tags: ["dessert"],
      ingredients: [
        { ingredient: "Filling", type: "heading" },
        "1 cup jam",
        "2 cups flour",
      ],
    });
  });

  it("judges the shared list against tag:drink by default", async () => {
    await patchInventory(ctx, {
      add: ["vodka", "simple syrup", "Gnista", "tonic", "sugar", "lavender"],
    });
    const result = await makeable(ctx);
    expect(result).toMatchObject({
      query: "tag:drink",
      inventory: 6,
      total: 2,
      canMake: [
        {
          slug: "lavender-gnista-tonic",
          name: "Lavender Gnista Tonic",
          makeFirst: ["lavender-syrup"],
        },
      ],
      oneAway: [
        { slug: "vodka-sour", name: "Vodka Sour", missing: ["lime juice"] },
      ],
      twoAway: [],
      further: 0,
    });
    expect(result.buyNext[0]).toMatchObject({ item: "lime juice", unlocks: 1 });
  });

  it("takes a scope, and reads stored headings off the index", async () => {
    await patchInventory(ctx, { add: ["jam"] });
    const result = await makeable(ctx, { query: "tag:dessert" });
    expect(result.oneAway).toEqual([
      { slug: "hand-pies", name: "Hand Pies", missing: ["flour"] },
    ]);
  });

  it("caps each bucket at `limit`", async () => {
    const result = await makeable(ctx, { query: "", limit: 1 });
    expect(result.total).toBe(4);
    const rows =
      result.canMake.length + result.oneAway.length + result.twoAway.length;
    expect(rows).toBeLessThanOrEqual(3);
    expect(result.canMake.length).toBeLessThanOrEqual(1);
  });
});

/*
 * D10: the export never reads the shared list. The file is no content type,
 * so nothing generic can reach it; what is left to guard is a direct import
 * or a hand-built path from the code the static export is built from.
 */
describe("the export never reads the shared inventory", () => {
  const SITE = join(
    dirname(fileURLToPath(import.meta.url)),
    "../websites/recipe-website",
  );

  async function sourceFiles(directory: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "out"
      ) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
      else if (/\.(tsx?|mjs|js)$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it("no common/ or export/ file imports curation/inventory or names on-hand", async () => {
    const files = [
      ...(await sourceFiles(join(SITE, "common"))),
      ...(await sourceFiles(join(SITE, "export"))),
    ];
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/curation\/inventory/.test(source)) {
        violations.push(`${relative(SITE, file)} imports curation/inventory`);
      }
      if (/on-hand/.test(source)) {
        violations.push(`${relative(SITE, file)} names inventory/on-hand`);
      }
    }
    expect(violations).toEqual([]);
  });
});
