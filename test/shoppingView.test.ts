// The shopping list's pure view (epic 35, D3): every switch on and off, the
// merge across recipes and scales, ticks, store routing, the on-hand fold and
// the copy text.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHOPPING_SETTINGS,
  normalizeShoppingSettings,
  type ShoppingFeatures,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  formatShoppingText,
  itemsForSubRecipe,
  shoppingNameOf,
  subRecipeGroups,
  viewForStore,
  type ShoppingRow,
  type ShoppingView,
} from "recipe-website-common/util/shoppingView";

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

const ALL_OFF: ShoppingFeatures = {
  merge: false,
  quantities: false,
  aisles: false,
  stores: false,
  onHand: false,
  sources: false,
  subRecipes: false,
  holdTicks: false,
};

function rows(view: ShoppingView): ShoppingRow[] {
  return view.stores.flatMap((list) =>
    list.sections.flatMap((section) => section.rows),
  );
}

function labels(view: ShoppingView): string[] {
  return rows(view).map((row) => row.label);
}

function row(view: ShoppingView, name: string): ShoppingRow {
  const found = [...rows(view), ...view.onHand, ...view.checked].find(
    (candidate) => candidate.nameKey === name,
  );
  expect(found, `no row ${name}`).toBeDefined();
  return found as ShoppingRow;
}

const cookies = { recipe: "cookies", recipeName: "Cookies" };
const cake = { recipe: "cake", recipeName: "Cake" };

describe("shoppingNameOf", () => {
  it("keys a line by its name, and a typed name the same way", () => {
    expect(shoppingNameOf("3 large eggs, beaten").key).toBe("egg");
    expect(shoppingNameOf("eggs").key).toBe("egg");
    /* Exact names only: all-purpose flour and flour are two rows. */
    expect(shoppingNameOf("2 cups all-purpose flour").key).toBe(
      "all purpose flour",
    );
  });

  it("falls back to the folded line when no name can be read", () => {
    expect(shoppingNameOf("12").key).toBe("text:12");
  });
});

