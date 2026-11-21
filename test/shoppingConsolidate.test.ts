// 49a: "same thing, different names" on the shopping list — the curated
// finder (`shoppingConsolidate`), the decisions and their amount arithmetic
// (`shoppingMerges`), and `buildShoppingView` applying a merged decision.

import { describe, expect, it } from "vitest";

import {
  findShoppingProposals,
  type ShoppingProposal,
} from "recipe-website-common/util/shoppingConsolidate";
import { parseAmount } from "recipe-website-common/util/ingredientAmount";
import {
  SHOPPING_EQUIVALENTS,
  activeMerges,
  consolidateAmounts,
  mergeIdOf,
  parseShoppingMerge,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingFeatures,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  formatShoppingText,
  shoppingNameOf,
  type ShoppingRow,
  type ShoppingView,
} from "recipe-website-common/util/shoppingView";

let next = 0;
/** Ids in insertion order, as ULIDs would sort. */
function item(text: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  next += 1;
  return { id: `01j${String(next).padStart(8, "0")}`, text, ...extra };
}

function from(recipe: string, text: string, extra: Partial<ShoppingItem> = {}) {
  return item(text, {
    recipe: recipe.toLowerCase().replace(/\s+/g, "-"),
    recipeName: recipe,
    ...extra,
  });
}

function settings(features: Partial<ShoppingFeatures> = {}): ShoppingSettings {
  return {
    ...DEFAULT_SHOPPING_SETTINGS,
    features: { ...DEFAULT_SHOPPING_SETTINGS.features, ...features },
  };
}

function rows(view: ShoppingView): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ];
}

/** The decision a person's plain Merge of `proposal` stores. */
function merged(
  proposal: ShoppingProposal,
  extra: Partial<ShoppingMerge> = {},
): ShoppingMerge {
  const keys = proposal.rows.map((row) => row.key).sort();
  return {
    id: mergeIdOf(keys),
    keys,
    status: "merged",
    decidedAt: "2026-11-21T12:00:00.000Z",
    ...extra,
  };
}

/** Roger's example: two recipes, two names for one bag of flour. */
function rogersFlour(): ShoppingItem[] {
  return [
    from("Pancakes", "1 cup white flour"),
    from("Bread", "2 cups AP flour"),
  ];
}

describe("the curated table", () => {
  it("keys the names it lists apart today, so the table is what joins them", () => {
    expect(shoppingNameOf("1 cup white flour").key).toBe("white flour");
    expect(shoppingNameOf("2 cups AP flour").key).toBe("all purpose flour");
    expect(shoppingNameOf("1 cup unbleached flour").key).toBe(
      "unbleached flour",
    );
    expect(shoppingNameOf("1 cup cane sugar").key).toBe("cane sugar");
    expect(shoppingNameOf("3 garlic cloves").key).toBe("garlic clove");
    expect(shoppingNameOf("2 cloves garlic").key).toBe("garlic");
  });

  it("never puts a name in two sets, nor bread flour or the judgement calls in any", () => {
    const members = SHOPPING_EQUIVALENTS.flatMap((set) => set.members);
    expect(new Set(members).size).toBe(members.length);
    for (const set of SHOPPING_EQUIVALENTS) {
      expect(set.members[0]).toBe(set.key);
    }
    for (const kept of [
      "bread flour",
      "cake flour",
      "pastry flour",
      "wheat flour",
      "almond flour",
      "butter",
      "unsalted butter",
      "salted butter",
      "salt",
      "table salt",
      "sea salt",
      "brown sugar",
      "light brown sugar",
    ]) {
      expect(members, kept).not.toContain(kept);
    }
  });
});

