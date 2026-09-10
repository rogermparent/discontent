// @vitest-environment node
//
// The repo default is jsdom; this suite opens real LMDB environments in a
// temporary directory, which needs node.
//
// Like `references.test.ts` — whose harness this copies — it drives the *real*
// write path (`createContent` / `updateContent` / `deleteContent` /
// `rebuildIndex`) against the *real* `groupContentConfig` and
// `recipeContentConfig`, rather than a pair of imitation configs. That is safe
// because `commitContentChanges` no-ops when the content directory is not a git
// repository, and a tmpdir is not.
//
// Using the real configs is the point. What is worth pinning about groups is
// not that the engine folds an aggregate — `aggregates.test.ts` covers that with
// a toy config — but the three claims *this site's* configs make: that
// `groupsByRecipe` is the inverse index "Appears in" renders, that the D3
// no-references decision leaves a deleted recipe's group untouched, and that the
// index value drops `note`.

import { mkdtemp, pathExists, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import {
  getAggregateDatabase,
  readAggregateRecord,
} from "@discontent/cms/aggregates/database";
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { getContentDatabase } from "@discontent/cms/content/database";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { updateContent } from "@discontent/cms/content/updateContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import {
  PAGE_SUMMARY,
  getPaginationDatabase,
} from "@discontent/cms/pagination/database";
import type { PageSummary } from "@discontent/cms/pagination/types";
import type { Key } from "lmdb";

import {
  groupsByRecipe,
  type AppearsInEntry,
} from "../websites/recipe-website/common/controller/groupAggregateConfigs";
import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import { groupsByDate } from "../websites/recipe-website/common/controller/groupPaginationConfig";
import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
  Recipe,
  RecipeEntryKey,
} from "../websites/recipe-website/common/controller/types";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let previousContentDirectory: string | undefined;

const DAY = 86_400_000;
const day = (n: number) => n * DAY;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "groups-"));
  /*
   * Every call below passes `contentDirectory` explicitly; this only covers
   * anything that still falls back to the ambient one. Pointing it at the
   * tmpdir — which is not a git repository — makes the commit no-op explicit
   * either way rather than dependent on the checkout's layout.
   */
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

function createRecipe(slug: string, name: string, date: number) {
  return createContent<Recipe, unknown, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    data: { name, date },
    contentDirectory,
  });
}

function createGroup(slug: string, data: Group) {
  return createContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    data,
    contentDirectory,
  });
}

function updateGroup(slug: string, currentDate: number, data: Group) {
  return updateContent<Group, GroupEntryValue, GroupEntryKey>({
    config: groupContentConfig,
    slug,
    currentSlug: slug,
    currentIndexKey: [currentDate, slug] as GroupEntryKey,
    data,
    contentDirectory,
  });
}

/** The folded "Appears in" map, as a page would read it. */
function readAppearsIn(): Promise<Record<string, AppearsInEntry[]> | null> {
  return readAggregate({
    config: groupContentConfig,
    aggregateConfig: groupsByRecipe,
    contentDirectory,
  });
}

/**
 * The aggregate's *stored hash*, which is the byte-for-byte identity of the
 * folded value — the same hash the engine compares to decide `changed`.
 */
function readAppearsInHash(): string | undefined {
  const db = getAggregateDatabase(
    groupContentConfig,
    groupsByRecipe,
    contentDirectory,
  );
  return readAggregateRecord<Record<string, AppearsInEntry[]>>(db)?.hash;
}

/** The group content index, keyed by slug. */
function readGroupIndex(): Map<string, GroupEntryValue> {
  const db = getContentDatabase<GroupEntryValue, GroupEntryKey>(
    groupContentConfig,
    contentDirectory,
  );
  const entries = new Map<string, GroupEntryValue>();
  for (const { key, value } of db.getRange()) {
    entries.set((key as GroupEntryKey)[1], value);
  }
  return entries;
}

/** The stored per-page hashes — the diff source, read directly. */
function storedPageHashes(): Map<number, string> {
  const db = getPaginationDatabase(
    groupContentConfig,
    groupsByDate,
    contentDirectory,
  );
  const hashes = new Map<number, string>();
  for (const { key, value } of db.getRange({
    start: [PAGE_SUMMARY],
    end: [PAGE_SUMMARY + 1],
  })) {
    hashes.set((key as Key[])[1] as number, (value as PageSummary).hash);
  }
  return hashes;
}

function readGroupFile(slug: string): Promise<Group> {
  return readJson(join(contentDirectory, "groups/data", slug, "group.json"));
}

const WEEK: Group = {
  name: "Week of May 4",
  date: day(10),
  kind: "meal-plan",
  items: [
    { recipe: "stew", label: "Mon · Dinner", note: "Leftovers for lunch" },
    { recipe: "soup", label: "Tue · Dinner" },
  ],
};

async function seedTwoRecipesAndAGroup() {
  await createRecipe("soup", "Soup", day(1));
  await createRecipe("stew", "Stew", day(2));
  return createGroup("week-of-may-4", WEEK);
}