describe("buildShoppingView", () => {
  it("is a plain checklist of the raw lines, in order, with every switch off", () => {
    const items = [
      item("2 cups flour", { ...cookies, scale: "2" }),
      item("1 cup sugar", cookies),
      item("3 eggs", cake),
      item("2 eggs", cookies),
      item("paper towels", { manual: true }),
    ];
    const view = buildShoppingView(
      items,
      settings(ALL_OFF),
      ["sugar"],
      undefined,
    );
    expect(labels(view)).toEqual([
      "2 cups flour",
      "1 cup sugar",
      "3 eggs",
      "2 eggs",
      "paper towels",
    ]);
    expect(view.stores).toHaveLength(1);
    expect(view.stores[0].store).toBeUndefined();
    expect(view.stores[0].sections).toEqual([
      { rows: expect.any(Array) as unknown },
    ]);
    for (const each of rows(view)) {
      expect(each.quantity).toBeUndefined();
      expect(each.aisle).toBeUndefined();
      expect(each.store).toBeUndefined();
      expect(each.sources).toBeUndefined();
    }
    expect(view.onHand).toEqual([]);
    expect(formatShoppingText(view)).toBe(
      "2 cups flour\n1 cup sugar\n3 eggs\n2 eggs\npaper towels",
    );
  });

  it("orders by id, not by the order it was given", () => {
    const a = item("1 onion");
    const b = item("2 carrots");
    const view = buildShoppingView([b, a], settings(ALL_OFF));
    expect(labels(view)).toEqual(["1 onion", "2 carrots"]);
  });

  it("merges a name across recipes, scaling each line first", () => {
    const view = buildShoppingView(
      [
        item("2 large eggs", { ...cookies, scale: "2" }),
        item("1 egg", cake),
        item("1 cup flour", cookies),
        item("1/2 cup all-purpose flour", { ...cake, scale: "1/2" }),
      ],
      settings({ aisles: false }),
    );
    const eggs = row(view, "egg");
    expect(eggs.quantity).toBe("5");
    expect(eggs.label).toBe("5 eggs");
    expect(eggs.total).toBe(2);
    expect(eggs.sources?.map((source) => source.recipe)).toEqual([
      "cookies",
      "cake",
    ]);
    expect(eggs.sources?.[0]).toMatchObject({
      recipeName: "Cookies",
      scale: "2",
    });
    expect(eggs.sources?.[1].scale).toBeUndefined();
    expect(labels(view)[0]).toBe("5 eggs");
  });

  it("joins unit families it cannot convert, and keeps one of a thing singular", () => {
    const view = buildShoppingView(
      [
        item("1 lb butter", cookies),
        item("2 cups butter, melted", cake),
        item("1 lemon", cake),
      ],
      settings({ aisles: false }),
    );
    expect(row(view, "butter").label).toBe("1 lb + 2 cups butter");
    expect(row(view, "lemon").label).toBe("1 lemon");
  });

  it("puts a bare count first, with its noun, beside a measure (35d)", () => {
    const view = buildShoppingView(
      [
        item("2 onions, diced", cookies),
        item("1 cup chopped onion", cake),
        item("2 lb carrots", cookies),
        item("1 carrot", cake),
      ],
      settings({ aisles: false }),
    );
    expect(row(view, "onion").label).toBe("2 onions + 1 cup");
    expect(row(view, "onion").quantity).toBe("2 + 1 cup");
    expect(row(view, "carrot").label).toBe("1 carrot + 2 lb");
    expect(row(view, "carrot").quantity).toBe("1 + 2 lb");
  });

  it("keeps a line it cannot read raw, under the merged name", () => {
    const view = buildShoppingView(
      [
        item("1 cup sugar", cookies),
        item("sugar (1 tbsp per serving)", { ...cake, scale: "2" }),
      ],
      settings({ aisles: false }),
    );
    const sugar = row(view, "sugar");
    expect(sugar.quantity).toBe("1 cup");
    expect(sugar.raw).toEqual(["sugar (1 tbsp per serving) (2×)"]);
    expect(formatShoppingText(view)).toBe(
      "1 cup sugar\n  · sugar (1 tbsp per serving) (2×)",
    );
  });

  it("shows names only with quantities off, and raw lines with merge off", () => {
    const items = [
      item("2 large eggs", cookies),
      item("3 eggs", { ...cake, scale: "2" }),
    ];
    const namesOnly = buildShoppingView(
      items,
      settings({ quantities: false, aisles: false }),
    );
    expect(labels(namesOnly)).toEqual(["eggs"]);
    expect(row(namesOnly, "egg").quantity).toBeUndefined();

    const unmerged = buildShoppingView(
      items,
      settings({ merge: false, aisles: false }),
    );
    expect(labels(unmerged)).toEqual(["2 large eggs", "3 eggs (2×)"]);
    expect(rows(unmerged)[1]).toMatchObject({ quantity: "6", scale: "2×" });
    expect(rows(unmerged)[0].scale).toBeUndefined();
  });

  it("sections by aisle in the settings' order, and flattens with aisles off", () => {
    const items = [
      item("1 cup flour"),
      item("2 carrots"),
      item("1 lb ground beef"),
      item("1 cup milk"),
    ];
    const view = buildShoppingView(
      items,
      settings({}, { aisleOrder: ["dairy-eggs", "produce"] as never }),
    );
    expect(
      view.stores[0].sections.map((section) => [
        section.aisle,
        section.rows.map((each) => each.label),
      ]),
    ).toEqual([
      ["dairy-eggs", ["1 cup milk"]],
      ["produce", ["2 carrots"]],
      ["meat-fish", ["1 lb ground beef"]],
      ["pantry", ["1 cup flour"]],
    ]);
    expect(view.stores[0].sections[0].label).toBe("Dairy & eggs");

    const overridden = buildShoppingView(
      items,
      settings({}, { aisleOverrides: { flour: "bakery" } }),
    );
    expect(row(overridden, "flour").aisle).toBe("bakery");

    const flat = buildShoppingView(items, settings({ aisles: false }));
    expect(flat.stores[0].sections).toHaveLength(1);
    expect(labels(flat)).toEqual([
      "1 cup flour",
      "2 carrots",
      "1 lb ground beef",
      "1 cup milk",
    ]);
  });

  it("routes stores: item, then name override, then aisle, then default", () => {
    const view = buildShoppingView(
      [
        item("2 carrots"),
        item("1 cup flour"),
        item("3 eggs"),
        item("1 onion", { store: "hannaford" }),
        item("1 lb butter", { store: "gone-store" }),
      ],
      settings({ stores: true }, { storeOverrides: { egg: "market-basket" } }),
    );
    expect(row(view, "carrot").store).toBe("market-basket");
    expect(row(view, "flour").store).toBe("hannaford");
    expect(row(view, "egg").store).toBe("market-basket");
    expect(row(view, "onion").store).toBe("hannaford");
    /* A store that no longer exists falls through to the next rule. */
    expect(row(view, "butter").store).toBe("hannaford");
    /* Which rows chose their store themselves (the menu's Automatic). */
    expect(row(view, "onion").storePinned).toBe(true);
    expect(row(view, "butter").storePinned).toBeUndefined();
    expect(row(view, "egg").storePinned).toBeUndefined();

    expect(view.stores.map((list) => [list.store?.id, list.count])).toEqual([
      ["market-basket", 2],
      ["hannaford", 3],
    ]);
    expect(formatShoppingText(view)).toBe(
      [
        "MARKET BASKET",
        "",
        "Produce:",
        "2 carrots",
        "",
        "Dairy & eggs:",
        "3 eggs",
        "",
        "HANNAFORD",
        "",
        "Produce:",
        "1 onion",
        "",
        "Dairy & eggs:",
        "1 lb butter",
        "",
        "Pantry:",
        "1 cup flour",
      ].join("\n"),
    );

    const marketBasket = viewForStore(view, "market-basket");
    expect(marketBasket.stores).toHaveLength(1);
    expect(marketBasket.counts.remaining).toBe(2);
    expect(formatShoppingText(marketBasket)).toBe(
      "MARKET BASKET\n\nProduce:\n2 carrots\n\nDairy & eggs:\n3 eggs",
    );
  });

  it("ignores stores entirely with stores off", () => {
    const view = buildShoppingView(
      [item("2 carrots", { store: "hannaford" })],
      settings({ aisles: false }),
    );
    expect(view.stores).toHaveLength(1);
    expect(rows(view)[0].store).toBeUndefined();
    expect(formatShoppingText(view)).toBe("2 carrots");
  });

  it("folds what's probably on hand, unless the item says buy anyway", () => {
    const items = [
      item("1 tsp kosher salt"),
      item("2 cups flour"),
      item("1 cup sugar"),
      item("1/2 cup sugar", { need: true }),
      item("3 eggs"),
      item("1 cup water"),
    ];
    const view = buildShoppingView(
      items,
      settings({ onHand: true, aisles: false }),
      ["all-purpose flour", "sugar"],
    );
    expect(view.onHand.map((each) => each.nameKey)).toEqual([
      "kosher salt",
      "flour",
      "water",
    ]);
    /* Merged with a `need` item: the whole row stays on the list. */
    expect(labels(view)).toEqual(["1½ cups sugar", "3 eggs"]);
    expect(view.counts).toMatchObject({ remaining: 2, onHand: 3 });
    expect(formatShoppingText(view)).toBe(
      "1½ cups sugar\n3 eggs\n\nProbably on hand:\n1 tsp kosher salt\n2 cups flour\n1 cup water",
    );
    expect(formatShoppingText(view, { onHand: false })).toBe(
      "1½ cups sugar\n3 eggs",
    );

    const off = buildShoppingView(items, settings({ aisles: false }), [
      "flour",
    ]);
    expect(off.onHand).toEqual([]);
    expect(off.counts.remaining).toBe(5);
  });

  it("checks a merged row only when every item is, and shows what's left", () => {
    const view = buildShoppingView(
      [
        item("2 eggs", { ...cookies, checked: true }),
        item("3 eggs", cake),
        item("1 cup milk", { checked: true }),
        item("1 cup flour"),
      ],
      settings({ aisles: false }),
    );
    const eggs = row(view, "egg");
    expect(eggs).toMatchObject({
      checked: false,
      partial: true,
      checkedCount: 1,
      total: 2,
      quantity: "5",
      remaining: "3",
      label: "3 eggs",
    });
    expect(view.checked.map((each) => each.label)).toEqual(["1 cup milk"]);
    expect(labels(view)).toEqual(["3 eggs", "1 cup flour"]);
    expect(view.counts).toMatchObject({ rows: 3, checked: 1, remaining: 2 });
    expect(formatShoppingText(view)).toBe("3 eggs\n1 cup flour");
    expect(formatShoppingText(view, { checked: true })).toBe(
      "3 eggs\n1 cup flour\n\nChecked:\n1 cup milk",
    );
  });

  it("merges identical unreadable lines and badges the lots", () => {
    const view = buildShoppingView(
      [item("12", { manual: true }), item("12", { manual: true })],
      settings({ aisles: false }),
    );
    expect(labels(view)).toEqual(["12 (2×)"]);
    expect(rows(view)[0].manual).toBe(true);
  });

  it("omits sources with sources off", () => {
    const view = buildShoppingView(
      [item("1 egg", cookies)],
      settings({ sources: false }),
    );
    expect(rows(view)[0].sources).toBeUndefined();
  });

  it("answers an empty list, and an all-ticked one, in words", () => {
    expect(
      formatShoppingText(buildShoppingView([], DEFAULT_SHOPPING_SETTINGS)),
    ).toBe("The list is empty.");
    expect(
      formatShoppingText(
        buildShoppingView(
          [item("2 eggs", { checked: true })],
          DEFAULT_SHOPPING_SETTINGS,
        ),
      ),
    ).toBe("Nothing left to buy.");
  });

  it("applies an aisle override to a line no name can be read from", () => {
    const view = buildShoppingView(
      [item("12")],
      settings({}, { aisleOverrides: { "text:12": "frozen" } }),
    );
    expect(rows(view)[0].aisle).toBe("frozen");
  });

  it("counts a store's narrowed view on its own", () => {
    const view = buildShoppingView(
      [
        item("2 carrots"),
        item("1 onion", { checked: true }),
        item("3 eggs"),
        item("1 cup flour"),
      ],
      settings({ stores: true }),
    );
    expect(view.counts).toMatchObject({ items: 4, rows: 4, remaining: 3 });
    expect(viewForStore(view, "market-basket").counts).toEqual({
      items: 2,
      rows: 2,
      remaining: 1,
      checked: 1,
      onHand: 0,
    });
  });
});