describe("mergeIdOf and parseShoppingMerge", () => {
  it("is stable whatever the order or repeats of the keys", () => {
    const id = mergeIdOf(["white flour", "all purpose flour"]);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(mergeIdOf(["all purpose flour", "white flour", "white flour"])).toBe(
      id,
    );
    expect(mergeIdOf(["all purpose flour", "bread flour"])).not.toBe(id);
  });

  it("reads a stored decision leniently: the file name is the id, an apart one drops a name", () => {
    const id = mergeIdOf(["a", "b"]);
    expect(
      parseShoppingMerge(
        {
          id: "nope",
          keys: ["b", " a ", "b"],
          status: "merged",
          name: " A  B ",
        },
        id,
      ),
    ).toEqual({
      id,
      keys: ["a", "b"],
      status: "merged",
      name: "A B",
      decidedAt: "",
    });
    expect(
      parseShoppingMerge({ keys: ["a", "b"], status: "apart", name: "x" }, id),
    ).toEqual({ id, keys: ["a", "b"], status: "apart", decidedAt: "" });
    expect(
      parseShoppingMerge({ keys: ["a"], status: "merged" }, id),
    ).toBeNull();
    expect(
      parseShoppingMerge({ keys: ["a", "b"], status: "x" }, id),
    ).toBeNull();
    expect(
      parseShoppingMerge({ keys: ["a", "b"], status: "merged" }),
    ).toBeNull();
  });

  it("applies a merged decision only when two of its names are on the list", () => {
    const decision: ShoppingMerge = {
      id: mergeIdOf(["a", "b", "c"]),
      keys: ["a", "b", "c"],
      status: "merged",
      decidedAt: "",
    };
    expect([...activeMerges([decision], new Set(["a"])).keys()]).toEqual([]);
    expect([...activeMerges([decision], new Set(["a", "c"])).keys()]).toEqual([
      "a",
      "c",
    ]);
    const apart = { ...decision, status: "apart" as const };
    expect(activeMerges([apart], new Set(["a", "b"])).size).toBe(0);
  });
});

describe("consolidateAmounts", () => {
  const amount = (text: string) => parseAmount(text)!;

  it("adds within a family as addAmounts does, with no density", () => {
    expect(
      consolidateAmounts([amount("1 cup flour"), amount("2 cups flour")]),
    ).toEqual({
      amount: { parts: [{ qty: 3, unit: "cup", family: "us-volume" }] },
      estimated: false,
    });
    /* Without a density, volume and weight stay side by side (35-D4). */
    const apart = consolidateAmounts([amount("1 cup x"), amount("120 g x")]);
    expect(apart.estimated).toBe(false);
    expect(apart.amount.parts).toHaveLength(2);
  });

  it("joins volume and weight by density, in the largest share's unit", () => {
    const cups = consolidateAmounts(
      [amount("2 cups flour"), amount("120 g flour")],
      120,
    );
    expect(cups.estimated).toBe(true);
    expect(cups.amount.parts).toEqual([
      { qty: 3, unit: "cup", family: "us-volume" },
    ]);
    const grams = consolidateAmounts(
      [amount("1 cup flour"), amount("500 g flour")],
      120,
    );
    expect(grams.amount.parts).toEqual([
      { qty: 620, unit: "g", family: "metric-weight" },
    ]);
  });

  it("leaves a sum of volumes alone even with a density: nothing to estimate", () => {
    const result = consolidateAmounts(
      [amount("1 cup flour"), amount("1 tbsp flour")],
      120,
    );
    expect(result.estimated).toBe(false);
  });
});

