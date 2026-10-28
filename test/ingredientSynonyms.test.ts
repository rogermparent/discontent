// 43n: one vocabulary behind Make, the shopping list's merge and step
// matching. A synonym or descriptor row in `ingredientNames` must move all
// three together, since each reads names through `toName`.

import { describe, expect, it } from "vitest";

import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import { aisleFor } from "recipe-website-common/util/aisles";
import {
  parseIngredientLine,
  requirementLabel,
} from "recipe-website-common/util/ingredientNames";
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

/*
 * 46g: the merges Roger picked from 43n's near-duplicates (the 46c
 * checklist's ing-N groups), and the groups he kept apart.
 */
describe("the 46g merges across Make, the shopping list and steps", () => {
  const MERGED: [string, string, string][] = [
    /* ing-3: a bare sugar is granulated. */
    ["1 cup sugar", "1/2 cup granulated sugar", "granulated sugar"],
    ["1 cup white sugar", "2 tbsp sugar", "granulated sugar"],
    /* ing-6: a bare onion is yellow. */
    ["1 onion, diced", "1 yellow onion", "onion"],
    ["2 yellow onions", "1 cup chopped onion", "onion"],
    /* ing-7 */
    [
      "2 cups unbleached all-purpose flour",
      "1 cup all-purpose flour",
      "all purpose flour",
    ],
    ["1 cup all-purpose white flour", "1 cup AP flour", "all purpose flour"],
    /* ing-10 */
    ["1/2 tsp ground pepper", "1/4 tsp pepper", "pepper"],
    /* ing-12 */
    ["2 tbsp low-sodium soy sauce", "1 tbsp soy sauce", "soy sauce"],
    ["1 tbsp reduced sodium soy sauce", "1 tbsp soy sauce", "soy sauce"],
    /* ing-14 */
    ["1 lb lean ground beef", "1 lb ground beef", "ground beef"],
    ["1 lb extra-lean ground beef", "1 lb ground beef", "ground beef"],
    /* ing-15 */
    ["2 cups chicken stock", "1 cup chicken broth", "chicken broth"],
    ["2 cups low-sodium chicken broth", "1 cup chicken broth", "chicken broth"],
    [
      "1 cup reduced-sodium chicken stock",
      "1 cup chicken broth",
      "chicken broth",
    ],
    /* ing-18 */
    ["1 cup shredded sharp cheddar", "1 cup cheddar cheese", "cheddar cheese"],
    ["1 cup extra-sharp cheddar cheese", "4 oz cheddar", "cheddar cheese"],
    ["4 oz sharp white cheddar", "1 cup cheddar cheese", "cheddar cheese"],
    /* ing-19 */
    ["8 oz brick cream cheese, softened", "8 oz cream cheese", "cream cheese"],
    ["8 oz block-style cream cheese", "4 oz cream cheese", "cream cheese"],
    /* ing-21 and ing-22: no `canned` (Dn2) on these two. */
    ["1 (15-ounce) can pumpkin puree", "1 cup pumpkin puree", "pumpkin puree"],
    ["1 cup canned pumpkin purée", "1/2 cup pumpkin puree", "pumpkin puree"],
    ["1 (6 oz) can tomato paste", "2 tbsp tomato paste", "tomato paste"],
    /* ing-23 */
    ["1/4 cup unsulphured molasses", "2 tbsp molasses", "molasses"],
    ["1/4 cup dark molasses", "2 tbsp molasses", "molasses"],
    ["1/4 cup unsulphured or dark molasses", "2 tbsp molasses", "molasses"],
    /* ing-28 */
    ["1 bottle dry sparkling wine", "3 oz sparkling wine", "sparkling wine"],
    /* ing-29: within raw, and within cooked. */
    ["1 cup white rice", "1 cup uncooked rice", "rice"],
    ["2 cups cooked white rice", "1 cup cooked rice", "cooked rice"],
    /* ing-30 */
    ["4 slices thick-cut bacon", "4 slices bacon", "bacon"],
  ];

  it.each(MERGED)("%s and %s are one name: %s", (a, b, name) => {
    expect(shoppingNameOf(a).key).toBe(name);
    expect(shoppingNameOf(b).key).toBe(name);
    for (const typed of [a, b]) {
      const item = parseInventoryItem(
        onlyRequirement(typed).alternatives[0].words.join(" "),
      );
      expect(satisfies(item, onlyRequirement(a)), `${typed} → ${a}`).toBe(true);
      expect(satisfies(item, onlyRequirement(b)), `${typed} → ${b}`).toBe(true);
    }
  });

  it("shelves each merged name where its old forms were", () => {
    for (const [before, after] of [
      ["sugar", "granulated sugar"],
      ["yellow onion", "onion"],
      ["unbleached all purpose flour", "all purpose flour"],
      ["ground pepper", "pepper"],
      ["low sodium soy sauce", "soy sauce"],
      ["lean ground beef", "ground beef"],
      ["chicken stock", "chicken broth"],
      ["sharp cheddar cheese", "cheddar cheese"],
      ["brick cream cheese", "cream cheese"],
      ["canned pumpkin puree", "pumpkin puree"],
      ["canned tomato paste", "tomato paste"],
      ["unsulphured molasses", "molasses"],
      ["dry sparkling wine", "sparkling wine"],
      ["white rice", "rice"],
      ["cooked white rice", "cooked rice"],
      ["thick cut bacon", "bacon"],
    ]) {
      expect(aisleFor(after), before).toBe(aisleFor(before));
    }
  });

  /* Each pair stays two names: the groups Roger kept, and what the rows
   * must not reach. */
  const KEPT: [string, string][] = [
    ["2 tbsp olive oil", "2 tbsp extra virgin olive oil"],
    ["1 cup unsalted butter", "1 cup salted butter"],
    ["1 cup unsalted butter", "1 cup butter"],
    ["1 tsp kosher salt", "1 tsp salt"],
    ["1 tsp fine sea salt", "1 tsp flaky sea salt"],
    ["1 cup light brown sugar", "1 cup dark brown sugar"],
    ["1 cup brown sugar", "1 cup sugar"],
    ["1 cup powdered sugar", "1 cup sugar"],
    ["1 tsp coarse sugar", "1 tsp sugar"],
    ["1 tsp instant yeast", "1 tsp active dry yeast"],
    ["1 tbsp ginger", "1 tsp ground ginger"],
    ["1/4 tsp white pepper", "1/4 tsp pepper"],
    ["1 tsp smoked paprika", "1 tsp paprika"],
    ["1 white onion", "1 onion"],
    ["1 red onion", "1 onion"],
    ["2 green onions", "1 onion"],
    ["1 tsp onion powder", "1 onion"],
    ["1/4 tsp ground cloves", "4 whole cloves"],
    ["2 tomatoes", "1 can diced tomatoes"],
    ["1 tbsp yellow mustard", "1 tsp dry mustard"],
    ["1 tsp ground coriander", "1 tsp coriander"],
    ["1 can black beans", "1 cup black beans"],
    ["1 cup frozen corn", "1 cup canned corn"],
    [
      "1/2 cup creamy peanut butter",
      "1/2 cup creamy unsweetened peanut butter",
    ],
    ["2 cups cooked rice", "1 cup rice"],
    ["1 cup brown rice", "1 cup rice"],
    ["1 cup white rice flour", "1 cup rice flour"],
    ["2 cups beef broth", "2 cups chicken broth"],
    ["2 cups low-sodium beef broth", "2 cups beef broth"],
    ["1 tbsp chicken stock concentrate", "1 cup chicken broth"],
    ["1/4 cup blackstrap molasses", "1/4 cup molasses"],
    ["1 tbsp pomegranate molasses", "1/4 cup molasses"],
    ["1 lb lean ground turkey", "1 lb ground turkey"],
    ["1 can diced tomatoes", "1 can tomato paste"],
    ["1 cup sugar snap peas", "1 cup sugar"],
  ];

  it.each(KEPT)("%s and %s stay apart", (a, b) => {
    expect(shoppingNameOf(a).key).not.toBe(shoppingNameOf(b).key);
  });

  it("reads a name lent its tail through the table too (Tn3)", () => {
    for (const [line, expected] of [
      [
        "2/3 cup granulated or coarse sugar",
        "granulated sugar or coarse sugar",
      ],
      ["1 cup chicken or beef stock", "chicken broth or beef stock"],
      ["1/2 cup yellow or white onion", "onion or white onion"],
      [
        "1 packet instant or active dry yeast",
        "instant yeast or active dry yeast",
      ],
      ["1 cup sugar or honey", "granulated sugar or honey"],
    ]) {
      expect(requirementLabel(onlyRequirement(line)), line).toBe(expected);
    }
  });

  it("keeps the bare word a step says (Tn1)", () => {
    const ingredients: Ingredient[] = [
      { ingredient: "1 cup granulated sugar" },
      { ingredient: "1/2 cup packed brown sugar" },
      { ingredient: "2 cups low-sodium chicken stock" },
    ];
    const instructions: InstructionEntry[] = [
      { text: "Beat the butter, granulated sugar, and brown sugar." },
      /* "the sugar" could be either sugar line (D3). */
      { text: "Sprinkle the sugar over." },
      { text: "Pour in the chicken broth." },
    ];
    expect(matchStepIngredients(ingredients, instructions)).toEqual([
      [[0, 1]],
      [[]],
      [[2]],
    ]);
  });
});
