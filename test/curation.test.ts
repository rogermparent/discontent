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
import type {
  Group,
  Recipe,
} from "../websites/recipe-website/common/controller/types";

import {
  parseAuthor,
  resolveAuthor,
} from "../websites/recipe-website/editor/controller/curation/author";
import type {
  ContentWriteEvent,
  CurationContext,
} from "../websites/recipe-website/editor/controller/curation/context";
import { SlugConflictError } from "../websites/recipe-website/editor/controller/curation/errors";
import { feature } from "../websites/recipe-website/editor/controller/curation/featured";
import * as groups from "../websites/recipe-website/editor/controller/curation/groups";
import { importAndCreate } from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { inspectUrl } from "../websites/recipe-website/editor/controller/curation/inspect";
import { setRecipeImage } from "../websites/recipe-website/editor/controller/curation/recipeImage";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  previewCreateRecipe,
  previewUpdateRecipe,
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

interface StubImage {
  /** `null` sends no content-type at all. Default `image/jpeg`. */
  type?: string | null;
  status?: number;
  body?: string;
  /** A declared `content-length` (epic 31's size warning), HEAD and GET. */
  length?: number;
}

/**
 * A tiny web: `images` answer as images (to `GET` and `HEAD` alike, as real
 * `Response`s, since `fetchImageFile` reads status, headers and the body
 * stream), and every other URL answers with `html`.
 */
