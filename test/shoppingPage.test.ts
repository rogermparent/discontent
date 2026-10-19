// 42g: the `/shopping` page's own groupings, over `buildShoppingView`'s
// unchanged output (42-D5) — the in-store aisles with ticked rows kept in
// place, the per-browser "aisle done" state, and "What's on it" by plan and
// recipe with the one write that takes an origin off.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingFeatures,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  formatShoppingText,
  viewForStore,
} from "recipe-website-common/util/shoppingView";
import {
  DONE_AISLE_TTL_MS,
  aisleIsDone,
  allRows,
  listOrigins,
  markAisle,
  readDoneAisles,
  removalPatch,
  rowsHolding,
  shopAisles,
} from "recipe-website-common/util/shoppingPage";

let next = 0;
/** Ids in insertion order, as ULIDs would sort. */
function item(text: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  next += 1;
  return { id: `01j${String(next).padStart(8, "0")}`, text, ...extra };
}

function settings(
  features: Partial<ShoppingFeatures> = {},
  rest: Partial<ShoppingSettings> = {},
): ShoppingSettings {
  return {
    ...DEFAULT_SHOPPING_SETTINGS,
    ...rest,
    features: { ...DEFAULT_SHOPPING_SETTINGS.features, ...features },
  };
}

/** The shopping fixture's shape: a plan (nested) and a recipe on its own. */
function planAndRecipe(): ShoppingItem[] {
  const plan = ["week-of-oct-19"];
  const nested = ["week-of-oct-19", "weeknight-dinners"];
  const pancakes = {
    recipe: "buttermilk-pancakes",
    recipeName: "Buttermilk Pancakes",
    via: plan,
    scale: "2",
  };
  const omelette = {
    recipe: "spanish-omelette",
    recipeName: "Spanish Omelette",
    via: nested,
  };
  const lemonade = { recipe: "lemonade", recipeName: "Lemonade" };
  return [
    item("2 cups all-purpose flour", { ...pancakes, line: 0 }),
    item("2 large eggs", { ...pancakes, line: 1 }),
    item("6 eggs", { ...omelette, line: 0 }),
    item("2 onions, thinly sliced", { ...omelette, line: 1 }),
    item("1 lb potatoes", { ...omelette, line: 2 }),
    item("4 lemons", { ...lemonade, line: 0 }),
    item("1/2 cup sugar", {
      ...lemonade,
      line: 0,
      for: [{ slug: "simple-syrup", name: "Simple Syrup" }],
    }),
    item("paper towels", { manual: true }),
  ];
}

const labelsOf = (rows: { label: string }[]) => rows.map((row) => row.label);

