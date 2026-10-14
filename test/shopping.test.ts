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
import {
  MAX_SHOPPING_ITEMS,
  SHOPPING_ITEMS_DIRECTORY,
  SHOPPING_SETTINGS_FILE,
  shoppingTestHooks,
  addToShopping,
  clearShopping,
  patchShopping,
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
  }, 30_000);

  it("refuses an add that would take the list past its cap", async () => {
    /* Files laid down by hand, uncommitted: only the count matters here. */
    const items = join(contentDirectory, SHOPPING_ITEMS_DIRECTORY);
    for (let i = 0; i < MAX_SHOPPING_ITEMS - 1; i++) {
      const id = `01j${String(i).padStart(23, "0")}`;
      await outputFile(
        join(items, `${id}.json`),
        `${JSON.stringify({ id, text: "salt" })}\n`,
      );
    }
    await expect(
      addToShopping(ctx, { items: ["eggs", "milk"] }),
    ).rejects.toMatchObject({ code: "validation" });
    expect((await addToShopping(ctx, { items: ["eggs"] })).changed).toBe(true);
  }, 60_000);

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
 * The static export never reads the list: nothing under `common/` or
 * `export/` names the items directory or imports the seat (D8). `common/`'s
 * `shoppingView.ts` and `shoppingTypes.ts` are pure and never touch a file.
 */
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

  it("no common/ or export/ file imports curation/shopping or names shopping/items", async () => {
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
    }
    expect(violations).toEqual([]);
  });
});