/*
 * 38d. The shape of `classic-peanut-butter-blossoms`' ingredient list
 * (Sally's), flattened as the seat stores it: line 11 is an `OR:` line —
 * the other way to make line 10's coating.
 */
const BLOSSOMS = [
  "1 1/4 cups (156g) all-purpose flour (spooned & leveled)",
  "1/2 teaspoon baking soda",
  "1/4 teaspoon salt",
  "1/2 cup (8 Tbsp; 113g) unsalted butter, softened to room temperature",
  "1/2 cup (100g) packed light or dark brown sugar",
  "1/4 cup (50g) granulated sugar",
  "1 large egg, at room temperature",
  "3/4 cup (about 185g) creamy peanut butter",
  "1 teaspoon pure vanilla extract",
  "24 chocolate kiss candies, unwrapped",
  "1/2 cup (100g) granulated sugar",
  "OR: 1/4 cup (50g) green sanding sugar and 1/4 cup (50g) red sanding sugar",
];
const SANDING =
  "1/4 cup (50g) green sanding sugar and 1/4 cup (50g) red sanding sugar";
const blossoms = {
  recipe: "classic-peanut-butter-blossoms",
  recipeName: "Peanut Butter Blossoms",
};

function blossomItems(extra: Partial<ShoppingItem> = {}): ShoppingItem[] {
  return BLOSSOMS.map((text, line) =>
    item(text, { ...blossoms, line, ...extra }),
  );
}