describe("shopAisles: the in-store list (42g)", () => {
  it("sections by aisle in the settings' order, with what is left", () => {
    const view = buildShoppingView(planAndRecipe(), settings());
    const aisles = shopAisles(view, DEFAULT_SHOPPING_SETTINGS.aisleOrder);
    expect(aisles.map((aisle) => aisle.id)).toEqual(
      view.stores[0].sections.map((section) => section.aisle),
    );
    const dairy = aisles.find((aisle) => aisle.id === "dairy-eggs")!;
    expect(dairy.label).toBe("Dairy & eggs");
    expect(labelsOf(dairy.rows)).toEqual(["10 eggs"]);
    expect(dairy.left).toBe(1);
    expect(dairy.ticked).toBe(0);
  });

  it("keeps a ticked row where it was, struck, instead of in a fold", () => {
    const items = planAndRecipe();
    const before = shopAisles(buildShoppingView(items, settings()));
    const produce = before.find((aisle) => aisle.id === "produce")!;
    expect(labelsOf(produce.rows)).toEqual([
      "2 onions",
      "1 lb potatoes",
      "4 lemons",
    ]);
    /* Tick the potatoes: the view moves them to `checked`… */
    const ticked = items.map((each) =>
      each.text === "1 lb potatoes" ? { ...each, checked: true } : each,
    );
    const view = buildShoppingView(ticked, settings());
    expect(labelsOf(view.checked)).toEqual(["1 lb potatoes"]);
    /* …and the store puts them back between the same neighbours. */
    const after = shopAisles(view).find((aisle) => aisle.id === "produce")!;
    expect(labelsOf(after.rows)).toEqual([
      "2 onions",
      "1 lb potatoes",
      "4 lemons",
    ]);
    expect(after.rows.map((row) => row.checked)).toEqual([false, true, false]);
    expect(after.left).toBe(2);
    expect(after.ticked).toBe(1);
  });

  it("counts a partly ticked merged row as left", () => {
    const items = planAndRecipe().map((each) =>
      each.text === "6 eggs" ? { ...each, checked: true } : each,
    );
    const dairy = shopAisles(buildShoppingView(items, settings())).find(
      (aisle) => aisle.id === "dairy-eggs",
    )!;
    expect(dairy.rows).toHaveLength(1);
    expect(dairy.rows[0].partial).toBe(true);
    expect(dairy.left).toBe(1);
    expect(dairy.ticked).toBe(0);
  });

  it("puts what is probably on hand beside its aisle, and nowhere else", () => {
    const items = [
      ...planAndRecipe(),
      item("1/4 cup olive oil", { recipe: "x" }),
      item("1 tsp salt", { recipe: "x" }),
    ];
    const view = buildShoppingView(items, settings({ onHand: true }), [
      "olive oil",
    ]);
    const aisles = shopAisles(view);
    const onHand = aisles.flatMap((aisle) => labelsOf(aisle.onHand));
    expect(onHand.sort()).toEqual(labelsOf(view.onHand).sort());
    for (const aisle of aisles) {
      for (const row of aisle.onHand) expect(row.aisle).toBe(aisle.aisle);
      expect(aisle.rows.some((row) => aisle.onHand.includes(row))).toBe(false);
    }
  });

  it("is one section with aisles off, ticked rows in place", () => {
    const items = planAndRecipe().map((each, index) =>
      index === 2 ? { ...each, checked: true } : each,
    );
    const view = buildShoppingView(
      items,
      settings({ aisles: false, merge: false, quantities: false }),
    );
    const aisles = shopAisles(view);
    expect(aisles).toHaveLength(1);
    expect(aisles[0].id).toBe("all");
    expect(aisles[0].label).toBeUndefined();
    expect(labelsOf(aisles[0].rows)).toEqual(items.map((each) => each.text));
    expect(aisles[0].rows[2].checked).toBe(true);
  });

  it("narrows to one store through viewForStore", () => {
    const view = viewForStore(
      buildShoppingView(planAndRecipe(), settings({ stores: true })),
      "market-basket",
    );
    const aisles = shopAisles(view);
    expect(aisles.map((aisle) => aisle.id)).toEqual(["produce"]);
  });

  it("is empty for an empty list", () => {
    expect(shopAisles(buildShoppingView([], settings()))).toEqual([]);
    expect(
      shopAisles(buildShoppingView([], settings({ aisles: false }))),
    ).toEqual([]);
  });

  it("leaves the shared view and its copy text as they were (42-D5)", () => {
    const items = planAndRecipe().map((each, index) =>
      index === 3 ? { ...each, checked: true } : each,
    );
    const view = buildShoppingView(items, settings());
    const before = JSON.stringify(view);
    const text = formatShoppingText(view);
    shopAisles(view);
    listOrigins(items);
    expect(JSON.stringify(view)).toBe(before);
    expect(formatShoppingText(view)).toBe(text);
  });
});

describe("aisle done, per browser (42g)", () => {
  const now = 1_800_000_000_000;

  function produce() {
    return shopAisles(buildShoppingView(planAndRecipe(), settings())).find(
      (aisle) => aisle.id === "produce",
    )!;
  }

  it("marks and unmarks an aisle within one scope", () => {
    const aisle = produce();
    const done = markAisle({}, "hannaford", aisle, true, now);
    expect(Object.keys(done)).toEqual(["hannaford"]);
    expect(aisleIsDone(done.hannaford.produce, aisle)).toBe(true);
    expect(aisleIsDone(done.all?.produce, aisle)).toBe(false);
    expect(markAisle(done, "hannaford", aisle, false, now)).toEqual({});
  });

  /** One list's produce aisle, built twice from the same items (same ids). */
  function produceOf(items: ShoppingItem[]) {
    return shopAisles(buildShoppingView(items, settings())).find(
      (aisle) => aisle.id === "produce",
    )!;
  }

  it("stays done over the same items, rebuilt", () => {
    const base = planAndRecipe();
    const done = markAisle({}, "list", produceOf(base), true, now);
    expect(aisleIsDone(done.list.produce, produceOf([...base]))).toBe(true);
  });

  it("opens again when a line is added to the aisle, even onto a merged row", () => {
    const base = planAndRecipe();
    const aisle = produceOf(base);
    const done = markAisle({}, "list", aisle, true, now);
    const later = produceOf([...base, item("1 onion")]);
    /* Same row keys ("name:onion"), one more item behind them. */
    expect(later.rows.map((row) => row.key)).toEqual(
      aisle.rows.map((row) => row.key),
    );
    expect(aisleIsDone(done.list.produce, later)).toBe(false);
  });

  it("stays done when a line leaves the aisle", () => {
    const base = planAndRecipe();
    const done = markAisle({}, "list", produceOf(base), true, now);
    const fewer = base.filter((each) => each.text !== "1 lb potatoes");
    expect(aisleIsDone(done.list.produce, produceOf(fewer))).toBe(true);
  });

  it("is never done with no lines to tick (on-hand rows only)", () => {
    const aisle = { ...produce(), rows: [], left: 0, ticked: 0 };
    const done = markAisle({}, "list", aisle, true, now);
    expect(aisleIsDone(done.list.produce, aisle)).toBe(false);
  });

  it("reads back what was stored, and forgets a trip over 12 hours old", () => {
    const aisle = produce();
    const stored = JSON.stringify(markAisle({}, "list", aisle, true, now));
    expect(readDoneAisles(stored, now + 60_000).list.produce.ids).toEqual(
      aisle.rows.flatMap((row) => row.ids),
    );
    expect(readDoneAisles(stored, now + DONE_AISLE_TTL_MS + 1)).toEqual({});
  });

  it("reads anything malformed as nothing done", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      '{"list": 3}',
      '{"list": {"produce": {"at": "x", "ids": []}}}',
      '{"list": {"produce": {"at": 1}}}',
    ]) {
      expect(readDoneAisles(raw, now)).toEqual({});
    }
    /* Non-string ids are dropped, the rest kept. */
    expect(
      readDoneAisles(
        JSON.stringify({ list: { produce: { at: now, ids: ["a", 3] } } }),
        now,
      ),
    ).toEqual({ list: { produce: { at: now, ids: ["a"] } } });
  });
});

