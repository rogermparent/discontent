// 43n: one vocabulary behind Make, the shopping list's merge and step
// matching. A synonym or descriptor row in `ingredientNames` must move all
// three together, since each reads names through `toName`.

import { describe, expect, it } from "vitest";

import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import { aisleFor } from "recipe-website-common/util/aisles";
import { parseIngredientLine } from "recipe-website-common/util/ingredientNames";
import {
  parseInventoryItem,
  satisfies,
} from "recipe-website-common/util/makeable";
import { DEFAULT_SHOPPING_SETTINGS } from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  shoppingNameOf,
} from "recipe-website-common/util/shoppingView";
import { matchStepIngredients } from "recipe-website-common/util/stepIngredients";

/** Pairs written two ways across recipes (the corpus survey's shapes). */
const PAIRS: [string, string][] = [
  ["1/2 cup mayo", "2 tablespoons mayonnaise"],
  ["4 oz mild feta cheese, crumbled", "1/2 cup feta cheese"],
  ["1/2 cup crumbled feta", "1/2 cup feta cheese"],
  ["1 tsp Dijon", "1 tablespoon Dijon mustard"],
  ["1 cup grated parm", "1/2 cup parmesan cheese"],
  ["2 cups AP flour", "1 cup all-purpose flour"],
  ["1 tsp ground cinnamon", "1/2 teaspoon cinnamon"],
  ["1 cup plain Greek yogurt", "1/2 cup Greek yogurt"],
  ["1 cup dry white wine", "1/2 cup white wine"],
  ["2 tbsp distilled white vinegar", "1 tbsp white distilled vinegar"],
  ["1 cup full-fat sour cream", "1/2 cup sour cream"],
];

function onlyRequirement(line: string) {
  const [requirement] = parseIngredientLine(line);
  expect(requirement, line).toBeDefined();
  return requirement;
}

describe("one name across Make, the shopping list and steps (43n)", () => {
  it.each(PAIRS)("%s and %s are one name", (a, b) => {
    /* Shopping: one key, so the merge puts them on one row. */
    expect(shoppingNameOf(a).key).toBe(shoppingNameOf(b).key);
    /* Make: either written form, typed as an item, meets either line. */
    for (const typed of [a, b]) {
      const item = parseInventoryItem(
        onlyRequirement(typed).alternatives[0].words.join(" "),
      );
      expect(satisfies(item, onlyRequirement(a)), `${typed} → ${a}`).toBe(true);
      expect(satisfies(item, onlyRequirement(b)), `${typed} → ${b}`).toBe(true);
    }
  });

  it("types an inventory item the short way", () => {
    expect(
      satisfies(
        parseInventoryItem("mayo"),
        onlyRequirement("1 cup mayonnaise"),
      ),
    ).toBe(true);
    expect(
      satisfies(
        parseInventoryItem("feta"),
        onlyRequirement("4 oz mild feta cheese"),
      ),
    ).toBe(true);
  });

  it("merges the two on one shopping row with their amounts added", () => {
    const view = buildShoppingView(
      [
        { id: "01j00000001", text: "1/2 cup mayo", recipe: "a", line: 0 },
        { id: "01j00000002", text: "1/4 cup mayonnaise", recipe: "b", line: 0 },
      ],
      DEFAULT_SHOPPING_SETTINGS,
    );
    const rows = view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    );
    expect(rows.map((row) => row.nameKey)).toEqual(["mayonnaise"]);
    expect(rows[0].label).toBe("¾ cup mayonnaise");
  });

  it("finds the line from a step that names it the other way", () => {
    const ingredients: Ingredient[] = [
      { ingredient: "1/2 cup mayonnaise" },
      { ingredient: "4 oz mild feta cheese, crumbled" },
      { ingredient: "1 tsp Dijon" },
    ];
    const instructions: InstructionEntry[] = [
      { text: "Whisk the mayo with the dijon mustard." },
      { text: "Fold in the feta." },
    ];
    expect(matchStepIngredients(ingredients, instructions)).toEqual([
      [[0, 2]],
      [[1]],
    ]);
  });

  it("still finds a named cheese by its own word", () => {
    const ingredients: Ingredient[] = [
      { ingredient: "1 cup shredded mozzarella" },
      { ingredient: "1/2 cup grated parmesan" },
    ];
    const instructions: InstructionEntry[] = [
      { text: "Top with the mozzarella, then the parmesan." },
      { text: "Sprinkle the cheese over." },
    ];
    /* "the cheese" could be either: D3 shows neither. */
    expect(matchStepIngredients(ingredients, instructions)).toEqual([
      [[0, 1]],
      [[]],
    ]);
  });
});

/*
 * Dn2 (43n review): every can shape reads `canned X`. A plain name on hand
 * still meets it (Make's tail rule), it shelves in the pantry, and a step
 * that says "the beans" or "the tomatoes" still finds it.
 */
describe("canned names across Make, the shopping list and steps (43n)", () => {
  const CANNED: [string, string][] = [
    ["1 can black beans, drained", "black beans"],
    ["1 (28 ounce) can crushed tomatoes", "tomatoes"],
    ["2 cans chickpeas", "chickpeas"],
    ["1 (15-ounce) can kidney beans, drained", "kidney beans"],
  ];

  it.each(CANNED)("%s is met by %s on hand", (line, item) => {
    expect(satisfies(parseInventoryItem(item), onlyRequirement(line))).toBe(
      true,
    );
    expect(
      satisfies(parseInventoryItem(`canned ${item}`), onlyRequirement(line)),
    ).toBe(true);
  });

  it("shelves every canned name in the pantry", () => {
    const view = buildShoppingView(
      CANNED.map(([text], i) => ({
        id: `01j0000000${i}`,
        text,
        recipe: "a",
        line: i,
      })),
      DEFAULT_SHOPPING_SETTINGS,
    );
    const rows = view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.nameKey.startsWith("canned "), row.nameKey).toBe(true);
      expect(aisleFor(row.nameKey), row.nameKey).toBe("pantry");
    }
  });

  it("finds a canned line from a step that leaves the can out", () => {
    const ingredients: Ingredient[] = [
      { ingredient: "1 can black beans, drained" },
      { ingredient: "1 (28 ounce) can crushed tomatoes" },
      { ingredient: "2 cans chickpeas" },
    ];
    const instructions: InstructionEntry[] = [
      { text: "Add the black beans and the tomatoes." },
      { text: "Stir in the chickpeas." },
    ];
    expect(matchStepIngredients(ingredients, instructions)).toEqual([
      [[0, 1]],
      [[2]],
    ]);
  });
});