describe("findShoppingProposals", () => {
  it("proposes Roger's example: 1 cup white flour + 2 cups AP flour → 3 cups all-purpose flour", () => {
    const items = rogersFlour();
    const [proposal, ...more] = findShoppingProposals(items, settings());
    expect(more).toEqual([]);
    expect(proposal).toMatchObject({
      id: mergeIdOf(["white flour", "all purpose flour"]),
      name: "all-purpose flour",
      amount: "3 cups",
      estimated: false,
      line: "3 cups all-purpose flour",
      reason: "Both are all-purpose flour",
    });
    expect(
      proposal.rows.map((row) => ({
        key: row.key,
        amountText: row.amountText,
        sources: row.sources.map((source) => [source.text, source.recipeName]),
      })),
    ).toEqual([
      {
        key: "white flour",
        amountText: "1 cup",
        sources: [["1 cup white flour", "Pancakes"]],
      },
      {
        key: "all purpose flour",
        amountText: "2 cups",
        sources: [["2 cups AP flour", "Bread"]],
      },
    ]);
  });

  it("adds cups and grams of flour by density, marked ≈ and estimated", () => {
    const [proposal] = findShoppingProposals(
      [
        from("Pancakes", "2 cups white flour"),
        from("Cake", "120 g all-purpose flour"),
      ],
      settings(),
    );
    expect(proposal).toMatchObject({
      amount: "≈ 3 cups",
      estimated: true,
      line: "≈ 3 cups all-purpose flour",
    });
  });

  it("scales each line by its recipe's scale", () => {
    const [proposal] = findShoppingProposals(
      [
        from("Pancakes", "1 cup white flour", { scale: "2" }),
        from("Bread", "1 cup all-purpose flour"),
      ],
      settings(),
    );
    expect(proposal.line).toBe("3 cups all-purpose flour");
  });

  it("never proposes bread flour with all-purpose flour", () => {
    expect(
      findShoppingProposals(
        [
          from("Bread", "3 cups bread flour"),
          from("Pancakes", "2 cups all-purpose flour"),
        ],
        settings(),
      ),
    ).toEqual([]);
  });

  it("leaves a row that merges today as it is: one name is one row", () => {
    expect(
      findShoppingProposals(
        [from("A", "2 cups all-purpose flour"), from("B", "1 cup AP flour")],
        settings(),
      ),
    ).toEqual([]);
  });

  it("counts garlic cloves as cloves", () => {
    const [proposal] = findShoppingProposals(
      [from("A", "3 garlic cloves"), from("B", "2 cloves garlic")],
      settings(),
    );
    expect(proposal.line).toBe("5 cloves garlic");
  });

  it("is suppressed by an apart decision, and asks again when a new name joins", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const apart: ShoppingMerge = { ...merged(proposal), status: "apart" };
    expect(findShoppingProposals(items, settings(), [apart])).toEqual([]);
    const more = [...items, from("Cake", "1 cup unbleached flour")];
    const [again] = findShoppingProposals(more, settings(), [apart]);
    expect(again.rows.map((row) => row.key)).toEqual([
      "white flour",
      "all purpose flour",
      "unbleached flour",
    ]);
    expect(again.reason).toBe("All 3 are all-purpose flour");
  });

  it("proposes nothing once merged, and a third name with the merged row as one", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const decision = merged(proposal);
    expect(findShoppingProposals(items, settings(), [decision])).toEqual([]);
    const [wider] = findShoppingProposals(
      [...items, from("Cake", "1 cup unbleached flour")],
      settings(),
      [decision],
    );
    expect(wider.rows).toHaveLength(3);
    expect(wider.line).toBe("4 cups all-purpose flour");
  });

  it("skips a name whose lines are all ticked, and proposes nothing with merge off", () => {
    expect(
      findShoppingProposals(
        [
          from("A", "1 cup white flour", { checked: true }),
          from("B", "2 cups AP flour"),
        ],
        settings(),
      ),
    ).toEqual([]);
    expect(
      findShoppingProposals(rogersFlour(), settings({ merge: false })),
    ).toEqual([]);
  });

  it("orders proposals by when their first line was added", () => {
    const proposals = findShoppingProposals(
      [
        from("A", "2 large eggs"),
        from("B", "1 cup white flour"),
        from("C", "2 cups AP flour"),
        from("D", "2 extra-large eggs"),
      ],
      settings(),
    );
    expect(proposals.map((each) => each.name)).toEqual([
      "egg",
      "all-purpose flour",
    ]);
    expect(proposals[0].line).toBe("4 eggs");
  });
});

