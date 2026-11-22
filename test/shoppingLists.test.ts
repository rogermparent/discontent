// @vitest-environment node
//
// 50d: saved shopping lists. The main list keeps its old paths; every other
// list is a record under `shopping/lists/<id>/` beside its own items,
// layers and tidy runs. A real git repository, so every write's one commit
// is observable.

import { mkdtemp, pathExists, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import { createGroup } from "../websites/recipe-website/editor/controller/curation/groups";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  SHOPPING_LISTS_DIRECTORY,
  SHOPPING_LIST_PATHS,
  addShoppingLayer,
  addToShopping,
  clearShopping,
  createShoppingList,
  deleteShoppingList,
  editShoppingList,
  patchShopping,
  readShopping,
  readShoppingLists,
  readShoppingView,
  resolveShoppingList,
  shoppingListPaths,
  shoppingListsForPlan,
} from "../websites/recipe-website/editor/controller/curation/shopping";
import {
  MAIN_SHOPPING_LIST,
  canonicalShoppingListRecord,
  isMainListName,
  listStorageKey,
  listSummaryText,
  parseShoppingListRecord,
  sortListSummaries,
} from "recipe-website-common/util/shoppingLists";

vi.setConfig({ testTimeout: 30_000 });

const AUTHOR = { name: "Test Curator", email: "curator@test.local" };

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

async function initTestRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await repo.addConfig("user.email", AUTHOR.email);
  await repo.addConfig("user.name", AUTHOR.name);
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

async function filesIn(commit: string): Promise<string[]> {
  return (await git.raw(["show", "--name-only", "--format=", commit]))
    .split("\n")
    .filter(Boolean)
    .sort();
}

async function headFiles(): Promise<string[]> {
  const [head] = (await git.log()).all;
  return filesIn(head.hash);
}

function on(list: string): CurationContext {
  return { ...ctx, shoppingList: list };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toErrorObject(error).error.code;
  }
  return "none";
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "shopping-lists-"));
  git = await initTestRepo(contentDirectory);
  ctx = { contentDirectory, author: AUTHOR };
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

describe("a list's paths (Dd1)", () => {
  it("keeps the main list where it always was", () => {
    expect(shoppingListPaths(MAIN_SHOPPING_LIST)).toBe(SHOPPING_LIST_PATHS);
    expect(SHOPPING_LIST_PATHS).toEqual({
      items: "shopping/items",
      layers: "shopping/layers",
      tidy: "shopping/tidy",
    });
  });

  it("puts a saved list's own files under its directory", () => {
    const id = "01kaaaaaaaaaaaaaaaaaaaaaaa";
    expect(shoppingListPaths(id)).toEqual({
      items: `shopping/lists/${id}/items`,
      layers: `shopping/lists/${id}/layers`,
      tidy: `shopping/lists/${id}/tidy`,
    });
    expect(SHOPPING_LISTS_DIRECTORY).toBe("shopping/lists");
  });

  it("refuses an id that is not a list's", () => {
    expect(() => shoppingListPaths("../items")).toThrow(/ULID/);
    expect(() => shoppingListPaths("Thanksgiving")).toThrow(/ULID/);
  });
});

