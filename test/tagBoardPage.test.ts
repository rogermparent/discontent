import { describe, expect, it } from "vitest";
import {
  carriesTerm,
  findTags,
  narrowChips,
  otherTags,
  pageTagSlugs,
  rootSections,
  tagBoardData,
} from "../websites/recipe-website/common/controller/tagBoardPage";
import {
  buildFacetModel,
  type FacetTerm,
} from "../websites/recipe-website/common/util/facets";

/*
 * 43t: `/tags` and the term pages as canvas B draws them, over a
 * real-shaped vocabulary (the content repo's shapes on 2026-10-19, after
 * 43k — copied and trimmed, never read from `editor/content`): the four food
 * facet roots, Collections including `house` (mostly drinks), holidays with
 * an alias, the bar's styles, method and nested families
 * (drink › margarita › frozen-margarita), and the spirit root.
 */
const TERMS: FacetTerm[] = [
  { slug: "course", label: "Course", record: true },
  { slug: "dessert", label: "Desserts", parent: "course", record: true },
  { slug: "cookies", label: "Cookies", parent: "dessert", record: true },
  { slug: "linzer", label: "Linzer Cookies", parent: "cookies", record: true },
  { slug: "main", label: "Mains", parent: "course", record: true },
  { slug: "breakfast", label: "Breakfast", parent: "course", record: true },
  { slug: "main-ingredient", label: "Main ingredient", record: true },
  {
    slug: "chicken",
    label: "Chicken",
    parent: "main-ingredient",
    record: true,
  },
  {
    slug: "chocolate",
    label: "Chocolate",
    parent: "main-ingredient",
    record: true,
  },
  { slug: "cuisine", label: "Cuisine", record: true },
  { slug: "american", label: "American", parent: "cuisine", record: true },
  { slug: "effort", label: "Speed & effort", record: true },
  { slug: "easy", label: "Easy", parent: "effort", record: true },
  { slug: "fall", label: "Fall Favorites", record: true },
  { slug: "house", label: "House recipes", record: true },
  { slug: "holidays", label: "Holidays", record: true },
  {
    slug: "christmas",
    label: "Christmas",
    parent: "holidays",
    aliases: ["christmas-cookies"],
    record: true,
  },
  { slug: "halloween", label: "Halloween", parent: "holidays", record: true },
  { slug: "drink", label: "Drinks", record: true },
  { slug: "sour", label: "Sour", parent: "drink", record: true },
  { slug: "shaken", label: "Shaken", parent: "drink", record: true },
  { slug: "margarita", label: "Margarita", parent: "drink", record: true },
  {
    slug: "frozen-margarita",
    label: "Frozen Margarita",
    parent: "margarita",
    record: true,
  },
  { slug: "mojito", label: "Mojito", parent: "drink", record: true },
  { slug: "spirit", label: "Spirit & base", record: true },
  { slug: "tequila", label: "Tequila", parent: "spirit", record: true },
];

const RECIPES = [
  { slug: "linzer-cookies", tags: ["linzer", "christmas", "easy", "american"] },
  { slug: "gingerbread", tags: ["cookies", "christmas-cookies", "american"] },
  { slug: "brownie-cookies", tags: ["cookies", "chocolate", "christmas"] },
  { slug: "cinnamon-rolls", tags: ["breakfast", "christmas", "easy"] },
  { slug: "roast-chicken", tags: ["main", "chicken", "american", "fall"] },
  { slug: "pumpkin-bars", tags: ["dessert", "halloween", "fall"] },
  {
    slug: "frozen-marg",
    tags: ["drink", "frozen-margarita", "tequila", "house"],
  },
  { slug: "margarita", tags: ["drink", "margarita", "sour", "shaken"] },
  { slug: "mojito", tags: ["drink", "mojito", "house"] },
  { slug: "odd-one", tags: ["main", "aviation"] },
];

