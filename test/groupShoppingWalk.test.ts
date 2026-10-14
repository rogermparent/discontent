import { describe, expect, it } from "vitest";
import type { Group, GroupItem } from "recipe-website-common/controller/types";
import {
  MAX_GROUP_DEPTH,
  walkGroupRecipes,
  type GroupWalk,
} from "recipe-website-common/util/groupShoppingWalk";

function group(items: GroupItem[], kind: Group["kind"] = "meal-plan"): Group {
  return { name: "Group", date: 0, kind, items };
}

/** A `readGroup` over a table, counting the reads. */
function reader(groups: Record<string, Group>) {
  const reads: string[] = [];
  return {
    reads,
    read: async (slug: string) => {
      reads.push(slug);
      return groups[slug] ?? null;
    },
  };
}

/** The walk with each scale as a fraction string, for `toEqual`. */
function plain(walk: GroupWalk) {
  return {
    ...walk,
    recipes: walk.recipes.map(({ scale, ...rest }) => ({
      ...rest,
      scale: scale.toFraction(),
    })),
  };
}

/*
 * The `nested-groups` Playwright fixture: a collection holding a meal plan
 * (with a dangling recipe) and a recipe of its own.
 */
const nestedGroups: Record<string, Group> = {
  "spring-menus": group(
    [{ group: "week-of-may-4", label: "Week 1" }, { recipe: "third-recipe" }],
    "collection",
  ),
  "week-of-may-4": group([
    {
      recipe: "first-recipe",
      label: "Mon · Dinner",
      note: "Leftovers for lunch",
    },
    { recipe: "second-recipe", label: "Tue · Dinner" },
    { recipe: "missing-recipe", label: "Wed · Dinner" },
  ]),
  "weeknight-favourites": group(
    [{ recipe: "first-recipe" }, { recipe: "third-recipe" }],
    "collection",
  ),
};

