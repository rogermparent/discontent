// @vitest-environment node
//
// The repo default is jsdom; this suite opens real LMDB environments in a
// temporary directory and stubs `fetch`, both of which want node.
//
// Harness copied from `test/groups.test.ts`: the *real* engine, the *real*
// `recipeContentConfig` / `groupContentConfig`, a tmpdir that is not a git
// repository (so `commitContentChanges` no-ops), and `contentDirectory` passed
// explicitly through every call — which is the thing the curation layer is
// built around (T16).
//
// What is worth pinning here is not that the engine writes files —
// `references.test.ts` and `groups.test.ts` already cover that — but the six
// claims this layer makes on top of it: that JSON input becomes the same data
// the browser form would have written, that a conflict is an error and not a
// clobber, that a patch's `null` clears and its `undefined` does not, that an
// import strips its own scaffolding, that search answers the way the browser
// does, and that the layer never imports anything that needs Next (D8).

import { mkdtemp, outputFile, pathExists, readJson, rm } from "fs-extra";
import { readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import {
  groupsByRecipe,
  type AppearsInEntry,
} from "../websites/recipe-website/common/controller/groupAggregateConfigs";
import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import type { Recipe } from "../websites/recipe-website/common/controller/types";

import {
  parseAuthor,
  resolveAuthor,
} from "../websites/recipe-website/editor/controller/curation/author";
import type {
  ContentWriteEvent,
  CurationContext,
} from "../websites/recipe-website/editor/controller/curation/context";
import { SlugConflictError } from "../websites/recipe-website/editor/controller/curation/errors";
import * as groups from "../websites/recipe-website/editor/controller/curation/groups";
import { importAndCreate } from "../websites/recipe-website/editor/controller/curation/importRecipe";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import { reindex } from "../websites/recipe-website/editor/controller/curation/reindex";
import { searchRecipes } from "../websites/recipe-website/editor/controller/curation/search";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "curation-"));
  ctx = { contentDirectory };
  /*
   * Only covers anything that still falls back to the ambient directory. The
   * curation layer must not have such a call site — the D8 case below is what
   * actually enforces that — but pointing it at the tmpdir keeps a regression
   * from silently writing into the checkout.
   */
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

function readRecipeFile(slug: string): Promise<Recipe> {
  return readJson(join(contentDirectory, "recipes/data", slug, "recipe.json"));
}

/** The folded "Appears in" map, as a recipe page would read it. */
function readAppearsIn(): Promise<Record<string, AppearsInEntry[]> | null> {
  return readAggregate({
    config: groupContentConfig,
    aggregateConfig: groupsByRecipe,
    contentDirectory,
  });
}

/* ------------------------------------------------------------------ */
/* 1. Create                                                           */
/* ------------------------------------------------------------------ */

