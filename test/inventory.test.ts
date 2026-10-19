// @vitest-environment node
//
// The editor's shared inventory (25d): `inventory/on-hand.json` in a real git
// repository, so every write's commit is observable — and the boundary that
// keeps the list out of the static export.

import { mkdtemp, readdir, readFile, readJson, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { absoluteLink } from "../websites/recipe-website/editor/cli/backend/link";
import { inventoryCommands } from "../websites/recipe-website/editor/cli/commands/inventory";
import { protectDashedPositionals } from "../websites/recipe-website/editor/cli/index";
import { analyzeMakeable } from "recipe-website-common/util/makeable";

/* `/api/inventory/make` with its auth stood in for: the route's own
 * parameters are what its test reads (U5 review). */
vi.mock("recipe-editor/controller/apiContext", () => ({
  requireCurationContext: async () => ctx,
}));
const { GET: makeRoute } =
  await import("../websites/recipe-website/editor/src/app/api/inventory/make/route");

let contentDirectory: string;
let settingsDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;
let previousSettingsDirectory: string | undefined;

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
  /* `makeable` reads the editor's saved staples (41i): an empty settings
   * directory of its own, so no checkout's settings.json leaks in. */
  settingsDirectory = await mkdtemp(join(tmpdir(), "inventory-settings-"));
  previousSettingsDirectory = process.env.SETTINGS_DIRECTORY;
  process.env.SETTINGS_DIRECTORY = settingsDirectory;
});