/* ------------------------------------------------------------------ */
/* The inverse index behind "Appears in"                               */
/* ------------------------------------------------------------------ */

describe("groupsByRecipe", () => {
  it("maps every listed recipe to the group, with that item's own label", async () => {
    await seedTwoRecipesAndAGroup();

    expect(await readAppearsIn()).toEqual({
      soup: [
        {
          slug: "week-of-may-4",
          name: "Week of May 4",
          kind: "meal-plan",
          label: "Tue · Dinner",
        },
      ],
      stew: [
        {
          slug: "week-of-may-4",
          name: "Week of May 4",
          kind: "meal-plan",
          label: "Mon · Dinner",
        },
      ],
    });
  });

  it("lists a recipe's groups newest first", async () => {
    await createRecipe("soup", "Soup", day(1));
    await createGroup("older", {
      name: "Older",
      date: day(5),
      kind: "collection",
      items: [{ recipe: "soup" }],
    });
    await createGroup("newer", {
      name: "Newer",
      date: day(20),
      kind: "collection",
      items: [{ recipe: "soup" }],
    });

    /*
     * The walk is ascending by `[date, slug]`, so `finalize` reverses — the
     * same newest-first order every other list surface in the app uses.
     */
    expect((await readAppearsIn())?.soup.map((entry) => entry.slug)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("keeps both lines when one group lists a recipe twice", async () => {
    await createRecipe("soup", "Soup", day(1));
    await createGroup("twice", {
      name: "Twice",
      date: day(5),
      kind: "meal-plan",
      items: [
        { recipe: "soup", label: "Mon · Dinner" },
        { recipe: "soup", label: "Thu · Lunch" },
      ],
    });

    // Collapsing to one entry per group would silently lose the second label,
    // which for a meal plan is a whole meal.
    expect((await readAppearsIn())?.soup.map((entry) => entry.label)).toEqual([
      "Thu · Lunch",
      "Mon · Dinner",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* D3: no references, and what that costs                              */
/* ------------------------------------------------------------------ */

describe("a deleted recipe (D3)", () => {
  it("leaves the group's data file and the aggregate exactly as they were", async () => {
    await seedTwoRecipesAndAGroup();
    const before = await readAppearsIn();

    await deleteContent<Recipe, unknown, RecipeEntryKey>({
      config: recipeContentConfig,
      slug: "stew",
      indexKey: [day(2), "stew"] as RecipeEntryKey,
      contentDirectory,
    });

    /*
     * Nothing rewrites `items[].recipe`: groups declare no `references` and no
     * `referencedBy`, because the engine's reference machinery is scalar-only
     * and cannot address an array element (F32). So the slug dangles, and both
     * the data file and the folded value still name it. The detail page renders
     * that as "Recipe not found: stew" rather than dropping the row — losing a
     * day out of a meal plan silently would be the worse failure.
     */
    expect(await pathExists(join(contentDirectory, "recipes/data/stew"))).toBe(
      false,
    );
    expect((await readGroupFile("week-of-may-4")).items).toEqual(WEEK.items);
    expect(await readAppearsIn()).toEqual(before);
  });
});

/* ------------------------------------------------------------------ */
/* The index value, and what it deliberately drops                     */
/* ------------------------------------------------------------------ */

describe("the stored group index value", () => {
  it("carries name, kind and the items' recipe + label, and no note", async () => {
    await seedTwoRecipesAndAGroup();

    /*
     * `note` is per-item prose only the detail page renders, and that page
     * reads the data file anyway. On the index it would be a value no
     * projection and no fold reads — so every note edit would dirty a sealed
     * page for nothing.
     */
    expect(readGroupIndex().get("week-of-may-4")).toEqual({
      name: "Week of May 4",
      kind: "meal-plan",
      items: [
        { recipe: "stew", label: "Mon · Dinner" },
        { recipe: "soup", label: "Tue · Dinner" },
      ],
    });
    expect((await readGroupFile("week-of-may-4")).items[0].note).toBe(
      "Leftovers for lunch",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Rebuild reproduces the incremental result                           */
/* ------------------------------------------------------------------ */

describe("rebuildIndex", () => {
  it("reproduces the aggregate byte for byte", async () => {
    await seedTwoRecipesAndAGroup();
    const incremental = await readAppearsIn();
    const incrementalHash = readAppearsInHash();

    await closeCachedEnvironments();
    await rebuildIndex({ config: groupContentConfig, contentDirectory });

    /*
     * The hash, not just the value: it is what the engine compares to decide
     * `changed`, so a rebuild that produced an equal value with a different
     * hash would make the *next* write report a spurious change and invalidate
     * every "Appears in" block on the site. Byte-for-byte is the property, and
     * the hash is the only thing that can state it.
     */
    expect(readAppearsInHash()).toBe(incrementalHash);
    expect(await readAppearsIn()).toEqual(incremental);
  });
});

/* ------------------------------------------------------------------ */
/* What a write moves, and what it leaves alone                        */
/* ------------------------------------------------------------------ */

describe("editing a group", () => {
  it("re-labels an item: the aggregate moves, the sealed page does not", async () => {
    await seedTwoRecipesAndAGroup();
    const hashesBefore = storedPageHashes();

    const result = await updateGroup("week-of-may-4", day(10), {
      ...WEEK,
      items: [{ ...WEEK.items[0], label: "Wed · Dinner" }, WEEK.items[1]],
    });

    /*
     * The two halves of precise invalidation, in one write.
     *
     * The *aggregate* moves: "Appears in" prints the label the group gave this
     * recipe, so it is folded, so it reports `changed` and fires its tag, and
     * every recipe view that names this group is recomputed.
     *
     * The *page* does not: `GroupListEntry` projects `itemCount`, not the
     * items, because a card prints a count. A projection that carried the array
     * would dirty every sealed page of the index whenever a label changed
     * inside a group the page merely lists — the over-projection §3.5 warns
     * about, and the reason the projection is as narrow as it is.
     */
    expect(
      result.aggregates.find((entry) => entry.name === "by-recipe")?.changed,
    ).toBe(true);
    expect(storedPageHashes()).toEqual(hashesBefore);
    expect((await readAppearsIn())?.stew[0].label).toBe("Wed · Dinner");
  });

  it("re-orders items: neither derived kind moves, because neither renders the order", async () => {
    await seedTwoRecipesAndAGroup();
    const hashesBefore = storedPageHashes();
    const aggregateBefore = readAppearsInHash();

    const result = await updateGroup("week-of-may-4", day(10), {
      ...WEEK,
      items: [WEEK.items[1], WEEK.items[0]],
    });

    /*
     * Worth stating because it is the case that looks like it should move
     * something and does not. For a meal plan the order *is* the plan, so a
     * reorder is a real edit — but the only surface that renders it is
     * `/group/<slug>`, which reads the data file rather than either derived
     * kind, and which this write invalidates through `item:groups:<slug>`
     * regardless of what the fold reports.
     *
     * The cards project a count, which has not changed; and `groupsByRecipe`
     * is keyed by *recipe*, so swapping two distinct recipes' rows leaves each
     * recipe's list, labels included, exactly as it was. Reporting `changed`
     * here would invalidate every recipe view on the site for a value that is
     * byte-identical, which is precisely what the aggregate kind exists to
     * avoid.
     */
    expect(
      result.aggregates.find((entry) => entry.name === "by-recipe")?.changed,
    ).toBe(false);
    expect(storedPageHashes()).toEqual(hashesBefore);
    expect(readAppearsInHash()).toBe(aggregateBefore);
    // The data file and the index value *did* move, which is the edit itself.
    expect(readGroupIndex().get("week-of-may-4")?.items[0].recipe).toBe("soup");
  });

  it("re-orders one recipe's two rows: the aggregate does move, since the labels swap", async () => {
    await createRecipe("soup", "Soup", day(1));
    await createGroup("twice", {
      name: "Twice",
      date: day(5),
      kind: "meal-plan",
      items: [
        { recipe: "soup", label: "Mon · Dinner" },
        { recipe: "soup", label: "Thu · Lunch" },
      ],
    });

    // The other side of the case above: when the reorder is *within* one
    // recipe's list, the fold really does produce a different value.
    const result = await updateGroup("twice", day(5), {
      name: "Twice",
      date: day(5),
      kind: "meal-plan",
      items: [
        { recipe: "soup", label: "Thu · Lunch" },
        { recipe: "soup", label: "Mon · Dinner" },
      ],
    });

    expect(
      result.aggregates.find((entry) => entry.name === "by-recipe")?.changed,
    ).toBe(true);
    expect((await readAppearsIn())?.soup.map((entry) => entry.label)).toEqual([
      "Mon · Dinner",
      "Thu · Lunch",
    ]);
  });

  it("removes an item: the page hash moves too, because the count is projected", async () => {
    await seedTwoRecipesAndAGroup();
    const hashesBefore = storedPageHashes();

    const result = await updateGroup("week-of-may-4", day(10), {
      ...WEEK,
      items: [WEEK.items[0]],
    });

    expect(
      result.aggregates.find((entry) => entry.name === "by-recipe")?.changed,
    ).toBe(true);
    expect(storedPageHashes()).not.toEqual(hashesBefore);
    // The dropped recipe loses its whole "Appears in" entry, not just a line.
    expect((await readAppearsIn())?.soup).toBeUndefined();
  });

  it("re-titles a group: the page hash moves, since the name is what a card renders", async () => {
    await seedTwoRecipesAndAGroup();
    const hashesBefore = storedPageHashes();

    await updateGroup("week-of-may-4", day(10), { ...WEEK, name: "Renamed" });

    expect(storedPageHashes()).not.toEqual(hashesBefore);
    expect((await readAppearsIn())?.soup[0].name).toBe("Renamed");
  });
});