describe("38d: OR: lines", () => {
  it("shows an OR: line on the row above it, not as a row of its own", () => {
    const items = blossomItems();
    const view = buildShoppingView(items, settings({ aisles: false }));
    /* Twelve lines, the two granulated sugars merged, the OR: folded in. */
    expect(view.counts.rows).toBe(10);
    expect(rows(view).some((each) => /sanding/.test(each.label))).toBe(false);
    const sugar = row(view, "granulated sugar");
    expect(sugar).toMatchObject({
      label: "¾ cup granulated sugar",
      alternatives: [SANDING],
      total: 2,
    });
    /* Its item ticks with the row, but adds nothing to the amount. */
    expect(sugar.ids).toEqual([items[5].id, items[10].id, items[11].id]);
    expect(sugar.sources?.at(-1)).toMatchObject({
      id: items[11].id,
      alternative: true,
    });
    expect(formatShoppingText(view)).toContain(
      `¾ cup granulated sugar\n  · or ${SANDING}`,
    );
  });

  it("folds with merge off too, and with every switch off", () => {
    for (const features of [{ merge: false }, ALL_OFF]) {
      const items = blossomItems();
      const view = buildShoppingView(items, settings(features));
      expect(rows(view)).toHaveLength(11);
      const coating = rows(view).find((each) => each.key === items[10].id);
      expect(coating?.ids).toEqual([items[10].id, items[11].id]);
      expect(coating?.alternatives).toEqual([SANDING]);
    }
  });

  it("finds its own lot when a recipe is on the list twice", () => {
    const first = blossomItems();
    const second = blossomItems({ scale: "2" });
    const view = buildShoppingView(
      [...first, ...second],
      settings({ merge: false }),
    );
    const coating = rows(view).find((each) => each.key === second[10].id);
    expect(coating?.ids).toEqual([second[10].id, second[11].id]);
    expect(coating?.alternatives).toEqual([`${SANDING} (2×)`]);
    expect(rows(view)).toHaveLength(22);
  });

  it("keeps its own row when the line above is gone, or it was typed in", () => {
    const items = blossomItems().filter((_, line) => line !== 10);
    const typed = item("OR: oat milk", { manual: true });
    const view = buildShoppingView(
      [...items, typed],
      settings({ merge: false }),
    );
    expect(rows(view).map((each) => each.label)).toContain(BLOSSOMS[11]);
    expect(rows(view).map((each) => each.label)).toContain("OR: oat milk");
  });

  it("says whose the other way is on a row merged from several recipes", () => {
    const items = [
      ...blossomItems(),
      item("1 cup granulated sugar", {
        recipe: "sugar-cookies",
        recipeName: "Sugar Cookies",
        line: 0,
      }),
    ];
    const view = buildShoppingView(items, settings({ aisles: false }));
    expect(row(view, "granulated sugar").alternatives).toEqual([
      `${SANDING} — in Peanut Butter Blossoms`,
    ]);
  });

  it("ticks the row by its own lines, whatever the OR: line says", () => {
    const items = blossomItems();
    items[10] = { ...items[10], checked: true };
    const view = buildShoppingView(items, settings({ merge: false }));
    expect(view.checked.map((each) => each.key)).toEqual([items[10].id]);
  });
});

