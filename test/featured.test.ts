// @vitest-environment node
//
// The featured seat (23a/D5), against the real engine in a tmpdir.
//
// Harness copied from `test/curation.test.ts`: the *real*
// `featuredRecipeContentConfig`, a tmpdir that is not a git repository (so
// `commitContentChanges` no-ops), and `contentDirectory` threaded explicitly
// through every call (T16).
//
// What is worth pinning is not that the engine writes a file, but the four
// claims this seat makes on top of it: that only the key that is *set* reaches
// disk (so `resolveReferences` has one dataField to follow, not two), that a
// feature of something that does not exist is refused rather than written as a
// nameless card, that the index carries the borrowed name so `listFeatured`
// costs no data reads, and that the write reports itself through `onWrite` with
// the content type the routes revalidate by.
//
// Every case passes an explicit `slug`: the default is
// `YYYY-MM-DD-HH-MM-SS` in local time, so two features in one second collide
// (T26) — which is itself one of the cases below.

import { mkdtemp, pathExists, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";

import { featuredRecipeContentConfig } from "../websites/recipe-website/common/controller/featuredRecipeContentConfig";
import type {
  FeaturedRecipe,
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
} from "../websites/recipe-website/common/controller/types";

import type {
  ContentWriteEvent,
  CurationContext,
} from "../websites/recipe-website/editor/controller/curation/context";
import {
  SlugConflictError,
  toErrorObject,
} from "../websites/recipe-website/editor/controller/curation/errors";
import {
  feature,
  listFeatured,
  unfeature,
} from "../websites/recipe-website/editor/controller/curation/featured";
import { createGroup } from "../websites/recipe-website/editor/controller/curation/groups";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "featured-"));
  ctx = { contentDirectory };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;

  await createRecipe(ctx, { name: "Naan", slug: "naan" });
  await createGroup(ctx, {
    name: "Weeknight Favourites",
    slug: "weeknights",
    kind: "collection",
    items: ["naan"],
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

function readFeaturedFile(slug: string): Promise<FeaturedRecipe> {
  return readJson(
    join(
      contentDirectory,
      "featured-recipes/data",
      slug,
      "featured-recipe.json",
    ),
  );
}

/** The index row as `FeaturedStrip` reads it, borrowed fields and all. */
async function readIndexValue(
  slug: string,
): Promise<FeaturedRecipeEntryValue | undefined> {
  const { entries } = await readContentIndex<
    FeaturedRecipeEntryValue,
    FeaturedRecipeEntryKey,
    { slug: string; value: FeaturedRecipeEntryValue }
  >({
    config: featuredRecipeContentConfig,
    contentDirectory,
    map: ({ key: [, entrySlug], value }) => ({ slug: entrySlug, value }),
  });
  return entries.find((entry) => entry.slug === slug)?.value;
}

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

/* ------------------------------------------------------------------ */
/* 1. feature                                                          */
/* ------------------------------------------------------------------ */

describe("feature", () => {
  it("writes only the recipe key, and the index borrows the recipe's name", async () => {
    const result = await feature(ctx, {
      recipe: "naan",
      note: "Good with everything.",
      slug: "naan-feature",
    });

    expect(result).toMatchObject({
      slug: "naan-feature",
      recipe: "naan",
      url: "/featured-recipe/naan-feature",
    });
    expect(result.group).toBeUndefined();
    expect(result.path).toBe(
      join(
        contentDirectory,
        "featured-recipes/data/naan-feature/featured-recipe.json",
      ),
    );

    const stored = await readFeaturedFile("naan-feature");
    /*
     * No `group` key at all — not `"group": null`. A second dataField would be
     * a second reference for `resolveReferences` to walk and a second name for
     * the card to prefer, which is why `buildFeaturedRecipeData` spreads
     * conditionally and why this does too.
     */
    expect(Object.keys(stored).sort()).toEqual(["date", "note", "recipe"]);
    expect(stored.recipe).toBe("naan");
    expect(stored.note).toBe("Good with everything.");

    expect(await readIndexValue("naan-feature")).toMatchObject({
      recipe: "naan",
      recipeName: "Naan",
    });
  });

  it("writes only the group key, and the index borrows the group's name and kind", async () => {
    await feature(ctx, { group: "weeknights", slug: "weeknights-feature" });

    const stored = await readFeaturedFile("weeknights-feature");
    expect(Object.keys(stored).sort()).toEqual(["date", "group"]);
    expect(stored.group).toBe("weeknights");
    /* `note` is omitted rather than written as `undefined` when absent. */
    expect("note" in stored).toBe(false);

    expect(await readIndexValue("weeknights-feature")).toMatchObject({
      group: "weeknights",
      groupName: "Weeknight Favourites",
      groupKind: "collection",
    });
  });

  it("refuses both targets and neither", async () => {
    await expect(
      feature(ctx, { recipe: "naan", group: "weeknights", slug: "both" }),
    ).rejects.toMatchObject({ code: "validation" });

    await expect(feature(ctx, { slug: "neither" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("refuses a target that does not exist, with no way to force it", async () => {
    /*
     * Unlike a group's items (D3), a dangling feature is not a legitimate
     * state: the card borrows a name that was never borrowed, and no later
     * write repairs it. So this is an error rather than a warning.
     */
    await expect(
      feature(ctx, { recipe: "ghost", slug: "ghost-feature" }),
    ).rejects.toMatchObject({
      code: "unknown_recipe",
      details: { recipes: ["ghost"] },
    });

    await expect(
      feature(ctx, { group: "ghost-group", slug: "ghost-feature" }),
    ).rejects.toMatchObject({
      code: "unknown_group",
      details: { groups: ["ghost-group"] },
    });

    /* Nothing was written on the way to either refusal. */
    expect(
      await pathExists(join(contentDirectory, "featured-recipes/data")),
    ).toBe(false);
  });

  it("honours an explicit slug and date, and defaults the date to now", async () => {
    const result = await feature(ctx, {
      recipe: "naan",
      slug: "Pinned Naan",
      date: "2026-05-04T18:30:00Z",
    });
    /* The slug is slugified, exactly as a create's is. */
    expect(result.slug).toBe("pinned-naan");
    expect(result.date).toBe(Date.parse("2026-05-04T18:30:00Z"));
    expect((await readFeaturedFile("pinned-naan")).date).toBe(result.date);

    const before = Date.now();
    const defaulted = await feature(ctx, { recipe: "naan", slug: "now" });
    expect(defaulted.date).toBeGreaterThanOrEqual(before);
  });

  it("allows a second feature of the same target, but not of the same slug", async () => {
    await feature(ctx, { group: "weeknights", slug: "first" });
    /* Re-featuring is a real curator move; the strip shows the six newest. */
    await feature(ctx, { group: "weeknights", slug: "second" });
    expect((await listFeatured(ctx)).total).toBe(2);

    /*
     * T26 as an error rather than a clobber. The engine's own
     * `SlugConflictError` carries no `code` — `toErrorObject` is what maps it
     * to `slug_conflict`, which `curationHttp.test.ts` pins.
     */
    const conflict = await feature(ctx, {
      group: "weeknights",
      slug: "second",
    }).catch((error) => error);
    expect(conflict).toBeInstanceOf(SlugConflictError);
    expect(conflict.slug).toBe("second");
    expect(toErrorObject(conflict).error.code).toBe("slug_conflict");
  });

  it("reports the write through onWrite as a featured-recipes create", async () => {
    const { ctx: recording, events } = recordingCtx();
    await feature(recording, { recipe: "naan", slug: "naan-feature" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contentType: "featured-recipes",
      kind: "create",
      slug: "naan-feature",
    });
    /* The half a CLI cannot use and a route cannot do without. */
    expect(Array.isArray(events[0].result.pagination)).toBe(true);
    expect(events[0].previousSlug).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 2. listFeatured                                                     */
/* ------------------------------------------------------------------ */

describe("listFeatured", () => {
  it("lists newest first with total and more, carrying the borrowed name", async () => {
    const day = 24 * 60 * 60 * 1000;
    await feature(ctx, { recipe: "naan", slug: "older", date: day });
    await feature(ctx, { group: "weeknights", slug: "newer", date: 2 * day });

    const all = await listFeatured(ctx);
    expect(all.total).toBe(2);
    expect(all.more).toBe(false);
    expect(all.featured.map((row) => row.slug)).toEqual(["newer", "older"]);
    expect(all.featured[0]).toMatchObject({
      slug: "newer",
      group: "weeknights",
      name: "Weeknight Favourites",
    });
    expect(all.featured[0].recipe).toBeUndefined();
    expect(all.featured[1]).toMatchObject({
      slug: "older",
      recipe: "naan",
      name: "Naan",
    });

    const page = await listFeatured(ctx, { limit: 1 });
    expect(page.featured.map((row) => row.slug)).toEqual(["newer"]);
    expect(page.more).toBe(true);
    expect(
      (await listFeatured(ctx, { limit: 1, offset: 1 })).featured[0].slug,
    ).toBe("older");
  });

  it("is empty rather than absent on a site with nothing featured", async () => {
    expect(await listFeatured(ctx)).toEqual({
      total: 0,
      more: false,
      featured: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/* 3. unfeature                                                        */
/* ------------------------------------------------------------------ */

describe("unfeature", () => {
  it("removes the file and the index row, and reports a delete", async () => {
    await feature(ctx, { group: "weeknights", slug: "weeknights-feature" });

    const { ctx: recording, events } = recordingCtx();
    expect(await unfeature(recording, "weeknights-feature")).toEqual({
      slug: "weeknights-feature",
      deleted: true,
    });

    expect(
      await pathExists(
        join(
          contentDirectory,
          "featured-recipes/data/weeknights-feature/featured-recipe.json",
        ),
      ),
    ).toBe(false);
    expect(await listFeatured(ctx)).toMatchObject({ total: 0, featured: [] });
    /* The group itself is untouched: unfeaturing is not deleting. */
    expect(
      await pathExists(join(contentDirectory, "groups/data/weeknights")),
    ).toBe(true);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contentType: "featured-recipes",
      kind: "delete",
      slug: "weeknights-feature",
    });
  });

  it("404s an unknown slug rather than succeeding silently", async () => {
    await expect(unfeature(ctx, "never-featured")).rejects.toMatchObject({
      code: "not_found",
      details: { slug: "never-featured" },
    });
  });
});