describe("buildShoppingView with merge decisions", () => {
  it("shows a merged decision as one row with both rows' items and sources", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const view = buildShoppingView(
      items,
      settings(),
      [],
      [],
      [merged(proposal)],
    );
    const [row, ...others] = rows(view);
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      key: `merge:${proposal.id}`,
      ids: items.map((each) => each.id),
      label: "3 cups all-purpose flour",
      quantity: "3 cups",
      nameKey: "all purpose flour",
      aisle: "pantry",
      total: 2,
    });
    expect(row.sources?.map((source) => source.recipeName)).toEqual([
      "Pancakes",
      "Bread",
    ]);
    expect(row.merge).toMatchObject({
      id: proposal.id,
      keys: ["all purpose flour", "white flour"],
      from: [
        { text: "1 cup white flour", recipeName: "Pancakes" },
        { text: "2 cups AP flour", recipeName: "Bread" },
      ],
    });
    expect(formatShoppingText(view)).toBe("Pantry:\n3 cups all-purpose flour");
  });

  it("is a rule: a later list with the same names merges too, one name alone does not", () => {
    const [proposal] = findShoppingProposals(rogersFlour(), settings());
    const decision = merged(proposal);
    const later = [
      from("Waffles", "1 cup white flour"),
      from("Rolls", "1 cup AP flour"),
    ];
    expect(
      rows(buildShoppingView(later, settings(), [], [], [decision]))[0].label,
    ).toBe("2 cups all-purpose flour");
    const alone = [from("Waffles", "1 cup white flour")];
    const [row] = rows(
      buildShoppingView(alone, settings(), [], [], [decision]),
    );
    expect(row.label).toBe("1 cup white flour");
    expect(row.merge).toBeUndefined();
  });

  it("labels the row with an edited name, as typed", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const [row] = rows(
      buildShoppingView(
        items,
        settings(),
        [],
        [],
        [merged(proposal, { name: "King Arthur AP" })],
      ),
    );
    expect(row.label).toBe("3 cups King Arthur AP");
    expect(row.merge?.named).toBe(true);
  });

  it("holds an edited amount for the same items, and falls back with a note when they change", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const decision = merged(proposal, {
      amount: { text: "1 bag", ids: items.map((each) => each.id).sort() },
    });
    const [row] = rows(
      buildShoppingView(items, settings(), [], [], [decision]),
    );
    expect(row.label).toBe("1 bag all-purpose flour");
    expect(row.merge?.amountEdited).toBe(true);
    expect(row.merge?.amountStale).toBeUndefined();

    const more = [...items, from("Rolls", "1 cup AP flour")];
    const [stale] = rows(
      buildShoppingView(more, settings(), [], [], [decision]),
    );
    expect(stale.label).toBe("4 cups all-purpose flour");
    expect(stale.merge?.amountStale).toBe(true);
    expect(stale.merge?.amountEdited).toBeUndefined();
  });

  it("marks a density's sum ≈, and a partly ticked row shows what is left", () => {
    const items = [
      from("Pancakes", "2 cups white flour"),
      from("Cake", "120 g all-purpose flour"),
    ];
    const [proposal] = findShoppingProposals(items, settings());
    const [row] = rows(
      buildShoppingView(items, settings(), [], [], [merged(proposal)]),
    );
    expect(row.label).toBe("≈ 3 cups all-purpose flour");
    expect(row.quantity).toBe("≈ 3 cups");
    expect(row.merge?.estimated).toBe(true);

    const ticked = items.map((each, index) =>
      index === 0 ? { ...each, checked: true } : each,
    );
    const [partial] = rows(
      buildShoppingView(ticked, settings(), [], [], [merged(proposal)]),
    );
    expect(partial.partial).toBe(true);
    expect(partial.label).toBe("120 g all-purpose flour");
  });

  it("routes by the merged name: one aisle override covers it", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    const [row] = rows(
      buildShoppingView(
        items,
        {
          ...settings(),
          aisleOverrides: { "all purpose flour": "bakery" },
        },
        [],
        [],
        [merged(proposal)],
      ),
    );
    expect(row.aisle).toBe("bakery");
  });

  it("changes nothing with merge off, or for an apart decision", () => {
    const items = rogersFlour();
    const [proposal] = findShoppingProposals(items, settings());
    expect(
      rows(
        buildShoppingView(
          items,
          settings({ merge: false }),
          [],
          [],
          [merged(proposal)],
        ),
      ),
    ).toHaveLength(2);
    expect(
      rows(
        buildShoppingView(
          items,
          settings(),
          [],
          [],
          [{ ...merged(proposal), status: "apart" }],
        ),
      ),
    ).toHaveLength(2);
  });
});