describe("38d: amount-less lines beside measured ones", () => {
  const merged = (texts: string[], extra: Partial<ShoppingItem>[] = []) =>
    buildShoppingView(
      texts.map((text, index) => item(text, extra[index] ?? cookies)),
      settings({ aisles: false }),
    );

  it("merges a pinch into the measured row as a suffix", () => {
    const view = merged(["pinch salt", "2 tsp salt"]);
    expect(labels(view)).toEqual(["2 tsp salt + a pinch"]);
    expect(row(view, "salt").quantity).toBe("2 tsp + a pinch");
    expect(row(view, "salt").ids).toHaveLength(2);
  });

  it("says a dash, and as needed for to taste, for garnish and a bare name", () => {
    expect(labels(merged(["1 tsp hot sauce", "a dash of hot sauce"]))).toEqual([
      "1 tsp hot sauce + a dash",
    ]);
    expect(labels(merged(["salt to taste", "1/2 tsp salt"]))).toEqual([
      "½ tsp salt + as needed",
    ]);
    expect(labels(merged(["parsley, for garnish", "2 tbsp parsley"]))).toEqual([
      "2 tbsp parsley + as needed",
    ]);
    expect(labels(merged(["2 eggs", "eggs"]))).toEqual(["2 eggs + as needed"]);
  });

  it("names each kind once, in order", () => {
    const view = merged([
      "salt to taste",
      "a pinch of salt",
      "2 tsp salt",
      "pinch salt",
      "1 tsp salt",
    ]);
    expect(labels(view)).toEqual(["1 tbsp salt + a pinch + as needed"]);
  });

  it("leaves an all-as-needed row as its name, and what's left without ticked pinches", () => {
    expect(labels(merged(["salt to taste", "pinch salt"]))).toEqual(["salt"]);
    const view = merged(
      ["pinch salt", "2 tsp salt", "1 tsp salt"],
      [{ ...cookies, checked: true }, cookies, { ...cookies, checked: true }],
    );
    expect(row(view, "salt")).toMatchObject({
      quantity: "1 tbsp + a pinch",
      remaining: "2 tsp",
      label: "2 tsp salt",
    });
  });
});

