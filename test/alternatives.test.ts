// Alternatives (45e1): parallel sections the reader picks one of. The model
// (`readChoices` → `Choices`, `shownPath`), the `?pick=` parameter and the
// remembered pick, and every reader that needs one value — the shopping
// list, Make, the index, JSON-LD, the plan page's path — on the default
// option (G2). A recipe without a `choice` reads exactly as before.

import { describe, expect, it } from "vitest";

import type {
  InstructionEntry,
  Recipe,
} from "recipe-website-common/controller/types";
import {
  ALL_OPTIONS,
  cookPicks,
  formatPickParam,
  isDefaultPicks,
  knownPicks,
  parsePickParam,
  pathKey,
  pickStorageKey,
  plainChoices,
  readStoredPicks,
  setOfEntry,
  setStartingAt,
  shownPath,
  writeStoredPicks,
} from "recipe-website-common/util/alternatives";
import {
  alternateLines,
  readChoices,
  recipeOnPath,
} from "recipe-website-common/util/readChoices";
import { stepNumbers } from "recipe-website-common/util/stepNumbers";
import {
  headsUpCandidates,
  selectHeadsUps,
} from "recipe-website-common/util/headsUp";
import { recipeLines } from "recipe-website-common/util/shoppingLines";
import {
  analyzeMakeable,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";
import buildRecipeIndexValue from "recipe-website-common/controller/buildIndexValue";
import { buildRecipeJsonLD } from "recipe-website-common/components/View/JsonLD";
import { cookProgressKey } from "recipe-website-common/components/View/FocusView/cookProgress";
import { stepTimerId } from "recipe-website-common/util/kitchenTimers";
import { matchStepIngredients } from "recipe-website-common/util/stepIngredients";
import {
  showJumpLinks,
  showJumpLinksOnPath,
} from "recipe-website-common/components/View/JumpLinks";
import {
  RecipeInputSchema,
  ShoppingAddSchema,
  toIngredients,
  toInstructions,
} from "../websites/recipe-website/editor/controller/curation/schema";

/** The everything-dough shape: a dough, then one of three ways to finish. */
const DOUGH: Recipe = {
  name: "Everything Dough",
  date: 1_760_000_000_000,
  recipeYield: "1 batch of dough",
  ingredients: [
    { ingredient: "For the dough", type: "heading" }, // 0
    { ingredient: "500 g bread flour" }, // 1
    { ingredient: "350 g warm water" }, // 2
    { ingredient: "10 g salt" }, // 3
    { ingredient: "For the bagels", type: "heading", choice: "Then make" }, // 4
    { ingredient: "2 tbsp molasses" }, // 5
    { ingredient: "For the pretzels", type: "heading", choice: "Then make" }, // 6
    { ingredient: "1/4 cup baking soda" }, // 7
    { ingredient: "Flaky sea salt, for topping" }, // 8
  ],
  instructions: [
    {
      name: "Dough",
      instructions: [
        { text: "Mix the flour, water and salt." },
        { text: "Let rise for 1 hour." },
      ],
    },
    {
      name: "Bagels",
      choice: "Then make",
      recipeYield: "8 bagels",
      instructions: [
        { text: "Shape 8 bagels. Cover and refrigerate overnight." },
        { text: "Boil with the molasses for 30 seconds a side." },
        { text: "Bake for 20 minutes." },
      ],
    },
    {
      name: "Pretzels",
      choice: "Then make",
      recipeYield: "8 pretzels",
      instructions: [
        { text: "Shape 8 pretzels." },
        { text: "Dip in the baking soda bath and sprinkle with the salt." },
      ],
    },
    {
      name: "Pizza",
      choice: "Then make",
      instructions: [{ text: "Stretch, top and bake for 12 minutes." }],
    },
    { text: "Cool on a rack for 10 minutes." },
  ],
};

const SET = "then-make";

describe("readChoices (G1)", () => {
  it("reads consecutive groups with one `choice` as a set, the first the default", () => {
    const choices = readChoices(DOUGH);
    expect(choices.entrySteps).toEqual([2, 3, 2, 1, 1]);
    expect(choices.ingredientCount).toBe(9);
    expect(choices.sets).toEqual([
      {
        key: SET,
        label: "Then make",
        options: [
          {
            slug: "bagels",
            label: "Bagels",
            groupIndexes: [1],
            ingredientLines: [4, 5],
            yield: "8 bagels",
          },
          {
            slug: "pretzels",
            label: "Pretzels",
            groupIndexes: [2],
            ingredientLines: [6, 7, 8],
            yield: "8 pretzels",
          },
          {
            slug: "pizza",
            label: "Pizza",
            groupIndexes: [3],
            ingredientLines: [],
          },
        ],
      },
    ]);
    expect(setStartingAt(choices, 1)?.key).toBe(SET);
    expect(setStartingAt(choices, 2)).toBeUndefined();
    expect(setOfEntry(choices, 3)?.key).toBe(SET);
    expect(setOfEntry(choices, 4)).toBeUndefined();
  });

  it("finds no set in a recipe without `choice`", () => {
    const plain = stripChoices(DOUGH);
    expect(readChoices(plain).sets).toEqual([]);
    expect(alternateLines(plain)).toEqual([]);
    /* The same object back: nothing to cut. */
    expect(recipeOnPath(plain)).toBe(plain);
  });

  it("reads a lone choice group, or a choice on a bare step, as no set", () => {
    const lone: Recipe = {
      ...DOUGH,
      instructions: [
        DOUGH.instructions![0],
        DOUGH.instructions![1],
        { text: "Serve." },
        { ...(DOUGH.instructions![2] as object), choice: "Finish" },
      ] as InstructionEntry[],
    };
    expect(readChoices(lone).sets).toEqual([]);
    const bare = {
      ...DOUGH,
      instructions: [{ text: "Mix.", choice: "Then make" }],
    } as unknown as Recipe;
    expect(readChoices(bare).sets).toEqual([]);
  });

  it("labels an unnamed option by its place, and never merges it", () => {
    const unnamed: Recipe = {
      name: "Two ways",
      date: 1_760_000_000_000,
      instructions: [
        { name: "", choice: "Finish", instructions: [{ text: "Glaze." }] },
        {
          name: "Option 1",
          choice: "Finish",
          instructions: [{ text: "Dust." }],
        },
      ],
    };
    const [set] = readChoices(unnamed).sets;
    expect(
      set.options.map(({ slug, label, groupIndexes }) => ({
        slug,
        label,
        groupIndexes,
      })),
    ).toEqual([
      { slug: "option-1", label: "Option 1", groupIndexes: [0] },
      { slug: "option-1-2", label: "Option 1", groupIndexes: [1] },
    ]);
  });

  it("matches `choice` labels by slug and merges groups of one name", () => {
    const merged: Recipe = {
      name: "Merged",
      date: 1,
      instructions: [
        { name: "Bagels", choice: "Then make", instructions: [{ text: "A" }] },
        { name: "bagels", choice: "then make", instructions: [{ text: "B" }] },
        { name: "Pizza", choice: "Then Make", instructions: [{ text: "C" }] },
      ],
    };
    const [set] = readChoices(merged).sets;
    expect(set.options.map((o) => [o.slug, o.groupIndexes])).toEqual([
      ["bagels", [0, 1]],
      ["pizza", [2]],
    ]);
  });

  it("keys two sets apart, one after a shared step, and prefixes a shared option slug", () => {
    const cake = cakeRecipe();
    const choices = readChoices(cake);
    expect(choices.sets.map((set) => set.key)).toEqual(["crumb", "frosting"]);
    expect(choices.sets[1].options.map((o) => o.ingredientLines)).toEqual([
      [5, 6],
      [7, 8, 9],
    ]);
    const path = shownPath(choices);
    /* Both sets have a "Classic": its anchors name the set. */
    expect(path.steps[0][0].id).toBe("step-crumb-classic-1");
    expect(path.steps[3][0].id).toBe("step-frosting-classic-3");
    expect(path.steps[1][0].id).toBe("step-oat-1");
  });

  it("leaves a heading that meets no option as an ordinary heading", () => {
    const odd: Recipe = {
      ...DOUGH,
      ingredients: [
        ...DOUGH.ingredients!,
        /* Names no option. */
        {
          ingredient: "For the focaccia",
          type: "heading",
          choice: "Then make",
        },
        { ingredient: "olive oil" }, // 10
        /* Another set's label. */
        { ingredient: "For the bagels", type: "heading", choice: "Frosting" },
        { ingredient: "sesame seeds" }, // 12
      ],
    };
    const choices = readChoices(odd);
    expect(choices.sets[0].options[0].ingredientLines).toEqual([4, 5]);
    const path = shownPath(choices, { [SET]: "pizza" });
    expect(path.lines.slice(9)).toEqual([true, true, true, true]);
  });

  it("ends an option's lines at the next heading, stored or detected", () => {
    const topped: Recipe = {
      ...DOUGH,
      ingredients: [
        { ingredient: "For the bagels", type: "heading", choice: "Then make" },
        { ingredient: "2 tbsp molasses" },
        { ingredient: "Topping:" },
        { ingredient: "sesame seeds" },
      ],
    };
    expect(readChoices(topped).sets[0].options[0].ingredientLines).toEqual([
      0, 1,
    ]);
  });
});

describe("shownPath (G4)", () => {
  const choices = readChoices(DOUGH);

  it("numbers the default path: shared, the default option, then shared again", () => {
    const path = shownPath(choices);
    expect(path.picks).toEqual({ [SET]: "bagels" });
    expect(path.entries).toEqual([true, true, false, false, true]);
    expect(path.steps.map((steps) => steps.map((s) => s.number))).toEqual([
      [1, 2],
      [3, 4, 5],
      [3, 4],
      [3],
      [6],
    ]);
    expect(path.steps[0].map((s) => s.id)).toEqual(["step-1", "step-2"]);
    expect(path.steps[1][0]).toMatchObject({
      id: "step-bagels-3",
      timerKey: "bagels-3",
      shown: true,
      option: { set: SET, slug: "bagels" },
    });
    expect(path.steps[2][1]).toMatchObject({
      id: "step-pretzels-4",
      shown: false,
    });
    expect(path.steps[4][0]).toMatchObject({
      id: "step-6",
      timerKey: 6,
      shown: true,
    });
    expect(path.lines).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(path.yield).toBe("8 bagels");
  });

  it("continues the count from the chosen option", () => {
    const pretzels = shownPath(choices, { [SET]: "pretzels" });
    expect(pretzels.entries).toEqual([true, false, true, false, true]);
    expect(pretzels.steps[4][0].number).toBe(5);
    expect(pretzels.lines.slice(4)).toEqual([false, false, true, true, true]);
    expect(pretzels.yield).toBe("8 pretzels");

    /* No extras and no yield of its own: the recipe's yield stands. */
    const pizza = shownPath(choices, { [SET]: "pizza" });
    expect(pizza.steps[4][0].number).toBe(4);
    expect(pizza.lines.slice(4)).toEqual([false, false, false, false, false]);
    expect(pizza.yield).toBeUndefined();
  });

  it("shows every option under All, each numbered from the set's start", () => {
    const all = shownPath(choices, { [SET]: ALL_OPTIONS });
    expect(all.entries.every(Boolean)).toBe(true);
    expect(all.lines.every(Boolean)).toBe(true);
    expect(all.steps[2].map((s) => s.number)).toEqual([3, 4]);
    /* After the set the count goes on from the default option (G2). */
    expect(all.steps[4][0].number).toBe(6);
    expect(all.yield).toBeUndefined();
  });

  it("falls back to the default for an unknown pick", () => {
    expect(shownPath(choices, { [SET]: "focaccia" }).picks).toEqual({
      [SET]: "bagels",
    });
    expect(shownPath(choices, { other: "x" }).picks).toEqual({
      [SET]: "bagels",
    });
  });

  it("numbers a set at the start from 1, each option alike", () => {
    const first: Recipe = {
      name: "Start",
      date: 1,
      instructions: DOUGH.instructions!.slice(1),
    };
    const path = shownPath(readChoices(first), { [SET]: "pizza" });
    expect(path.steps.map((steps) => steps.map((s) => s.number))).toEqual([
      [1, 2, 3],
      [1, 2],
      [1],
      [2],
    ]);
  });

  it("is `stepNumbers` exactly for a recipe without alternatives", () => {
    for (const recipe of [stripChoices(DOUGH), stripChoices(cakeRecipe())]) {
      const path = shownPath(readChoices(recipe));
      const numbers = stepNumbers(recipe.instructions);
      expect(path.steps.map((steps) => steps.map((s) => s.number))).toEqual(
        numbers,
      );
      expect(path.steps.flat().map((s) => s.id)).toEqual(
        numbers.flat().map((n) => `step-${n}`),
      );
      /* The timer ids the page always had. */
      expect(path.steps.flat().map((s) => stepTimerId(s.timerKey, 0))).toEqual(
        numbers.flat().map((n) => stepTimerId(n, 0)),
      );
      expect(path.entries.every(Boolean)).toBe(true);
      expect(path.lines.every(Boolean)).toBe(true);
      /* The same from the lists' shape alone. */
      expect(
        shownPath(
          plainChoices(recipe.instructions, recipe.ingredients?.length),
        ),
      ).toEqual(path);
    }
  });

  it("follows two sets at once", () => {
    const choices = readChoices(cakeRecipe());
    const path = shownPath(choices, {
      crumb: "oat",
      frosting: "frosting-classic",
    });
    expect(path.picks).toEqual({ crumb: "oat", frosting: "classic" });
    // `frosting-classic` is an id prefix, not a slug: the default stands.
    const picked = shownPath(choices, {
      crumb: "oat",
      frosting: "brown-butter",
    });
    expect(picked.entries).toEqual([false, true, true, false, true, true]);
    expect(picked.steps.map((steps) => steps.map((s) => s.number))).toEqual([
      [1],
      [1, 2],
      [3],
      [4],
      [4, 5],
      [6],
    ]);
    expect(picked.lines).toEqual([
      true,
      false,
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("picks (G3)", () => {
  const choices = readChoices(DOUGH);
  const cake = readChoices(cakeRecipe());

  it("reads `?pick=` in each of its shapes, ignoring what it does not know", () => {
    expect(parsePickParam("pretzels", choices)).toEqual({ [SET]: "pretzels" });
    expect(parsePickParam("Pretzels", choices)).toEqual({ [SET]: "pretzels" });
    expect(parsePickParam("all", choices)).toEqual({ [SET]: ALL_OPTIONS });
    expect(parsePickParam("then-make:pizza", choices)).toEqual({
      [SET]: "pizza",
    });
    expect(parsePickParam("then-make:all", choices)).toEqual({
      [SET]: ALL_OPTIONS,
    });
    expect(parsePickParam("focaccia", choices)).toEqual({});
    expect(parsePickParam("then-make:focaccia", choices)).toEqual({});
    expect(parsePickParam("", choices)).toEqual({});
    expect(parsePickParam(null, choices)).toEqual({});
    expect(parsePickParam("crumb:oat,frosting:brown-butter", cake)).toEqual({
      crumb: "oat",
      frosting: "brown-butter",
    });
    /* A bare slug names the first set that has it. */
    expect(parsePickParam("classic", cake)).toEqual({ crumb: "classic" });
  });

  it("writes `?pick=` only off the defaults, bare for one set", () => {
    expect(formatPickParam(choices, {})).toBeUndefined();
    expect(formatPickParam(choices, { [SET]: "bagels" })).toBeUndefined();
    expect(formatPickParam(choices, { [SET]: "pretzels" })).toBe("pretzels");
    expect(formatPickParam(choices, { [SET]: ALL_OPTIONS })).toBe("all");
    expect(formatPickParam(cake, { frosting: "brown-butter" })).toBe(
      "frosting:brown-butter",
    );
    expect(
      formatPickParam(cake, { crumb: "all", frosting: "brown-butter" }),
    ).toBe("crumb:all,frosting:brown-butter");
    /* What it writes, it reads back. */
    for (const picks of [
      { [SET]: "pretzels" },
      { [SET]: ALL_OPTIONS },
      { [SET]: "pizza" },
    ]) {
      expect(parsePickParam(formatPickParam(choices, picks), choices)).toEqual(
        picks,
      );
    }
  });

  it("reads All as the default where one path is the point (the cook view)", () => {
    expect(cookPicks(choices, { [SET]: ALL_OPTIONS })).toEqual({
      [SET]: "bagels",
    });
    expect(isDefaultPicks(choices, {})).toBe(true);
    expect(isDefaultPicks(choices, { [SET]: "pizza" })).toBe(false);
    expect(knownPicks(choices, { [SET]: "pizza", other: "x" })).toEqual({
      [SET]: "pizza",
    });
    expect(pathKey(choices, { [SET]: "pizza" })).toBe("then-make=pizza");
  });

  it("keeps the pick per recipe in storage, and survives a broken one", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    writeStoredPicks(storage, "everything-dough", { [SET]: "pizza" });
    expect(store.get(pickStorageKey("everything-dough"))).toBe(
      '{"then-make":"pizza"}',
    );
    expect(readStoredPicks(storage, "everything-dough")).toEqual({
      [SET]: "pizza",
    });
    expect(readStoredPicks(storage, "other")).toEqual({});
    store.set(pickStorageKey("bad"), "{not json");
    expect(readStoredPicks(storage, "bad")).toEqual({});
    store.set(pickStorageKey("array"), "[1]");
    expect(readStoredPicks(storage, "array")).toEqual({});
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readStoredPicks(broken, "x")).toEqual({});
    expect(() => writeStoredPicks(broken, "x", {})).not.toThrow();
  });

  it("keys the cook view's ticks per path, the old key without alternatives", () => {
    expect(cookProgressKey("dough")).toBe("cook-view:dough");
    expect(cookProgressKey("dough", "then-make=pizza")).toBe(
      "cook-view:dough|then-make=pizza",
    );
  });
});

describe("one path for the readers that need one value (G2)", () => {
  it("cuts the recipe to the default path, or a pick's", () => {
    const onPath = recipeOnPath(DOUGH);
    expect(
      onPath.instructions!.map((entry) =>
        "instructions" in entry ? entry.name : entry.text,
      ),
    ).toEqual(["Dough", "Bagels", "Cool on a rack for 10 minutes."]);
    expect(onPath.ingredients!.map((line) => line.ingredient)).toEqual(
      DOUGH.ingredients!.slice(0, 6).map((line) => line.ingredient),
    );
    expect(onPath.recipeYield).toBe("8 bagels");
    /* The stored recipe is untouched. */
    expect(DOUGH.instructions).toHaveLength(5);

    const pizza = recipeOnPath(DOUGH, { [SET]: "pizza" });
    expect(pizza.recipeYield).toBe("1 batch of dough");
    expect(pizza.ingredients).toHaveLength(4);
    /* All reads as the default here. */
    expect(recipeOnPath(DOUGH, { [SET]: ALL_OPTIONS })).toEqual(onPath);
  });

  it("puts the chosen path's lines on the shopping list", () => {
    const lines = (picks?: Record<string, string>) =>
      recipeLines(DOUGH, picks).map((line) => line.line);
    expect(lines()).toEqual([1, 2, 3, 5]);
    expect(lines({ [SET]: "pretzels" })).toEqual([1, 2, 3, 7, 8]);
    expect(lines({ [SET]: "pizza" })).toEqual([1, 2, 3]);
    expect(lines({ [SET]: ALL_OPTIONS })).toEqual([1, 2, 3, 5, 7, 8]);
    /* Lines alone, no steps: no sets to read, every line as before. */
    expect(
      recipeLines({ ingredients: DOUGH.ingredients }).map((line) => line.line),
    ).toEqual([1, 2, 3, 5, 7, 8]);
  });

  it("indexes the lines off the default path, and nothing for a recipe without", () => {
    const value = buildRecipeIndexValue(DOUGH);
    expect(value.ingredientAlternates).toEqual([6, 7, 8]);
    /* Every line is still searchable. */
    expect(value.ingredients).toHaveLength(9);
    const plain = buildRecipeIndexValue(stripChoices(DOUGH));
    expect("ingredientAlternates" in plain).toBe(false);
  });

  it("counts the default option on Make", () => {
    const value = buildRecipeIndexValue(DOUGH);
    const row: MakeRecipe = {
      slug: "everything-dough",
      name: value.name,
      ingredients: value.ingredients,
      ingredientHeadings: value.ingredientHeadings,
      ingredientAlternates: value.ingredientAlternates,
    };
    const shelf = ["bread flour", "water", "salt", "molasses"];
    const result = analyzeMakeable([row], [row], shelf, {
      pantryStaples: false,
    });
    expect(result.canMake.map((r) => r.recipe.slug)).toEqual([
      "everything-dough",
    ]);
    /* Without the field (an index built before 45e) every line counts. */
    const old = { ...row, ingredientAlternates: undefined };
    const before = analyzeMakeable([old], [old], shelf, {
      pantryStaples: false,
    });
    expect(before.canMake).toEqual([]);
  });

  it("gives JSON-LD the default path, its sections by name (G6)", () => {
    const jsonLD = buildRecipeJsonLD(DOUGH, undefined) as unknown as {
      recipeIngredient: string[];
      recipeInstructions: Array<{ "@type": string; name?: string }>;
      recipeYield?: string;
    };
    expect(jsonLD.recipeInstructions.map((entry) => entry.name)).toEqual([
      "Dough",
      "Bagels",
      undefined,
    ]);
    expect(jsonLD.recipeIngredient).not.toContain("1/4 cup baking soda");
    expect(jsonLD.recipeIngredient).toContain("2 tbsp molasses");
    expect(jsonLD.recipeYield).toBe("8 bagels");

    /* Every recipe's sections: their own names, no longer "To Store". */
    const plain = buildRecipeJsonLD(
      stripChoices(DOUGH),
      undefined,
    ) as unknown as {
      recipeInstructions: Array<{ name?: string }>;
    };
    expect(plain.recipeInstructions.map((entry) => entry.name)).toEqual([
      "Dough",
      "Bagels",
      "Pretzels",
      "Pizza",
      undefined,
    ]);
  });
});

describe("heads-up notes on the reader's path", () => {
  it("drops an option's note when another is chosen, numbered by the path", () => {
    const choices = readChoices(DOUGH);
    const candidates = headsUpCandidates(DOUGH.instructions, DOUGH.timelines);
    const notesFor = (picks?: Record<string, string>) => {
      const path = shownPath(choices, picks);
      return selectHeadsUps(candidates, (entry, step) => {
        const at = path.steps[entry]?.[step];
        return at?.shown ? { number: at.number, anchor: at.id } : undefined;
      });
    };
    expect(notesFor()).toEqual([
      {
        sentence: "Cover and refrigerate overnight.",
        step: 3,
        anchor: "step-bagels-3",
        source: "step",
      },
    ]);
    expect(notesFor({ [SET]: "pretzels" })).toEqual([]);
  });

  it("picks every note on the one path of a recipe without alternatives", () => {
    /* Worked by hand: the dough's only heads-up is the bagels' first step,
       the third on the page with every group stacked. */
    const plain = stripChoices(DOUGH);
    const path = shownPath(readChoices(plain));
    expect(
      selectHeadsUps(
        headsUpCandidates(plain.instructions, plain.timelines),
        (entry, step) => {
          const at = path.steps[entry]?.[step];
          return at?.shown ? { number: at.number } : undefined;
        },
      ),
    ).toEqual([
      {
        sentence: "Cover and refrigerate overnight.",
        step: 3,
        source: "step",
      },
    ]);
    expect(path.steps[1][0].id).toBe("step-3");
  });
});

describe("the jump row on the reader's path", () => {
  /* 15 lines and steps between them is the row's threshold (39-Dc5). */
  const LONG: Recipe = {
    name: "Long dough",
    date: 1_760_000_000_000,
    ingredients: [
      ...Array.from({ length: 8 }, (_, n) => ({ ingredient: `${n + 1} g a` })),
      { ingredient: "For the bagels", type: "heading", choice: "Then make" },
      ...Array.from({ length: 3 }, (_, n) => ({ ingredient: `${n + 1} g b` })),
    ],
    instructions: [
      { name: "Dough", instructions: [{ text: "Mix." }, { text: "Rise." }] },
      {
        name: "Bagels",
        choice: "Then make",
        instructions: [{ text: "Shape." }, { text: "Boil." }],
      },
      { name: "Pizza", choice: "Then make", instructions: [{ text: "Bake." }] },
    ],
  };
  const onPath = (recipe: Recipe, picks?: Record<string, string>) => {
    const path = shownPath(readChoices(recipe), picks);
    return showJumpLinksOnPath({
      headings: (recipe.ingredients ?? []).map(
        ({ type }) => type === "heading",
      ),
      lines: path.lines,
      entries: path.entries,
      steps: path.steps.flat().filter((step) => step.shown).length,
    });
  };

  it("counts the chosen path: bagels 8 + 3 + 2 + 2 = 15, pizza 8 + 2 + 1 = 11", () => {
    expect(onPath(LONG)).toBe(true);
    expect(onPath(LONG, { [SET]: "pizza" })).toBe(false);
    expect(onPath(LONG, { [SET]: ALL_OPTIONS })).toBe(true);
  });

  it("is `showJumpLinks` without alternatives: 11 lines + 5 steps", () => {
    const plain = stripChoices(LONG);
    expect(onPath(plain)).toBe(true);
    expect(showJumpLinks(plain.ingredients, plain.instructions)).toBe(true);
    const short: Recipe = {
      ...plain,
      ingredients: plain.ingredients!.slice(2),
    };
    expect(onPath(short)).toBe(false);
    expect(showJumpLinks(short.ingredients, short.instructions)).toBe(false);
  });
});

describe("a step's Uses inside an option", () => {
  it("pairs an option's group with its heading's lines, as a section", () => {
    const uses = matchStepIngredients(DOUGH.ingredients, DOUGH.instructions);
    /* "Boil with the molasses": the bagels' molasses. */
    expect(uses[1][1]).toEqual([5]);
    /* "the baking soda … the salt": the pretzels' own lines. */
    expect(uses[2][1]).toEqual([7, 8]);
  });
});

describe("Add to list with a pick", () => {
  it("takes a pick whose option has a long name", () => {
    const name =
      "Soft pretzels with a beer cheese dip and a mustard glaze, rolled in everything seasoning and baked on a stone";
    const recipe: Recipe = {
      ...DOUGH,
      instructions: [
        DOUGH.instructions![0],
        DOUGH.instructions![1],
        { ...(DOUGH.instructions![2] as object), name } as InstructionEntry,
        DOUGH.instructions![3],
      ],
    };
    const [set] = readChoices(recipe).sets;
    const long = set.options[1].slug;
    expect(long.length).toBeGreaterThan(80);
    const parsed = ShoppingAddSchema.safeParse({
      recipe: "everything-dough",
      picks: { [set.key]: long },
    });
    expect(parsed.success).toBe(true);
    expect(
      ShoppingAddSchema.safeParse({
        recipe: "everything-dough",
        picks: { [set.key]: "x".repeat(201) },
      }).success,
    ).toBe(false);
  });
});

describe("the write schema (G1, G5: explicit only)", () => {
  it("accepts `choice` on a group and on a heading, with an option's yield", () => {
    const parsed = RecipeInputSchema.parse({
      name: "Everything Dough",
      ingredients: DOUGH.ingredients,
      instructions: DOUGH.instructions,
    });
    expect(toIngredients(parsed.ingredients!)).toEqual(DOUGH.ingredients);
    expect(toInstructions(parsed.instructions!)).toEqual(DOUGH.instructions);
  });

  it("trims a label, refuses a blank one, and refuses one on a plain line", () => {
    const group = (choice: string) => ({
      name: "Dough",
      instructions: [{ name: "Bagels", choice, instructions: [] }],
    });
    expect(RecipeInputSchema.parse(group("  Then make ")).instructions).toEqual(
      [{ name: "Bagels", choice: "Then make", instructions: [] }],
    );
    expect(RecipeInputSchema.safeParse(group("  ")).success).toBe(false);
    expect(
      RecipeInputSchema.safeParse({
        name: "Dough",
        ingredients: [{ ingredient: "2 tbsp molasses", choice: "Then make" }],
      }).success,
    ).toBe(false);
    expect(
      RecipeInputSchema.safeParse({
        name: "Dough",
        instructions: [{ name: "Bagels", instructions: [], choise: "x" }],
      }).success,
    ).toBe(false);
  });
});

/** The recipe with every `choice` and option yield taken off. */
function stripChoices(recipe: Recipe): Recipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients?.map(({ ingredient, type }) =>
      type ? { ingredient, type } : { ingredient },
    ),
    instructions: recipe.instructions?.map((entry) =>
      "instructions" in entry
        ? { name: entry.name, instructions: entry.instructions }
        : entry,
    ),
  };
}

/**
 * A cake with two sets: a crumb, a shared step, a frosting — and a
 * "Classic" in both, so its anchors name the set.
 */
function cakeRecipe(): Recipe {
  return {
    name: "Coffee Cake",
    date: 1_760_000_000_000,
    ingredients: [
      { ingredient: "2 cups flour" }, // 0
      { ingredient: "Classic", type: "heading", choice: "Crumb" }, // 1
      { ingredient: "1/2 cup brown sugar" }, // 2
      { ingredient: "For the oat", type: "heading", choice: "Crumb" }, // 3
      { ingredient: "1 cup oats" }, // 4
      {
        ingredient: "Classic:",
        type: "heading",
        choice: "Frosting",
      }, // 5
      { ingredient: "8 oz cream cheese" }, // 6
      {
        ingredient: "For the brown butter",
        type: "heading",
        choice: "Frosting",
      }, // 7
      { ingredient: "1/2 cup butter" }, // 8
      { ingredient: "Powdered sugar, for dusting" }, // 9 (still the option's)
    ],
    instructions: [
      { name: "Classic", choice: "Crumb", instructions: [{ text: "Rub." }] },
      {
        name: "Oat",
        choice: "Crumb",
        instructions: [{ text: "Toss the oats." }, { text: "Rest." }],
      },
      { text: "Bake for 40 minutes." },
      {
        name: "Classic",
        choice: "Frosting",
        instructions: [{ text: "Beat." }],
      },
      {
        name: "Brown butter",
        choice: "Frosting",
        instructions: [{ text: "Brown." }, { text: "Whip." }],
      },
      { text: "Frost and serve." },
    ],
  };
}