describe("createRecipe", () => {
  it("shapes prose ingredients, normalizes tags and defaults slug and date", async () => {
    const before = Date.now();
    const result = await createRecipe(ctx, {
      name: "Chocolate Cake",
      description: "Rich.",
      tags: ["Dessert", "dessert", "  Baking  "],
      ingredients: ["2 cups flour", "1 tsp salt"],
      instructions: ["Mix.", { name: "Bake", text: "40 minutes." }],
    });

    expect(result.slug).toBe("chocolate-cake");
    expect(result.url).toBe("/recipe/chocolate-cake");
    expect(result.path).toBe(
      join(contentDirectory, "recipes/data", "chocolate-cake", "recipe.json"),
    );
    expect(result.date).toBeGreaterThanOrEqual(before);

    const stored = await readRecipeFile("chocolate-cake");
    /* `createIngredient`'s multiplier markup — the same thing the paste flow writes. */
    expect(stored.ingredients?.[0].ingredient).toContain(
      '<Multiplyable baseNumber="2"',
    );
    expect(stored.tags).toEqual(["dessert", "baking"]);
    expect(stored.instructions).toEqual([
      { text: "Mix." },
      { name: "Bake", text: "40 minutes." },
    ]);
    expect(stored.date).toBe(result.date);
    expect(stored.slug).toBeUndefined();
  });

  it("rejects unknown keys", async () => {
    await expect(
      createRecipe(ctx, { name: "Typo", ingredents: ["flour"] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  /* ---------------------------------------------------------------- */
  /* 2. Duplicate create                                               */
  /* ---------------------------------------------------------------- */

  it("refuses a duplicate slug with SlugConflictError", async () => {
    await createRecipe(ctx, { name: "Stew" });
    const error = await createRecipe(ctx, { name: "Stew" }).catch((e) => e);
    expect(error).toBeInstanceOf(SlugConflictError);
    expect(error.slug).toBe("stew");
  });

  /* ---------------------------------------------------------------- */
  /* 5. Overwrite                                                      */
  /* ---------------------------------------------------------------- */

  it("--overwrite deletes the old item's uploads rather than leaking them", async () => {
    await createRecipe(ctx, { name: "Stew", description: "First." });
    const uploadPath = join(
      contentDirectory,
      "uploads/recipe",
      "stew",
      "old.jpg",
    );
    await outputFile(uploadPath, "not really a jpeg");

    await createRecipe(
      ctx,
      { name: "Stew", description: "Second." },
      { overwrite: true },
    );

    expect(await pathExists(uploadPath)).toBe(false);
    expect((await readRecipeFile("stew")).description).toBe("Second.");
    expect((await listRecipes(ctx)).total).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 3 + 4. Update                                                       */
/* ------------------------------------------------------------------ */

describe("updateRecipe", () => {
  it("refuses a rename onto an occupied slug and leaves the source alone", async () => {
    await createRecipe(ctx, { name: "Stew", description: "Stewy." });
    await createRecipe(ctx, { name: "Soup" });

    const error = await updateRecipe(ctx, "stew", { slug: "soup" }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(SlugConflictError);
    expect(error.slug).toBe("soup");

    /* Both survive, and the source still has its own content. */
    expect((await readRecipeFile("stew")).description).toBe("Stewy.");
    expect((await readRecipeFile("soup")).name).toBe("Soup");
  });

  it("merges a patch, clears with null, and moves the index key on a date change", async () => {
    const created = await createRecipe(ctx, {
      name: "Stew",
      description: "Stewy.",
      tags: ["dinner"],
      imageImportUrl: "https://example.com/pictures/stew.jpg?w=800",
      videoUrl: "https://example.com/stew.mp4",
    });
    expect((await readRecipeFile("stew")).image).toBe("stew.jpg");

    /* A patch that touches one field leaves everything else exactly as it was. */
    await updateRecipe(ctx, "stew", { description: "Stewier." });
    const afterFirst = await readRecipeFile("stew");
    expect(afterFirst.name).toBe("Stew");
    expect(afterFirst.image).toBe("stew.jpg");
    expect(afterFirst.video).toBe("https://example.com/stew.mp4");
    expect(afterFirst.tags).toEqual(["dinner"]);
    expect(afterFirst.date).toBe(created.date);

    /* `null` is the one thing a form cannot say: clear the field. */
    await updateRecipe(ctx, "stew", { tags: null });
    expect((await readRecipeFile("stew")).tags).toBeUndefined();

    const moved = await updateRecipe(ctx, "stew", { date: "2026-05-04" });
    expect(moved.date).toBe(Date.parse("2026-05-04"));
    const list = await listRecipes(ctx);
    expect(list.total).toBe(1);
    expect(list.recipes[0]).toMatchObject({
      slug: "stew",
      date: Date.parse("2026-05-04"),
    });
  });

  it("renames when the patch names a free slug", async () => {
    await createRecipe(ctx, { name: "Stew" });
    const renamed = await updateRecipe(ctx, "stew", { slug: "beef-stew" });
    expect(renamed.slug).toBe("beef-stew");
    expect(
      await pathExists(join(contentDirectory, "recipes/data", "stew")),
    ).toBe(false);
    expect((await listRecipes(ctx)).recipes[0].slug).toBe("beef-stew");
  });

  it("is a not_found for a slug that does not exist", async () => {
    await expect(
      updateRecipe(ctx, "nope", { name: "Nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

/* ------------------------------------------------------------------ */
/* 6. Import                                                           */
/* ------------------------------------------------------------------ */

const PAGE_URL = "https://www.example.com/recipes/naan";

/** Copied from `test/importRecipeSource.test.ts:22-35`, plus an image. */
function recipeHtml(extra: Record<string, unknown> = {}): string {
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Naan",
    description: "South Asia&#39;s classic yeasted flatbread.",
    recipeIngredient: ["1 1/2 cups flour"],
    recipeInstructions: [{ text: "Mix, rest, griddle." }],
    image: ["https://cdn.example.com/img/naan.jpg?w=1200"],
    ...extra,
  };
  return [
    "<html><head>",
    `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`,
    "</head><body></body></html>",
  ].join("");
}

function stubFetch(html: string) {
  const fetchStub = vi.fn(async () => ({ text: async () => html }));
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

describe("importAndCreate", () => {
  it("dry-runs without writing and reports the image it would fetch", async () => {
    stubFetch(recipeHtml());
    const result = await importAndCreate(ctx, PAGE_URL, { dryRun: true });

    expect(result).toMatchObject({ dryRun: true, url: PAGE_URL, slug: "naan" });
    if (!("dryRun" in result)) throw new Error("expected a dry run");
    expect(result.image).toEqual({
      importUrl: "https://cdn.example.com/img/naan.jpg?w=1200",
      filename: "naan.jpg",
    });
    expect(result.recipe.source?.url).toBe(PAGE_URL);
    /* Nothing on disk: no data directory at all. */
    expect(
      await pathExists(join(contentDirectory, "recipes/data", "naan")),
    ).toBe(false);
  });

  it("writes the citation, the image filename and no import scaffolding", async () => {
    stubFetch(recipeHtml({ publisher: { name: "Example Kitchen" } }));
    const result = await importAndCreate(ctx, PAGE_URL, {
      tags: ["Bread", "bread"],
      slug: "garlic-naan",
    });

    expect(result.slug).toBe("garlic-naan");
    if ("dryRun" in result) throw new Error("expected a real import");
    expect(result.source).toMatchObject({
      url: PAGE_URL,
      name: "Example Kitchen",
    });

    const stored = await readRecipeFile("garlic-naan");
    expect(stored.source?.url).toBe(PAGE_URL);
    expect(stored.image).toBe("naan.jpg");
    expect(stored.tags).toEqual(["bread"]);
    /* Fact 9: `Recipe` has an index signature, so these would have persisted. */
    expect(stored.imageImportUrl).toBeUndefined();
    expect(stored.videoImportUrl).toBeUndefined();
  });

  it("is an import_failed when the page carries no Recipe node", async () => {
    stubFetch("<html><head></head><body>no json-ld here</body></html>");
    await expect(importAndCreate(ctx, PAGE_URL)).rejects.toMatchObject({
      code: "import_failed",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 7. Search                                                           */
/* ------------------------------------------------------------------ */

describe("searchRecipes", () => {
  beforeEach(async () => {
    await createRecipe(ctx, {
      name: "Chocolate Cake",
      tags: ["dessert"],
      totalTime: 45,
      ingredients: ["200 g dark chocolate", "3 eggs"],
    });
    await createRecipe(ctx, {
      name: "Quick Salad",
      tags: ["dessert", "fast"],
      totalTime: 10,
      ingredients: ["1 cucumber"],
    });
    await createRecipe(ctx, {
      name: "Beef Stew",
      tags: ["dinner"],
      totalTime: 180,
      ingredients: ["500 g beef"],
    });
  });

  it("evaluates typed terms and comparisons", async () => {
    const result = await searchRecipes(ctx, "tag:dessert time:<30");
    expect(result.query.hasAdvancedSyntax).toBe(true);
    expect(result.total).toBe(1);
    expect(result.recipes[0].slug).toBe("quick-salad");
  });

  it("runs the mandatory free-text pass over names and ingredients", async () => {
    /* Without the second pass this would return the whole corpus (fact 3). */
    const byName = await searchRecipes(ctx, "choc");
    expect(byName.query.hasAdvancedSyntax).toBe(false);
    expect(byName.recipes.map((row) => row.slug)).toEqual(["chocolate-cake"]);

    const byIngredient = await searchRecipes(ctx, "cucumber");
    expect(byIngredient.recipes.map((row) => row.slug)).toEqual([
      "quick-salad",
    ]);
  });

  it("honours a bare-word negation", async () => {
    const result = await searchRecipes(ctx, "-beef");
    expect(result.recipes.map((row) => row.slug).sort()).toEqual([
      "chocolate-cake",
      "quick-salad",
    ]);
  });

  it("answers listRecipes({tag}) and search('tag:x') identically", async () => {
    const listed = await listRecipes(ctx, { tag: "dessert" });
    const searched = await searchRecipes(ctx, "tag:dessert");
    expect(listed.recipes.map((row) => row.slug)).toEqual(
      searched.recipes.map((row) => row.slug),
    );
    expect(listed.total).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Groups                                                           */
/* ------------------------------------------------------------------ */

describe("groups", () => {
  beforeEach(async () => {
    await createRecipe(ctx, { name: "Stew" });
    await createRecipe(ctx, { name: "Salad" });
  });

  it("parses string items, refuses unknown recipes, and forces past them", async () => {
    await expect(
      groups.createGroup(ctx, {
        name: "Week of May 4",
        kind: "meal-plan",
        items: ["stew:Mon · Dinner", "ghost:Tue · Dinner"],
      }),
    ).rejects.toMatchObject({
      code: "unknown_recipe",
      details: { recipes: ["ghost"] },
    });

    const forced = await groups.createGroup(
      ctx,
      {
        name: "Week of May 4",
        kind: "meal-plan",
        items: ["stew:Mon · Dinner", "ghost:Tue · Dinner"],
      },
      { force: true },
    );
    expect(forced.slug).toBe("week-of-may-4");
    expect(forced.url).toBe("/group/week-of-may-4");
    expect(forced.warnings).toEqual(["Unknown recipe: ghost"]);

    const detail = await groups.getGroup(ctx, "week-of-may-4");
    expect(detail.group.items).toEqual([
      { recipe: "stew", label: "Mon · Dinner" },
      { recipe: "ghost", label: "Tue · Dinner" },
    ]);
    /* A dangling item is a legitimate state (D3), marked rather than dropped. */
    expect(detail.items[0]).toMatchObject({ recipe: "stew", name: "Stew" });
    expect(detail.items[1]).toMatchObject({ recipe: "ghost", missing: true });
  });

  it("round-trips add / remove / set-items and keeps the aggregate in step", async () => {
    await groups.createGroup(ctx, {
      name: "Weeknights",
      items: ["stew"],
    });

    await groups.addItem(ctx, "weeknights", "salad", { label: "Tue" });
    expect((await groups.getGroup(ctx, "weeknights")).group.items).toEqual([
      { recipe: "stew" },
      { recipe: "salad", label: "Tue" },
    ]);
    expect((await readAppearsIn())?.salad).toEqual([
      {
        slug: "weeknights",
        name: "Weeknights",
        kind: "collection",
        label: "Tue",
      },
    ]);

    await groups.removeItem(ctx, "weeknights", "salad");
    expect((await readAppearsIn())?.salad).toBeUndefined();
    await expect(
      groups.removeItem(ctx, "weeknights", "salad"),
    ).rejects.toMatchObject({ code: "not_found" });

    await groups.setItems(ctx, "weeknights", [
      { recipe: "salad", label: "Wed", note: "double it" },
    ]);
    const after = await groups.getGroup(ctx, "weeknights");
    expect(after.group.items).toEqual([
      { recipe: "salad", label: "Wed", note: "double it" },
    ]);
    expect((await readAppearsIn())?.stew).toBeUndefined();
  });

  it("lists and deletes", async () => {
    await groups.createGroup(ctx, { name: "Weeknights", items: ["stew"] });
    const listed = await groups.listGroups(ctx);
    expect(listed.total).toBe(1);
    expect(listed.groups[0]).toMatchObject({
      slug: "weeknights",
      name: "Weeknights",
      kind: "collection",
      itemCount: 1,
    });

    expect(await groups.deleteGroup(ctx, "weeknights")).toEqual({
      slug: "weeknights",
      deleted: true,
    });
    await expect(groups.getGroup(ctx, "weeknights")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 9. Delete                                                           */
/* ------------------------------------------------------------------ */

describe("deleteRecipe", () => {
  it("drops the record and the index entry", async () => {
    await createRecipe(ctx, { name: "Stew" });
    await createRecipe(ctx, { name: "Salad" });

    expect(await deleteRecipe(ctx, "stew")).toEqual({
      slug: "stew",
      deleted: true,
    });
    expect((await listRecipes(ctx)).total).toBe(1);
    await expect(getRecipe(ctx, "stew")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(deleteRecipe(ctx, "stew")).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 10. Reindex                                                         */
/* ------------------------------------------------------------------ */

describe("reindex", () => {
  it("names every registered type, and rejects one that is not registered", async () => {
    expect(await reindex(ctx)).toEqual({
      rebuilt: ["recipes", "featured-recipes", "pages", "groups"],
    });
    expect(await reindex(ctx, "groups")).toEqual({ rebuilt: ["groups"] });
    await expect(reindex(ctx, "widgets")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rebuilds an index the data files outlived", async () => {
    await createRecipe(ctx, { name: "Stew" });
    await rm(join(contentDirectory, "recipes/index"), {
      recursive: true,
      force: true,
    });
    await closeCachedEnvironments();
    expect((await listRecipes(ctx)).total).toBe(0);
    await reindex(ctx, "recipes");
    expect((await listRecipes(ctx)).total).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 11. Author                                                          */
/* ------------------------------------------------------------------ */

describe("author resolution", () => {
  it("parses both accepted forms", () => {
    expect(parseAuthor("Roger <roger@example.com>")).toEqual({
      name: "Roger",
      email: "roger@example.com",
    });
    expect(parseAuthor("roger@example.com")).toEqual({
      name: "roger@example.com",
      email: "roger@example.com",
    });
    /* A bare `<email>` still has an email to fall back on for the name. */
    expect(parseAuthor("<roger@example.com>")).toEqual({
      name: "roger@example.com",
      email: "roger@example.com",
    });
    expect(parseAuthor(undefined)).toBeUndefined();
    expect(parseAuthor("   ")).toBeUndefined();
  });

  it("prefers the flag, then the environment, then nothing", () => {
    const env = { RECIPE_AUTHOR: "Env <env@example.com>" };
    expect(resolveAuthor("Flag <flag@example.com>", env)?.email).toBe(
      "flag@example.com",
    );
    expect(resolveAuthor(undefined, env)?.email).toBe("env@example.com");
    expect(resolveAuthor(undefined, {})).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 12. The onWrite hook (22d)                                          */
/* ------------------------------------------------------------------ */

/**
 * The seat the API routes fill with `revalidateContentWrite` (D9).
 *
 * 22c's curation functions threw the engine's `ContentWriteResult` away — a CLI
 * has no cache to invalidate, so there was nothing to do with it. A write that
 * arrives *through* the editor is in the process that owns the caches, so the
 * result has to come back out. It is reported through a hook rather than
 * returned so the CLI's JSON contract is byte-identical to what 22c shipped,
 * which is what the `cliJson` suite still asserts.
 *
 * What matters here is the *shape of the report*, since a route cannot be
 * unit-tested (T17) and a wrong `contentType` or a missing `previousSlug` would
 * simply leave a page stale — silent, and invisible to every other test.
 */
describe("onWrite", () => {
  function recordingCtx(): {
    ctx: CurationContext;
    events: ContentWriteEvent[];
  } {
    const events: ContentWriteEvent[] = [];
    return {
      ctx: { contentDirectory, onWrite: (event) => events.push(event) },
      events,
    };
  }

  it("reports a create with the engine's own result", async () => {
    const { ctx: recording, events } = recordingCtx();
    await createRecipe(recording, { name: "Chocolate Cake" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contentType: "recipes",
      kind: "create",
      slug: "chocolate-cake",
    });
    /* The half a CLI cannot use and a route cannot do without. */
    expect(Array.isArray(events[0].result.pagination)).toBe(true);
    expect(Array.isArray(events[0].result.aggregates)).toBe(true);
    expect(events[0].previousSlug).toBeUndefined();
  });

  it("reports an update, and carries previousSlug only on a rename", async () => {
    await createRecipe(ctx, { name: "Chocolate Cake" });

    const { ctx: recording, events } = recordingCtx();
    await updateRecipe(recording, "chocolate-cake", { description: "Rich." });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contentType: "recipes",
      kind: "update",
      slug: "chocolate-cake",
    });
    expect(events[0].previousSlug).toBeUndefined();

    await updateRecipe(recording, "chocolate-cake", { slug: "choc-cake" });
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      kind: "update",
      slug: "choc-cake",
      previousSlug: "chocolate-cake",
    });
  });

  it("reports a delete, and reports overwrite as delete then create", async () => {
    await createRecipe(ctx, { name: "Chocolate Cake" });

    const { ctx: recording, events } = recordingCtx();
    await createRecipe(
      recording,
      { name: "Chocolate Cake", description: "Second." },
      { overwrite: true },
    );
    expect(events.map((event) => event.kind)).toEqual(["delete", "create"]);
    expect(events.every((event) => event.slug === "chocolate-cake")).toBe(true);

    await deleteRecipe(recording, "chocolate-cake");
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({
      contentType: "recipes",
      kind: "delete",
      slug: "chocolate-cake",
    });
  });

  it("reports group writes, with an item mutation as an update", async () => {
    await createRecipe(ctx, { name: "First Recipe" });

    const { ctx: recording, events } = recordingCtx();
    await groups.createGroup(recording, {
      name: "API week",
      kind: "meal-plan",
      items: ["first-recipe"],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ contentType: "groups", kind: "create" });
    const slug = events[0].slug;

    await groups.addItem(recording, slug, "first-recipe", { label: "Tue" });
    expect(events[1]).toMatchObject({
      contentType: "groups",
      kind: "update",
      slug,
    });
    expect(events[1].previousSlug).toBeUndefined();

    await groups.deleteGroup(recording, slug);
    expect(events[2]).toMatchObject({
      contentType: "groups",
      kind: "delete",
      slug,
    });
  });

  it("is optional: a context without it writes exactly as before", async () => {
    const result = await createRecipe(ctx, { name: "Chocolate Cake" });
    expect(result.slug).toBe("chocolate-cake");
    expect(Object.keys(result).sort()).toEqual(["date", "path", "slug", "url"]);
  });
});

/* ------------------------------------------------------------------ */
/* 13. D8 import boundary                                              */
/* ------------------------------------------------------------------ */

/**
 * The rule that makes this layer callable from `tsx`, checked mechanically.
 *
 * Every failure it guards against is silent at compile time and loud only at
 * runtime, in a process nothing type-checks: `unstable_cache` throws
 * `incrementalCache missing` outside Next
 * (`packages/cms/content/next/cachedItemRead.ts:47`), a `"use server"` module
 * drags the whole Next runtime in, and `getAllTags`/`getSearchCorpus` are
 * Next-only exports of an otherwise Node-safe module. So the boundary is a test
 * rather than a convention (D8).
 */
const CURATION_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../websites/recipe-website/editor/controller/curation",
);

const ALLOWED: RegExp[] = [
  /^node:/,
  /^path$/,
  /^fs-extra$/,
  /^zod$/,
  /^simple-git$/,
  /^@sindresorhus\/slugify$/,
  /^@discontent\/cms\/content\/[^/]+$/,
  /^@discontent\/cms\/aggregates\/[^/]+$/,
  /^@discontent\/cms\/git\/commit$/,
  /^recipe-website-common\/controller\/(types|recipeContentConfig|groupContentConfig|createSlug|createGroupSlug|normalizeTags|aggregateConfigs|tagSlug|data\/read|data\/readGroups)$/,
  /^recipe-website-common\/components\/SearchForm\/queryLanguage$/,
  /^recipe-website-common\/util\/[^/]+$/,
  /^\.\.?\//,
  /^\.\.\/contentTypes$/,
];

const FORBIDDEN: RegExp[] = [
  /^next\//,
  /^@\//,
  /controller\/actions/,
  /data\/read(RecipeItem|RecipeTags|RecipeTagIndex|GroupPages|GroupsByRecipe|RecipePages|FeaturedRecipePages)/,
  /^@discontent\/cms\/[^/]+\/next\//,
];

/** `from "…"` and `import("…")`, static and dynamic alike. */
const IMPORT_SPECIFIER =
  /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;

/**
 * Comments are stripped before either check runs.
 *
 * These files explain *why* they may not import the forbidden modules, so the
 * prose naturally names `getAllTags` and `controller/actions`. Checking code
 * rather than text is also what makes a commented-out import not count.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("D8 import boundary", () => {
  it("controller/curation/* imports only what runs outside Next", async () => {
    const files = (await readdir(CURATION_DIR)).filter((file) =>
      file.endsWith(".ts"),
    );
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(
        await readFile(join(CURATION_DIR, file), "utf8"),
      );
      for (const match of source.matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1] ?? match[2];
        if (FORBIDDEN.some((pattern) => pattern.test(specifier))) {
          violations.push(`${file}: forbidden import "${specifier}"`);
          continue;
        }
        if (!ALLOWED.some((pattern) => pattern.test(specifier))) {
          violations.push(
            `${file}: import "${specifier}" is not on the D8 allow-list`,
          );
        }
      }
      /*
       * Symbols, not modules: `data/read` is allowed (type-only), but these two
       * exports of it are Next-only however they are reached.
       */
      for (const symbol of ["getAllTags", "getSearchCorpus"]) {
        if (new RegExp(`\\b${symbol}\\b`).test(source)) {
          violations.push(`${file}: uses the Next-only symbol ${symbol}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("imports data/read for types only", async () => {
    const files = (await readdir(CURATION_DIR)).filter((file) =>
      file.endsWith(".ts"),
    );
    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(
        await readFile(join(CURATION_DIR, file), "utf8"),
      );
      for (const statement of source.split(";")) {
        if (!statement.includes("recipe-website-common/controller/data/read")) {
          continue;
        }
        if (!/\bimport\s+type\b/.test(statement)) {
          violations.push(`${file}: ${statement.trim().replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