describe("tagBoardData (43t)", () => {
  const board = tagBoardData({
    terms: TERMS,
    recipes: RECIPES,
    groups: [{ tags: ["christmas"] }, { tags: ["aviation"] }],
  });

  it("puts the four food facets in columns, rows nested depth-first", () => {
    expect(board.food.map((column) => column.id)).toEqual([
      "course",
      "main-ingredient",
      "cuisine",
      "effort",
    ]);
    const course = board.food[0];
    expect(course.total).toBe(7);
    expect(course.root).toBe("course");
    expect(course.rows.map((row) => [row.label, row.count, row.depth])).toEqual(
      [
        ["Desserts", 4, 0],
        ["Cookies", 3, 1],
        ["Linzer Cookies", 1, 2],
        ["Mains", 2, 0],
        ["Breakfast", 1, 0],
      ],
    );
    expect(board.foodCount).toBe(7);
    expect(board.drinkCount).toBe(3);
  });

  it("files Collections on the Food shelf and again, counted on drinks, on the Drinks shelf (Dt2)", () => {
    expect(board.collections?.rows.map((row) => [row.slug, row.count])).toEqual(
      [
        ["fall", 2],
        ["house", 2],
      ],
    );
    expect(board.drinkCollections.map((row) => [row.slug, row.count])).toEqual([
      ["house", 2],
    ]);
  });

  it("lists the holidays with their recipes and plans; an alias counts", () => {
    expect(
      board.holidays.map((holiday) => [
        holiday.slug,
        holiday.recipes,
        holiday.plans,
      ]),
    ).toEqual([
      ["christmas", 4, 1],
      ["halloween", 1, 0],
    ]);
    expect(board.holidays[0].rule).toBe("christmas");
    expect(board.holidayCount).toBe(5);
  });

  it("splits drinks into style, strength & method, spirit, and nested families", () => {
    expect(board.drinks.map((column) => column.id)).toEqual([
      "style",
      "strength-method",
      "spirit",
    ]);
    expect(board.families).toEqual([
      {
        slug: "margarita",
        label: "Margarita",
        count: 2,
        children: [
          {
            slug: "frozen-margarita",
            label: "Frozen Margarita",
            count: 1,
            children: [],
          },
        ],
      },
      { slug: "mojito", label: "Mojito", count: 1, children: [] },
    ]);
    expect(board.familyCount).toBe(3);
    expect(board.drinkRoot).toBe("drink");
  });

  it("counts other tags over recipes and plans", () => {
    expect(board.other).toEqual([
      { slug: "aviation", label: "aviation", count: 2 },
    ]);
    expect(board.otherOnce).toBe(0);
  });

  it("finds a tag by label, slug or alias, with its trail and facet", () => {
    const linzer = board.finder.find((entry) => entry.slug === "linzer");
    expect(linzer).toMatchObject({
      trail: ["Course", "Desserts", "Cookies"],
      facet: "course",
      count: 1,
    });
    /* Names first; an alias match ("christmas-cookies") after them. */
    expect(findTags(board.finder, "cook", 5).map((hit) => hit.slug)).toEqual([
      "cookies",
      "linzer",
      "christmas",
    ]);
    const byAlias = findTags(board.finder, "christmas cook", 5);
    expect(byAlias.map((hit) => [hit.slug, hit.alias])).toEqual([
      ["christmas", "christmas-cookies"],
    ]);
    expect(findTags(board.finder, "   ", 5)).toEqual([]);
    expect(board.names).toBe(board.finder.length + 1);
  });

  it("is empty-safe: no terms, no shelves", () => {
    const bare = tagBoardData({
      terms: [],
      recipes: [{ tags: ["soup"] }, { tags: ["soup", "quick"] }],
    });
    expect(bare.food).toEqual([]);
    expect(bare.collections).toBeUndefined();
    expect(bare.holidays).toEqual([]);
    expect(bare.other.map((tag) => [tag.slug, tag.count])).toEqual([
      ["soup", 2],
      ["quick", 1],
    ]);
  });
});