describe("38d: lines from sub-recipes", () => {
  const syrup = { slug: "simple-syrup", name: "Simple Syrup" };
  const daiquiri = { recipe: "daiquiri", recipeName: "Daiquiri" };

  it("notes which sub-recipe a row is for, partly or wholly", () => {
    const view = buildShoppingView(
      [
        item("1/2 cup sugar", { ...daiquiri, for: [syrup] }),
        item("1/2 cup water", { ...daiquiri, for: [syrup] }),
        item("1/4 cup sugar", daiquiri),
      ],
      settings({ aisles: false }),
    );
    expect(row(view, "water").forNote).toBe("for Simple Syrup");
    /* The sub-recipe's sugar merges with the drink's own. */
    const sugar = row(view, "sugar");
    expect(sugar.label).toBe("¾ cup sugar");
    expect(sugar.forNote).toBe("partly for Simple Syrup");
    expect(sugar.sources?.[0].for).toEqual([syrup]);
    expect(sugar.sources?.[1].for).toBeUndefined();
  });

  it("says what a line called for, and names the innermost sub-recipe", () => {
    const crust = { slug: "pie-crust", name: "Pie Crust" };
    const lard = { slug: "lard", name: "Rendered Lard", called: "½ cup" };
    const view = buildShoppingView(
      [
        item("1 lb pork fat", { recipe: "pie", for: [crust, lard] }),
        item("2 cups flour", { recipe: "pie", for: [crust] }),
      ],
      settings({ aisles: false }),
    );
    expect(row(view, "pork fat").forNote).toBe(
      "for Rendered Lard (½ cup called for)",
    );
    expect(row(view, "flour").forNote).toBe("for Pie Crust");
  });
});