describe("walkGroupRecipes", () => {
  it("walks the nested-groups fixture in plan order, with each path", async () => {
    const walk = await walkGroupRecipes(
      "spring-menus",
      reader(nestedGroups).read,
    );
    expect(plain(walk)).toEqual({
      recipes: [
        {
          slug: "first-recipe",
          scale: "1",
          via: ["spring-menus", "week-of-may-4"],
          label: "Mon · Dinner",
        },
        {
          slug: "second-recipe",
          scale: "1",
          via: ["spring-menus", "week-of-may-4"],
          label: "Tue · Dinner",
        },
        /* Recipes are not checked here: a dangling one is the caller's. */
        {
          slug: "missing-recipe",
          scale: "1",
          via: ["spring-menus", "week-of-may-4"],
          label: "Wed · Dinner",
        },
        { slug: "third-recipe", scale: "1", via: ["spring-menus"] },
      ],
      missing: [],
      cycles: [],
      tooDeep: [],
    });
  });

  it("reports a missing root, and a missing sub-group once", async () => {
    expect(await walkGroupRecipes("nope", reader({}).read)).toEqual({
      recipes: [],
      missing: ["nope"],
      cycles: [],
      tooDeep: [],
    });
    const walk = await walkGroupRecipes(
      "plan",
      reader({
        plan: group([{ group: "gone" }, { recipe: "soup" }, { group: "gone" }]),
      }).read,
    );
    expect(walk.recipes.map(({ slug }) => slug)).toEqual(["soup"]);
    expect(walk.missing).toEqual(["gone"]);
  });

  it("counts a sub-group listed twice twice, and reads it once", async () => {
    const { read, reads } = reader({
      month: group([
        { group: "week" },
        { group: "week" },
        { recipe: "cake", label: "Birthday" },
      ]),
      week: group([{ recipe: "soup" }, { recipe: "stew" }]),
    });
    const walk = await walkGroupRecipes("month", read);
    expect(walk.recipes.map(({ slug }) => slug)).toEqual([
      "soup",
      "stew",
      "soup",
      "stew",
      "cake",
    ]);
    expect(walk.cycles).toEqual([]);
    expect(reads).toEqual(["month", "week"]);
  });

  it("counts a diamond's shared group once per path", async () => {
    const walk = await walkGroupRecipes(
      "top",
      reader({
        top: group([{ group: "left" }, { group: "right" }]),
        left: group([{ group: "shared" }]),
        right: group([{ group: "shared" }]),
        shared: group([{ recipe: "bread" }]),
      }).read,
    );
    expect(walk.recipes.map(({ via }) => via)).toEqual([
      ["top", "left", "shared"],
      ["top", "right", "shared"],
    ]);
  });

  it("stops a cycle, reports it, and keeps the rest", async () => {
    const walk = await walkGroupRecipes(
      "a",
      reader({
        a: group([{ group: "b" }, { recipe: "after" }]),
        b: group([{ recipe: "in-b" }, { group: "a" }, { group: "b" }]),
      }).read,
    );
    expect(walk.recipes.map(({ slug }) => slug)).toEqual(["in-b", "after"]);
    expect(walk.cycles).toEqual([
      ["a", "b", "a"],
      ["a", "b", "b"],
    ]);
    expect(walk.missing).toEqual([]);
  });

  it("multiplies scale down the path, as exact fractions", async () => {
    const walk = await walkGroupRecipes(
      "plan",
      reader({
        plan: group([
          { recipe: "soup", scale: "2" },
          { group: "party", scale: "3" } as GroupItem,
          { recipe: "bad", scale: "zero" },
          { recipe: "none", scale: "0" },
        ]),
        party: group([{ recipe: "dip", scale: "1/3" }, { group: "sides" }]),
        sides: group([{ recipe: "slaw", scale: "1 1/2" }]),
      }).read,
    );
    expect(
      Object.fromEntries(
        walk.recipes.map(({ slug, scale }) => [slug, scale.toFraction()]),
      ),
    ).toEqual({
      soup: "2",
      dip: "1",
      slaw: "9/2",
      /* What `parseScale` refuses reads as 1, as on the group page. */
      bad: "1",
      none: "1",
    });
  });

  it("cuts a chain at MAX_GROUP_DEPTH and reports where", async () => {
    const groups: Record<string, Group> = {};
    const depth = MAX_GROUP_DEPTH + 3;
    for (let i = 0; i < depth; i++) {
      groups[`g${i}`] = group([
        { recipe: `r${i}` },
        ...(i + 1 < depth ? [{ group: `g${i + 1}` }] : []),
      ]);
    }
    const walk = await walkGroupRecipes("g0", reader(groups).read);
    expect(MAX_GROUP_DEPTH).toBe(32);
    expect(walk.recipes).toHaveLength(MAX_GROUP_DEPTH);
    expect(walk.recipes.at(-1)!.via).toHaveLength(MAX_GROUP_DEPTH);
    expect(walk.tooDeep).toEqual([
      Array.from({ length: MAX_GROUP_DEPTH + 1 }, (_, i) => `g${i}`),
    ]);
    expect(walk.cycles).toEqual([]);
  });

  it("walks a group with no items", async () => {
    const walk = await walkGroupRecipes(
      "empty",
      reader({ empty: group([]) }).read,
    );
    expect(walk).toEqual({ recipes: [], missing: [], cycles: [], tooDeep: [] });
  });

  /*
   * 35c review: repeats count, so a sub-group listed twice at every level
   * fans out as 2^depth — 2^31 rows at the depth limit. The caps stop it.
   */
  it("stops a fan-out at its caps and says so", async () => {
    const groups: Record<string, Group> = {};
    for (let i = 0; i < MAX_GROUP_DEPTH; i++) {
      groups[`g${i}`] = group(
        i + 1 < MAX_GROUP_DEPTH
          ? [{ group: `g${i + 1}` }, { group: `g${i + 1}` }]
          : [{ recipe: "leaf" }],
      );
    }
    const byRecipes = await walkGroupRecipes("g0", reader(groups).read, {
      maxRecipes: 10,
    });
    expect(byRecipes.recipes).toHaveLength(10);
    expect(byRecipes.truncated).toBe(true);

    /* Groups that list no recipes at all: only the visit cap stops it. */
    const empty: Record<string, Group> = {};
    for (let i = 0; i < MAX_GROUP_DEPTH; i++) {
      empty[`e${i}`] = group(
        i + 1 < MAX_GROUP_DEPTH
          ? [{ group: `e${i + 1}` }, { group: `e${i + 1}` }]
          : [],
      );
    }
    const byVisits = await walkGroupRecipes("e0", reader(empty).read, {
      maxVisits: 100,
    });
    expect(byVisits).toMatchObject({ recipes: [], truncated: true });

    /* Under the caps, nothing is marked. */
    const small = await walkGroupRecipes("g29", reader(groups).read, {
      maxRecipes: 10,
      maxVisits: 100,
    });
    expect(small.recipes).toHaveLength(4);
    expect(small.truncated).toBeUndefined();
  });
});