describe("term pages (43t)", () => {
  const model = buildFacetModel(TERMS);

  it("a card leaves out the page's own tags: the term, above and below", () => {
    const page = pageTagSlugs(model, "cookies");
    expect([...page].sort()).toEqual([
      "cookies",
      "course",
      "dessert",
      "linzer",
    ]);
    expect(
      otherTags(model, ["linzer", "christmas", "easy", "mystery"], page),
    ).toEqual(["christmas", "easy", "mystery"]);
    expect(carriesTerm(model, ["linzer"], "dessert")).toBe(true);
    expect(carriesTerm(model, ["christmas-cookies"], "christmas")).toBe(true);
    expect(carriesTerm(model, ["easy"], "dessert")).toBe(false);
  });

  it("narrows Christmas by its narrower terms and the other facets", () => {
    const christmas = RECIPES.filter((recipe) =>
      carriesTerm(model, recipe.tags, "christmas"),
    );
    expect(christmas).toHaveLength(4);
    const rows = narrowChips(model, "christmas", christmas, []);
    expect(rows.map((row) => row.id)).toEqual([
      "course",
      "main-ingredient",
      "cuisine",
      "effort",
    ]);
    expect(
      rows[0].chips.map((chip) => [chip.label, chip.count, chip.pressed]),
    ).toEqual([
      ["Cookies", 3, false],
      ["Desserts", 3, false],
      ["Breakfast", 1, false],
      ["Linzer Cookies", 1, false],
    ]);
  });

  it("a pressed chip keeps its place and the counts narrow with it", () => {
    const christmas = RECIPES.filter((recipe) =>
      carriesTerm(model, recipe.tags, "christmas"),
    );
    const filtered = christmas.filter((recipe) =>
      carriesTerm(model, recipe.tags, "cookies"),
    );
    const rows = narrowChips(model, "christmas", filtered, ["cookies"]);
    const course = rows.find((row) => row.id === "course");
    expect(course?.chips[0]).toEqual({
      slug: "cookies",
      label: "Cookies",
      count: 3,
      pressed: true,
    });
    /* Every cookie is a dessert: no chip that changes nothing. */
    expect(course?.chips.some((chip) => chip.slug === "dessert")).toBe(false);
    expect(
      rows
        .find((row) => row.id === "cuisine")
        ?.chips.map((chip) => [chip.label, chip.count]),
    ).toEqual([["American", 2]]);
  });

  it("a term's own narrower terms lead the chips", () => {
    const dessert = RECIPES.filter((recipe) =>
      carriesTerm(model, recipe.tags, "dessert"),
    );
    const rows = narrowChips(model, "dessert", dessert, []);
    expect(rows[0]).toEqual({
      id: "narrower",
      label: "Narrower",
      chips: [{ slug: "cookies", label: "Cookies", count: 3, pressed: false }],
    });
  });

  it("a root page: one section per narrower term, biggest first, photos and chips", () => {
    const rows = RECIPES.map((recipe, index) => ({
      ...recipe,
      name: recipe.slug,
      date: 100 - index,
      ...(recipe.slug === "gingerbread" ? {} : { image: "photo.jpg" }),
    })).filter((recipe) => carriesTerm(model, recipe.tags, "course"));
    const { sections, more } = rootSections(model, "course", rows, 2);
    expect(sections.map((section) => [section.slug, section.count])).toEqual([
      ["dessert", 4],
      ["main", 2],
    ]);
    /* Three at most, with a photo, in the incoming order. */
    expect(sections[0].recipes.map((recipe) => recipe.slug)).toEqual([
      "linzer-cookies",
      "brownie-cookies",
      "pumpkin-bars",
    ]);
    expect(sections[0].children).toEqual([
      { slug: "cookies", label: "Cookies", count: 3 },
    ]);
    expect(more.map((section) => [section.slug, section.recipes])).toEqual([
      ["breakfast", []],
    ]);
  });
});