describe("the list record", () => {
  it("round-trips through its canonical form, keys in order", () => {
    const id = "01kaaaaaaaaaaaaaaaaaaaaaaa";
    const record = canonicalShoppingListRecord({
      archived: true,
      plan: "thanksgiving",
      created: "2026-11-21T10:00:00.000Z",
      name: "Thanksgiving",
      id,
    });
    expect(Object.keys(record)).toEqual([
      "id",
      "name",
      "created",
      "plan",
      "archived",
    ]);
    expect(
      parseShoppingListRecord(JSON.parse(JSON.stringify(record)), id),
    ).toEqual(record);
  });

  it("reads leniently: the directory is the id, a falsy flag no key", () => {
    const id = "01kaaaaaaaaaaaaaaaaaaaaaaa";
    expect(
      parseShoppingListRecord(
        {
          id: "something-else",
          name: "  Party \n list ",
          created: "2026-11-21T10:00:00.000Z",
          archived: false,
          plan: "",
        },
        id,
      ),
    ).toEqual({ id, name: "Party list", created: "2026-11-21T10:00:00.000Z" });
    expect(parseShoppingListRecord({ name: "x" }, id)).toBeNull();
    expect(
      parseShoppingListRecord({ name: "x", created: "t" }, "not-an-id"),
    ).toBeNull();
  });

  it("knows the main list's names and its storage keys", () => {
    expect(isMainListName("main")).toBe(true);
    expect(isMainListName(" Main  List ")).toBe(true);
    expect(isMainListName("Mainly")).toBe(false);
    expect(listStorageKey("shopping-held-ticks", "main")).toBe(
      "shopping-held-ticks",
    );
    expect(listStorageKey("shopping-held-ticks", "01kaa")).toBe(
      "shopping-held-ticks:01kaa",
    );
  });

  it("sorts the main list first, newest next, deleted last", () => {
    const sorted = sortListSummaries([
      { id: "a", name: "Old", created: "2026-01-01", items: 0, left: 0 },
      {
        id: "b",
        name: "Gone",
        created: "2026-12-01",
        archived: true,
        items: 0,
        left: 0,
      },
      { id: "main", name: "Main list", main: true, items: 3, left: 2 },
      { id: "c", name: "New", created: "2026-11-01", items: 1, left: 1 },
    ]);
    expect(sorted.map((list) => list.id)).toEqual(["main", "c", "a", "b"]);
    expect(listSummaryText(sorted[0])).toBe("Main list · 2 of 3 left");
    expect(
      listSummaryText({
        id: "d",
        name: "Thanksgiving dinner",
        planName: "Thanksgiving",
        items: 1,
        left: 1,
      }),
    ).toBe("Thanksgiving dinner · 1 item · Thanksgiving");
  });
});