afterEach(async () => {
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  if (previousSettingsDirectory === undefined) {
    delete process.env.SETTINGS_DIRECTORY;
  } else {
    process.env.SETTINGS_DIRECTORY = previousSettingsDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
  await rm(settingsDirectory, { recursive: true, force: true });
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

  it("judges the shared list against every recipe by default (32j)", async () => {
    await patchInventory(ctx, {
      add: ["vodka", "simple syrup", "Gnista", "tonic", "sugar", "lavender"],
    });
    /* Pantry staples off (U5): flour would otherwise answer for Hand Pies. */
    const result = await makeable(ctx, { staples: false });
    expect(result).toMatchObject({
      query: "",
      staples: false,
      inventory: 6,
      total: 4,
      canMake: [
        {
          slug: "lavender-gnista-tonic",
          makeFirst: ["lavender-syrup"],
        },
        { slug: "lavender-syrup", name: "Lavender Syrup" },
      ],
      oneAway: [{ slug: "vodka-sour", missing: ["lime juice"] }],
      twoAway: [{ slug: "hand-pies", missing: ["jam", "flour"] }],
    });
  });

  it("narrows to drinks with tag:drink", async () => {
    await patchInventory(ctx, {
      add: ["vodka", "simple syrup", "Gnista", "tonic", "sugar", "lavender"],
    });
    const result = await makeable(ctx, { query: "tag:drink" });
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
    const result = await makeable(ctx, {
      query: "tag:dessert",
      staples: false,
    });
    expect(result.oneAway).toEqual([
      { slug: "hand-pies", name: "Hand Pies", missing: ["flour"] },
    ]);
  });

  it("assumes the staples and counts a close match, naming it (32j)", async () => {
    await createRecipe(ctx, {
      name: "Shallot Rice",
      tags: ["side"],
      ingredients: [
        "1 shallot, minced",
        "1 cup long-grain rice",
        "2 tablespoons olive oil",
        "1 tsp kosher salt",
        "1/4 tsp freshly ground black pepper",
      ],
    });
    await patchInventory(ctx, { add: ["onion", "rice", "vegetable oil"] });
    const result = await makeable(ctx, { query: "-tag:drink", staples: false });
    expect(result.canMake).toEqual([
      {
        slug: "shallot-rice",
        name: "Shallot Rice",
        close: [
          { needs: "shallot", have: "onion" },
          { needs: "olive oil", have: "vegetable oil" },
        ],
      },
    ]);
  });

  it("lists bean swaps by default, and not with beanSwaps: false (42m)", async () => {
    await createRecipe(ctx, {
      name: "Two Bean Salad",
      tags: ["salad"],
      ingredients: [
        "1 (15 oz) can chickpeas, drained and rinsed",
        "1 (15 oz) can kidney beans, drained and rinsed",
        "1 red onion, diced",
      ],
    });
    await patchInventory(ctx, { add: ["pinto beans", "red onion"] });
    const on = await makeable(ctx, { query: "tag:salad", staples: false });
    expect(on.beanSwaps).toBe(true);
    expect(on.beanSwap).toEqual([
      {
        slug: "two-bean-salad",
        name: "Two Bean Salad",
        swaps: [
          { line: "chickpea", use: "pinto beans" },
          { line: "kidney bean", use: "pinto beans" },
        ],
      },
    ]);
    /* Never can make; still two away, missing what it was missing. */
    expect(on.canMake).toEqual([]);
    expect(on.twoAway).toEqual([
      {
        slug: "two-bean-salad",
        name: "Two Bean Salad",
        missing: ["chickpea", "kidney bean"],
      },
    ]);
    const off = await makeable(ctx, {
      query: "tag:salad",
      staples: false,
      beanSwaps: false,
    });
    expect(off.beanSwaps).toBe(false);
    expect(off).not.toHaveProperty("beanSwap");
    expect(off.twoAway).toEqual(on.twoAway);
    /* And over the route: `beanSwaps=0` turns it off. */
    const routed = (await (
      await makeRoute(
        new Request(
          "http://editor.test/api/inventory/make?query=tag:salad&beanSwaps=0",
        ),
      )
    ).json()) as Awaited<ReturnType<typeof makeable>>;
    expect(routed.beanSwaps).toBe(false);
    expect(routed).not.toHaveProperty("beanSwap");
  });

  it("keeps a matcher as `any bean` and judges it as /make does (42m2)", async () => {
    const salad = {
      name: "Two Bean Salad",
      tags: ["salad"],
      ingredients: [
        "1 (15 oz) can chickpeas, drained and rinsed",
        "1 (15 oz) can kidney beans, drained and rinsed",
        "1 red onion, diced",
      ],
    };
    await createRecipe(ctx, salad);
    await createRecipe(ctx, {
      name: "Green Bean Salad",
      tags: ["salad"],
      ingredients: ["1 lb green beans, trimmed", "1 red onion, diced"],
    });
    /* "beans" is stored as the matcher's canonical text (Dm2-6). */
    const added = await patchInventory(ctx, { add: ["beans", "red onion"] });
    expect(added).toMatchObject({
      items: ["any bean", "red onion"],
      added: ["any bean", "red onion"],
    });
    expect((await patchInventory(ctx, { add: ["Any Beans"] })).changed).toBe(
      false,
    );

    const result = await makeable(ctx, { query: "tag:salad", staples: false });
    expect(result.canMake).toEqual([
      { slug: "two-bean-salad", name: "Two Bean Salad" },
    ]);
    /* Green beans are no family bean; the swap tier has nothing to add. */
    expect(result.oneAway).toEqual([
      {
        slug: "green-bean-salad",
        name: "Green Bean Salad",
        missing: ["green bean"],
      },
    ]);
    expect(result.beanSwap).toEqual([]);
    /* The page's judge over the same lines says the same (41i parity). */
    const page = analyzeMakeable(
      [{ slug: "two-bean-salad", ...salad }],
      [{ slug: "two-bean-salad", ...salad }],
      ["any bean", "red onion"],
      { staples: [], beanSwaps: true },
    );
    expect(page.canMake.map((match) => match.recipe.slug)).toEqual([
      "two-bean-salad",
    ]);

    /* Any spelling removes it. */
    const removed = await patchInventory(ctx, { remove: ["beans"] });
    expect(removed).toMatchObject({
      items: ["red onion"],
      removed: ["any bean"],
    });
  });

  it("reads a list saved before matchers, `beans` and all (42m2)", async () => {
    await createRecipe(ctx, {
      name: "Chickpea Salad",
      tags: ["salad"],
      ingredients: ["1 can chickpeas", "1 cucumber"],
    });
    await patchInventory(ctx, { add: ["cucumber"] });
    /* Written by hand, as an old list or another tool might have. */
    await writeFile(
      join(contentDirectory, INVENTORY_FILE),
      `${JSON.stringify({ items: ["beans", "cucumber"] }, null, 2)}\n`,
    );
    const result = await makeable(ctx, { query: "tag:salad", staples: false });
    expect(result.canMake).toEqual([
      { slug: "chickpea-salad", name: "Chickpea Salad" },
    ]);
    expect(
      (await patchInventory(ctx, { remove: ["any bean"] })).removed,
    ).toEqual(["beans"]);
  });

  it("assumes pantry staples by default, and not with staples: false (U5)", async () => {
    await patchInventory(ctx, { add: ["jam"] });
    const on = await makeable(ctx, { query: "tag:dessert" });
    expect(on.staples).toBe(true);
    expect(on.canMake).toEqual([{ slug: "hand-pies", name: "Hand Pies" }]);
    const off = await makeable(ctx, { query: "tag:dessert", staples: false });
    expect(off.staples).toBe(false);
    expect(off.canMake).toEqual([]);
    expect(off.oneAway).toEqual([
      { slug: "hand-pies", name: "Hand Pies", missing: ["flour"] },
    ]);
  });

  it("takes staples=0 on /api/inventory/make, and assumes them otherwise (U5)", async () => {
    await patchInventory(ctx, { add: ["jam"] });
    const get = async (search: string) =>
      (await (
        await makeRoute(
          new Request(`http://editor.test/api/inventory/make${search}`),
        )
      ).json()) as Awaited<ReturnType<typeof makeable>>;
    const on = await get("?query=tag:dessert");
    expect(on.staples).toBe(true);
    expect(on.canMake).toEqual([{ slug: "hand-pies", name: "Hand Pies" }]);
    for (const off of ["0", "false"]) {
      const result = await get(`?query=tag:dessert&staples=${off}`);
      expect(result.staples).toBe(false);
      expect(result.canMake).toEqual([]);
      expect(result.oneAway).toEqual([
        { slug: "hand-pies", name: "Hand Pies", missing: ["flour"] },
      ]);
    }
    expect((await get("?query=tag:dessert&staples=1")).staples).toBe(true);
  });

  /* 41i: the tools ask what the page asks. */
  describe("as /make judges it (41i)", () => {
    beforeEach(async () => {
      await createRecipe(ctx, {
        name: "Gin and Tonic",
        tags: ["drink"],
        ingredients: [
          "2 oz gin",
          "Tonic water, to top",
          "Lime wedge, for garnish",
        ],
      });
      await createRecipe(ctx, {
        name: "Moscow Mule",
        tags: ["drink"],
        ingredients: ["2 oz vodka", "1/2 oz lime juice", "4 oz ginger beer"],
      });
      await createRecipe(ctx, {
        name: "Gimlet",
        tags: ["drink"],
        ingredients: ["2 oz gin", "3/4 oz lime juice", "3/4 oz simple syrup"],
      });
      await patchInventory(ctx, { add: ["vodka", "gin", "simple syrup"] });
    });

    const slugs = (result: Awaited<ReturnType<typeof makeable>>) =>
      [...result.canMake, ...result.oneAway, ...result.twoAway]
        .map((row) => row.slug)
        .sort();

    it("features an ingredient through the matcher: a garnish doesn't count", async () => {
      const result = await makeable(ctx, {
        query: "tag:drink",
        feature: ["lime"],
      });
      expect(result).toMatchObject({
        query: "tag:drink",
        scope: "tag:drink ingredient:lime",
        features: ["lime"],
        link: "/make?q=tag%3Adrink+ingredient%3Alime",
        total: 3,
        canMake: [],
      });
      /* The G&T's lime is a garnish; the Gnista tonic has none. */
      expect(slugs(result)).toEqual(["gimlet", "moscow-mule", "vodka-sour"]);
      /* Buy next within the featured scope ("Buy next for lime drinks"). */
      expect(result.buyNext[0]).toMatchObject({
        item: "lime juice",
        unlocks: 2,
        helps: 1,
      });
      expect(result.buyNext[0].recipes.sort()).toEqual([
        "gimlet",
        "vodka-sour",
      ]);
    });

    it("gin is gin, never ginger beer, and several features must all meet", async () => {
      const gin = await makeable(ctx, { feature: ["gin"] });
      expect(slugs(gin)).toEqual(["gimlet", "gin-and-tonic"]);
      const both = await makeable(ctx, { feature: ["gin", "lime"] });
      expect(both.features).toEqual(["gin", "lime"]);
      expect(slugs(both)).toEqual(["gimlet"]);
    });

    it("reads an ingredient: term in the query as a feature, once", async () => {
      const typed = await makeable(ctx, { query: "tag:drink ingredient:gin" });
      expect(typed).toMatchObject({
        scope: "tag:drink ingredient:gin",
        features: ["gin"],
        total: 2,
      });
      const twice = await makeable(ctx, {
        query: "tag:drink ingredient:gin",
        feature: ["Gin"],
      });
      expect(twice.scope).toBe("tag:drink ingredient:gin");
      expect(twice.features).toEqual(["gin"]);
    });

    it("needs every free-text word, as /make's scope does", async () => {
      /* recipe_search's ranked any-word match would add Lavender Syrup. */
      expect((await makeable(ctx, { query: "lavender" })).total).toBe(2);
      expect((await makeable(ctx, { query: "lavender tonic" })).total).toBe(1);
    });

    it("assumes the editor's saved staples when there are some (38a)", async () => {
      const without = await makeable(ctx, {
        query: "tag:drink",
        staples: false,
      });
      expect(without.alwaysHave).toEqual([
        "salt",
        "black pepper",
        "water",
        "ice",
      ]);
      expect(without.oneAway.map((row) => row.slug)).toContain("vodka-sour");

      await writeFile(
        join(settingsDirectory, "settings.json"),
        JSON.stringify({ makeStaples: ["salt", "lime juice"] }),
      );
      const saved = await makeable(ctx, {
        query: "tag:drink",
        staples: false,
      });
      expect(saved.alwaysHave).toEqual(["salt", "lime juice"]);
      expect(saved.canMake.map((row) => row.slug).sort()).toEqual([
        "gimlet",
        "vodka-sour",
      ]);

      /* A malformed value is no saved list. */
      await writeFile(
        join(settingsDirectory, "settings.json"),
        JSON.stringify({ makeStaples: ["salt", 3] }),
      );
      expect((await makeable(ctx, { query: "tag:drink" })).alwaysHave).toEqual([
        "salt",
        "black pepper",
        "water",
        "ice",
      ]);
    });

    it("takes feature, repeated, on /api/inventory/make", async () => {
      const response = await makeRoute(
        new Request(
          "http://editor.test/api/inventory/make?query=tag:drink&feature=gin&feature=lime",
        ),
      );
      const result = (await response.json()) as Awaited<
        ReturnType<typeof makeable>
      >;
      expect(result.features).toEqual(["gin", "lime"]);
      expect(slugs(result)).toEqual(["gimlet"]);
    });

    it("refuses a feature that names no ingredient", async () => {
      for (const feature of ["  ", "()", '"', "( )"]) {
        await expect(
          makeable(ctx, { feature: [feature] }),
          JSON.stringify(feature),
        ).rejects.toMatchObject({ code: "validation" });
      }
      await expect(makeable(ctx, { feature: ["()"] })).rejects.toMatchObject({
        details: {
          issues: [
            expect.objectContaining({
              message: "A feature must name an ingredient, e.g. lime",
            }),
          ],
        },
      });
    });
  });

  /* 41i review: `--remote` / RECIPE_API_URL against any editor. */
  describe("over HTTP", () => {
    const ORIGIN = "http://old-editor.test:3000";
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function answer(body: unknown) {
      const seen: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL) => {
          seen.push(String(input));
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }),
      );
      return seen;
    }

    /* What a route from before 41i answers: no scope, features or link. */
    const OLD = {
      query: "tag:drink",
      staples: true,
      inventory: 2,
      total: 1,
      unjudged: 0,
      canMake: [],
      oneAway: [{ slug: "vodka-sour", name: "Vodka Sour" }],
      twoAway: [],
      further: 0,
      buyNext: [],
    };

    it("names an editor from before 41i when a feature was asked for", async () => {
      const seen = answer(OLD);
      const backend = createHttpBackend({ baseUrl: ORIGIN });
      await expect(
        backend.inventoryMakeable({ query: "tag:drink", feature: ["lime"] }),
      ).rejects.toThrow(
        `The editor at ${ORIGIN} predates featuring (41i) — update it, or run with --content-dir.`,
      );
      expect(seen[0]).toContain("feature=lime");
      /* Without a feature the old answer is still an answer… */
      const plain = await backend.inventoryMakeable({ query: "tag:drink" });
      expect(plain.total).toBe(1);
      /* …and the text output doesn't trip over its missing fields. */
      const text = inventoryCommands.make.format(plain);
      expect(text).toContain('1 recipes for "tag:drink", 2 items on hand');
      expect(text).not.toContain("undefined");
      expect(text).not.toContain("On the site");
    });

    it("sends beanSwaps=0 only when bean swaps are off, and reads an old answer (42m)", async () => {
      const seen = answer(OLD);
      const backend = createHttpBackend({ baseUrl: ORIGIN });
      await backend.inventoryMakeable({ query: "tag:drink" });
      const plain = await backend.inventoryMakeable({
        query: "tag:drink",
        beanSwaps: false,
      });
      expect(seen[0]).not.toContain("beanSwaps");
      expect(seen[1]).toContain("beanSwaps=0");
      /* An editor from before 42m answers without the tier: no swap lines. */
      const text = inventoryCommands.make.format(plain);
      expect(text).not.toContain("bean swap");
      expect(text).not.toContain("undefined");
      /* A 42m answer prints the tier after the buckets. */
      const swapped = inventoryCommands.make.format({
        ...OLD,
        beanSwaps: true,
        beanSwap: [
          {
            slug: "two-bean-salad",
            name: "Two Bean Salad",
            swaps: [{ line: "chickpea", use: "pinto beans" }],
          },
        ],
      } as never);
      expect(swapped).toContain("With a bean swap (1)");
      expect(swapped).toContain("    swap: pinto beans for chickpea");
    });

    it("makes the link absolute on the editor that answered", async () => {
      answer({
        ...OLD,
        scope: "tag:drink ingredient:lime",
        features: ["lime"],
        link: "/make?q=tag%3Adrink+ingredient%3Alime",
        alwaysHave: ["salt"],
      });
      const result = await createHttpBackend({
        baseUrl: `${ORIGIN}/`,
      }).inventoryMakeable({ query: "tag:drink", feature: ["lime"] });
      expect(result.link).toBe(
        `${ORIGIN}/make?q=tag%3Adrink+ingredient%3Alime`,
      );
    });
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

describe("the CLI's make flags (41i review)", () => {
  const OPTIONS = {
    query: { type: "string" },
    feature: { type: "string", multiple: true },
    limit: { type: "string" },
    json: { type: "boolean" },
  } as const;

  it("takes a negation inline, and never a flag as a value", () => {
    expect(
      protectDashedPositionals(["--query", "-tag:drink", "--json"], OPTIONS),
    ).toEqual(["--query=-tag:drink", "--json"]);
    /* `--feature --json` stays two flags, for parseArgs to refuse. */
    expect(protectDashedPositionals(["--feature", "--json"], OPTIONS)).toEqual([
      "--feature",
      "--json",
    ]);
    expect(
      protectDashedPositionals(["--query", "--limit", "5"], OPTIONS),
    ).toEqual(["--query", "--limit", "--", "5"]);
    expect(
      protectDashedPositionals(["-tag:drink", "--feature", "lime"], OPTIONS),
    ).toEqual(["--feature", "lime", "--", "-tag:drink"]);
  });

  it("makes a link absolute only on an http(s) base", () => {
    expect(absoluteLink("/make?q=", "http://editor.test:3000/x")).toBe(
      "http://editor.test:3000/make?q=",
    );
    expect(absoluteLink("/make?q=", undefined)).toBe("/make?q=");
    expect(absoluteLink("/make?q=", "not a url")).toBe("/make?q=");
    expect(absoluteLink("/make?q=", "file:///x")).toBe("/make?q=");
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