describe("normalizeShoppingSettings", () => {
  it("reads nothing as the defaults", () => {
    expect(normalizeShoppingSettings(undefined)).toEqual(
      DEFAULT_SHOPPING_SETTINGS,
    );
    expect(normalizeShoppingSettings({})).toEqual(DEFAULT_SHOPPING_SETTINGS);
  });

  it("merges a file over the defaults and repairs what it can", () => {
    const read = normalizeShoppingSettings({
      features: { stores: true, merge: "yes" },
      aisleOrder: ["frozen", "nope", "produce", "frozen"],
      stores: [
        { id: "hannaford", name: "Hannaford" },
        { id: "Bad Id", name: "x" },
      ],
      defaultStore: "market-basket",
      storeByAisle: { produce: "market-basket", frozen: "hannaford" },
      storeOverrides: { egg: "hannaford", milk: "nowhere" },
      aisleOverrides: { flour: "bakery", salt: "nope" },
    });
    expect(read.features).toEqual({
      ...DEFAULT_SHOPPING_SETTINGS.features,
      stores: true,
    });
    expect(read.aisleOrder.slice(0, 2)).toEqual(["frozen", "produce"]);
    expect(read.aisleOrder).toHaveLength(8);
    expect(read.stores).toEqual([{ id: "hannaford", name: "Hannaford" }]);
    expect(read.defaultStore).toBe("hannaford");
    expect(read.storeByAisle).toEqual({ frozen: "hannaford" });
    expect(read.storeOverrides).toEqual({ egg: "hannaford" });
    expect(read.aisleOverrides).toEqual({ flour: "bakery" });
  });
});

describe("sub-recipe groups (39c)", () => {
  const syrup = { slug: "simple-syrup", name: "Simple Syrup" };
  const lavender = { slug: "lavender-syrup", name: "Lavender Syrup" };
  const lemonade = { recipe: "lemonade", recipeName: "Lemonade" };
  const party = {
    recipe: "lavender-lemonade",
    recipeName: "Lavender Lemonade",
  };

  it("groups the list's sub-recipe lines by slug, at any depth, in order", () => {
    const juice = item("1 cup lemon juice", lemonade);
    const sugar = item("1/2 cup sugar", { ...lemonade, for: [syrup] });
    const water = item("1/2 cup water", { ...lemonade, for: [syrup] });
    const own = item("1/4 cup sugar", lemonade);
    const nestedSugar = item("1/2 cup sugar", {
      ...party,
      for: [lavender, syrup],
      checked: true,
    });
    const flowers = item("2 Tbsp dried lavender", {
      ...party,
      for: [lavender],
    });
    const typed = item("simple syrup", { manual: true });
    const items = [flowers, juice, sugar, water, own, nestedSugar, typed];

    expect(subRecipeGroups(items)).toEqual([
      {
        slug: "simple-syrup",
        name: "Simple Syrup",
        /* Ticked lines too: Remove these takes every line it put there. */
        ids: [sugar.id, water.id, nestedSugar.id],
        usedBy: ["Lemonade", "Lavender Syrup"],
      },
      {
        slug: "lavender-syrup",
        name: "Lavender Syrup",
        ids: [nestedSugar.id, flowers.id],
        usedBy: ["Lavender Lemonade"],
      },
    ]);
    /* The recipe's own sugar and a typed line are no sub-recipe's. */
    expect(itemsForSubRecipe(items, "simple-syrup")).toEqual([
      sugar,
      water,
      nestedSugar,
    ]);
    expect(itemsForSubRecipe(items, "lavender-syrup")).toEqual([
      flowers,
      nestedSugar,
    ]);
    expect(itemsForSubRecipe(items, "nothing")).toEqual([]);
  });

  it("is empty for a list with no sub-recipe lines", () => {
    expect(subRecipeGroups([item("eggs"), item("milk", lemonade)])).toEqual([]);
  });
});