describe("saved lists in the seat", () => {
  async function pancakes() {
    return createRecipe(ctx, {
      name: "Pancakes",
      ingredients: ["2 cups flour", "2 eggs", "1 cup milk"],
    });
  }

  it("makes a blank list in one commit, and the main list is untouched", async () => {
    await pancakes();
    await addToShopping(ctx, { recipe: "pancakes" });
    const mainBefore = (await readShopping(ctx)).items;

    const made = await createShoppingList(ctx, { name: "Party" });
    expect(made.changed).toBe(true);
    expect(made.list).toMatchObject({ name: "Party", items: 0, left: 0 });
    const id = made.list.id;
    expect(id).toMatch(/^[0-9a-z]{26}$/);
    expect((await messages())[0]).toBe("New shopping list: Party");
    expect(await headFiles()).toEqual([`shopping/lists/${id}/list.json`]);
    const record = JSON.parse(
      await readFile(
        join(contentDirectory, "shopping", "lists", id, "list.json"),
        "utf8",
      ),
    );
    expect(Object.keys(record)).toEqual(["id", "name", "created"]);

    /* Add to the new list: its own items, the subject names it. */
    const added = await addToShopping(on(id), { recipe: "pancakes" });
    expect(added.items).toHaveLength(3);
    expect((await messages())[0]).toBe(
      'Update shopping list "Party": +Pancakes (3 items)',
    );
    expect(await headFiles()).toEqual(
      added.added
        .map((item) => `shopping/lists/${id}/items/${item.id}.json`)
        .sort(),
    );
    /* The main list is as it was. */
    expect((await readShopping(ctx)).items).toEqual(mainBefore);
    expect((await readShopping(on(id))).list).toEqual({ id, name: "Party" });
    expect((await readShopping(ctx)).list).toEqual({
      id: "main",
      name: "Main list",
      main: true,
    });

    /* A body's own `list` does the same as the context's. */
    await addToShopping(ctx, { items: ["paper towels"], list: id });
    expect((await readShopping(on(id))).items).toHaveLength(4);
    expect((await readShopping(ctx)).items).toEqual(mainBefore);

    const lists = await readShoppingLists(ctx);
    expect(
      lists.map(({ name, items, left }) => ({ name, items, left })),
    ).toEqual([
      { name: "Main list", items: 3, left: 3 },
      { name: "Party", items: 4, left: 4 },
    ]);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("makes a list from a meal plan: named after it, its recipes at the plan's scale, one commit", async () => {
    await pancakes();
    await createRecipe(ctx, {
      name: "Syrup",
      ingredients: ["1 cup maple syrup"],
    });
    await createGroup(ctx, {
      name: "Brunch",
      slug: "brunch",
      items: [{ recipe: "pancakes", scale: "2" }, { recipe: "syrup" }],
    });
    const before = (await messages()).length;

    const made = await createShoppingList(ctx, {
      plan: "brunch",
      scale: "1/2",
    });
    expect((await messages()).length).toBe(before + 1);
    expect((await messages())[0]).toBe(
      "New shopping list: Brunch (+Brunch ×1/2 (4 items))",
    );
    const id = made.list.id;
    expect(made.list).toMatchObject({
      name: "Brunch",
      plan: "brunch",
      planName: "Brunch",
      items: 4,
    });
    expect(await headFiles()).toEqual(
      [
        `shopping/lists/${id}/list.json`,
        ...made.added!.map(
          (item) => `shopping/lists/${id}/items/${item.id}.json`,
        ),
      ].sort(),
    );
    /* 2 × ½ = 1 for the pancakes; ½ for the syrup. */
    expect(
      made.added!.map(({ text, scale, via }) => ({ text, scale, via })),
    ).toEqual([
      { text: "2 cups flour", scale: undefined, via: ["brunch"] },
      { text: "2 eggs", scale: undefined, via: ["brunch"] },
      { text: "1 cup milk", scale: undefined, via: ["brunch"] },
      { text: "1 cup maple syrup", scale: "1/2", via: ["brunch"] },
    ]);
    expect((await readShopping(ctx)).items).toEqual([]);

    /* The plan's page finds it; a second one takes a free name. */
    expect(
      (await shoppingListsForPlan(ctx, "brunch")).map((list) => list.id),
    ).toEqual([id]);
    const again = await createShoppingList(ctx, { plan: "brunch" });
    expect(again.list.name).toBe("Brunch (2)");
    expect(
      (await shoppingListsForPlan(ctx, "brunch")).map((list) => list.id),
    ).toEqual([again.list.id, id]);

    /* `shopping add --group` into a list scales as the plan says, too. */
    const blank = await createShoppingList(ctx, { name: "Blank" });
    const plan = await addToShopping(on(blank.list.id), {
      group: "brunch",
      scale: "2",
    });
    expect(plan.added.map((item) => item.scale)).toEqual(["4", "4", "4", "2"]);
    expect(await codeOf(createShoppingList(ctx, { plan: "ghost" }))).toBe(
      "unknown_group",
    );
  });

  it("keeps each list's ticks and layers its own", async () => {
    await pancakes();
    const party = (await createShoppingList(ctx, { name: "Party" })).list.id;
    const main = await addToShopping(ctx, { recipe: "pancakes" });
    const other = await addToShopping(on(party), { recipe: "pancakes" });

    /* "I bought eggs" on the party list ticks only its eggs. */
    const ticked = await patchShopping(on(party), { names: ["eggs"] });
    expect(ticked.updated).toEqual([other.added[1].id]);
    expect((await readShopping(ctx)).items.some((item) => item.checked)).toBe(
      false,
    );
    /* An id of the main list is not on the party list. */
    const unknown = await patchShopping(on(party), {
      check: [main.added[0].id],
    });
    expect(unknown.changed).toBe(false);
    expect(unknown.unknown).toEqual([main.added[0].id]);

    /* A change on one list names its items, never the other's. */
    expect(
      await codeOf(
        addShoppingLayer(on(party), {
          ops: [{ op: "drop", ids: [main.added[2].id], reason: "no" }],
        }),
      ),
    ).toBe("validation");
    const layer = await addShoppingLayer(on(party), {
      ops: [{ op: "drop", ids: [other.added[2].id], reason: "have milk" }],
    });
    expect(await headFiles()).toEqual([
      `shopping/lists/${party}/layers/${layer.layer!.id}.json`,
    ]);
    expect((await readShopping(ctx)).layers).toEqual([]);
    const partyView = await readShoppingView(on(party));
    expect(partyView.view.leftOff.map((entry) => entry.reason)).toEqual([
      "have milk",
    ]);
    const mainView = await readShoppingView(ctx);
    expect(mainView.view.leftOff).toEqual([]);

    /* Done shopping on the party list clears its ticked line only. */
    const cleared = await clearShopping(on(party));
    expect(cleared.removed).toEqual([other.added[1].id]);
    expect((await messages())[0]).toBe(
      'Clear shopping list "Party": 1 checked',
    );
    expect((await readShopping(ctx)).items).toHaveLength(3);
  });

  it("finds a list by id or name, and says when it can't", async () => {
    const made = (await createShoppingList(ctx, { name: "Thanksgiving" })).list;
    expect((await resolveShoppingList(ctx, made.id)).id).toBe(made.id);
    expect((await resolveShoppingList(ctx, made.id.toUpperCase())).id).toBe(
      made.id,
    );
    expect((await resolveShoppingList(ctx, " thanksgiving ")).id).toBe(made.id);
    expect((await resolveShoppingList(ctx, "Main list")).id).toBe("main");
    expect((await resolveShoppingList(ctx, undefined)).id).toBe("main");
    expect(await codeOf(resolveShoppingList(ctx, "Christmas"))).toBe(
      "not_found",
    );
    expect(
      await codeOf(resolveShoppingList(ctx, "01kzzzzzzzzzzzzzzzzzzzzzzz")),
    ).toBe("not_found");
    /* Names are the list's: a typed one in use, or the main list's, is refused. */
    expect(
      await codeOf(createShoppingList(ctx, { name: "THANKSGIVING" })),
    ).toBe("validation");
    expect(await codeOf(createShoppingList(ctx, { name: "Main list" }))).toBe(
      "validation",
    );
    expect(await codeOf(createShoppingList(ctx, {}))).toBe("validation");
  });

  it("renames, deletes (archives) and restores, one commit each", async () => {
    await pancakes();
    const id = (await createShoppingList(ctx, { name: "Party" })).list.id;
    await addToShopping(on(id), { recipe: "pancakes" });

    const renamed = await editShoppingList(ctx, { id, name: "Birthday" });
    expect(renamed.changed).toBe(true);
    expect((await messages())[0]).toBe(
      "Rename shopping list: Party → Birthday",
    );
    expect(await headFiles()).toEqual([`shopping/lists/${id}/list.json`]);
    expect(
      (await editShoppingList(ctx, { id, name: "Birthday" })).changed,
    ).toBe(false);

    const deleted = await deleteShoppingList(ctx, { id });
    expect(deleted.list.archived).toBe(true);
    expect(deleted.lists.map((list) => list.id)).toEqual(["main"]);
    expect((await messages())[0]).toBe(
      "Delete shopping list: Birthday (3 items kept)",
    );
    /* Kept: readable, out of the switcher, refusing writes. */
    expect(
      await pathExists(join(contentDirectory, shoppingListPaths(id).items)),
    ).toBe(true);
    expect((await readShopping(on(id))).items).toHaveLength(3);
    expect((await readShoppingLists(ctx)).map((list) => list.id)).toEqual([
      "main",
    ]);
    expect(
      (await readShoppingLists(ctx, { all: true })).map((list) => list.id),
    ).toEqual(["main", id]);
    expect(await codeOf(addToShopping(on(id), { items: ["eggs"] }))).toBe(
      "validation",
    );
    /* A name of a deleted list is free again. */
    const reused = await createShoppingList(ctx, { name: "Birthday" });
    expect(await codeOf(editShoppingList(ctx, { id, archived: false }))).toBe(
      "validation",
    );
    await deleteShoppingList(ctx, { id: reused.list.id });

    const restored = await editShoppingList(ctx, { id, archived: false });
    expect(restored.list.archived).toBeUndefined();
    expect((await messages())[0]).toBe("Restore shopping list: Birthday");
    await addToShopping(on(id), { items: ["eggs"] });

    /* The main list keeps its name and stays. */
    expect(await codeOf(editShoppingList(ctx, { id: "main", name: "X" }))).toBe(
      "validation",
    );
    expect(await codeOf(deleteShoppingList(ctx, { id: "main" }))).toBe(
      "validation",
    );
    expect((await git.status()).isClean()).toBe(true);
  });
});

describe("the HTTP backend names the list (review 1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends ?list= on every shopping call, a clear's raw list too, never on /lists", async () => {
    const { createHttpBackend } =
      await import("../websites/recipe-website/editor/cli/backend/http");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ items: [], lists: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const backend = createHttpBackend({ baseUrl: "http://editor.test" });
    await backend.clearShopping({ scope: "all", list: "Party" });
    await backend.forShoppingList("01kaaaaaaaaaaaaaaaaaaaaaaa").getShopping();
    await backend.forShoppingList("Party").listShoppingLists();
    await backend.clearShopping({ scope: "checked" });
    expect(urls).toEqual([
      "http://editor.test/api/shopping?list=Party&scope=all",
      "http://editor.test/api/shopping?list=01kaaaaaaaaaaaaaaaaaaaaaaa",
      "http://editor.test/api/shopping/lists",
      "http://editor.test/api/shopping?scope=checked",
    ]);
  });
});