function stubWeb(html: string, images: Record<string, StubImage> = {}) {
  const fetchStub = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const image = images[String(input)];
    if (!image) {
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    const type = image.type === undefined ? "image/jpeg" : image.type;
    const headers: Record<string, string> = type
      ? { "content-type": type }
      : {};
    if (image.length !== undefined) {
      headers["content-length"] = String(image.length);
    }
    return new Response(
      init?.method === "HEAD" ? null : (image.body ?? "jpeg bytes"),
      { status: image.status ?? 200, headers },
    );
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function readRecipeFile(slug: string): Promise<Recipe> {
  return readJson(join(contentDirectory, "recipes/data", slug, "recipe.json"));
}

function readGroupFile(slug: string): Promise<Group> {
  return readJson(join(contentDirectory, "groups/data", slug, "group.json"));
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
    stubWeb("", { "https://example.com/pictures/stew.jpg?w=800": {} });
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

  it("downloads the image itself and names it from the content type (26a)", async () => {
    /*
     * The Kitchn's Cloudinary URLs (T9): an encoded asset path in one segment,
     * no extension. `fetchImageFile` keeps the last decoded part and adds the
     * extension the content type implies.
     */
    const url =
      "https://cdn.example.com/image/upload/f_jpg,w_1500,ar_16:9/k%2FPhoto%2FRecipes%2F2024%2Fbloody-mary-441_1";
    const fetchStub = stubWeb("", { [url]: { body: "the jpeg" } });
    await createRecipe(ctx, { name: "Bloody Mary", imageImportUrl: url });

    expect((await readRecipeFile("bloody-mary")).image).toBe(
      "bloody-mary-441_1.jpg",
    );
    expect(
      await readFile(
        join(
          contentDirectory,
          "uploads/recipe/bloody-mary/uploads/bloody-mary-441_1.jpg",
        ),
        "utf8",
      ),
    ).toBe("the jpeg");
    /* One download: the engine is handed a File, it does not fetch again. */
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("refuses an image URL that answers with HTML, and writes nothing", async () => {
    stubWeb("<html>Not found</html>");
    await expect(
      createRecipe(ctx, {
        name: "Stew",
        imageImportUrl: "https://example.com/missing.jpg",
      }),
    ).rejects.toMatchObject({ code: "import_failed" });
    expect(
      await pathExists(join(contentDirectory, "recipes/data", "stew")),
    ).toBe(false);
  });

  it("clears the image with imageImportUrl: null and with clearImage (26a)", async () => {
    stubWeb("", {
      "https://example.com/a.png": { type: "image/png" },
      "https://example.com/b.png": { type: "image/png" },
    });
    const uploads = join(contentDirectory, "uploads/recipe/stew/uploads");

    await createRecipe(ctx, {
      name: "Stew",
      imageImportUrl: "https://example.com/a.png",
    });
    expect((await readRecipeFile("stew")).image).toBe("a.png");
    expect(await pathExists(join(uploads, "a.png"))).toBe(true);

    /* Before 26a this kept the image: `null ?? undefined` read as "unchanged". */
    await updateRecipe(ctx, "stew", { imageImportUrl: null });
    expect("image" in (await readRecipeFile("stew"))).toBe(false);
    expect(await pathExists(join(uploads, "a.png"))).toBe(false);

    await updateRecipe(ctx, "stew", {
      imageImportUrl: "https://example.com/b.png",
    });
    expect((await readRecipeFile("stew")).image).toBe("b.png");
    await updateRecipe(ctx, "stew", { clearImage: true });
    expect("image" in (await readRecipeFile("stew"))).toBe(false);
    expect(await pathExists(join(uploads, "b.png"))).toBe(false);
    expect((await readRecipeFile("stew")).clearImage).toBeUndefined();
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
/* Drink spec (25a)                                                    */
/* ------------------------------------------------------------------ */

describe("drink spec", () => {
  it("round-trips on create, trimmed, with blank parts dropped", async () => {
    await createRecipe(ctx, {
      name: "Daiquiri",
      drink: { method: "shake", glass: "  coupe ", ice: "", garnish: "lime" },
    });
    expect((await readRecipeFile("daiquiri")).drink).toEqual({
      method: "shake",
      glass: "coupe",
      garnish: "lime",
    });
    expect((await getRecipe(ctx, "daiquiri")).recipe.drink?.glass).toBe(
      "coupe",
    );
  });

  it("stores no block at all when every part is blank", async () => {
    await createRecipe(ctx, {
      name: "Not A Drink",
      drink: { glass: " ", garnish: "" },
    });
    expect(await readRecipeFile("not-a-drink")).not.toHaveProperty("drink");
  });

  it("rejects an unknown key inside the spec, and an unknown method", async () => {
    await expect(
      createRecipe(ctx, { name: "Typo", drink: { glas: "coupe" } }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      createRecipe(ctx, { name: "Swizzle", drink: { method: "swizzle" } }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("replaces the whole spec on patch, keeps it when omitted, clears on null or {}", async () => {
    await createRecipe(ctx, {
      name: "Martini",
      drink: { method: "stir", glass: "martini", garnish: "olive" },
    });

    /* Omitted: untouched. */
    await updateRecipe(ctx, "martini", { description: "Cold." });
    expect((await readRecipeFile("martini")).drink).toEqual({
      method: "stir",
      glass: "martini",
      garnish: "olive",
    });

    /* Present: replaces rather than merges — the olive is gone. */
    await updateRecipe(ctx, "martini", {
      drink: { method: "stir", glass: "coupe" },
    });
    expect((await readRecipeFile("martini")).drink).toEqual({
      method: "stir",
      glass: "coupe",
    });

    await updateRecipe(ctx, "martini", { drink: null });
    expect(await readRecipeFile("martini")).not.toHaveProperty("drink");

    await updateRecipe(ctx, "martini", { drink: { ice: "up" } });
    await updateRecipe(ctx, "martini", { drink: { ice: "  " } });
    expect(await readRecipeFile("martini")).not.toHaveProperty("drink");
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

const NAAN_IMAGE = "https://cdn.example.com/img/naan.jpg?w=1200";

describe("importAndCreate", () => {
  it("dry-runs without writing and reports the image it would fetch", async () => {
    const fetchStub = stubWeb(recipeHtml(), { [NAAN_IMAGE]: {} });
    const result = await importAndCreate(ctx, PAGE_URL, { dryRun: true });

    expect(result).toMatchObject({ dryRun: true, url: PAGE_URL, slug: "naan" });
    if (!("dryRun" in result)) throw new Error("expected a dry run");
    /* From a HEAD probe (26a): the name a real run would store, no download. */
    expect(result.image).toEqual({
      importUrl: NAAN_IMAGE,
      filename: "naan.jpg",
      status: 200,
      contentType: "image/jpeg",
    });
    expect(result.recipe.image).toBe("naan.jpg");
    const imageCalls = fetchStub.mock.calls.filter(
      ([url]) => String(url) === NAAN_IMAGE,
    );
    expect(imageCalls.map(([, init]) => init?.method)).toEqual(["HEAD"]);
    expect(result.recipe.source?.url).toBe(PAGE_URL);
    /* Nothing on disk: no data directory at all. */
    expect(
      await pathExists(join(contentDirectory, "recipes/data", "naan")),
    ).toBe(false);
  });

  it("writes the citation, the image filename and no import scaffolding", async () => {
    stubWeb(recipeHtml({ publisher: { name: "Example Kitchen" } }), {
      [NAAN_IMAGE]: {},
    });
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
    expect(stored.images).toBeUndefined();
  });

  it("maps recipeYield, which used to be read and never set (26a)", async () => {
    stubWeb(recipeHtml({ recipeYield: ["8", "8 flatbreads"] }), {
      [NAAN_IMAGE]: {},
    });
    await importAndCreate(ctx, PAGE_URL);
    expect((await readRecipeFile("naan")).recipeYield).toBe("8 flatbreads");
  });

  it("takes an --image override over the page's best image", async () => {
    const other = "https://cdn.example.com/img/other.png";
    stubWeb(recipeHtml(), { [other]: { type: "image/png" } });
    await importAndCreate(ctx, PAGE_URL, { image: other });
    expect((await readRecipeFile("naan")).image).toBe("other.png");
  });

  it("is an import_failed when the page carries no Recipe node", async () => {
    stubWeb("<html><head></head><body>no json-ld here</body></html>");
    await expect(importAndCreate(ctx, PAGE_URL)).rejects.toMatchObject({
      code: "import_failed",
    });
  });

  it("dry-runs an SEO-only page as partial, and creates from it only when allowed", async () => {
    const seoPage = [
      "<html><head>",
      "<title>Paper Plane | Example Drinks</title>",
      '<meta property="og:site_name" content="Example Drinks">',
      '<meta property="og:description" content="Equal parts, shaken.">',
      `<meta property="og:image" content="${NAAN_IMAGE}">`,
      "</head><body></body></html>",
    ].join("");
    stubWeb(seoPage, { [NAAN_IMAGE]: {} });

    const dry = await importAndCreate(ctx, PAGE_URL, { dryRun: true });
    if (!("dryRun" in dry)) throw new Error("expected a dry run");
    expect(dry.partial).toBe(true);
    expect(dry.recipe).toMatchObject({
      name: "Paper Plane",
      description: "Equal parts, shaken.",
      image: "naan.jpg",
      source: { url: PAGE_URL, name: "Example Drinks" },
    });

    await expect(importAndCreate(ctx, PAGE_URL)).rejects.toMatchObject({
      code: "import_failed",
    });
    await importAndCreate(ctx, PAGE_URL, { allowPartial: true });
    expect((await readRecipeFile("paper-plane")).name).toBe("Paper Plane");
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

  it("ORs free-text words and ranks name > tags > ingredients > description (27d)", async () => {
    await createRecipe(ctx, {
      name: "Gimlet",
      tags: ["drink", "gin"],
      ingredients: ["2 oz gin", "3/4 oz lime juice"],
    });
    await createRecipe(ctx, {
      name: "Gin and Tonic",
      tags: ["drink", "gin"],
      ingredients: ["2 oz gin", "4 oz tonic water", "1 lime wedge"],
    });
    await createRecipe(ctx, {
      name: "Daiquiri",
      tags: ["drink", "rum"],
      ingredients: ["2 oz white rum", "1 oz lime juice"],
    });
    await createRecipe(ctx, {
      name: "Lime Pickle",
      tags: ["condiment"],
      ingredients: ["10 limes", "salt"],
    });

    const result = await searchRecipes(ctx, "lime gin");
    const slugs = result.recipes.map((row) => row.slug);
    /* Either word is enough: the rum drink and the pickle are in. */
    expect(slugs).toHaveLength(4);
    /*
     * Gin and Tonic: gin in the name (4) + lime in an ingredient (2) = 6;
     * Gimlet: gin as a tag (3) + lime in an ingredient (2) = 5;
     * Lime Pickle: lime in the name (4); Daiquiri: lime in an ingredient (2).
     */
    expect(slugs).toEqual([
      "gin-and-tonic",
      "gimlet",
      "lime-pickle",
      "daiquiri",
    ]);
  });

  it("breaks a score tie newest first", async () => {
    const result = await searchRecipes(ctx, "dessert");
    /* Both are tagged dessert (3 each); the salad was created last. */
    expect(result.recipes.map((row) => row.slug)).toEqual([
      "quick-salad",
      "chocolate-cake",
    ]);
  });

  it("filters by source: label or host, and leaves source-less rows out (27d)", async () => {
    await createRecipe(ctx, {
      name: "Last Word",
      tags: ["drink"],
      source: { url: "https://imbibemagazine.com/recipe/last-word/" },
    });
    await createRecipe(ctx, {
      name: "Margarita",
      tags: ["drink"],
      source: {
        url: "https://www.acouplecooks.com/margarita/",
        name: "A Couple Cooks",
      },
    });

    const imbibe = await searchRecipes(ctx, "source:imbibe");
    expect(imbibe.recipes.map((row) => row.slug)).toEqual(["last-word"]);
    expect(imbibe.recipes[0]).toMatchObject({
      sourceName: "Imbibe",
      sourceHost: "imbibemagazine.com",
    });
    const byHost = await searchRecipes(ctx, "source:acouplecooks");
    expect(byHost.recipes.map((row) => row.slug)).toEqual(["margarita"]);
    const byName = await searchRecipes(ctx, 'source:"a couple"');
    expect(byName.recipes.map((row) => row.slug)).toEqual(["margarita"]);
    expect((await searchRecipes(ctx, "-source:imbibe tag:drink")).total).toBe(
      1,
    );
    /* A row with no source carries neither key at all. */
    const plain = await searchRecipes(ctx, "choc");
    expect(plain.recipes[0]).not.toHaveProperty("sourceName");
  });

  /*
   * 30a. Membership lives on the groups, so rows used to carry none: `group:x`
   * matched nothing and `-group:x` matched everything. Slug or name, as in the
   * browser, and transitive through a sub-group.
   */
  it("filters by group: slug or name, and negates it (30a)", async () => {
    await groups.createGroup(ctx, {
      name: "Weeknight Favourites",
      kind: "collection",
      items: ["chocolate-cake", "beef-stew"],
    });
    await groups.createGroup(ctx, {
      name: "Party Menus",
      kind: "collection",
      items: [{ group: "weeknight-favourites" }],
    });

    const bySlug = await searchRecipes(ctx, "group:weeknight-favourites");
    expect(bySlug.recipes.map((row) => row.slug).sort()).toEqual([
      "beef-stew",
      "chocolate-cake",
    ]);
    const byName = await searchRecipes(ctx, 'group:"weeknight favourites"');
    expect(byName.total).toBe(2);
    const nested = await searchRecipes(ctx, "group:party-menus");
    expect(nested.total).toBe(2);
    const negated = await searchRecipes(ctx, "-group:weeknight-favourites");
    expect(negated.recipes.map((row) => row.slug)).toEqual(["quick-salad"]);
    /* Matched on, not returned: result rows keep their shape. */
    expect(bySlug.recipes[0]).not.toHaveProperty("groups");
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

  /*
   * The 24b field on the way in. Normalised with the same function recipes use,
   * and spread only when something survives it — so an untagged group's record
   * and its `GroupRow` both keep the exact shape they had (T16).
   */
  it("normalises the tags it is given and leaves an untagged group unchanged", async () => {
    await groups.createGroup(ctx, {
      name: "Weeknights",
      slug: "weeknights",
      tags: [" Weeknight ", "QUICK", "quick", "  "],
      items: ["stew"],
    });
    expect((await readGroupFile("weeknights")).tags).toEqual([
      "weeknight",
      "quick",
    ]);
    expect((await groups.listGroups(ctx)).groups[0]).toMatchObject({
      slug: "weeknights",
      tags: ["weeknight", "quick"],
    });

    await groups.createGroup(ctx, { name: "Plain", slug: "plain" });
    expect("tags" in (await readGroupFile("plain"))).toBe(false);
    const plainRow = (await groups.listGroups(ctx)).groups.find(
      (row) => row.slug === "plain",
    );
    expect(plainRow).toEqual({
      slug: "plain",
      date: expect.any(Number),
      name: "Plain",
      kind: "collection",
      itemCount: 0,
    });
  });

  it("round-trips add / remove / set-items and keeps the aggregate in step", async () => {
    await groups.createGroup(ctx, {
      name: "Weeknights",
      items: ["stew"],
    });

    await groups.addItem(
      ctx,
      "weeknights",
      { recipe: "salad" },
      { label: "Tue" },
    );
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

    await groups.removeItem(ctx, "weeknights", { recipe: "salad" });
    expect((await readAppearsIn())?.salad).toBeUndefined();
    await expect(
      groups.removeItem(ctx, "weeknights", { recipe: "salad" }),
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

  it("imports the group's image from a URL and keeps it through an item edit", async () => {
    /*
     * Since 26d the group's image goes through `fetchImageFile`, as a
     * recipe's does: one checked download, handed to the engine as a `File`.
     */
    const fetchStub = stubWeb("", {
      "https://cdn.example.com/img/cover.png?w=1200": { type: "image/png" },
    });

    await groups.createGroup(ctx, {
      name: "Weeknights",
      items: ["stew"],
      imageImportUrl: "https://cdn.example.com/img/cover.png?w=1200",
    });

    /* The basename of the URL's *pathname*: the query string is not a name. */
    expect(
      await pathExists(
        join(contentDirectory, "uploads/group/weeknights/uploads/cover.png"),
      ),
    ).toBe(true);
    const stored = await readGroupFile("weeknights");
    expect(stored.image).toBe("cover.png");
    /* `Group` has an index signature, so an input-only key would have persisted. */
    expect(stored.imageImportUrl).toBeUndefined();
    /* One download: the engine is handed a File, it does not fetch again. */
    expect(fetchStub).toHaveBeenCalledTimes(1);

    /*
     * `writeItems` spreads the record it read, so the picture survives every
     * item mutation — which is the whole of the "no group update seat" bet.
     */
    await groups.setItems(ctx, "weeknights", [{ recipe: "salad" }]);
    expect((await readGroupFile("weeknights")).image).toBe("cover.png");
    expect(
      await pathExists(
        join(contentDirectory, "uploads/group/weeknights/uploads/cover.png"),
      ),
    ).toBe(true);
  });

  it("names an extension-less image from its content type (26d)", async () => {
    /* 25e-T9 for groups: a Cloudinary-style URL with no extension. */
    const url =
      "https://cdn.example.com/image/upload/f_jpg,w_1500/k%2FPhoto%2Fcover-1";
    stubWeb("", { [url]: { body: "the jpeg" } });
    await groups.createGroup(ctx, { name: "Weeknights", imageImportUrl: url });

    expect((await readGroupFile("weeknights")).image).toBe("cover-1.jpg");
    expect(
      await readFile(
        join(contentDirectory, "uploads/group/weeknights/uploads/cover-1.jpg"),
        "utf8",
      ),
    ).toBe("the jpeg");
  });

  it("refuses an image URL that answers with HTML, and writes nothing (26d)", async () => {
    stubWeb("<html>Not found</html>");
    await expect(
      groups.createGroup(ctx, {
        name: "Weeknights",
        imageImportUrl: "https://example.com/missing.jpg",
      }),
    ).rejects.toMatchObject({ code: "import_failed" });
    expect(
      await pathExists(join(contentDirectory, "groups/data", "weeknights")),
    ).toBe(false);
    expect(
      await pathExists(join(contentDirectory, "uploads/group/weeknights")),
    ).toBe(false);
  });

  it("rejects unknown keys", async () => {
    /*
     * `GroupInputSchema` is a `strictObject`, which is why `imageImportUrl` had
     * to be declared rather than merely passed through — and why a typo is
     * still an error rather than a silently ignored field.
     */
    await expect(
      groups.createGroup(ctx, {
        name: "Weeknights",
        imageUrl: "https://x/y.png",
      }),
    ).rejects.toMatchObject({ code: "validation" });
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

  /* ---- Nested groups (23c/D15–D17) ---- */

  it("resolves a sub-group item to its name and kind, or marks it missing", async () => {
    await groups.createGroup(ctx, {
      name: "Week of May 4",
      slug: "week-of-may-4",
      kind: "meal-plan",
      items: ["stew"],
    });
    await groups.createGroup(ctx, {
      name: "Spring Menus",
      slug: "spring-menus",
      items: [{ group: "week-of-may-4", label: "Week 1" }, { recipe: "salad" }],
    });

    const detail = await groups.getGroup(ctx, "spring-menus");
    expect(detail.items[0]).toEqual({
      group: "week-of-may-4",
      label: "Week 1",
      name: "Week of May 4",
      kind: "meal-plan",
    });
    expect(detail.items[1]).toMatchObject({ recipe: "salad", name: "Salad" });

    /*
     * Renaming the child rewrites the parent's row in the same write (F32,
     * epic 31); the row keeps its label.
     */
    await groups.updateGroup(ctx, "week-of-may-4", { slug: "week-one" });
    expect((await readGroupFile("spring-menus")).items[0]).toEqual({
      group: "week-one",
      label: "Week 1",
    });
    expect((await groups.getGroup(ctx, "spring-menus")).items[0]).toMatchObject(
      { group: "week-one", name: "Week of May 4" },
    );

    /*
     * Deleting the child leaves the row (T31): nothing rewrites a parent on a
     * delete, the same D3 rule recipes have had since 22b.
     */
    await groups.deleteGroup(ctx, "week-one");
    expect((await groups.getGroup(ctx, "spring-menus")).items[0]).toMatchObject(
      { group: "week-one", missing: true },
    );
  });

  it("refuses a sub-group that does not exist, and forces past it", async () => {
    await expect(
      groups.createGroup(ctx, {
        name: "Spring Menus",
        items: [{ group: "ghost" }],
      }),
    ).rejects.toMatchObject({
      code: "unknown_group",
      details: { groups: ["ghost"] },
      /* The hint `UnknownGroupError` only carries when it is asked for (D17). */
      message: expect.stringContaining("--force"),
    });

    const forced = await groups.createGroup(
      ctx,
      { name: "Spring Menus", items: [{ group: "ghost" }] },
      { force: true },
    );
    expect(forced.warnings).toEqual(["Unknown group: ghost"]);
  });

  it("refuses a group that contains itself, at create and through addItem", async () => {
    /*
     * At create the group is not on disk yet, so the self-reference has to be
     * caught before the existence pass or it surfaces as a forceable
     * `unknown_group` and `--force` writes the cycle (T30).
     */
    await expect(
      groups.createGroup(ctx, {
        name: "Spring Menus",
        slug: "spring-menus",
        items: [{ group: "spring-menus" }],
      }),
    ).rejects.toMatchObject({
      code: "group_cycle",
      details: { groups: ["spring-menus", "spring-menus"] },
    });
    await expect(
      groups.createGroup(
        ctx,
        {
          name: "Spring Menus",
          slug: "spring-menus",
          items: [{ group: "spring-menus" }],
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: "group_cycle" });

    await groups.createGroup(ctx, {
      name: "Spring Menus",
      slug: "spring-menus",
    });
    await expect(
      groups.addItem(ctx, "spring-menus", { group: "spring-menus" }),
    ).rejects.toMatchObject({
      code: "group_cycle",
      details: { groups: ["spring-menus", "spring-menus"] },
    });
  });

  it("assertNoGroupCycle is the cycle half on its own, for the browser form (epic 31)", async () => {
    await groups.createGroup(ctx, { name: "A", slug: "a" });
    await groups.createGroup(ctx, { name: "B", slug: "b" });
    await groups.addItem(ctx, "a", { group: "b" });

    await expect(
      groups.assertNoGroupCycle(ctx, "a", [{ group: "a" }]),
    ).rejects.toMatchObject({ code: "group_cycle" });
    await expect(
      groups.assertNoGroupCycle(ctx, "b", [
        { recipe: "x" } as never,
        { group: "a" },
      ]),
    ).rejects.toMatchObject({
      code: "group_cycle",
      details: { groups: ["b", "a", "b"] },
    });
    /* Fine: no cycle, and an unknown group is not this check's business. */
    await expect(
      groups.assertNoGroupCycle(ctx, "c", [{ group: "a" }, { group: "nope" }]),
    ).resolves.toBeUndefined();
  });

  it("refuses a cycle two and three levels deep, and names the path", async () => {
    await groups.createGroup(ctx, { name: "A", slug: "a" });
    await groups.createGroup(ctx, { name: "B", slug: "b" });
    await groups.addItem(ctx, "a", { group: "b" });

    /* b would contain a, which already contains b. */
    await expect(
      groups.addItem(ctx, "b", { group: "a" }),
    ).rejects.toMatchObject({
      code: "group_cycle",
      details: { groups: ["b", "a", "b"] },
    });

    await groups.createGroup(ctx, { name: "C", slug: "c" });
    await groups.addItem(ctx, "b", { group: "c" });
    await expect(
      groups.setItems(ctx, "c", [{ group: "a" }]),
    ).rejects.toMatchObject({
      code: "group_cycle",
      details: { groups: ["c", "a", "b", "c"] },
    });
  });

  it("removes by ref, leaving the other namespace's rows alone", async () => {
    await groups.createGroup(ctx, { name: "Stew", slug: "stew-group" });
    await groups.createGroup(ctx, {
      name: "Spring Menus",
      slug: "spring-menus",
      items: [{ recipe: "stew" }, { group: "stew-group" }],
    });

    await groups.removeItem(ctx, "spring-menus", { group: "stew-group" });
    expect((await groups.getGroup(ctx, "spring-menus")).group.items).toEqual([
      { recipe: "stew" },
    ]);
    await expect(
      groups.removeItem(ctx, "spring-menus", { group: "stew-group" }),
    ).rejects.toMatchObject({ code: "not_found" });

    await groups.removeItem(ctx, "spring-menus", { recipe: "stew" });
    expect((await groups.getGroup(ctx, "spring-menus")).group.items).toEqual(
      [],
    );
  });
});

/* ------------------------------------------------------------------ */
/* 8b. Group update (23a/D4)                                           */
/* ------------------------------------------------------------------ */

/**
 * The seat that did not exist until 23a: everything about a group *except* its
 * items.
 *
 * Two properties carry the whole design. **A patch cannot touch `items`** —
 * `GroupPatchSchema` does not declare the key, so a patch meaning "rename this"
 * cannot silently wipe a meal plan. And **a rename is explicit and checked**,
 * because `updateContent` has no conflict guard of its own and the featured
 * entry that points at the old slug has to follow.
 */
describe("updateGroup", () => {
  beforeEach(async () => {
    await createRecipe(ctx, { name: "Stew" });
    await groups.createGroup(ctx, {
      name: "Weeknights",
      slug: "weeknights",
      description: "Fast ones.",
      items: ["stew:Mon"],
    });
  });

  it("changes the name and description and leaves everything else alone", async () => {
    const result = await groups.updateGroup(ctx, "weeknights", {
      name: "Weeknight Favourites",
      description: "Thirty minutes or less.",
    });
    expect(result).toMatchObject({
      slug: "weeknights",
      url: "/group/weeknights",
    });

    const stored = await readGroupFile("weeknights");
    expect(stored.name).toBe("Weeknight Favourites");
    expect(stored.description).toBe("Thirty minutes or less.");
    /* The whole reason `items` is not in the patch schema. */
    expect(stored.items).toEqual([{ recipe: "stew", label: "Mon" }]);
    expect(stored.kind).toBe("collection");

    expect((await groups.listGroups(ctx)).groups[0]).toMatchObject({
      name: "Weeknight Favourites",
      itemCount: 1,
    });
  });

  /*
   * Groups joined the site's one tag vocabulary at 24b (D4). The seat's
   * contract is `updateRecipe`'s, restated: normalised on the way in, `null`
   * clears, an array replaces, and an empty result writes no key at all so an
   * untagged group's data file is byte-identical to what it was.
   */
  it("normalises the tags it is given and replaces the whole list", async () => {
    await groups.updateGroup(ctx, "weeknights", {
      tags: ["  Weeknight  ", "QUICK", "quick"],
    });
    expect((await readGroupFile("weeknights")).tags).toEqual([
      "weeknight",
      "quick",
    ]);

    await groups.updateGroup(ctx, "weeknights", { tags: ["dinner"] });
    expect((await readGroupFile("weeknights")).tags).toEqual(["dinner"]);
  });

  it("clears the tags on null and leaves them alone on undefined", async () => {
    await groups.updateGroup(ctx, "weeknights", { tags: ["weeknight"] });

    await groups.updateGroup(ctx, "weeknights", { name: "Renamed Again" });
    expect((await readGroupFile("weeknights")).tags).toEqual(["weeknight"]);

    await groups.updateGroup(ctx, "weeknights", { tags: null });
    expect("tags" in (await readGroupFile("weeknights"))).toBe(false);
  });

  it("clears the description on null and keeps it on undefined", async () => {
    await groups.updateGroup(ctx, "weeknights", { name: "Renamed" });
    expect((await readGroupFile("weeknights")).description).toBe("Fast ones.");

    await groups.updateGroup(ctx, "weeknights", { description: null });
    expect("description" in (await readGroupFile("weeknights"))).toBe(false);
  });

  it("moves the kind onto the index value", async () => {
    await groups.updateGroup(ctx, "weeknights", { kind: "meal-plan" });
    expect((await readGroupFile("weeknights")).kind).toBe("meal-plan");
    /* `listGroups` reads the index, not the file — so this is the projection. */
    expect((await groups.listGroups(ctx)).groups[0].kind).toBe("meal-plan");
  });

  it("renames: moves the directory, the index key, and the feature pointing at it", async () => {
    await feature(ctx, { group: "weeknights", slug: "weeknights-feature" });

    const { ctx: recording, events } = (() => {
      const collected: ContentWriteEvent[] = [];
      return {
        ctx: {
          contentDirectory,
          onWrite: (event: ContentWriteEvent) => collected.push(event),
        } satisfies CurationContext,
        events: collected,
      };
    })();

    const result = await groups.updateGroup(recording, "weeknights", {
      slug: "weeknight-favourites",
    });
    expect(result.slug).toBe("weeknight-favourites");
    expect(result.url).toBe("/group/weeknight-favourites");

    expect(
      await pathExists(join(contentDirectory, "groups/data/weeknights")),
    ).toBe(false);
    expect((await readGroupFile("weeknight-favourites")).items).toEqual([
      { recipe: "stew", label: "Mon" },
    ]);

    /* The index key moved with it: the old slug lists nowhere. */
    const listed = await groups.listGroups(ctx);
    expect(listed.groups.map((group) => group.slug)).toEqual([
      "weeknight-favourites",
    ]);
    await expect(groups.getGroup(ctx, "weeknights")).rejects.toMatchObject({
      code: "not_found",
    });

    /* Only a real rename carries `previousSlug`: the old URL now 404s. */
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contentType: "groups",
      kind: "update",
      slug: "weeknight-favourites",
      previousSlug: "weeknights",
    });

    /*
     * `group` is a scalar `dataField` on `featuredRecipeContentConfig`, so
     * `updateDependents` rewrote the feature's own record. Nothing in the
     * curation layer does this — it is engine behaviour, pinned here because
     * the alternative is a homepage card pointing at a 404.
     */
    const featured = await readJson(
      join(
        contentDirectory,
        "featured-recipes/data/weeknights-feature/featured-recipe.json",
      ),
    );
    expect(featured.group).toBe("weeknight-favourites");
  });

  it("refuses a rename onto an occupied slug", async () => {
    await groups.createGroup(ctx, { name: "Taken", slug: "taken" });
    await expect(
      groups.updateGroup(ctx, "weeknights", { slug: "taken" }),
    ).rejects.toBeInstanceOf(SlugConflictError);
    /* And the group it would have clobbered is untouched. */
    expect((await readGroupFile("taken")).name).toBe("Taken");
    expect((await readGroupFile("weeknights")).name).toBe("Weeknights");
  });

  it("refuses an `items` key, so a patch cannot wipe a plan", async () => {
    await expect(
      groups.updateGroup(ctx, "weeknights", { name: "Renamed", items: [] }),
    ).rejects.toMatchObject({ code: "validation" });
    expect((await readGroupFile("weeknights")).items).toHaveLength(1);
  });

  it("clears the picture on null and carries it forward otherwise", async () => {
    stubWeb("<html>Not an image</html>", {
      "https://cdn.example.com/img/cover.png?w=1200": { type: "image/png" },
    });
    await groups.createGroup(ctx, {
      name: "Pictured",
      slug: "pictured",
      imageImportUrl: "https://cdn.example.com/img/cover.png?w=1200",
    });
    const uploaded = join(
      contentDirectory,
      "uploads/group/pictured/uploads/cover.png",
    );
    expect(await pathExists(uploaded)).toBe(true);

    /* An unrelated patch leaves the file and the field where they were. */
    await groups.updateGroup(ctx, "pictured", { name: "Still Pictured" });
    expect((await readGroupFile("pictured")).image).toBe("cover.png");
    expect(await pathExists(uploaded)).toBe(true);

    /* A refused replacement throws before the write: the old picture stays. */
    await expect(
      groups.updateGroup(ctx, "pictured", {
        imageImportUrl: "https://example.com/page.html",
      }),
    ).rejects.toMatchObject({ code: "import_failed" });
    expect((await readGroupFile("pictured")).image).toBe("cover.png");
    expect(await pathExists(uploaded)).toBe(true);

    await groups.updateGroup(ctx, "pictured", { imageImportUrl: null });
    expect("image" in (await readGroupFile("pictured"))).toBe(false);
    expect(await pathExists(uploaded)).toBe(false);
  });

  it("404s a group that is not there", async () => {
    await expect(
      groups.updateGroup(ctx, "ghost", { name: "Nope" }),
    ).rejects.toMatchObject({ code: "not_found", details: { slug: "ghost" } });
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
    const all = await reindex(ctx);
    expect(all.rebuilt).toEqual([
      /* `tag-terms` appended at 24c, from the one line added to the registry. */
      "recipes",
      "featured-recipes",
      "pages",
      "groups",
      "tag-terms",
    ]);
    /* 29a: one timing per type rebuilt, plus the whole pass. */
    expect(Object.keys(all.timings ?? {})).toEqual([...all.rebuilt, "total"]);
    const one = await reindex(ctx, "groups");
    expect(one.rebuilt).toEqual(["groups"]);
    expect(Object.keys(one.timings ?? {})).toEqual(["groups", "total"]);
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

    await groups.addItem(
      recording,
      slug,
      { recipe: "first-recipe" },
      { label: "Tue" },
    );
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
  /* The taxonomy kind's Node-safe reads (24b): `listTags` folds through
   * `readTaxonomyTerms`, which is `readAggregate` underneath and touches no
   * Next API — the same standing the `aggregates/` prefix above has. */
  /^@discontent\/cms\/taxonomies\/[^/]+$/,
  /* `indexStamp` joined at 27b: the HEAD the indexes were built from, read
   * and written with `simple-git` and `fs` alone — the standing `commit` has. */
  /^@discontent\/cms\/git\/(commit|indexStamp|syncState)$/,
  /* `featuredRecipeContentConfig` and its default slug joined at 23a (D5): a
   * content config and a pure string builder, neither of which touches Next. */
  /* `tagTermContentConfig` joined at 24c, for the same standing the other three
   * content configs have: a config module that imports the engine's term kind
   * and one thunk, and touches no Next API. `feature --term` reads a term
   * record's data file through it. */
  /^recipe-website-common\/controller\/(types|recipeContentConfig|groupContentConfig|featuredRecipeContentConfig|tagTermContentConfig|createSlug|createGroupSlug|createFeaturedRecipeSlug|normalizeTags|recipeTagTaxonomy|groupTagTaxonomy|tagSlug|data\/read|data\/readGroups)$/,
  /^recipe-website-common\/components\/SearchForm\/queryLanguage$/,
  /* The pure halves of the term vocabulary joined at 31b, for the server's
   * hierarchy-aware `tag:` (`tagResolver.ts`): merge and expansion functions
   * over values the seat reads itself, no reads of their own. */
  /^recipe-website-common\/controller\/(tagVocabulary|tagExpansion)$/,
  /* The group search corpus joined at 30a, for `group:` in `searchRecipes`:
   * CLI-safe by construction (its T5/D8 note) — `readAllIds` and
   * `readContentFile` over configs already on this list, no `unstable_cache`. */
  /^recipe-website-common\/controller\/data\/readGroupSearchCorpus$/,
  /* The instance role (epic 28, 28a): reads `process.env` and `globalThis`
   * only, so a mirror's git seats can refuse to push or merge. */
  /^recipe-website-common\/config\/role$/,
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
        /* The one Node-safe value module under `data/` (30a, allow-list above). */
        if (statement.includes("controller/data/readGroupSearchCorpus")) {
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

/* ------------------------------------------------------------------ */
/* 14. 26b: inspect, drafts, dry runs, the image seat                  */
/* ------------------------------------------------------------------ */

describe("inspect and drafts (26b)", () => {
  it("returns a markup-free draft, the raw node, the meta and ranked images", async () => {
    const base = "https://cdn.example.com/wp-content/uploads/naan";
    stubWeb(
      recipeHtml({
        image: [`${base}-225x225.jpg`, `${base}.jpg`],
        recipeIngredient: [
          "1 1/2 cups flour",
          "For the topping:",
          "2 tbsp ghee",
        ],
        recipeInstructions: [
          { text: "Mix." },
          {
            "@type": "HowToSection",
            name: "Cook",
            itemListElement: [{ text: "Griddle." }],
          },
        ],
        recipeYield: ["8", "8 flatbreads"],
      }).replace(
        "<html><head>",
        '<html><head><meta property="og:site_name" content="Example Kitchen">',
      ),
    );
    const result = await inspectUrl(PAGE_URL);

    expect(result).toMatchObject({
      url: PAGE_URL,
      status: 200,
      partial: false,
      meta: { siteName: "Example Kitchen" },
    });
    /* No category signals on this page: no `suggestedTags` key at all. */
    expect("suggestedTags" in result).toBe(false);
    expect(result.images.map((image) => image.url)).toEqual([`${base}.jpg`]);
    expect(result.jsonLd).toMatchObject({ "@type": "Recipe", name: "Naan" });
    expect(result.draft).toEqual({
      name: "Naan",
      description: "South Asia's classic yeasted flatbread.",
      recipeYield: "8 flatbreads",
      ingredients: ["1 1/2 cups flour", "For the topping:", "2 tbsp ghee"],
      instructions: [
        "Mix.",
        { name: "Cook", instructions: [{ text: "Griddle." }] },
      ],
      source: { url: PAGE_URL, name: "Example Kitchen" },
      imageImportUrl: `${base}.jpg`,
    });
    /* The draft is what `create` takes — it creates the importer's record. */
    stubWeb("", { [`${base}.jpg`]: {} });
    await createRecipe(ctx, result.draft);
    const stored = await readRecipeFile("naan");
    expect(stored.ingredients?.[0].ingredient).toBe(
      '<Multiplyable baseNumber="1 1/2" /> cups flour',
    );
    expect(stored.ingredients?.[1]).toEqual({
      ingredient: "For the topping:",
      type: "heading",
    });
  });

  it("lifts the page's categories to suggestedTags, never into the draft (26d)", async () => {
    stubWeb(
      recipeHtml({
        recipeCategory: "Main Course",
        recipeCuisine: ["Indian"],
        keywords: "naan, flatbread, Indian",
      }),
      { [NAAN_IMAGE]: {} },
    );
    const result = await inspectUrl(PAGE_URL);
    expect(result.suggestedTags).toEqual([
      "main course",
      "indian",
      "naan",
      "flatbread",
    ]);
    expect(result.draft?.tags).toBeUndefined();
    expect(result.recipe?.suggestedTags).toBeUndefined();

    const dryRun = await importAndCreate(ctx, PAGE_URL, { dryRun: true });
    if (!("dryRun" in dryRun)) throw new Error("expected a dry run");
    expect(dryRun.suggestedTags).toEqual(result.suggestedTags);
    expect(dryRun.recipe.tags).toBeUndefined();
    expect(dryRun.draft.tags).toBeUndefined();
    expect(dryRun.recipe.suggestedTags).toBeUndefined();

    /* A real import stores none of them either. */
    await importAndCreate(ctx, PAGE_URL);
    const stored = await readRecipeFile("naan");
    expect(stored.tags).toBeUndefined();
    expect(stored.suggestedTags).toBeUndefined();
  });

  it("answers a page with no recipe with what it has, and truncates a huge node", async () => {
    stubWeb("<html><head><title>Nothing here</title></head></html>");
    const bare = await inspectUrl(PAGE_URL);
    expect(bare.partial).toBe(true);
    expect(bare.draft).toEqual({
      name: "Nothing here",
      source: { url: PAGE_URL, name: "example.com" },
    });

    stubWeb(recipeHtml({ notes: "x".repeat(25_000) }));
    const big = await inspectUrl(PAGE_URL);
    expect(typeof big.jsonLd).toBe("string");
    expect(big.jsonLd as string).toMatch(/\[truncated, \d+ characters\]$/);
  });

  it("puts the same draft on an import dry run, overrides applied", async () => {
    stubWeb(recipeHtml(), { [NAAN_IMAGE]: {} });
    const result = await importAndCreate(ctx, PAGE_URL, {
      dryRun: true,
      tags: ["bread"],
      slug: "my-naan",
    });
    if (!("dryRun" in result)) throw new Error("expected a dry run");
    expect(result.draft).toMatchObject({
      name: "Naan",
      slug: "my-naan",
      tags: ["bread"],
      ingredients: ["1 1/2 cups flour"],
      imageImportUrl: NAAN_IMAGE,
    });
  });
});

describe("create and update dry runs (26b)", () => {
  it("resolves the slug, reports a conflict, and writes nothing", async () => {
    stubWeb("", { [NAAN_IMAGE]: {} });
    const fresh = await previewCreateRecipe(ctx, {
      name: "Garlic Naan",
      imageImportUrl: NAAN_IMAGE,
    });
    expect(fresh).toMatchObject({
      dryRun: true,
      slug: "garlic-naan",
      conflict: false,
      recipe: { name: "Garlic Naan", image: "naan.jpg" },
      image: { filename: "naan.jpg", status: 200 },
    });
    expect(
      await pathExists(join(contentDirectory, "recipes/data/garlic-naan")),
    ).toBe(false);

    await createRecipe(ctx, { name: "Stew" });
    expect(await previewCreateRecipe(ctx, { name: "Stew" })).toMatchObject({
      slug: "stew",
      conflict: true,
    });
  });

  it("reports the image's size, and warns above 2 MB (epic 31)", async () => {
    const big = 9.7 * 1024 * 1024;
    stubWeb("", { [NAAN_IMAGE]: { length: big } });
    const preview = await previewCreateRecipe(ctx, {
      name: "Garlic Naan",
      imageImportUrl: NAAN_IMAGE,
    });
    expect(preview.image).toMatchObject({ filename: "naan.jpg", bytes: big });
    expect(preview.image?.warning).toMatch(/9\.7 MB, over 2\.0 MB/);
    expect(preview.warnings).toEqual([
      expect.stringContaining(`Image ${NAAN_IMAGE} is 9.7 MB`),
    ]);

    stubWeb("", { [NAAN_IMAGE]: { length: 300_000 } });
    const small = await previewCreateRecipe(ctx, {
      name: "Garlic Naan",
      imageImportUrl: NAAN_IMAGE,
    });
    expect(small.image?.bytes).toBe(300_000);
    expect(small.warnings).toBeUndefined();
  });

  it("warns on a real write that stores an image over 2 MB", async () => {
    stubWeb("", {
      [NAAN_IMAGE]: { body: "x".repeat(2 * 1024 * 1024 + 1) },
    });
    const created = await createRecipe(ctx, {
      name: "Garlic Naan",
      imageImportUrl: NAAN_IMAGE,
    });
    expect(created.warnings).toEqual([expect.stringContaining("over 2.0 MB")]);
    expect((await readRecipeFile("garlic-naan")).image).toBe("naan.jpg");
  });

  it("previews a patch, a rename onto a taken slug, and a missing recipe", async () => {
    await createRecipe(ctx, { name: "Stew", description: "Stewy." });
    await createRecipe(ctx, { name: "Soup" });

    const preview = await previewUpdateRecipe(ctx, "stew", {
      description: "Stewier.",
      slug: "soup",
    });
    expect(preview).toMatchObject({
      slug: "soup",
      previousSlug: "stew",
      conflict: true,
      recipe: { name: "Stew", description: "Stewier." },
    });
    expect((await readRecipeFile("stew")).description).toBe("Stewy.");

    await expect(
      previewUpdateRecipe(ctx, "nope", { name: "Nope" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("setRecipeImage (26b)", () => {
  const uploads = () => join(contentDirectory, "uploads/recipe/stew/uploads");

  it("sets from a URL, replaces with a File, and clears", async () => {
    await createRecipe(ctx, { name: "Stew" });
    stubWeb("", { "https://example.com/a.png": { type: "image/png" } });

    const fromUrl = await setRecipeImage(ctx, "stew", {
      url: "https://example.com/a.png",
    });
    expect(fromUrl).toMatchObject({ slug: "stew", image: "a.png" });
    expect(await pathExists(join(uploads(), "a.png"))).toBe(true);

    const fromFile = await setRecipeImage(ctx, "stew", {
      file: new File(["png"], "My Photo.png", { type: "image/png" }),
    });
    expect(fromFile).toMatchObject({
      image: "My-Photo.png",
      previous: "a.png",
    });
    expect(await pathExists(join(uploads(), "a.png"))).toBe(false);
    expect(await readFile(join(uploads(), "My-Photo.png"), "utf8")).toBe("png");
    expect((await readRecipeFile("stew")).image).toBe("My-Photo.png");

    const cleared = await setRecipeImage(ctx, "stew", { clear: true });
    expect(cleared).toMatchObject({ image: null, previous: "My-Photo.png" });
    expect("image" in (await readRecipeFile("stew"))).toBe(false);
    expect(await pathExists(join(uploads(), "My-Photo.png"))).toBe(false);
  });

  it("refuses a non-image file, an empty choice, and a missing recipe", async () => {
    await createRecipe(ctx, { name: "Stew" });
    await expect(
      setRecipeImage(ctx, "stew", {
        file: new File(["#!/bin/sh"], "run.sh", { type: "text/x-sh" }),
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setRecipeImage(ctx, "stew", {} as never),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setRecipeImage(ctx, "nope", { clear: true }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
