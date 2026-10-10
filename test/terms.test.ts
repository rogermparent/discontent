// @vitest-environment node
//
// The term seats (31c, epic 24's 24e), against the real engine in a tmpdir.
//
// Harness copied from `test/featured.test.ts`: the real content configs, a
// tmpdir that is not a git repository (so commits no-op), and the content
// directory threaded through every call (T16).
//
// What is pinned is what `curation/terms.ts` claims on top of the engine:
// carriers are matched by slug and written one update each; the record and
// the carriers move together on a rename, and children and features follow
// the record by reference (24-T8); a merge folds a term in two ways depending
// on whether the target has a record; a delete is refused while anything
// carries the term; a parent cannot close a cycle; pinned recipes must carry
// the term. And, in the same phase, `Group.kind` narrowing to `meal-plan`.

import { mkdtemp, pathExists, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { createContent } from "@discontent/cms/content/createContent";

import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import type {
  FeaturedRecipe,
  Group,
  GroupEntryKey,
  GroupEntryValue,
  Recipe,
  TagTerm,
} from "../websites/recipe-website/common/controller/types";

import type {
  ContentWriteEvent,
  CurationContext,
} from "../websites/recipe-website/editor/controller/curation/context";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  feature,
  listFeatured,
} from "../websites/recipe-website/editor/controller/curation/featured";
import { GIT_TYPES } from "../websites/recipe-website/editor/controller/curation/git";
import {
  createGroup,
  updateGroup,
} from "../websites/recipe-website/editor/controller/curation/groups";
import { setTermImage } from "../websites/recipe-website/editor/controller/curation/recipeImage";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { searchRecipes } from "../websites/recipe-website/editor/controller/curation/search";
import {
  assertTaxonomy,
  assignTerm,
  carrierTag,
  createTerm,
  deleteTerm,
  getTerm,
  listTerms,
  mergeTerm,
  renameTerm,
  updateTerm,
} from "../websites/recipe-website/editor/controller/curation/terms";
import { successConfigFor } from "../websites/recipe-website/editor/controller/successConfigs";
import { tagTermContentConfig } from "../websites/recipe-website/common/controller/tagTermContentConfig";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "terms-"));
  ctx = { contentDirectory };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;

  await createRecipe(ctx, {
    name: "Shortbread",
    slug: "shortbread",
    date: 1_000,
    tags: ["cookies", "baked"],
  });
  await createRecipe(ctx, {
    name: "Linzer Cookies",
    slug: "linzer",
    date: 2_000,
    tags: ["Cookies"],
  });
  await createRecipe(ctx, {
    name: "Chili",
    slug: "chili",
    date: 3_000,
    tags: ["dinner"],
  });
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

function readRecipeTags(slug: string): Promise<string[] | undefined> {
  return readJson(
    join(contentDirectory, "recipes/data", slug, "recipe.json"),
  ).then((recipe: Recipe) => recipe.tags);
}

function termFile(slug: string): string {
  return join(contentDirectory, "taxonomies/tag/data", slug, "term.json");
}

function readTermFile(slug: string): Promise<TagTerm> {
  return readJson(termFile(slug));
}

function featuredFile(slug: string): string {
  return join(
    contentDirectory,
    "featured-recipes/data",
    slug,
    "featured-recipe.json",
  );
}

function readFeaturedFile(slug: string): Promise<FeaturedRecipe> {
  return readJson(featuredFile(slug));
}

/** The strip as the index has it: `[entry slug, term]`, oldest first. */
async function featuredTerms(): Promise<[string, string | undefined][]> {
  const { featured } = await listFeatured(ctx, { limit: 100 });
  return featured
    .map((row): [string, string | undefined] => [row.slug, row.term])
    .reverse();
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toErrorObject(error).error;
  }
  throw new Error("expected a rejection");
}

/* ------------------------------------------------------------------ */
/* 1. Records                                                          */
/* ------------------------------------------------------------------ */

