// @vitest-environment node
//
// The editor's shared shopping list (epic 35, 35c): one file per item under
// `shopping/items/` in a real git repository, so every write's commit — and
// the merge between two devices that D1 is designed for — is observable.
// And the boundary that keeps the list out of the static export.

import {
  mkdtemp,
  outputFile,
  pathExists,
  readdir,
  readFile,
  rm,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { commitTestHooks } from "@discontent/cms/git/commit";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import { createGroup } from "../websites/recipe-website/editor/controller/curation/groups";
import { patchInventory } from "../websites/recipe-website/editor/controller/curation/inventory";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { mergeIdOf } from "recipe-website-common/util/shoppingMerges";
import {
  SHOPPING_ITEMS_DIRECTORY,
  SHOPPING_LAYERS_DIRECTORY,
  SHOPPING_LIST_PATHS,
  SHOPPING_MERGES_DIRECTORY,
  SHOPPING_RULES_DIRECTORY,
  SHOPPING_SETTINGS_FILE,
  shoppingTestHooks,
  addShoppingLayer,
  readShoppingLayers,
  readShoppingRules,
  removeShoppingLayer,
  setShoppingLayer,
  setShoppingLeaveOff,
  addToShopping,
  clearShopping,
  decideShoppingMerge,
  patchShopping,
  readShoppingMerges,
  splitShoppingMerge,
  readShopping,
  readShoppingView,
  updateShoppingSettings,
} from "../websites/recipe-website/editor/controller/curation/shopping";

/*
 * Real git commits per case: a second or so alone, much more on a loaded
 * machine (CI, or a worker beside a build). Vitest's 5 s default is too tight.
 */
vi.setConfig({ testTimeout: 30_000 });

const AUTHOR = { name: "Test Curator", email: "curator@test.local" };

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;
const extraDirectories: string[] = [];

/** The same ordering `curationGit.test.ts` explains (T49). */
async function initTestRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await configure(repo);
  await writeFile(
    join(directory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

async function configure(repo: SimpleGit): Promise<void> {
  await repo.addConfig("user.email", AUTHOR.email);
  await repo.addConfig("user.name", AUTHOR.name);
  await repo.addConfig("commit.gpgsign", "false");
}

async function messages(repo: SimpleGit = git): Promise<string[]> {
  return (await repo.log()).all.map((entry) => entry.message);
}

async function filesIn(commit: string): Promise<string[]> {
  return (await git.raw(["show", "--name-only", "--format=", commit]))
    .split("\n")
    .filter(Boolean);
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "shopping-"));
  git = await initTestRepo(contentDirectory);
  ctx = { contentDirectory, author: AUTHOR };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  shoppingTestHooks.beforeFile = undefined;
  shoppingTestHooks.maxItems = undefined;
  commitTestHooks.beforeUpdateRef = undefined;
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
  for (const directory of extraDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function chocolateChipCookies() {
  return createRecipe(ctx, {
    name: "Chocolate Chip Cookies",
    ingredients: [
      "2 1/4 cups all-purpose flour",
      "1 cup butter, softened",
      "2 large eggs",
      { ingredient: "For the topping", type: "heading" },
      "Flaky sea salt, to taste",
    ],
  });
}

describe("readShopping", () => {
  it("reads nothing as an empty list with the default settings", async () => {
    const result = await readShopping(ctx);
    expect(result.items).toEqual([]);
    expect(result.settings.features).toMatchObject({
      merge: true,
      stores: false,
    });
    expect(result.path).toBe(join(contentDirectory, "shopping"));
  });
});

describe("addToShopping", () => {
  it("adds a recipe's lines, one file each, in one commit", async () => {
    await chocolateChipCookies();
    const result = await addToShopping(ctx, {
      recipe: "chocolate-chip-cookies",
      scale: "2",
    });
    expect(result.changed).toBe(true);
    expect(result.added.map((item) => item.text)).toEqual([
      "2 1/4 cups all-purpose flour",
      "1 cup butter, softened",
      "2 large eggs",
      "Flaky sea salt, to taste",
    ]);
    expect(result.added[0]).toEqual({
      id: result.added[0].id,
      text: "2 1/4 cups all-purpose flour",
      recipe: "chocolate-chip-cookies",
      recipeName: "Chocolate Chip Cookies",
      line: 0,
      scale: "2",
    });
    /* The heading is skipped; the line after it keeps its index. */
    expect(result.added[3]).toMatchObject({ line: 4, optional: true });
    /* Ids sort in the order the lines were added. */
    const ids = result.added.map((item) => item.id);
    expect([...ids].sort()).toEqual(ids);
    expect(ids[0]).toMatch(/^[0-9a-z]{26}$/);

    expect((await messages())[0]).toBe(
      "Update shopping list: +Chocolate Chip Cookies ×2 (4 items)",
    );
    const [head] = (await git.log()).all;
    expect((await filesIn(head.hash)).sort()).toEqual(
      ids.map((id) => `shopping/items/${id}.json`).sort(),
    );
    expect((await git.status()).isClean()).toBe(true);

    /* The file: known keys in a fixed order, no timestamps, a newline. */
    const file = await readFile(
      join(contentDirectory, SHOPPING_ITEMS_DIRECTORY, `${ids[0]}.json`),
      "utf8",
    );
    expect(file).toBe(
      `${JSON.stringify(
        {
          id: ids[0],
          text: "2 1/4 cups all-purpose flour",
          recipe: "chocolate-chip-cookies",
          recipeName: "Chocolate Chip Cookies",
          line: 0,
          scale: "2",
        },
        null,
        2,
      )}\n`,
    );
  });

  it("refuses a recipe that does not exist, without a --force hint", async () => {
    await expect(addToShopping(ctx, { recipe: "nope" })).rejects.toMatchObject({
      code: "unknown_recipe",
      message: "No recipe at slug: nope.",
    });
    await expect(addToShopping(ctx, { group: "nope" })).rejects.toMatchObject({
      code: "unknown_group",
    });
    expect(await messages()).toEqual(["Initial commit"]);
  });

  it("refuses an input naming two sources, or a scale on typed lines", async () => {
    await expect(
      addToShopping(ctx, { recipe: "a", group: "b" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      addToShopping(ctx, { items: ["eggs"], scale: "2" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      addToShopping(ctx, { recipe: "a", scale: "0" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("adds a meal plan through its nested plans, scale multiplied down", async () => {
    await createRecipe(ctx, {
      name: "Chili",
      ingredients: ["1 lb ground beef", "1 onion"],
    });
    await createRecipe(ctx, {
      name: "Cornbread",
      ingredients: ["1 cup cornmeal"],
    });
    await createGroup(
      ctx,
      {
        name: "Sides",
        slug: "sides",
        items: [{ recipe: "cornbread" }, { recipe: "ghost" }],
      },
      { force: true },
    );
    await createGroup(ctx, {
      name: "Week of Oct 19",
      slug: "week-of-oct-19",
      items: [{ recipe: "chili", scale: "2" }, { group: "sides" }],
    });
    const before = (await messages()).length;

    const result = await addToShopping(ctx, {
      group: "week-of-oct-19",
      scale: "1/2",
    });
    expect(
      result.added.map(({ text, recipe, scale, via }) => ({
        text,
        recipe,
        scale,
        via,
      })),
    ).toEqual([
      /* 2 × ½ = 1: no scale stored. */
      {
        text: "1 lb ground beef",
        recipe: "chili",
        scale: undefined,
        via: ["week-of-oct-19"],
      },
      {
        text: "1 onion",
        recipe: "chili",
        scale: undefined,
        via: ["week-of-oct-19"],
      },
      {
        text: "1 cup cornmeal",
        recipe: "cornbread",
        scale: "1/2",
        via: ["week-of-oct-19", "sides"],
      },
    ]);
    expect(result.missing).toEqual({ recipes: ["ghost"], groups: [] });
    expect(result.warnings).toEqual([
      "Skipped recipes that do not exist: ghost.",
    ]);
    const log = await messages();
    expect(log).toHaveLength(before + 1);
    expect(log[0]).toBe("Update shopping list: +Week of Oct 19 ×1/2 (3 items)");

    /* Removing the sub-plan's source takes only what came through it. */
    const removed = await patchShopping(ctx, {
      removeSource: { group: "sides" },
    });
    expect(removed.removed).toHaveLength(1);
    expect(removed.items.map((item) => item.recipe)).toEqual([
      "chili",
      "chili",
    ]);
    expect((await messages())[0]).toBe("Update shopping list: -Sides (1 item)");
  });

  it("adds lines typed by hand", async () => {
    const result = await addToShopping(ctx, {
      items: ["paper towels", "2 lemons"],
    });
    expect(result.added).toEqual([
      { id: result.added[0].id, text: "paper towels", manual: true },
      { id: result.added[1].id, text: "2 lemons", manual: true },
    ]);
    expect((await messages())[0]).toBe(
      "Update shopping list: +paper towels +2 lemons",
    );
  });

  it("commits nothing for a recipe with no lines", async () => {
    await createRecipe(ctx, { name: "Toast" });
    const before = await messages();
    const result = await addToShopping(ctx, { recipe: "toast" });
    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual(["Toast has no ingredient lines."]);
    expect(await messages()).toEqual(before);
  });
});

describe("sub-recipes (38d)", () => {
  async function lemonade() {
    await createRecipe(ctx, {
      name: "Simple Syrup",
      ingredients: ["1/2 cup sugar", "1/2 cup water"],
    });
    await createRecipe(ctx, {
      name: "Lemonade",
      ingredients: [
        "1 cup lemon juice",
        "2 batches [Simple Syrup](/recipe/simple-syrup)",
        "1/4 cup sugar",
        "1 batch [Lavender Syrup](/recipe/lavender-syrup)",
      ],
    });
  }

  it("adds a linked sub-recipe's lines, scaled, in the one commit", async () => {
    await lemonade();
    const result = await addToShopping(ctx, { recipe: "lemonade" });
    expect(
      result.added.map(({ text, line, scale, for: path }) => ({
        text,
        line,
        scale,
        for: path,
      })),
    ).toEqual([
      { text: "1 cup lemon juice", line: 0, scale: undefined, for: undefined },
      {
        text: "1/2 cup sugar",
        line: 0,
        scale: "2",
        for: [{ slug: "simple-syrup", name: "Simple Syrup" }],
      },
      {
        text: "1/2 cup water",
        line: 1,
        scale: "2",
        for: [{ slug: "simple-syrup", name: "Simple Syrup" }],
      },
      { text: "1/4 cup sugar", line: 2, scale: undefined, for: undefined },
      /* The sub-recipe that does not exist: the line as written. */
      {
        text: "1 batch Lavender Syrup",
        line: 3,
        scale: undefined,
        for: undefined,
      },
    ]);
    expect(result.added[1].recipe).toBe("lemonade");
    expect(result.warnings).toEqual([
      'Kept "1 batch Lavender Syrup" as written: there is no recipe "lavender-syrup".',
    ]);
    expect((await messages())[0]).toBe(
      "Update shopping list: +Lemonade (5 items)",
    );

    /* The syrup's sugar merges with the lemonade's own, sources kept. */
    const { view } = await readShoppingView(ctx);
    const sugar = view.stores[0].sections
      .flatMap((section) => section.rows)
      .find((row) => row.nameKey === "granulated sugar");
    expect(sugar).toMatchObject({
      label: "1¼ cups granulated sugar",
      forNote: "partly for Simple Syrup",
    });
    expect(sugar?.sources?.map((source) => source.for?.[0]?.slug)).toEqual([
      "simple-syrup",
      undefined,
    ]);

    /* Through a plan, the plan's scale multiplies the batches. */
    await createGroup(ctx, {
      name: "Party",
      slug: "party",
      items: [{ recipe: "lemonade", scale: "2" }],
    });
    const plan = await addToShopping(ctx, { group: "party" });
    expect(plan.added.map((item) => item.scale)).toEqual([
      "2",
      "4",
      "4",
      "2",
      "2",
    ]);
  });

  it("adds the lines as written with the switch off", async () => {
    await lemonade();
    await updateShoppingSettings(ctx, { features: { subRecipes: false } });
    const result = await addToShopping(ctx, { recipe: "lemonade" });
    expect(result.added.map((item) => item.text)).toEqual([
      "1 cup lemon juice",
      "2 batches Simple Syrup",
      "1/4 cup sugar",
      "1 batch Lavender Syrup",
    ]);
    expect(result.warnings).toBeUndefined();
  });
});

describe("undo a sub-recipe expansion (39c)", () => {
  async function recipes() {
    await createRecipe(ctx, {
      name: "Simple Syrup",
      ingredients: ["1/2 cup sugar", "1/2 cup water"],
    });
    await createRecipe(ctx, {
      name: "Lavender Syrup",
      ingredients: [
        "1 batch [Simple Syrup](/recipe/simple-syrup)",
        "2 Tbsp dried lavender",
      ],
    });
    await createRecipe(ctx, {
      name: "Lemonade",
      ingredients: [
        "1 cup lemon juice",
        "1 batch [Simple Syrup](/recipe/simple-syrup)",
        "1/4 cup sugar",
      ],
    });
    await createRecipe(ctx, {
      name: "Lavender Lemonade",
      ingredients: [
        "1 cup lemon juice",
        "1 batch [Lavender Syrup](/recipe/lavender-syrup)",
      ],
    });
  }
  const texts = (items: { text: string }[]) => items.map((item) => item.text);

  it("removes the sub-recipe's lines in one commit; a merged row keeps the recipe's own line", async () => {
    await recipes();
    await addToShopping(ctx, { recipe: "lemonade" });
    const before = (await messages()).length;
    const result = await patchShopping(ctx, {
      removeSource: { for: "simple-syrup" },
    });
    expect(result.removed).toHaveLength(2);
    expect(texts(result.items)).toEqual(["1 cup lemon juice", "1/4 cup sugar"]);
    expect((await messages()).length).toBe(before + 1);
    expect((await messages())[0]).toBe(
      "Update shopping list: -for Simple Syrup (2 items)",
    );
    /* The sugar row was shared with the syrup: now only the lemonade's. */
    const { view } = await readShoppingView(ctx);
    const sugar = view.stores[0].sections
      .flatMap((section) => section.rows)
      .find((row) => row.nameKey === "granulated sugar");
    expect(sugar?.label).toBe("¼ cup granulated sugar");
    expect(sugar?.forNote).toBeUndefined();
  });

  it("takes an item whole, at any depth of its path: nested lines go with either sub-recipe", async () => {
    await recipes();
    await addToShopping(ctx, { recipe: "lavender-lemonade" });
    /* Lavender Syrup's own lavender, and its Simple Syrup's two lines. */
    expect(
      (await readShopping(ctx)).items.map((item) =>
        item.for?.map((sub) => sub.slug),
      ),
    ).toEqual([
      undefined,
      ["lavender-syrup", "simple-syrup"],
      ["lavender-syrup", "simple-syrup"],
      ["lavender-syrup"],
    ]);

    /* The inner one: its lines go whole — never left as "for Lavender Syrup". */
    const inner = await patchShopping(ctx, {
      removeSource: { for: "simple-syrup" },
    });
    expect(texts(inner.items)).toEqual([
      "1 cup lemon juice",
      "2 Tbsp dried lavender",
    ]);
    expect(inner.items[1].for).toEqual([
      { slug: "lavender-syrup", name: "Lavender Syrup" },
    ]);

    await addToShopping(ctx, { recipe: "lavender-lemonade" });
    const outer = await patchShopping(ctx, {
      removeSource: { for: "lavender-syrup" },
    });
    /* The outer one takes what is under it too. */
    expect(texts(outer.items)).toEqual([
      "1 cup lemon juice",
      "1 cup lemon juice",
    ]);
    expect((await messages())[0]).toBe(
      "Update shopping list: -for Lavender Syrup (4 items)",
    );
  });

  it("takes the sub-recipe's lines from every recipe that expanded it, and nothing else", async () => {
    await recipes();
    await addToShopping(ctx, { recipe: "lemonade" });
    await addToShopping(ctx, { recipe: "lavender-lemonade" });
    await addToShopping(ctx, { items: ["simple syrup"] });
    const result = await patchShopping(ctx, {
      removeSource: { for: "simple-syrup" },
    });
    expect(result.removed).toHaveLength(4);
    expect(texts(result.items)).toEqual([
      "1 cup lemon juice",
      "1/4 cup sugar",
      "1 cup lemon juice",
      "2 Tbsp dried lavender",
      "simple syrup",
    ]);
  });

  it("reports a sub-recipe with no lines on the list, and commits nothing", async () => {
    await recipes();
    await addToShopping(ctx, { recipe: "lemonade" });
    const before = (await messages()).length;
    const result = await patchShopping(ctx, {
      removeSource: { for: "lavender-syrup" },
    });
    expect(result).toMatchObject({
      changed: false,
      removed: [],
      unmatched: ["lavender-syrup"],
    });
    expect((await messages()).length).toBe(before);
  });

  it("refuses a source naming two of recipe, group and for", async () => {
    await expect(
      patchShopping(ctx, {
        removeSource: { recipe: "lemonade", for: "simple-syrup" },
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("OR: items go with their line (38d)", () => {
  async function blossoms() {
    await createRecipe(ctx, {
      name: "Blossoms",
      ingredients: [
        "1 large egg",
        "1/2 cup (100g) granulated sugar",
        "OR: 1/4 cup (50g) green sanding sugar and 1/4 cup (50g) red sanding sugar",
        "OR: 1/2 cup turbinado sugar",
      ],
    });
    return (await addToShopping(ctx, { recipe: "blossoms" })).added;
  }

  it("a name tick takes the folded OR: items along, and so does Clear", async () => {
    const added = await blossoms();
    const ticked = await patchShopping(ctx, { names: ["granulated sugar"] });
    expect([...ticked.updated].sort()).toEqual(
      [added[1].id, added[2].id, added[3].id].sort(),
    );
    const untick = await patchShopping(ctx, {
      uncheckNames: ["granulated sugar"],
    });
    expect(untick.updated).toHaveLength(3);

    await patchShopping(ctx, { names: ["granulated sugar"] });
    const cleared = await clearShopping(ctx);
    expect(cleared.items.map((item) => item.text)).toEqual(["1 large egg"]);
  });

  it("Clear drops an OR: item whose line it removes, ticked or not", async () => {
    const added = await blossoms();
    /* The line ticked by id alone, as an older editor would. */
    await patchShopping(ctx, { check: [added[1].id] });
    const cleared = await clearShopping(ctx);
    expect([...cleared.removed].sort()).toEqual(
      [added[1].id, added[2].id, added[3].id].sort(),
    );
    expect(cleared.items.map((item) => item.text)).toEqual(["1 large egg"]);
  });
});

describe("patchShopping", () => {
  it("ticks by id and by name, one commit each, and no-ops commit nothing", async () => {
    await chocolateChipCookies();
    await addToShopping(ctx, { recipe: "chocolate-chip-cookies" });
    const { added } = await addToShopping(ctx, {
      items: ["eggs", "1 cup flour"],
    });
    const { items } = await readShopping(ctx);
    const flour = items.find((item) => item.text.includes("all-purpose"));

    const byId = await patchShopping(ctx, { check: [flour!.id] });
    expect(byId).toMatchObject({ changed: true, updated: [flour!.id] });
    expect((await messages())[0]).toBe(
      "Update shopping list: ✓all purpose flour",
    );

    /* "I bought eggs": every egg line, the recipe's and the typed one. */
    const byName = await patchShopping(ctx, { names: ["eggs", "kale"] });
    expect(byName.updated).toHaveLength(2);
    expect(byName.unmatched).toEqual(["kale"]);
    expect(
      byName.items.filter((item) => item.checked).map((item) => item.text),
    ).toEqual(["2 1/4 cups all-purpose flour", "2 large eggs", "eggs"]);
    expect((await messages())[0]).toBe("Update shopping list: ✓eggs");

    const before = await messages();
    const again = await patchShopping(ctx, {
      check: [flour!.id],
      names: ["eggs"],
      uncheck: ["01jzzzzzzzzzzzzzzzzzzzzzzz"],
    });
    expect(again).toMatchObject({
      changed: false,
      unknown: ["01jzzzzzzzzzzzzzzzzzzzzzzz"],
    });
    expect(await messages()).toEqual(before);

    /* The file says `checked: true`, and nothing else changed in it. */
    const egg = added[0];
    expect(
      JSON.parse(
        await readFile(
          join(contentDirectory, SHOPPING_ITEMS_DIRECTORY, `${egg.id}.json`),
          "utf8",
        ),
      ),
    ).toEqual({ id: egg.id, text: "eggs", manual: true, checked: true });

    const unticked = await patchShopping(ctx, { uncheckNames: ["egg"] });
    expect(unticked.updated).toHaveLength(2);
    expect((await messages())[0]).toBe("Update shopping list: ☐egg");
  });

  it("flags, moves to a store and removes, removal winning", async () => {
    const { added } = await addToShopping(ctx, {
      items: ["eggs", "milk", "bread"],
    });
    const [eggs, milk, bread] = added.map((item) => item.id);
    const result = await patchShopping(ctx, {
      need: [eggs],
      set: { ids: [milk], store: "market-basket" },
      check: [bread],
      remove: [bread],
    });
    expect(result.removed).toEqual([bread]);
    expect(result.items).toEqual([
      { id: eggs, text: "eggs", manual: true, need: true },
      { id: milk, text: "milk", manual: true, store: "market-basket" },
    ]);
    expect((await messages())[0]).toBe(
      "Update shopping list: ✓bread need:egg milk→market-basket −bread",
    );
    expect(
      await pathExists(
        join(contentDirectory, SHOPPING_ITEMS_DIRECTORY, `${bread}.json`),
      ),
    ).toBe(false);
    const [head] = (await git.log()).all;
    expect(await filesIn(head.hash)).toContain(`shopping/items/${bread}.json`);

    await expect(
      patchShopping(ctx, { set: { ids: [milk], store: "costco" } }),
    ).rejects.toMatchObject({ code: "validation" });
    const cleared = await patchShopping(ctx, {
      set: { ids: [milk], store: null },
      unneed: [eggs],
    });
    expect(cleared.items).toEqual([
      { id: eggs, text: "eggs", manual: true },
      { id: milk, text: "milk", manual: true },
    ]);
  });

  it("removes what one recipe put there", async () => {
    await chocolateChipCookies();
    await addToShopping(ctx, { recipe: "chocolate-chip-cookies" });
    await addToShopping(ctx, { items: ["milk"] });
    const result = await patchShopping(ctx, {
      removeSource: { recipe: "chocolate-chip-cookies" },
    });
    expect(result.removed).toHaveLength(4);
    expect(result.items.map((item) => item.text)).toEqual(["milk"]);
    expect((await messages())[0]).toBe(
      "Update shopping list: -Chocolate Chip Cookies (4 items)",
    );
  });

  it("refuses an empty patch", async () => {
    await expect(patchShopping(ctx, {})).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("clearShopping", () => {
  it("clears the ticked items by default, everything with all", async () => {
    const { added } = await addToShopping(ctx, {
      items: ["eggs", "milk", "bread"],
    });
    await patchShopping(ctx, { check: [added[0].id, added[2].id] });

    const checked = await clearShopping(ctx);
    expect(checked.removed).toEqual([added[0].id, added[2].id]);
    expect(checked.items.map((item) => item.text)).toEqual(["milk"]);
    expect((await messages())[0]).toBe("Clear shopping list: 2 checked");

    const before = await messages();
    expect((await clearShopping(ctx, { scope: "checked" })).changed).toBe(
      false,
    );
    expect(await messages()).toEqual(before);

    const all = await clearShopping(ctx, { scope: "all" });
    expect(all.items).toEqual([]);
    expect((await messages())[0]).toBe("Clear shopping list: all 1 item");
    expect((await git.status()).isClean()).toBe(true);
  });
});

describe("updateShoppingSettings", () => {
  it("merges a change over the defaults, keys overrides by name, one commit", async () => {
    const result = await updateShoppingSettings(ctx, {
      features: { stores: true },
      storeOverrides: { Eggs: "market-basket" },
      aisleOverrides: { "Corn Tortillas": "bakery" },
    });
    expect(result.changed).toBe(true);
    expect(result.settings.features).toMatchObject({
      stores: true,
      merge: true,
    });
    expect(result.settings.storeOverrides).toEqual({ egg: "market-basket" });
    expect(result.settings.aisleOverrides).toEqual({
      "corn tortilla": "bakery",
    });
    expect((await messages())[0]).toBe("Update shopping list settings");
    const stored = JSON.parse(
      await readFile(join(contentDirectory, SHOPPING_SETTINGS_FILE), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual([
      "features",
      "aisleOrder",
      "stores",
      "defaultStore",
      "storeByAisle",
      "aisleOverrides",
      "storeOverrides",
    ]);

    /* The same change again: nothing written. */
    const before = await messages();
    expect(
      (
        await updateShoppingSettings(ctx, {
          features: { stores: true },
          storeOverrides: { eggs: "market-basket" },
        })
      ).changed,
    ).toBe(false);
    expect(await messages()).toEqual(before);

    /* And the view routes by it. */
    await addToShopping(ctx, { items: ["6 eggs", "1 cup flour"] });
    const { view, text } = await readShoppingView(ctx);
    expect(view.stores.map((list) => [list.store?.id, list.count])).toEqual([
      ["market-basket", 1],
      ["hannaford", 1],
    ]);
    expect(text).toBe(
      "MARKET BASKET\n\nDairy & eggs:\n6 eggs\n\nHANNAFORD\n\nPantry:\n1 cup flour",
    );
    const hannaford = await readShoppingView(ctx, { store: "hannaford" });
    expect(hannaford.text).toBe("HANNAFORD\n\nPantry:\n1 cup flour");
    await expect(
      readShoppingView(ctx, { store: "costco" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("refuses a store that does not exist, and drops a removed store's routes", async () => {
    await expect(
      updateShoppingSettings(ctx, { defaultStore: "costco" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      updateShoppingSettings(ctx, { storeByAisle: { produce: "costco" } }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(updateShoppingSettings(ctx, {})).rejects.toMatchObject({
      code: "validation",
    });

    const result = await updateShoppingSettings(ctx, {
      stores: [{ id: "hannaford", name: "Hannaford" }],
    });
    expect(result.settings).toMatchObject({
      stores: [{ id: "hannaford", name: "Hannaford" }],
      defaultStore: "hannaford",
      storeByAisle: {},
    });
  });
});

describe("the on-hand fold reads the shared inventory", () => {
  it("folds what the on-hand list covers", async () => {
    await patchInventory(ctx, { add: ["flour"] });
    await updateShoppingSettings(ctx, { features: { onHand: true } });
    await addToShopping(ctx, { items: ["1 cup flour", "2 eggs", "salt"] });
    const { view, text } = await readShoppingView(ctx);
    expect(view.onHand.map((row) => row.nameKey)).toEqual(["flour", "salt"]);
    expect(text).toBe(
      "Dairy & eggs:\n2 eggs\n\nProbably on hand:\n1 cup flour\nsalt",
    );
  });
});

describe("write safety", () => {
  it("refuses mid-merge before writing anything", async () => {
    const head = (await git.revparse(["HEAD"])).trim();
    const marker = join(contentDirectory, ".git", "MERGE_HEAD");
    await writeFile(marker, `${head}\n`);
    try {
      const code = (error: unknown) => toErrorObject(error).error.code;
      expect(
        code(await addToShopping(ctx, { items: ["eggs"] }).catch((e) => e)),
      ).toBe("dirty_tree");
      expect(
        code(
          await updateShoppingSettings(ctx, {
            features: { stores: true },
          }).catch((e) => e),
        ),
      ).toBe("dirty_tree");
      expect(await pathExists(join(contentDirectory, "shopping"))).toBe(false);
    } finally {
      await rm(marker, { force: true });
    }
  });

  it("serialises concurrent writes: both land, one commit each", async () => {
    const [a, b] = await Promise.all([
      addToShopping(ctx, { items: ["eggs"] }),
      addToShopping(ctx, { items: ["milk"] }),
    ]);
    expect(a.changed && b.changed).toBe(true);
    const { items } = await readShopping(ctx);
    expect(items.map((item) => item.text).sort()).toEqual(["eggs", "milk"]);
    expect((await messages()).slice(0, 2).sort()).toEqual([
      "Update shopping list: +eggs",
      "Update shopping list: +milk",
    ]);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("merges two devices' adds and ticks without a conflict (D1)", async () => {
    const cloneA = await mkdtemp(join(tmpdir(), "shopping-a-"));
    const cloneB = await mkdtemp(join(tmpdir(), "shopping-b-"));
    extraDirectories.push(cloneA, cloneB);
    await simpleGit().clone(contentDirectory, cloneA);
    await simpleGit().clone(contentDirectory, cloneB);
    const gitA = simpleGit({ baseDir: cloneA });
    const gitB = simpleGit({ baseDir: cloneB });
    await configure(gitA);
    await configure(gitB);
    const ctxA: CurationContext = { contentDirectory: cloneA, author: AUTHOR };
    const ctxB: CurationContext = { contentDirectory: cloneB, author: AUTHOR };

    /* A shared item both devices will tick, already on both. */
    const shared = (await addToShopping(ctxA, { items: ["bread"] })).added[0];
    await gitB.raw(["pull", "--no-rebase", "--no-edit", cloneA, "HEAD"]);

    const x = (await addToShopping(ctxA, { items: ["eggs"] })).added[0];
    await patchShopping(ctxA, { check: [x.id, shared.id] });
    const y = (await addToShopping(ctxB, { items: ["milk"] })).added[0];
    await patchShopping(ctxB, { check: [y.id, shared.id] });

    await gitB.raw(["pull", "--no-rebase", "--no-edit", cloneA, "HEAD"]);
    const status = await gitB.status();
    expect(status.conflicted).toEqual([]);
    expect(status.isClean()).toBe(true);
    const log = await messages(gitB);
    expect(log[0]).toMatch(/^Merge /);

    const { items } = await readShopping(ctxB);
    expect(
      items
        .map(({ text, checked }) => ({ text, checked }))
        .sort((a, b) => a.text.localeCompare(b.text)),
    ).toEqual([
      { text: "bread", checked: true },
      { text: "eggs", checked: true },
      { text: "milk", checked: true },
    ]);
  });
});

describe("review round (35c)", () => {
  it("refuses a plan that fans out past the walk cap, adding nothing", async () => {
    await createRecipe(ctx, { name: "Leaf", ingredients: ["1 egg"] });
    /* Each level lists the next twice: 2^10 = 1024 recipe rows. */
    await createGroup(ctx, {
      name: "Level 10",
      slug: "level-10",
      items: [{ recipe: "leaf" }],
    });
    for (let i = 9; i >= 0; i--) {
      await createGroup(ctx, {
        name: `Level ${i}`,
        slug: `level-${i}`,
        items: [{ group: `level-${i + 1}` }, { group: `level-${i + 1}` }],
      });
    }
    const before = await messages();
    await expect(
      addToShopping(ctx, { group: "level-0" }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("more than 500 recipe rows"),
    });
    expect(await messages()).toEqual(before);
    /* Under the cap it adds as usual: 2^8 = 256 rows. */
    expect((await addToShopping(ctx, { group: "level-2" })).added).toHaveLength(
      256,
    );
  });

  it("refuses an add that would take the list past its cap", async () => {
    await createRecipe(ctx, {
      name: "Simple Syrup",
      ingredients: ["1/2 cup sugar", "1/2 cup water"],
    });
    await createRecipe(ctx, {
      name: "Syrup Soda",
      ingredients: ["1 batch [Simple Syrup](/recipe/simple-syrup)"],
    });
    /*
     * Files laid down by hand, uncommitted: only the count matters here. A
     * cap of 20 in place of `MAX_SHOPPING_ITEMS` (40f): the same check, but
     * 5 000 files written and read back on every add timed out at 60 s
     * under load.
     */
    shoppingTestHooks.maxItems = 20;
    const items = join(contentDirectory, SHOPPING_ITEMS_DIRECTORY);
    for (let i = 0; i < shoppingTestHooks.maxItems - 1; i++) {
      const id = `01j${String(i).padStart(23, "0")}`;
      await outputFile(
        join(items, `${id}.json`),
        `${JSON.stringify({ id, text: "salt" })}\n`,
      );
    }
    await expect(
      addToShopping(ctx, { items: ["eggs", "milk"] }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.not.stringContaining("Sub-recipes"),
    });
    /* One line, opened into two: the message says why (38d). */
    await expect(
      addToShopping(ctx, { recipe: "syrup-soda" }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining(
        "Sub-recipes went on as their own lines",
      ),
    });
    expect((await addToShopping(ctx, { items: ["eggs"] })).changed).toBe(true);
  });

  it("commits what a failed patch wrote as (partial), leaving the tree clean", async () => {
    const { added } = await addToShopping(ctx, {
      items: ["eggs", "milk", "bread"],
    });
    shoppingTestHooks.beforeFile = (_path, index) => {
      if (index === 1) throw new Error("disk full");
    };
    await expect(
      patchShopping(ctx, { check: added.map((item) => item.id) }),
    ).rejects.toThrow("disk full");
    expect((await messages())[0]).toBe(
      "Update shopping list: ✓egg ✓milk ✓bread (partial)",
    );
    expect((await git.status()).isClean()).toBe(true);
    const { items } = await readShopping(ctx);
    expect(items.filter((item) => item.checked)).toHaveLength(1);

    /* The same for a clear's deletions. */
    const fail = shoppingTestHooks.beforeFile;
    shoppingTestHooks.beforeFile = undefined;
    await patchShopping(ctx, { check: added.map((item) => item.id) });
    shoppingTestHooks.beforeFile = fail;
    await expect(clearShopping(ctx)).rejects.toThrow("disk full");
    expect((await messages())[0]).toBe(
      "Clear shopping list: 3 checked (partial)",
    );
    expect((await git.status()).isClean()).toBe(true);
    expect((await readShopping(ctx)).items).toHaveLength(2);
  });

  it("puts every file back when the commit itself fails", async () => {
    const { added } = await addToShopping(ctx, { items: ["eggs", "milk"] });
    await updateShoppingSettings(ctx, { features: { stores: true } });
    const before = await messages();
    commitTestHooks.beforeUpdateRef = async () => {
      throw new Error("ref locked");
    };
    await expect(
      patchShopping(ctx, {
        check: [added[0].id],
        remove: [added[1].id],
      }),
    ).rejects.toThrow();
    await expect(addToShopping(ctx, { items: ["bread"] })).rejects.toThrow();
    await expect(
      updateShoppingSettings(ctx, { features: { stores: false } }),
    ).rejects.toThrow();
    commitTestHooks.beforeUpdateRef = undefined;

    expect(await messages()).toEqual(before);
    expect((await git.status()).isClean()).toBe(true);
    expect((await readShopping(ctx)).items).toEqual(added);
    expect((await readShopping(ctx)).settings.features.stores).toBe(true);
  });

  it("reports a patch that nets out to nothing as no change, and commits nothing", async () => {
    const { added } = await addToShopping(ctx, { items: ["eggs"] });
    const before = await messages();
    const result = await patchShopping(ctx, {
      check: [added[0].id],
      uncheck: [added[0].id],
    });
    expect(result).toMatchObject({ changed: false, updated: [] });
    expect(await messages()).toEqual(before);
  });

  it("collapses control characters in typed lines", async () => {
    const { added } = await addToShopping(ctx, {
      items: ["paper\ntowels\t", "\u0007lemons"],
    });
    expect(added.map((item) => item.text)).toEqual(["paper towels", "lemons"]);
    await expect(addToShopping(ctx, { items: ["\n\t"] })).rejects.toMatchObject(
      { code: "validation" },
    );
  });

  it("caps override changes, and applies an override to an unnamed line", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [`thing ${i}`, "pantry"]),
    );
    await expect(
      updateShoppingSettings(ctx, { aisleOverrides: many }),
    ).rejects.toMatchObject({ code: "validation" });

    await addToShopping(ctx, { items: ["12"] });
    await updateShoppingSettings(ctx, { aisleOverrides: { "12": "frozen" } });
    const { view } = await readShoppingView(ctx);
    expect(view.stores[0].sections.map((section) => section.aisle)).toEqual([
      "frozen",
    ]);
  });
});

/**
 * 49a: merge decisions — one file each under `shopping/merges/`, one commit
 * per write, the view and the name ticks following them.
 */
describe("merge decisions", () => {
  const FLOUR = mergeIdOf(["white flour", "all purpose flour"]);

  async function flourList() {
    return addToShopping(ctx, {
      items: ["1 cup white flour", "2 cups AP flour"],
    });
  }

  it("lists the open proposal on the read, and a merge writes one file in one commit", async () => {
    await flourList();
    const before = await readShoppingView(ctx);
    expect(before.merges).toEqual([]);
    expect(before.proposals).toHaveLength(1);
    expect(before.proposals[0]).toMatchObject({
      id: FLOUR,
      line: "3 cups all-purpose flour",
    });

    const result = await decideShoppingMerge(ctx, {
      id: FLOUR,
      status: "merged",
    });
    expect(result.changed).toBe(true);
    expect(result.decision).toMatchObject({
      id: FLOUR,
      keys: ["all purpose flour", "white flour"],
      status: "merged",
    });
    expect((await messages())[0]).toBe(
      "Update shopping list: merge all purpose flour + white flour",
    );
    const [head] = (await git.log()).all;
    expect(await filesIn(head.hash)).toEqual([`shopping/merges/${FLOUR}.json`]);
    expect((await git.status()).isClean()).toBe(true);
    const file = JSON.parse(
      await readFile(
        join(contentDirectory, SHOPPING_MERGES_DIRECTORY, `${FLOUR}.json`),
        "utf8",
      ),
    );
    expect(Object.keys(file)).toEqual(["id", "keys", "status", "decidedAt"]);

    const after = await readShoppingView(ctx);
    expect(after.proposals).toEqual([]);
    expect(after.merges.map((merge) => merge.id)).toEqual([FLOUR]);
    expect(after.text).toBe("Pantry:\n3 cups all-purpose flour");
  });

  it("stores an edited name and amount for the items the row covers, and the same answer twice commits once", async () => {
    const { items } = await flourList();
    const result = await decideShoppingMerge(ctx, {
      id: FLOUR,
      status: "merged",
      name: "flour",
      amount: "1 bag",
    });
    expect(result.decision?.amount).toEqual({
      text: "1 bag",
      ids: items.map((item) => item.id).sort(),
    });
    expect((await messages())[0]).toBe(
      "Update shopping list: merge all purpose flour + white flour → flour",
    );
    expect((await readShoppingView(ctx)).text).toBe("Pantry:\n1 bag flour");

    const count = (await messages()).length;
    const again = await decideShoppingMerge(ctx, {
      keys: ["white flour", "all purpose flour"],
      status: "merged",
      name: "flour",
    });
    expect(again.changed).toBe(false);
    expect((await messages()).length).toBe(count);
  });

  it("49c: an ask's amount holds to the lines it was worked out for; a changed list shows its sum and says so", async () => {
    const { items } = await flourList();
    const asked = [items[0].id];
    const result = await decideShoppingMerge(ctx, {
      id: FLOUR,
      status: "merged",
      amount: "≈ 360 g",
      amountFor: asked,
    });
    expect(result.decision?.amount).toEqual({ text: "≈ 360 g", ids: asked });
    /* The row covers both lines now, not the one the sum was for. */
    const view = await readShoppingView(ctx);
    expect(view.text).toBe("Pantry:\n3 cups all-purpose flour");
    await expect(
      decideShoppingMerge(ctx, {
        id: FLOUR,
        status: "merged",
        amountFor: asked,
      }),
    ).rejects.toThrow();
  });

  it("keeps apart, then splits — one commit each — and the proposal returns", async () => {
    await flourList();
    const apart = await decideShoppingMerge(ctx, {
      id: FLOUR,
      status: "apart",
    });
    expect(apart.decision?.status).toBe("apart");
    expect((await messages())[0]).toBe(
      "Update shopping list: keep apart all purpose flour + white flour",
    );
    expect((await readShoppingView(ctx)).proposals).toEqual([]);

    const split = await splitShoppingMerge(ctx, { id: FLOUR });
    expect(split).toMatchObject({ changed: true, removed: [FLOUR] });
    expect((await messages())[0]).toBe(
      "Update shopping list: ask again about all purpose flour + white flour",
    );
    expect(await readShoppingMerges(ctx)).toEqual([]);
    expect((await readShoppingView(ctx)).proposals).toHaveLength(1);
    const [head] = (await git.log()).all;
    expect(await filesIn(head.hash)).toEqual([`shopping/merges/${FLOUR}.json`]);

    const count = (await messages()).length;
    expect((await splitShoppingMerge(ctx, { id: FLOUR })).changed).toBe(false);
    expect((await messages()).length).toBe(count);
  });

  it("splits a merged row back into its names", async () => {
    await flourList();
    await decideShoppingMerge(ctx, { id: FLOUR, status: "merged" });
    await splitShoppingMerge(ctx, { id: FLOUR });
    expect((await messages())[0]).toBe(
      "Update shopping list: split all purpose flour + white flour",
    );
    const { view } = await readShoppingView(ctx);
    expect(view.counts.rows).toBe(2);
  });

  it("folds a merge a wider one covers into it, deleting the old file in the same commit", async () => {
    await flourList();
    await decideShoppingMerge(ctx, { id: FLOUR, status: "merged" });
    await addToShopping(ctx, { items: ["1 cup unbleached flour"] });
    const { proposals } = await readShoppingView(ctx);
    expect(proposals).toHaveLength(1);
    const wider = await decideShoppingMerge(ctx, {
      id: proposals[0].id,
      status: "merged",
    });
    expect(wider.removed).toEqual([FLOUR]);
    expect(wider.merges.map((merge) => merge.keys)).toEqual([
      ["all purpose flour", "unbleached flour", "white flour"],
    ]);
    const [head] = (await git.log()).all;
    expect((await filesIn(head.hash)).sort()).toEqual(
      [
        `shopping/merges/${FLOUR}.json`,
        `shopping/merges/${proposals[0].id}.json`,
      ].sort(),
    );
    expect((await readShoppingView(ctx)).text).toBe(
      "Pantry:\n4 cups all-purpose flour",
    );
  });

  it("keeps the name and note of a merge that grows, and drops its amount", async () => {
    await flourList();
    await decideShoppingMerge(ctx, {
      id: FLOUR,
      status: "merged",
      name: "King Arthur AP",
      amount: "1 bag",
      note: "the red bag",
    });
    await addToShopping(ctx, { items: ["1 cup unbleached flour"] });
    const [proposal] = (await readShoppingView(ctx)).proposals;
    expect(proposal.name).toBe("King Arthur AP");
    expect(proposal.line).toBe("4 cups King Arthur AP");
    const wider = await decideShoppingMerge(ctx, {
      id: proposal.id,
      status: "merged",
    });
    expect(wider.decision).toMatchObject({
      name: "King Arthur AP",
      note: "the red bag",
    });
    expect(wider.decision?.amount).toBeUndefined();
  });

  it("49b: an accepted answer that narrows a merge replaces it in one commit, not absorbed back", async () => {
    await flourList();
    await addToShopping(ctx, { items: ["1 cup unbleached flour"] });
    const [three] = (await readShoppingView(ctx)).proposals;
    await decideShoppingMerge(ctx, { id: three.id, status: "merged" });
    const count = (await messages()).length;

    const narrower = await decideShoppingMerge(ctx, {
      keys: ["all purpose flour", "white flour"],
      status: "merged",
      note: "the unbleached is for bread",
      replaces: three.id,
    });
    expect(narrower.removed).toEqual([three.id]);
    expect(narrower.decision).toMatchObject({
      id: FLOUR,
      keys: ["all purpose flour", "white flour"],
      note: "the unbleached is for bread",
    });
    expect((await messages()).length).toBe(count + 1);
    const [head] = (await git.log()).all;
    expect((await filesIn(head.hash)).sort()).toEqual(
      [
        `shopping/merges/${FLOUR}.json`,
        `shopping/merges/${three.id}.json`,
      ].sort(),
    );
    expect((await readShoppingMerges(ctx)).map((merge) => merge.id)).toEqual([
      FLOUR,
    ]);
    expect((await readShoppingView(ctx)).view.counts.rows).toBe(2);

    /* Kept apart in its place: the same names, so the same file, rewritten. */
    const kept = await decideShoppingMerge(ctx, {
      keys: ["all purpose flour", "white flour"],
      status: "apart",
      note: "different after all",
      replaces: FLOUR,
    });
    expect(kept).toMatchObject({
      changed: true,
      removed: [],
      decision: { id: FLOUR, status: "apart", note: "different after all" },
    });
  });

  it("49b: refuses a `replaces` that names no merged row sharing a name, and writes nothing", async () => {
    await flourList();
    await addToShopping(ctx, { items: ["1 tsp salt", "1 pinch sea salt"] });
    const salt = await decideShoppingMerge(ctx, {
      keys: ["salt", "sea salt"],
      status: "merged",
    });
    const count = (await messages()).length;
    for (const replaces of [salt.decision!.id, "0123456789abcdef"]) {
      await expect(
        decideShoppingMerge(ctx, {
          keys: ["all purpose flour", "white flour"],
          status: "merged",
          replaces,
        }),
      ).rejects.toMatchObject({ code: "validation" });
    }
    expect((await messages()).length).toBe(count);
    expect((await readShoppingMerges(ctx)).map((merge) => merge.id)).toEqual([
      salt.decision!.id,
    ]);
  });

  it("ticks a merged row by any of its names, or by its merged name", async () => {
    await flourList();
    await decideShoppingMerge(ctx, { id: FLOUR, status: "merged" });
    const ticked = await patchShopping(ctx, { names: ["all-purpose flour"] });
    expect(ticked.updated).toHaveLength(2);
    const unticked = await patchShopping(ctx, {
      uncheckNames: ["white flour"],
    });
    expect(unticked.updated).toHaveLength(2);
  });

  it("refuses an unknown id, an amount for names not on the list, and a name for keeping apart", async () => {
    await expect(
      decideShoppingMerge(ctx, { id: FLOUR, status: "merged" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      decideShoppingMerge(ctx, {
        keys: ["white flour", "all purpose flour"],
        status: "merged",
        amount: "1 bag",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      decideShoppingMerge(ctx, {
        keys: ["white flour", "all purpose flour"],
        status: "apart",
        name: "x",
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      splitShoppingMerge(ctx, { id: "../../etc/passwd" }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await messages()).toEqual(["Initial commit"]);
  });
});

/**
 * The static export never reads the list: nothing under `common/` or
 * `export/` names the items directory or imports the seat (D8). `common/`'s
 * `shoppingView.ts` and `shoppingTypes.ts` are pure and never touch a file.
 */
describe("50a: this list's layers and the rules for every list", () => {
  async function pearList() {
    const { added } = await addToShopping(ctx, {
      items: [
        "1 1/2 cups strained pear poaching liquid",
        "1/4 cup cold water",
        "2 cups flour",
      ],
    });
    return added;
  }

  it("adds a layer as one file in one commit, composes it, and turns it off and on", async () => {
    const [liquid, , flour] = await pearList();
    const before = await readShoppingView(ctx);
    expect(before.text).toBe(
      "Produce:\n1½ cups strained pear poaching liquid\n\nPantry:\n2 cups flour",
    );
    expect(before.view.leftOff.map((off) => off.reason)).toEqual(["tap water"]);

    const added = await addShoppingLayer(ctx, {
      ops: [
        { op: "drop", ids: [liquid.id], reason: "the recipe makes it" },
        { op: "note", ids: [flour.id], text: "the 5 lb bag" },
      ],
      reason: "the poaching makes it",
    });
    expect(added.changed).toBe(true);
    const id = added.layer!.id;
    expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect((await messages())[0]).toBe(
      "Update shopping list: change: Leave off strained pear poaching liquid: the recipe makes it; Note on flour: the 5 lb bag (the poaching makes it)",
    );
    const [head] = (await git.log()).all;
    expect(await filesIn(head.hash)).toEqual([`shopping/layers/${id}.json`]);
    expect(SHOPPING_LIST_PATHS.layers).toBe(SHOPPING_LAYERS_DIRECTORY);
    const file = JSON.parse(
      await readFile(
        join(contentDirectory, SHOPPING_LAYERS_DIRECTORY, `${id}.json`),
        "utf8",
      ),
    );
    expect(Object.keys(file)).toEqual([
      "id",
      "ops",
      "reason",
      "by",
      "at",
      "on",
    ]);
    expect(file.by).toEqual({ kind: "you" });

    const composed = await readShoppingView(ctx);
    expect(composed.layers.map((layer) => layer.id)).toEqual([id]);
    expect(composed.text).toBe("Pantry:\n2 cups flour\n  · the 5 lb bag");
    expect(
      composed.view.leftOff.map((off) => [off.source, off.reason]),
    ).toEqual([
      ["built-in", "tap water"],
      ["layer", "the recipe makes it"],
    ]);
    const asWritten = await readShoppingView(ctx, { asWritten: true });
    expect(asWritten.asWritten).toBe(true);
    expect(asWritten.view.leftOff).toEqual([]);
    expect(asWritten.text).toContain("¼ cup water");

    const off = await setShoppingLayer(ctx, { id, on: false });
    expect(off.changed).toBe(true);
    expect((await messages())[0]).toMatch(
      /^Update shopping list: change off: /,
    );
    expect((await readShoppingView(ctx)).text).toBe(before.text);
    /* The same again changes nothing and commits nothing. */
    const count = (await messages()).length;
    expect((await setShoppingLayer(ctx, { id, on: false })).changed).toBe(
      false,
    );
    expect((await messages()).length).toBe(count);
    await setShoppingLayer(ctx, { id, on: true });
    expect((await readShoppingView(ctx)).text).toBe(composed.text);

    const removed = await removeShoppingLayer(ctx, { id });
    expect(removed).toMatchObject({ changed: true, removed: [id] });
    expect(await readShoppingLayers(ctx)).toEqual([]);
    expect((await removeShoppingLayer(ctx, { id })).changed).toBe(false);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("refuses an item not on the list, a merge of one item, and an unknown change", async () => {
    const [liquid] = await pearList();
    const count = (await messages()).length;
    await expect(
      addShoppingLayer(ctx, {
        ops: [{ op: "drop", ids: ["01jzzzzzzzzzzzzzzzzzzzzzzz"], reason: "x" }],
      }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    await expect(
      addShoppingLayer(ctx, {
        ops: [{ op: "merge", ids: [liquid.id, liquid.id] }],
      }),
    ).rejects.toThrow(/two or more different items/);
    await expect(
      addShoppingLayer(ctx, {
        ops: [{ op: "amount", ids: [liquid.id], amount: "1 cup", unit: "g" }],
      }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    await expect(
      setShoppingLayer(ctx, { id: "01kaaaaaaaaaaaaaaaaaaaaaaa", on: false }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    expect((await messages()).length).toBe(count);
  });

  it("Restore of water writes a rule; leaving it off again deletes it; a person's leave-off restores to nothing", async () => {
    await pearList();
    const restored = await setShoppingLeaveOff(ctx, {
      name: "cold water",
      leaveOff: false,
    });
    expect(restored.changed).toBe(true);
    expect(restored.rule).toMatchObject({ key: "water", leaveOff: false });
    expect((await messages())[0]).toBe("Update shopping list: buy water again");
    const [head] = (await git.log()).all;
    expect(await filesIn(head.hash)).toEqual([
      `shopping/rules/${restored.rule!.id}.json`,
    ]);
    expect((await readShoppingView(ctx)).text).toContain("¼ cup water");
    expect(
      (await setShoppingLeaveOff(ctx, { name: "water", leaveOff: false }))
        .changed,
    ).toBe(false);

    const again = await setShoppingLeaveOff(ctx, {
      name: "water",
      leaveOff: true,
    });
    expect(again.changed).toBe(true);
    expect(await readShoppingRules(ctx)).toEqual([]);
    expect((await readShoppingView(ctx)).text).not.toContain("water");

    await setShoppingLeaveOff(ctx, {
      name: "flour",
      leaveOff: true,
      reason: "a sack in the pantry",
    });
    const view = await readShoppingView(ctx);
    expect(view.view.leftOff.map((off) => off.reason)).toContain(
      "a sack in the pantry",
    );
    expect(view.rules).toHaveLength(1);
    await setShoppingLeaveOff(ctx, { name: "flour", leaveOff: false });
    expect(await readShoppingRules(ctx)).toEqual([]);
    expect(SHOPPING_RULES_DIRECTORY).toBe("shopping/rules");
    expect((await git.status()).isClean()).toBe(true);
  });

  it("a removal that takes a layer's last items takes the layer in the same commit; clear all takes every layer", async () => {
    const [liquid, water, flour] = await pearList();
    const one = (
      await addShoppingLayer(ctx, {
        ops: [{ op: "drop", ids: [liquid.id], reason: "made" }],
      })
    ).layer!;
    const both = (
      await addShoppingLayer(ctx, {
        ops: [{ op: "merge", ids: [water.id, flour.id], name: "batter" }],
      })
    ).layer!;
    /* One of the merge's two lines goes: the layer stays. */
    const partly = await patchShopping(ctx, { remove: [water.id] });
    expect(partly.removedLayers).toBeUndefined();
    expect((await readShoppingLayers(ctx)).map((layer) => layer.id)).toEqual([
      one.id,
      both.id,
    ]);
    const gone = await patchShopping(ctx, { remove: [liquid.id] });
    expect(gone.removedLayers).toEqual([one.id]);
    const [head] = (await git.log()).all;
    expect((await filesIn(head.hash)).sort()).toEqual(
      [
        `shopping/items/${liquid.id}.json`,
        `shopping/layers/${one.id}.json`,
      ].sort(),
    );
    const cleared = await clearShopping(ctx, { scope: "all" });
    expect(cleared.removedLayers).toEqual([both.id]);
    expect(await readShoppingLayers(ctx)).toEqual([]);
    expect((await git.status()).isClean()).toBe(true);
  });
});

describe("the export never reads the shopping list", () => {
  const SITE = join(
    dirname(fileURLToPath(import.meta.url)),
    "../websites/recipe-website",
  );

  async function sourceFiles(directory: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".next", "out"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
      else if (/\.(tsx?|mjs|js)$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it("no common/ or export/ file imports curation/shopping or names shopping/items or shopping/merges", async () => {
    const files = [
      ...(await sourceFiles(join(SITE, "common"))),
      ...(await sourceFiles(join(SITE, "export"))),
    ];
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/curation\/shopping/.test(source)) {
        violations.push(`${relative(SITE, file)} imports curation/shopping`);
      }
      if (/shopping\/items/.test(source)) {
        violations.push(`${relative(SITE, file)} names shopping/items`);
      }
      /* 49a: nor the merge decisions' directory. */
      if (/shopping\/merges/.test(source)) {
        violations.push(`${relative(SITE, file)} names shopping/merges`);
      }
      /* 50a: nor the layers' or the rules'. */
      if (/shopping\/(?:layers|rules)/.test(source)) {
        violations.push(`${relative(SITE, file)} names a 50a directory`);
      }
    }
    expect(violations).toEqual([]);
  });
});