describe("listOrigins: what is on the list, by plan and recipe (42g)", () => {
  it("groups by outermost plan, then recipes alone, then typed lines", () => {
    const items = planAndRecipe();
    const origins = listOrigins(items, { "week-of-oct-19": "Week of Oct 19" });
    expect(origins.map(({ kind, key, name }) => ({ kind, key, name }))).toEqual(
      [
        { kind: "plan", key: "plan:week-of-oct-19", name: "Week of Oct 19" },
        { kind: "recipe", key: "recipe:lemonade", name: "Lemonade" },
        { kind: "typed", key: "typed", name: "Typed in" },
      ],
    );
    const [plan, lemonade, typed] = origins;
    expect(plan.ids).toEqual(items.slice(0, 5).map((each) => each.id));
    expect(plan.recipes!.map((recipe) => recipe.name)).toEqual([
      "Buttermilk Pancakes",
      "Spanish Omelette",
    ]);
    expect(plan.recipes![1].ids).toEqual(
      items.slice(2, 5).map((each) => each.id),
    );
    expect(lemonade.subRecipes).toEqual(["Simple Syrup"]);
    expect(lemonade.ids).toHaveLength(2);
    expect(typed.ids).toEqual([items[7].id]);
  });

  it("names a plan from its slug when its name is unknown", () => {
    const [plan] = listOrigins(planAndRecipe());
    expect(plan.name).toBe("Week of oct 19");
  });

  it("keeps the order each was first added in, whatever the item order", () => {
    const items = [
      item("1 lime", { recipe: "b", recipeName: "B" }),
      item("1 lemon", { recipe: "a", recipeName: "A" }),
    ];
    const origins = listOrigins([...items].reverse());
    expect(origins.map((origin) => origin.name)).toEqual(["B", "A"]);
  });

  it("is empty for an empty list", () => {
    expect(listOrigins([])).toEqual([]);
  });

  it("counts the rows an origin is on as the page shows them", () => {
    const items = planAndRecipe();
    const view = buildShoppingView(items, settings());
    const [plan] = listOrigins(items);
    /* flour, eggs (merged once), onions, potatoes. */
    expect(rowsHolding(view, new Set(plan.ids))).toBe(4);
    expect(rowsHolding(view, new Set())).toBe(0);
    expect(allRows(view).length).toBe(view.counts.rows);
  });
});

describe("removalPatch: one write per Remove these (42g)", () => {
  it("takes a plan by `removeSource` when that is exactly its lines", () => {
    const items = planAndRecipe();
    const [plan, recipe, typed] = listOrigins(items);
    expect(removalPatch(plan, items)).toEqual({
      removeSource: { group: "week-of-oct-19" },
    });
    expect(removalPatch(recipe, items)).toEqual({
      removeSource: { recipe: "lemonade" },
    });
    expect(removalPatch(typed, items)).toEqual({ remove: typed.ids });
  });

  it("goes by ids when the recipe is also on a plan", () => {
    const items = [
      ...planAndRecipe(),
      item("1 cup buttermilk", {
        recipe: "buttermilk-pancakes",
        recipeName: "Buttermilk Pancakes",
      }),
    ];
    const pancakes = listOrigins(items).find(
      (origin) => origin.key === "recipe:buttermilk-pancakes",
    )!;
    expect(removalPatch(pancakes, items)).toEqual({ remove: pancakes.ids });
  });

  it("goes by ids when the plan is also nested in another one on the list", () => {
    const items = [
      ...planAndRecipe(),
      item("1 cup rice", {
        recipe: "rice",
        recipeName: "Rice",
        via: ["weeknight-dinners"],
      }),
    ];
    const origins = listOrigins(items);
    const weeknight = origins.find(
      (origin) => origin.key === "plan:weeknight-dinners",
    )!;
    expect(removalPatch(weeknight, items)).toEqual({ remove: weeknight.ids });
    /* The outer plan is still exactly its own. */
    const week = origins.find(
      (origin) => origin.key === "plan:week-of-oct-19",
    )!;
    expect(removalPatch(week, items)).toEqual({
      removeSource: { group: "week-of-oct-19" },
    });
  });
});