describe("createTerm / updateTerm", () => {
  it("derives the slug from the label and reports the carrier string", async () => {
    const events: ContentWriteEvent[] = [];
    const result = await createTerm(
      { contentDirectory, onWrite: (event) => events.push(event) },
      { label: "Christmas Cookies", description: "December." },
    );
    expect(result).toMatchObject({
      slug: "christmas-cookies",
      url: "/tags/christmas-cookies",
      tag: "christmas cookies",
    });
    expect(result.warnings).toBeUndefined();
    expect(await readTermFile("christmas-cookies")).toEqual({
      label: "Christmas Cookies",
      date: result.date,
      description: "December.",
    });
    /* The write event the API routes revalidate by, and a config for it. */
    expect(events).toEqual([
      expect.objectContaining({ contentType: "tag-terms", kind: "create" }),
    ]);
    expect(successConfigFor("tag-terms", "write").itemBasePath).toBe("/tags");
    expect(successConfigFor("tag-terms", "delete").redirectTo?.("x")).toBe(
      "/tags",
    );
  });

  it("warns when the label does not slug to the record's slug", async () => {
    const result = await createTerm(ctx, {
      label: "Linzer Biscuits",
      slug: "linzer",
    });
    expect(result.tag).toBe("linzer");
    expect(result.warnings).toEqual([expect.stringContaining("does not slug")]);
  });

  it("refuses a slug that already has a record", async () => {
    await createTerm(ctx, { label: "Cookies" });
    expect(await codeOf(createTerm(ctx, { label: "cookies" }))).toMatchObject({
      code: "slug_conflict",
      slug: "cookies",
    });
  });

  it("requires the parent to be a record, and refuses a cycle at any depth", async () => {
    expect(
      await codeOf(createTerm(ctx, { label: "Linzer", parent: "cookies" })),
    ).toMatchObject({ code: "unknown_term", terms: ["cookies"] });
    expect(
      await codeOf(createTerm(ctx, { label: "Cookies", parent: "cookies" })),
    ).toMatchObject({ code: "term_cycle", terms: ["cookies", "cookies"] });

    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Cookies", parent: "dessert" });
    await createTerm(ctx, { label: "Linzer", parent: "cookies" });

    expect(
      await codeOf(updateTerm(ctx, "dessert", { parent: "linzer" })),
    ).toMatchObject({
      code: "term_cycle",
      terms: ["dessert", "linzer", "cookies", "dessert"],
    });
    expect(
      await codeOf(updateTerm(ctx, "linzer", { parent: "linzer" })),
    ).toMatchObject({ code: "term_cycle", terms: ["linzer", "linzer"] });
    /* Nothing was written by the refusals. */
    expect((await readTermFile("dessert")).parent).toBeUndefined();
  });

  it("patches, clears with null, and checks pinned recipes carry the term", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, {
      label: "Cookies",
      parent: "dessert",
      description: "Small.",
      pinned: ["linzer", "shortbread", "linzer"],
    });
    /* Deduplicated, order kept. */
    expect((await readTermFile("cookies")).pinned).toEqual([
      "linzer",
      "shortbread",
    ]);

    expect(
      await codeOf(updateTerm(ctx, "cookies", { pinned: ["chili", "nope"] })),
    ).toMatchObject({
      code: "validation",
      issues: [
        {
          path: "pinned.0",
          message: expect.stringContaining("does not carry"),
        },
        { path: "pinned.1", message: expect.stringContaining("No recipe") },
      ],
    });

    await updateTerm(ctx, "cookies", {
      label: "Biscuits and Cookies",
      description: null,
      parent: null,
      pinned: null,
    });
    const stored = await readTermFile("cookies");
    expect(stored.label).toBe("Biscuits and Cookies");
    expect(stored).not.toHaveProperty("description");
    expect(stored).not.toHaveProperty("parent");
    expect(stored).not.toHaveProperty("pinned");

    /* A slug in the patch is not a rename: the schema refuses it. */
    expect(
      await codeOf(updateTerm(ctx, "cookies", { slug: "biscuits" })),
    ).toMatchObject({ code: "validation" });
    expect(await codeOf(updateTerm(ctx, "ghost", {}))).toMatchObject({
      code: "not_found",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 1b. Pictures (32c, D2: everything a recipe picture takes)           */
/* ------------------------------------------------------------------ */

describe("term pictures (32c)", () => {
  const uploads = (slug: string) =>
    join(contentDirectory, "uploads/tag-term", slug, "uploads");
  const png = (name: string, body: BlobPart = "png") =>
    new File([body], name, { type: "image/png" });

  /** `fetch` answering every URL with a small PNG, counting the calls. */
  function stubImageFetch() {
    const fetchStub = vi.fn(
      async (_input: string | URL, init?: RequestInit) =>
        new Response(init?.method === "HEAD" ? null : "fetched png", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("setTermImage sets from a URL, replaces with a File, and clears", async () => {
    await createTerm(ctx, { label: "Cookies" });
    stubImageFetch();
    const events: ContentWriteEvent[] = [];
    const watched = {
      contentDirectory,
      onWrite: (e: ContentWriteEvent) => events.push(e),
    };

    const fromUrl = await setTermImage(watched, "cookies", {
      url: "https://example.com/tin.png",
    });
    expect(fromUrl).toMatchObject({
      slug: "cookies",
      image: "tin.png",
      url: "/tags/cookies",
      path: termFile("cookies"),
    });
    expect(await pathExists(join(uploads("cookies"), "tin.png"))).toBe(true);

    const fromFile = await setTermImage(ctx, "cookies", {
      file: png("Cookie Tin.png"),
    });
    expect(fromFile).toMatchObject({
      image: "Cookie-Tin.png",
      previous: "tin.png",
    });
    expect(await pathExists(join(uploads("cookies"), "tin.png"))).toBe(false);
    expect(await readTermFile("cookies")).toMatchObject({
      label: "Cookies",
      image: "Cookie-Tin.png",
    });

    const cleared = await setTermImage(watched, "cookies", { clear: true });
    expect(cleared).toMatchObject({ image: null, previous: "Cookie-Tin.png" });
    expect(await readTermFile("cookies")).not.toHaveProperty("image");
    expect(await pathExists(join(uploads("cookies"), "Cookie-Tin.png"))).toBe(
      false,
    );
    /* The write event the API route revalidates by: the term record's. */
    expect(events).toEqual([
      expect.objectContaining({ contentType: "tag-terms", kind: "update" }),
      expect.objectContaining({ contentType: "tag-terms", kind: "update" }),
    ]);

    /* Clearing nothing writes nothing. */
    events.length = 0;
    expect(await setTermImage(watched, "cookies", { clear: true })).toEqual({
      slug: "cookies",
      image: null,
      path: termFile("cookies"),
      url: "/tags/cookies",
    });
    expect(events).toEqual([]);
  });

  it("setTermImage refuses a carried-only term, a non-image and an empty choice", async () => {
    /* `cookies` is on two recipes but has no record to keep a picture in. */
    expect(
      await codeOf(setTermImage(ctx, "cookies", { file: png("a.png") })),
    ).toMatchObject({
      code: "not_found",
      message: expect.stringContaining("term_create"),
    });
    await createTerm(ctx, { label: "Cookies" });
    expect(
      await codeOf(
        setTermImage(ctx, "cookies", {
          file: new File(["#!/bin/sh"], "run.sh", { type: "text/x-sh" }),
        }),
      ),
    ).toMatchObject({ code: "validation" });
    expect(
      await codeOf(setTermImage(ctx, "cookies", {} as never)),
    ).toMatchObject({ code: "validation" });
    expect(await readTermFile("cookies")).not.toHaveProperty("image");
  });

  it("createTerm takes an uploaded file, which beats a URL", async () => {
    const fetchStub = stubImageFetch();
    const result = await createTerm(
      ctx,
      { label: "Cookies", imageImportUrl: "https://example.com/tin.png" },
      { imageFile: png("My Tin.png") },
    );
    expect(result.warnings).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
    expect((await readTermFile("cookies")).image).toBe("My-Tin.png");
    expect(await pathExists(join(uploads("cookies"), "My-Tin.png"))).toBe(true);
  });

  it("updateTerm: a file beats a URL and a clear; null alone clears", async () => {
    await createTerm(ctx, { label: "Cookies" }, { imageFile: png("a.png") });
    const fetchStub = stubImageFetch();

    await updateTerm(
      ctx,
      "cookies",
      { imageImportUrl: "https://example.com/tin.png" },
      { imageFile: png("b.png") },
    );
    expect(fetchStub).not.toHaveBeenCalled();
    expect((await readTermFile("cookies")).image).toBe("b.png");

    await updateTerm(
      ctx,
      "cookies",
      { imageImportUrl: null },
      { imageFile: png("c.png") },
    );
    expect((await readTermFile("cookies")).image).toBe("c.png");
    expect(await pathExists(join(uploads("cookies"), "b.png"))).toBe(false);

    /* No file: the URL is fetched, and then null clears. */
    await updateTerm(ctx, "cookies", {
      imageImportUrl: "https://example.com/tin.png",
    });
    expect(fetchStub).toHaveBeenCalled();
    expect((await readTermFile("cookies")).image).toBe("tin.png");
    await updateTerm(ctx, "cookies", { imageImportUrl: null });
    expect(await readTermFile("cookies")).not.toHaveProperty("image");
  });

  it("files a refused upload under `image` and writes nothing", async () => {
    await createTerm(ctx, { label: "Cookies", description: "Small." });
    expect(
      await codeOf(
        updateTerm(
          ctx,
          "cookies",
          { description: "Changed." },
          {
            imageFile: new File(["text"], "notes.txt", { type: "text/plain" }),
          },
        ),
      ),
    ).toMatchObject({
      code: "validation",
      issues: [
        { path: "image", message: expect.stringContaining("notes.txt") },
      ],
    });
    expect(await readTermFile("cookies")).toMatchObject({
      description: "Small.",
    });
    expect(
      await codeOf(
        createTerm(
          ctx,
          { label: "Bars" },
          {
            imageFile: new File(["text"], "notes.txt", { type: "text/plain" }),
          },
        ),
      ),
    ).toMatchObject({ code: "validation", issues: [{ path: "image" }] });
    expect(await pathExists(termFile("bars"))).toBe(false);
  });

  it("warns when an uploaded picture is over 2 MB, as a recipe's does", async () => {
    const big = png("big.png", new Uint8Array(2_200_000));
    const created = await createTerm(
      ctx,
      { label: "Cookies" },
      { imageFile: big },
    );
    expect(created.warnings).toEqual([expect.stringContaining("over 2.0 MB")]);
    const set = await setTermImage(ctx, "cookies", { file: big });
    expect(set.warnings).toEqual([expect.stringContaining("over 2.0 MB")]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Reads                                                            */
/* ------------------------------------------------------------------ */

describe("listTerms / getTerm", () => {
  it("lists the merged vocabulary with records, parents and counts", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Cookies", parent: "dessert" });

    const all = await listTerms(ctx);
    expect(all.terms).toEqual([
      { slug: "baked", label: "baked", count: 1, record: false },
      {
        slug: "cookies",
        label: "Cookies",
        count: 2,
        parent: "dessert",
        record: true,
      },
      { slug: "dessert", label: "Dessert", count: 0, record: true },
      { slug: "dinner", label: "dinner", count: 1, record: false },
    ]);
    expect((await listTerms(ctx, { records: true })).total).toBe(2);
    expect(await listTerms(ctx, { limit: 1, offset: 1 })).toMatchObject({
      total: 4,
      more: true,
      terms: [{ slug: "cookies" }],
    });
  });

  it("answers own and with-descendants counts, children and breadcrumb", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Cookies", parent: "dessert" });
    await assignTerm(ctx, "dessert", { add: ["chili"] });

    const dessert = await getTerm(ctx, "dessert");
    expect(dessert).toMatchObject({
      slug: "dessert",
      label: "Dessert",
      record: { label: "Dessert" },
      counts: { own: 1, withDescendants: 3 },
      children: [{ slug: "cookies", label: "Cookies", count: 2 }],
      breadcrumb: [{ slug: "dessert", label: "Dessert", count: 1 }],
      recipes: ["chili"],
      groups: [],
    });
    expect(dessert.path).toBe(termFile("dessert"));

    /* A term with carriers and no record is still a term. */
    expect(await getTerm(ctx, "baked")).toMatchObject({
      record: null,
      label: "baked",
      counts: { own: 1, withDescendants: 1 },
    });
    expect((await getTerm(ctx, "baked")).path).toBeUndefined();
    expect(await codeOf(getTerm(ctx, "ghost"))).toMatchObject({
      code: "not_found",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 3. Carriers                                                         */
/* ------------------------------------------------------------------ */

describe("assignTerm", () => {
  it("adds and removes by slug, one update each, and reports what moved", async () => {
    await createTerm(ctx, { label: "Christmas Cookies" });
    const added = await assignTerm(ctx, "christmas-cookies", {
      add: ["shortbread", "linzer", "nope"],
    });
    expect(added).toEqual({
      slug: "christmas-cookies",
      type: "recipe",
      tag: "christmas cookies",
      updated: ["shortbread", "linzer"],
      unchanged: [],
      missing: ["nope"],
    });
    expect(await readRecipeTags("shortbread")).toEqual([
      "cookies",
      "baked",
      "christmas cookies",
    ]);

    /* "Cookies" and "cookies" are one term: removal matches by slug. */
    const removed = await assignTerm(ctx, "cookies", {
      remove: ["linzer", "chili"],
    });
    expect(removed).toMatchObject({
      updated: ["linzer"],
      unchanged: ["chili"],
    });
    expect(await readRecipeTags("linzer")).toEqual(["christmas cookies"]);
  });

  it("tags groups with type: group, and needs no record for a bare tag", async () => {
    await createGroup(ctx, { name: "Week One", items: ["chili"] });
    const result = await assignTerm(ctx, "Weeknight", {
      add: ["week-one"],
      type: "group",
    });
    expect(result).toMatchObject({
      slug: "weeknight",
      type: "group",
      tag: "weeknight",
      updated: ["week-one"],
    });
    expect(
      (
        (await readJson(
          join(contentDirectory, "groups/data/week-one/group.json"),
        )) as Group
      ).tags,
    ).toEqual(["weeknight"]);
    expect((await getTerm(ctx, "weeknight")).groups).toEqual(["week-one"]);
  });

  it("refuses an empty assignment and a slug on both sides", async () => {
    expect(await codeOf(assignTerm(ctx, "cookies", {}))).toMatchObject({
      code: "validation",
    });
    expect(
      await codeOf(
        assignTerm(ctx, "cookies", { add: ["chili"], remove: ["chili"] }),
      ),
    ).toMatchObject({ code: "validation" });
  });
});

/* ------------------------------------------------------------------ */
/* 4. Rename, merge, delete                                            */
/* ------------------------------------------------------------------ */

describe("renameTerm", () => {
  it("moves the record and rewrites carriers; children and features follow", async () => {
    await createTerm(ctx, { label: "Cookies", pinned: ["shortbread"] });
    await createTerm(ctx, { label: "Linzer", parent: "cookies" });
    await feature(ctx, { term: "cookies", slug: "cookies-strip" });

    const result = await renameTerm(ctx, "cookies", { to: "Biscuits" });
    expect(result).toMatchObject({
      from: "cookies",
      slug: "biscuits",
      label: "Biscuits",
      tag: "biscuits",
      record: true,
      recipes: ["linzer", "shortbread"],
      groups: [],
    });
    expect(await pathExists(termFile("cookies"))).toBe(false);
    expect(await readTermFile("biscuits")).toMatchObject({
      label: "Biscuits",
      pinned: ["shortbread"],
    });
    expect(await readRecipeTags("shortbread")).toEqual(["biscuits", "baked"]);
    expect(await readRecipeTags("linzer")).toEqual(["biscuits"]);
    /* By reference, through the engine (24-T8): no hierarchy code in the seat. */
    expect((await readTermFile("linzer")).parent).toBe("biscuits");
    expect(
      (
        (await readJson(
          join(
            contentDirectory,
            "featured-recipes/data/cookies-strip/featured-recipe.json",
          ),
        )) as FeaturedRecipe
      ).term,
    ).toBe("biscuits");
    /* And the hierarchy-aware search follows it. */
    expect((await searchRecipes(ctx, "tag:biscuits")).total).toBe(2);
  });

  it("renames a carried-only term, and refuses an existing target", async () => {
    const result = await renameTerm(ctx, "baked", { to: "oven-baked" });
    expect(result).toMatchObject({ record: false, recipes: ["shortbread"] });
    expect(await readRecipeTags("shortbread")).toEqual([
      "cookies",
      "oven-baked",
    ]);
    expect(
      await codeOf(renameTerm(ctx, "oven-baked", { to: "dinner" })),
    ).toMatchObject({ code: "slug_conflict", slug: "dinner" });
    expect(
      await codeOf(renameTerm(ctx, "ghost", { to: "spirit" })),
    ).toMatchObject({ code: "not_found" });
  });
});

describe("mergeTerm", () => {
  it("moves the record when the target has none", async () => {
    await createTerm(ctx, { label: "Biscuits", description: "British." });
    await assignTerm(ctx, "biscuits", { add: ["shortbread"] });

    const result = await mergeTerm(ctx, "biscuits", { into: "cookies" });
    expect(result).toMatchObject({
      from: "biscuits",
      into: "cookies",
      tag: "cookies",
      recordMoved: true,
      deleted: false,
    });
    /* The tag is gone; the carrier already had the target, so no duplicate. */
    expect(await readRecipeTags("shortbread")).toEqual(["cookies", "baked"]);
    expect(await readTermFile("cookies")).toMatchObject({
      label: "cookies",
      description: "British.",
    });
    expect(await pathExists(termFile("biscuits"))).toBe(false);
  });

  it("folds into a target record: children, features and pinned move, then delete", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Sweets" });
    await assignTerm(ctx, "sweets", { add: ["chili"] });
    await assignTerm(ctx, "treats", { add: ["chili"] });
    await createTerm(ctx, {
      label: "Treats",
      parent: "dessert",
      pinned: ["chili"],
    });
    /* `dessert` sits under `sweets`, so it must not end up under `dessert`. */
    await updateTerm(ctx, "dessert", { parent: "sweets" });
    await createTerm(ctx, { label: "Candy", parent: "sweets" });
    await feature(ctx, { term: "sweets", slug: "sweets-strip" });

    const result = await mergeTerm(ctx, "sweets", { into: "treats" });
    expect(result).toMatchObject({
      recordMoved: false,
      deleted: true,
      featured: ["sweets-strip"],
    });
    expect(result.reparented).toEqual(
      expect.arrayContaining([
        { slug: "candy", parent: "treats" },
        /* An ancestor of `treats`: it goes up to `sweets`' parent (none). */
        { slug: "dessert" },
      ]),
    );
    expect(await pathExists(termFile("sweets"))).toBe(false);
    expect((await readTermFile("candy")).parent).toBe("treats");
    expect((await readTermFile("dessert")).parent).toBeUndefined();
    expect(await readRecipeTags("chili")).toEqual(["dinner", "treats"]);
    expect(
      (
        (await readJson(
          join(
            contentDirectory,
            "featured-recipes/data/sweets-strip/featured-recipe.json",
          ),
        )) as FeaturedRecipe
      ).term,
    ).toBe("treats");
  });

  it("unfeatures instead of re-pointing when the target is already featured (31-D2)", async () => {
    await createTerm(ctx, { label: "Sweets" });
    await createTerm(ctx, { label: "Treats" });
    await feature(ctx, { term: "treats", slug: "treats-strip", date: 1 });
    await feature(ctx, { term: "sweets", slug: "sweets-strip", date: 2 });

    const result = await mergeTerm(ctx, "sweets", { into: "treats" });
    expect(result).toMatchObject({
      deleted: true,
      featured: [],
      unfeatured: ["sweets-strip"],
    });
    expect(await pathExists(featuredFile("sweets-strip"))).toBe(false);
    expect(await featuredTerms()).toEqual([["treats-strip", "treats"]]);
  });

  it("refuses itself and a target that does not exist", async () => {
    expect(
      await codeOf(mergeTerm(ctx, "cookies", { into: "cookies" })),
    ).toMatchObject({ code: "validation" });
    expect(
      await codeOf(mergeTerm(ctx, "cookies", { into: "ghost" })),
    ).toMatchObject({ code: "not_found", slug: "ghost" });
  });
});

describe("deleteTerm", () => {
  it("is term_in_use while carried, and unassigns on request", async () => {
    await createTerm(ctx, { label: "Cookies" });
    expect(await codeOf(deleteTerm(ctx, "cookies"))).toMatchObject({
      code: "term_in_use",
      slug: "cookies",
      recipes: ["linzer", "shortbread"],
    });
    expect(await pathExists(termFile("cookies"))).toBe(true);

    expect(await deleteTerm(ctx, "cookies", { unassign: true })).toEqual({
      slug: "cookies",
      deleted: true,
      recipes: ["linzer", "shortbread"],
      groups: [],
      reparented: [],
      featured: [],
      unfeatured: [],
    });
    expect(await readRecipeTags("shortbread")).toEqual(["baked"]);
    expect(await readRecipeTags("linzer")).toBeUndefined();
    expect(await pathExists(termFile("cookies"))).toBe(false);
  });

  it("moves children up to the deleted term's parent", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Treats", parent: "dessert" });
    await createTerm(ctx, { label: "Candy", parent: "treats" });
    expect(await deleteTerm(ctx, "treats")).toMatchObject({
      deleted: true,
      reparented: [{ slug: "candy", parent: "dessert" }],
    });
    expect((await readTermFile("candy")).parent).toBe("dessert");
    expect(await codeOf(deleteTerm(ctx, "ghost"))).toMatchObject({
      code: "not_found",
    });
  });

  /* Epic 32, D1: a delete moves the feature to the parent, else unfeatures it. */

  it("re-points the term's features at its parent", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Treats", parent: "dessert" });
    await feature(ctx, { term: "treats", slug: "treats-strip" });

    expect(await deleteTerm(ctx, "treats")).toMatchObject({
      deleted: true,
      featured: ["treats-strip"],
      unfeatured: [],
    });
    expect((await readFeaturedFile("treats-strip")).term).toBe("dessert");
    expect(await featuredTerms()).toEqual([["treats-strip", "dessert"]]);
  });

  it("unfeatures the term's features when it has no parent", async () => {
    await createTerm(ctx, { label: "Treats" });
    await feature(ctx, { term: "treats", slug: "treats-strip", date: 1 });
    await feature(ctx, {
      term: "treats",
      slug: "treats-again",
      date: 2,
      again: true,
    });

    expect(await deleteTerm(ctx, "treats")).toMatchObject({
      deleted: true,
      featured: [],
      unfeatured: ["treats-again", "treats-strip"],
    });
    expect(await pathExists(featuredFile("treats-strip"))).toBe(false);
    expect(await pathExists(featuredFile("treats-again"))).toBe(false);
    expect(await featuredTerms()).toEqual([]);
  });

  it("unfeatures instead when the parent is already featured (31-D2)", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Treats", parent: "dessert" });
    await feature(ctx, { term: "dessert", slug: "dessert-strip", date: 1 });
    await feature(ctx, { term: "treats", slug: "treats-strip", date: 2 });

    expect(await deleteTerm(ctx, "treats")).toMatchObject({
      featured: [],
      unfeatured: ["treats-strip"],
    });
    /* One card for the parent, not two. */
    expect(await featuredTerms()).toEqual([["dessert-strip", "dessert"]]);
  });

  it("leaves other terms' features alone", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Treats" });
    await feature(ctx, { term: "dessert", slug: "dessert-strip", date: 1 });

    expect(await deleteTerm(ctx, "treats")).toMatchObject({
      featured: [],
      unfeatured: [],
    });
    expect(await featuredTerms()).toEqual([["dessert-strip", "dessert"]]);
  });
});

/* ------------------------------------------------------------------ */
/* 5. The rest of 31c's surface                                        */
/* ------------------------------------------------------------------ */

describe("the edges", () => {
  it("knows one taxonomy, and git addresses term records", () => {
    expect(() => assertTaxonomy("tag")).not.toThrow();
    expect(
      toErrorObject(captured(() => assertTaxonomy("genre"))),
    ).toMatchObject({ error: { code: "not_found" } });
    expect(GIT_TYPES.term.contentType).toBe("tag-terms");
  });

  it("writes the label as the carrier string only when it slugs back", () => {
    expect(carrierTag("christmas-cookies", "Christmas  Cookies")).toBe(
      "christmas cookies",
    );
    expect(carrierTag("linzer", "Linzer Biscuits")).toBe("linzer");
    expect(carrierTag("linzer")).toBe("linzer");
  });
});

describe("Group.kind narrows to meal-plan (24-D5)", () => {
  it("refuses a new collection and a patch that names one", async () => {
    expect(
      await codeOf(createGroup(ctx, { name: "Tin", kind: "collection" })),
    ).toMatchObject({
      code: "validation",
      issues: [
        { path: "kind", message: expect.stringContaining("term_create") },
      ],
    });
    const created = await createGroup(ctx, { name: "Week" });
    expect(
      (
        (await readJson(
          join(contentDirectory, "groups/data", created.slug, "group.json"),
        )) as Group
      ).kind,
    ).toBe("meal-plan");
    expect(
      await codeOf(updateGroup(ctx, created.slug, { kind: "collection" })),
    ).toMatchObject({ code: "validation" });
  });

  it("keeps an existing collection readable and editable", async () => {
    await createContent<Group, GroupEntryValue, GroupEntryKey>({
      config: groupContentConfig,
      slug: "old-tin",
      data: { name: "Old Tin", date: 5_000, kind: "collection", items: [] },
      contentDirectory,
    });
    await updateGroup(ctx, "old-tin", { name: "Older Tin", tags: ["holiday"] });
    const stored = (await readJson(
      join(contentDirectory, "groups/data/old-tin/group.json"),
    )) as Group;
    expect(stored).toMatchObject({ name: "Older Tin", kind: "collection" });
  });
});

function captured(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

/* ------------------------------------------------------------------ */
/* Aliases (epic 32, 32i — D5)                                         */
/* ------------------------------------------------------------------ */

describe("term aliases (32i)", () => {
  it("stores normalised aliases, deduplicated by slug, and getTerm / listTerms show them", async () => {
    await createTerm(ctx, {
      label: "Cookies",
      aliases: ["Biscuits", "biscuits", " Christmas  Biscuits "],
    });
    expect((await readTermFile("cookies")).aliases).toEqual([
      "biscuits",
      "christmas biscuits",
    ]);
    expect(await getTerm(ctx, "cookies")).toMatchObject({
      aliases: ["biscuits", "christmas biscuits"],
    });
    const { terms } = await listTerms(ctx);
    expect(terms.find((term) => term.slug === "cookies")).toMatchObject({
      aliases: ["biscuits", "christmas biscuits"],
    });
    /* A term without any keeps the exact old row shape (T16). */
    expect(terms.find((term) => term.slug === "dinner")).toEqual({
      slug: "dinner",
      label: "dinner",
      count: 1,
      record: false,
    });
  });

  it("refuses its own slug, another term, and another term's alias — one issue each", async () => {
    await createTerm(ctx, { label: "Treats", aliases: ["goodies"] });
    const error = await codeOf(
      createTerm(ctx, {
        label: "Cookies",
        aliases: ["cookies", "dinner", "Treats", "goodies", "fine"],
      }),
    );
    expect(error).toMatchObject({ code: "validation" });
    expect(error.issues).toEqual([
      { path: "aliases.0", message: '"cookies" is this term\'s own slug' },
      {
        path: "aliases.1",
        message: expect.stringContaining('names the term "dinner"'),
      },
      {
        path: "aliases.2",
        message: expect.stringContaining('names the term "treats"'),
      },
      {
        path: "aliases.3",
        message: '"goodies" is already an alias of the term "treats"',
      },
    ]);
    /* Nothing was written. */
    expect(await pathExists(termFile("cookies"))).toBe(false);
  });

  it("an update replaces the list, null clears it, and a kept alias is not rechecked", async () => {
    await createTerm(ctx, { label: "Cookies", aliases: ["biscuits"] });
    /* The alias comes to be carried as a tag — nothing canonicalises it. */
    await assignTerm(ctx, "biscuits", { add: ["chili"] });
    await updateTerm(ctx, "cookies", { aliases: ["biscuits", "bikkies"] });
    expect((await readTermFile("cookies")).aliases).toEqual([
      "biscuits",
      "bikkies",
    ]);
    /* Adding one that a carrier uses is refused, though. */
    expect(
      await codeOf(updateTerm(ctx, "cookies", { aliases: ["dinner"] })),
    ).toMatchObject({ code: "validation" });
    await updateTerm(ctx, "cookies", { aliases: null });
    expect(await readTermFile("cookies")).not.toHaveProperty("aliases");
    await updateTerm(ctx, "cookies", { aliases: ["bikkies"] });
    await updateTerm(ctx, "cookies", { aliases: [] });
    expect(await readTermFile("cookies")).not.toHaveProperty("aliases");
  });

  it("a new term may not take another term's alias as its slug", async () => {
    await createTerm(ctx, { label: "Cookies", aliases: ["biscuits"] });
    expect(await codeOf(createTerm(ctx, { label: "Biscuits" }))).toMatchObject({
      code: "validation",
      issues: [{ path: "slug", message: expect.stringContaining('"cookies"') }],
    });
    await createTerm(ctx, { label: "Holiday" });
    expect(
      await codeOf(renameTerm(ctx, "holiday", { to: "biscuits" })),
    ).toMatchObject({ code: "validation", issues: [{ path: "to" }] });
  });

  it("a rename onto one of its own aliases drops that alias", async () => {
    await createTerm(ctx, {
      label: "Cookies",
      aliases: ["biscuits", "bikkies"],
    });
    await renameTerm(ctx, "cookies", { to: "biscuits" });
    expect((await readTermFile("biscuits")).aliases).toEqual(["bikkies"]);
  });

  it("a merge makes the merged-away slug an alias of the target", async () => {
    /* Target with a record: `from` and its own aliases join `into`'s. */
    await createTerm(ctx, { label: "Treats", aliases: ["goodies"] });
    await createTerm(ctx, { label: "Sweets", aliases: ["candy"] });
    await assignTerm(ctx, "sweets", { add: ["chili"] });
    const merged = await mergeTerm(ctx, "sweets", { into: "treats" });
    expect(merged.aliases).toEqual(["goodies", "candy", "sweets"]);
    expect((await readTermFile("treats")).aliases).toEqual([
      "goodies",
      "candy",
      "sweets",
    ]);
    expect(
      (await searchRecipes(ctx, "tag:sweets", { limit: 10 })).recipes.map(
        (row) => row.slug,
      ),
    ).toEqual(["chili"]);

    /* Target without a record: the moved record carries the alias. */
    await createTerm(ctx, { label: "Biscuits" });
    const moved = await mergeTerm(ctx, "biscuits", { into: "cookies" });
    expect(moved).toMatchObject({ recordMoved: true, aliases: ["biscuits"] });
    expect((await readTermFile("cookies")).aliases).toEqual(["biscuits"]);

    /* A bare tag into a record: the record gains it. */
    await assignTerm(ctx, "baked", { add: ["linzer"] });
    expect(
      (await mergeTerm(ctx, "baked", { into: "cookies" })).aliases,
    ).toEqual(["biscuits", "baked"]);

    /* A bare tag into a bare tag: nowhere to keep it. */
    await assignTerm(ctx, "supper", { add: ["shortbread"] });
    await assignTerm(ctx, "evening", { add: ["shortbread"] });
    const none = await mergeTerm(ctx, "supper", { into: "evening" });
    expect(none.aliases).toEqual([]);
    expect(await pathExists(termFile("evening"))).toBe(false);
  });

  it("an alias may not be spelled like another term's label, nor a label like an alias (review)", async () => {
    await createTerm(ctx, { label: "Biscuits", slug: "british-biscuits" });
    const error = await codeOf(
      createTerm(ctx, { label: "Cookies", aliases: ["Biscuits"] }),
    );
    expect(error).toMatchObject({
      code: "validation",
      issues: [
        {
          path: "aliases.0",
          message: '"Biscuits" is the label of the term "british-biscuits"',
        },
      ],
    });
    await createTerm(ctx, { label: "Cookies", aliases: ["bikkies"] });

    /* The reverse: a new term, a relabel and a rename onto an alias. */
    expect(
      await codeOf(createTerm(ctx, { label: "Bikkies", slug: "aussie" })),
    ).toMatchObject({ code: "validation", issues: [{ path: "label" }] });
    expect(
      await codeOf(updateTerm(ctx, "british-biscuits", { label: "bikkies" })),
    ).toMatchObject({ code: "validation", issues: [{ path: "label" }] });
    expect(
      await codeOf(
        renameTerm(ctx, "british-biscuits", { to: "uk", label: "Bikkies" }),
      ),
    ).toMatchObject({ code: "validation", issues: [{ path: "label" }] });
    /* An unchanged label is not rechecked. */
    await updateTerm(ctx, "british-biscuits", {
      label: "Biscuits",
      description: "UK.",
    });
    expect((await readTermFile("british-biscuits")).description).toBe("UK.");
  });

  it("a merge skips an alias of `from` that a third record already lists (review)", async () => {
    await createTerm(ctx, { label: "Treats" });
    await createTerm(ctx, { label: "Sweets", aliases: ["candy", "goodies"] });
    /* Hand-written state the seat would refuse: `goodies` on two records. */
    await createContent({
      config: tagTermContentConfig,
      slug: "snacks",
      data: { label: "Snacks", date: 5_000, aliases: ["goodies"] },
      contentDirectory,
    });
    const merged = await mergeTerm(ctx, "sweets", { into: "treats" });
    expect(merged.aliases).toEqual(["candy", "sweets"]);
    expect((await readTermFile("treats")).aliases).toEqual(["candy", "sweets"]);
  });
});
