// @vitest-environment node
//
// 45e2: alternatives in the edit form — the sets' rules (`choiceProblems`,
// the form's live list and `parseFormData`'s refusals in 45d's words), the
// Steps section's edits, heading ties, and the ingredients' text mode
// keeping a heading's `choice`.

import { describe, expect, it } from "vitest";

import type {
  Ingredient,
  InstructionEntry,
  InstructionGroup,
} from "../websites/recipe-website/common/controller/types";
import {
  choiceProblems,
  choiceRuns,
  everySet,
} from "../websites/recipe-website/common/util/choiceChecks";
import {
  addOption,
  labelProblem,
  makeChoice,
  moveEntry,
  moveOption,
  moveTarget,
  notChoice,
  relabel,
  retieHeadings,
  selectionProblem,
  settleLabel,
  suggestionFits,
} from "../websites/recipe-website/common/components/Form/Instructions/choiceEdits";
import { reconcileKeys } from "../websites/recipe-website/common/components/Form/stableKeys";
import {
  headingTies,
  tieHeading,
} from "../websites/recipe-website/common/components/Form/Ingredients/headingTies";
import {
  linesAsText,
  linesFromText,
} from "../websites/recipe-website/common/components/Form/Ingredients/ingredientRows";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import { recipeFormFailure } from "../websites/recipe-website/editor/controller/recipeFormErrors";
import {
  RecipeInputSchema,
  RecipePatchSchema,
  parseInput,
} from "../websites/recipe-website/editor/controller/curation/schema";
import { ValidationError } from "../websites/recipe-website/editor/controller/curation/errors";

function group(
  name: string,
  choice?: string,
  extra: Partial<InstructionGroup> = {},
): InstructionGroup {
  return {
    name,
    instructions: [{ text: `${name || "It"}: do it.` }],
    ...(choice !== undefined ? { choice } : {}),
    ...extra,
  };
}

const DOUGH: InstructionEntry[] = [
  group("Dough"),
  group("Bagels", "Then make", { recipeYield: "8 bagels" }),
  group("Pretzels", "Then make"),
  group("Pizza", "Then make"),
  { text: "Cool on a rack." },
];

const INGREDIENTS: Ingredient[] = [
  { ingredient: "For the dough", type: "heading" },
  { ingredient: "500 g bread flour" },
  { ingredient: "For the bagels", type: "heading", choice: "Then make" },
  { ingredient: "2 tbsp molasses" },
  { ingredient: "For the pretzels", type: "heading" },
  { ingredient: "1/4 cup baking soda" },
  { ingredient: "Toppings", type: "heading", choice: "Then make" },
  { ingredient: "Sesame seeds" },
];

/** Every set worked on, as the curation write path judges them. */
function judged(instructions: InstructionEntry[]) {
  return choiceProblems(instructions, everySet(instructions));
}

describe("choiceRuns / choiceProblems", () => {
  it("reads a set as one run, and finds nothing wrong with it", () => {
    expect(choiceRuns(DOUGH)).toEqual([
      { start: 1, end: 4, label: "Then make" },
    ]);
    expect(choiceProblems(DOUGH)).toEqual([]);
    expect(judged(DOUGH)).toEqual([]);
  });

  it("a set as stored reads as readChoices reads it, and is never judged", () => {
    /* A lone group with a `choice` is an ordinary group (De1-1). */
    const lone = [group("Dough"), group("Bagels", "Then make")];
    expect(choiceRuns(lone)).toEqual([]);
    expect(choiceProblems(lone)).toEqual([]);
    /* Two groups of one name are one option: no set either. */
    expect(
      choiceRuns([
        group("Dough"),
        group("Bagels", "Then make"),
        group("bagels", "Then make"),
      ]),
    ).toEqual([]);
    /* Two sets sharing a label: two runs, no problem until worked on. */
    const two = [
      group("Cake"),
      group("Cream cheese", "Frosting"),
      group("Buttercream", "Frosting"),
      { text: "Chill the cake." },
      group("Ganache", "Frosting"),
      group("Glaze", "Frosting"),
    ];
    expect(choiceRuns(two).map((run) => [run.start, run.end])).toEqual([
      [1, 3],
      [4, 6],
    ]);
    expect(choiceProblems(two)).toEqual([]);
    /* Worked on, the set says so — whichever of the two it is. */
    const sets = [undefined, "a", "a", undefined, undefined, undefined];
    expect(choiceProblems(two, sets).map((p) => [p.index, p.message])).toEqual([
      [1, "Two choices are called “Frosting”: give each its own label"],
    ]);
  });

  it("a worked-on set keeps its bounds: a neighbour's label never merges them", () => {
    /* Two sets, the second's label typed until it is the first's. */
    const typed = [
      group("Cake"),
      group("Vanilla", "Crumb"),
      group("Streusel", "Crumb"),
      group("Cream cheese", "Crumb"),
      group("Chocolate", "Crumb"),
    ];
    const sets = [undefined, "a", "a", "b", "b"];
    expect(choiceRuns(typed, sets).map((run) => [run.start, run.end])).toEqual([
      [1, 3],
      [3, 5],
    ]);
    expect(
      choiceProblems(typed, sets).map((p) => [p.index, p.message]),
    ).toEqual([
      [1, "Two choices next to each other can't share a label"],
      [3, "Two choices next to each other can't share a label"],
    ]);
    /* Only the edited one is judged when the other is as stored. */
    expect(
      choiceProblems(typed, [undefined, undefined, undefined, "b", "b"]).map(
        (p) => [p.index, p.message],
      ),
    ).toEqual([[3, "Two choices next to each other can't share a label"]]);
  });

  it("a set of one needs a second option", () => {
    expect(judged([group("Dough"), group("Bagels", "Then make")])).toEqual([
      {
        index: 1,
        field: "choice",
        message: "The choice “Then make” needs at least two options",
      },
    ]);
  });

  it("a blank label is one set still, and needs a label", () => {
    const blank = [group("Dough"), group("Bagels", ""), group("Pizza", " ")];
    expect(choiceRuns(blank)).toEqual([]);
    expect(choiceRuns(blank, ["x", "a", "a"])).toEqual([
      { start: 1, end: 3, label: "", set: "a" },
    ]);
    expect(judged(blank).map((p) => p.message)).toEqual([
      "The choice starting with “Bagels” needs a label",
    ]);
  });

  it("two sets can't share a label (45e1's known limit)", () => {
    const two = [
      group("Cake"),
      group("Cream cheese", "Frosting"),
      group("Buttercream", "Frosting"),
      { text: "Chill the cake." },
      group("Ganache", "frosting"),
      group("Glaze", "Frosting"),
    ];
    expect(judged(two)).toEqual([
      {
        index: 4,
        field: "choice",
        message: "Two choices are called “frosting”: give each its own label",
      },
    ]);
  });

  it("option names are required, and unique in their set", () => {
    expect(
      judged([
        group("Dough"),
        group("Bagels", "Then make"),
        group("bagels", "Then make"),
        group("", "Then make"),
      ]).map((p) => [p.index, p.field, p.message]),
    ).toEqual([
      [2, "name", "The choice “Then make” has two options called “bagels”"],
      [3, "name", "An option of the choice “Then make” needs a name"],
    ]);
  });
});

describe("the Steps section's edits", () => {
  const plain: InstructionEntry[] = [
    { text: "Mix." },
    group("Bagels"),
    group("Pretzels"),
    { text: "Cool." },
    group("Pizza"),
  ];

  it("makes adjacent groups a choice, and says why it can't otherwise", () => {
    expect(selectionProblem(plain, [1])).toBe("Tick at least two groups.");
    expect(selectionProblem(plain, [2, 4])).toBe(
      "The groups must sit next to each other, with no step between them.",
    );
    expect(selectionProblem(plain, [0, 1])).toBe(
      "Only groups that are not in a choice yet can be ticked.",
    );
    expect(selectionProblem(plain, [2, 1])).toBeUndefined();
    const made = makeChoice(plain, [1, 2], " Then make ");
    expect(made[1]).toMatchObject({ name: "Bagels", choice: "Then make" });
    expect(made[2]).toMatchObject({ name: "Pretzels", choice: "Then make" });
    expect(made[4]).toEqual(group("Pizza"));
  });

  it("refuses a blank label and one another set has", () => {
    const runs = choiceRuns(DOUGH);
    expect(labelProblem(runs, " ")).toBe(
      "Give the choice a label, such as “Then make”.",
    );
    expect(labelProblem(runs, "then make")).toBe(
      "Another choice is already called “Then make”.",
    );
    expect(labelProblem(runs, "Then make", runs[0])).toBe(undefined);
    expect(labelProblem(runs, "Crumb")).toBeUndefined();
  });

  it("“Not a choice” drops the label and the yields", () => {
    const [run] = choiceRuns(DOUGH);
    const undone = notChoice(DOUGH, run);
    expect(undone[1]).toEqual(group("Bagels"));
    expect(choiceRuns(undone)).toEqual([]);
  });

  it("a label settles once: cleared and retyped key by key, the ties follow", () => {
    /* The review's sequence: "Then make" backspaced to "" and typed again
     * as "Bake" — the headings move once, when the field is left. */
    let instructions: InstructionEntry[] = DOUGH;
    const sets = DOUGH.map((_, i) => (i >= 1 && i < 4 ? "a" : undefined));
    for (const typed of ["Then mak", "T", "", "B", "Bake"]) {
      const run = choiceRuns(instructions, sets)[0];
      instructions = relabel(instructions, run, typed);
    }
    const run = choiceRuns(instructions, sets)[0];
    expect(run.label).toBe("Bake");
    const settled = settleLabel(
      INGREDIENTS,
      choiceRuns(instructions, sets),
      run,
      "Then make",
    );
    expect(settled.tiedAs).toBe("Bake");
    expect(settled.ingredients[2].choice).toBe("Bake");
    expect(settled.ingredients[6].choice).toBe("Bake");
    /* Left blank: nothing moves, and the label they wait under stays. */
    const blank = relabel(DOUGH, choiceRuns(DOUGH, sets)[0], "");
    const waiting = settleLabel(
      INGREDIENTS,
      choiceRuns(blank, sets),
      choiceRuns(blank, sets)[0],
      "Then make",
    );
    expect(waiting.tiedAs).toBe("Then make");
    expect(waiting.ingredients[2].choice).toBe("Then make");
    /* Never retied to a blank label directly either. */
    expect(retieHeadings(INGREDIENTS, "Then make", " ")[2].choice).toBe(
      "Then make",
    );
  });

  it("typing through another set's label moves no headings to it", () => {
    const cake: InstructionEntry[] = [
      group("Cake"),
      group("Vanilla", "Crumb"),
      group("Streusel", "Crumb"),
      { text: "Bake." },
      group("Cream cheese", "Frosting"),
      group("Chocolate", "Frosting"),
    ];
    const lines: Ingredient[] = [
      { ingredient: "For the streusel", type: "heading", choice: "Crumb" },
      { ingredient: "Oats" },
      { ingredient: "Chocolate", type: "heading", choice: "Frosting" },
      { ingredient: "Cocoa" },
    ];
    const sets = [undefined, "a", "a", undefined, "b", "b"];
    let instructions = cake;
    /* "Frosting" retyped as "Crumbs", through "Crumb" (the other set's). */
    for (const typed of ["C", "Cr", "Cru", "Crum", "Crumb", "Crumbs"]) {
      instructions = relabel(
        instructions,
        choiceRuns(instructions, sets)[1],
        typed,
      );
    }
    const runs = choiceRuns(instructions, sets);
    const settled = settleLabel(lines, runs, runs[1], "Frosting");
    expect(settled.ingredients[0].choice).toBe("Crumb");
    expect(settled.ingredients[2].choice).toBe("Crumbs");
    /* Left on the other set's label, they wait for one of its own. */
    const clash = relabel(cake, choiceRuns(cake, sets)[1], "Crumb");
    const held = settleLabel(
      lines,
      choiceRuns(clash, sets),
      choiceRuns(clash, sets)[1],
      "Frosting",
    );
    expect(held.tiedAs).toBe("Frosting");
    expect(held.ingredients[2].choice).toBe("Frosting");
  });

  it("relabels every option, and the tied headings follow", () => {
    const [run] = choiceRuns(DOUGH);
    const next = relabel(DOUGH, run, "Shape it as");
    expect(choiceRuns(next)).toEqual([
      { start: 1, end: 4, label: "Shape it as" },
    ]);
    const lines = retieHeadings(INGREDIENTS, "Then make", "Shape it as");
    expect(lines[2].choice).toBe("Shape it as");
    expect(lines[6].choice).toBe("Shape it as");
    expect(lines[4].choice).toBeUndefined();
    const untied = retieHeadings(INGREDIENTS, "Then make", undefined);
    expect(untied.some((line) => line.choice)).toBe(false);
    expect(untied[2]).toEqual({
      ingredient: "For the bagels",
      type: "heading",
    });
  });

  it("reorders options inside their set only; the first is the default", () => {
    const [run] = choiceRuns(DOUGH);
    const moved = moveOption(DOUGH, run, 2, 1);
    expect((moved[1] as InstructionGroup).name).toBe("Pretzels");
    expect(moveOption(DOUGH, run, 1, 0)).toEqual(DOUGH);
    expect(moveOption(DOUGH, run, 3, 4)).toEqual(DOUGH);
  });

  it("adds an empty option at the set's end", () => {
    const [run] = choiceRuns(DOUGH);
    const added = addOption(DOUGH, run);
    expect(added[4]).toEqual({
      name: "",
      choice: "Then make",
      instructions: [{ text: "" }],
    });
    expect(choiceRuns(added)[0]).toEqual({
      start: 1,
      end: 5,
      label: "Then make",
    });
  });

  it("moves an ordinary entry past a whole set, never into it", () => {
    expect(moveTarget(DOUGH, 0, false)).toBe(3);
    const down = moveEntry(DOUGH, 0, 3);
    expect(choiceRuns(down)).toEqual([
      { start: 0, end: 3, label: "Then make" },
    ]);
    expect((down[3] as InstructionGroup).name).toBe("Dough");
    expect(moveTarget(DOUGH, 4, true)).toBe(1);
    const up = moveEntry(DOUGH, 4, 1);
    expect(choiceRuns(up)).toEqual([{ start: 2, end: 5, label: "Then make" }]);
    expect(moveTarget(DOUGH, 0, true)).toBeUndefined();
    expect(moveTarget(plain, 0, false)).toBe(1);
  });

  it("a suggestion fits while its groups are still where it said", () => {
    expect(suggestionFits(plain, { label: "Then make", groups: [1, 2] })).toBe(
      true,
    );
    expect(suggestionFits(plain, { label: "Then make", groups: [2, 4] })).toBe(
      false,
    );
    expect(
      suggestionFits(makeChoice(plain, [1, 2], "X"), {
        label: "Then make",
        groups: [1, 2],
      }),
    ).toBe(false);
  });
});

describe("heading ties", () => {
  it("each heading's tie, a one-click suggestion, and a dangling one", () => {
    const { options, ties } = headingTies(INGREDIENTS, DOUGH);
    expect(options.map((option) => option.label)).toEqual([
      "Then make › Bagels",
      "Then make › Pretzels",
      "Then make › Pizza",
    ]);
    expect(ties.get(0)).toEqual({});
    expect(ties.get(2)?.tied?.label).toBe("Then make › Bagels");
    expect(ties.get(4)?.suggestion?.label).toBe("Then make › Pretzels");
    expect(ties.get(6)).toEqual({ dangling: "Then make" });
    expect(ties.has(1)).toBe(false);
  });

  it("no sets, no ties", () => {
    const plainSteps = notChoice(DOUGH, choiceRuns(DOUGH)[0]);
    expect(headingTies(INGREDIENTS, plainSteps).options).toEqual([]);
  });

  it("ties by name: a heading whose name doesn't meet the option is renamed", () => {
    const { options } = headingTies(INGREDIENTS, DOUGH);
    const pretzels = options[1];
    const tied = tieHeading(INGREDIENTS, 4, pretzels);
    expect(tied.renamed).toBeUndefined();
    expect(tied.ingredients[4]).toEqual({
      ingredient: "For the pretzels",
      type: "heading",
      choice: "Then make",
    });
    const pizza = tieHeading(INGREDIENTS, 6, options[2]);
    expect(pizza.renamed).toBe("Toppings");
    expect(pizza.ingredients[6]).toEqual({
      ingredient: "Pizza",
      type: "heading",
      choice: "Then make",
    });
    expect(headingTies(pizza.ingredients, DOUGH).ties.get(6)?.tied?.label).toBe(
      "Then make › Pizza",
    );
    const untied = tieHeading(INGREDIENTS, 2, undefined);
    expect(untied.ingredients[2]).toEqual({
      ingredient: "For the bagels",
      type: "heading",
    });
  });

  it("a rename is undone: untied, or tied back to an option its old name meets", () => {
    const { options } = headingTies(INGREDIENTS, DOUGH);
    const pizza = tieHeading(INGREDIENTS, 4, options[2]);
    expect(pizza.renamed).toBe("For the pretzels");
    expect(pizza.ingredients[4].ingredient).toBe("Pizza");
    /* "For every option" gives the old name back. */
    const untied = tieHeading(pizza.ingredients, 4, undefined, pizza.renamed);
    expect(untied.ingredients[4]).toEqual({
      ingredient: "For the pretzels",
      type: "heading",
    });
    expect(untied.renamed).toBeUndefined();
    /* Tied back to the option the old name meets: the old name, no note. */
    const back = tieHeading(pizza.ingredients, 4, options[1], pizza.renamed);
    expect(back.ingredients[4]).toEqual({
      ingredient: "For the pretzels",
      type: "heading",
      choice: "Then make",
    });
    expect(back.renamed).toBeUndefined();
    /* Retied to a third option: still renamed from the first name. */
    const bagels = tieHeading(pizza.ingredients, 4, options[0], pizza.renamed);
    expect(bagels.renamed).toBe("For the pretzels");
    expect(bagels.ingredients[4].ingredient).toBe("Bagels");
  });

  it("a second heading tied to the same option is tied, not dangling", () => {
    const lines: Ingredient[] = [
      { ingredient: "For the bagels", type: "heading", choice: "Then make" },
      { ingredient: "2 tbsp molasses" },
      { ingredient: "For the dough", type: "heading" },
      { ingredient: "Flour" },
      { ingredient: "For the bagels", type: "heading", choice: "Then make" },
      { ingredient: "Sesame seeds" },
    ];
    const { ties } = headingTies(lines, DOUGH);
    expect(ties.get(0)?.tied?.label).toBe("Then make › Bagels");
    expect(ties.get(4)?.tied?.label).toBe("Then make › Bagels");
    expect(ties.get(4)?.dangling).toBeUndefined();
  });
});

describe("stable row keys (45e2)", () => {
  let n = 0;
  const mint = () => `k${++n}`;
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("an edited row keeps its place's key; a moved one keeps its own", () => {
    n = 0;
    const keys = reconcileKeys([], [], [a, b, c], mint);
    expect(keys).toEqual(["k1", "k2", "k3"]);
    /* b edited in place (a new object), then c and a swapped. */
    const edited = { id: "b2" };
    expect(reconcileKeys([a, b, c], keys, [a, edited, c], mint)).toEqual(keys);
    expect(reconcileKeys([a, b, c], keys, [c, b, a], mint)).toEqual([
      "k3",
      "k2",
      "k1",
    ]);
  });

  it("an inserted row is new; a removed one takes its key away", () => {
    n = 10;
    const keys = ["k1", "k2", "k3"];
    const fresh = { id: "new" };
    expect(reconcileKeys([a, b, c], keys, [a, fresh, b, c], mint)).toEqual([
      "k1",
      "k11",
      "k2",
      "k3",
    ]);
    expect(reconcileKeys([a, b, c], keys, [a, c], mint)).toEqual(["k1", "k3"]);
    /* A row given a key before it arrived keeps it. */
    const claimed = new WeakMap([[fresh, "mine"]]);
    expect(
      reconcileKeys([a, b, c], keys, [a, b, c, fresh], mint, claimed),
    ).toEqual(["k1", "k2", "k3", "mine"]);
  });
});

describe("the ingredients' text mode keeps a heading's choice", () => {
  it("rows → text → rows, unchanged, is the same list", () => {
    const text = linesAsText(INGREDIENTS);
    expect(linesFromText(text, INGREDIENTS)).toEqual(INGREDIENTS);
  });

  it("an edited heading whose name still matches keeps its tie", () => {
    const text = linesAsText(INGREDIENTS).replace(
      "For the bagels",
      "For the Bagels:",
    );
    const lines = linesFromText(text, INGREDIENTS);
    expect(lines[2]).toEqual({
      ingredient: "For the Bagels:",
      type: "heading",
      choice: "Then make",
    });
  });

  it("a heading renamed to something else loses it", () => {
    const text = linesAsText(INGREDIENTS).replace(
      "For the bagels",
      "For the glaze:",
    );
    const lines = linesFromText(text, INGREDIENTS);
    expect(lines[2].type).toBe("heading");
    expect(lines[2].choice).toBeUndefined();
  });
});

describe("parseRecipeFormData — alternatives", () => {
  function stepsForm(fields: Record<string, string>): FormData {
    const formData = new FormData();
    formData.set("name", "Everything Dough");
    formData.set("instructions[0].name", "Dough");
    formData.set("instructions[0].instructions[0].text", "Mix.");
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    return formData;
  }
  /* An option of a set the person worked on: it posts the set's id. */
  const option = (
    index: number,
    name: string,
    choice: string,
    /* null: a set as stored, which posts no id. */
    set: string | null = "a",
  ) => ({
    [`instructions[${index}].name`]: name,
    [`instructions[${index}].choice`]: choice,
    ...(set !== null ? { [`instructions[${index}].choiceSet`]: set } : {}),
    [`instructions[${index}].instructions[0].text`]: `${name}: bake.`,
  });

  it("keeps a set, its label trimmed and an option's yield", () => {
    const result = parseRecipeFormData(
      stepsForm({
        ...option(1, "Bagels", " Then make "),
        "instructions[1].recipeYield": "8 bagels",
        ...option(2, "Pretzels", "Then make"),
        "instructions[2].recipeYield": "",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.instructions))).toEqual([
      { name: "Dough", instructions: [{ text: "Mix." }] },
      {
        name: "Bagels",
        instructions: [{ text: "Bagels: bake." }],
        choice: "Then make",
        recipeYield: "8 bagels",
      },
      {
        name: "Pretzels",
        instructions: [{ text: "Pretzels: bake." }],
        choice: "Then make",
      },
    ]);
  });

  it("refuses a set of one, in 45d's words, under Steps", () => {
    const result = parseRecipeFormData(
      stepsForm({ ...option(1, "Bagels", "Then make") }),
    );
    expect(result.success).toBe(false);
    const failure = recipeFormFailure(result.error!);
    expect(failure.errors.instructions).toEqual([
      "The choice “Then make” needs at least two options",
    ]);
    expect(failure.message).toBe("Couldn't save: 1 problem — Steps.");
  });

  it("refuses a blank label, a nameless option, and a shared label", () => {
    const blank = parseRecipeFormData(
      stepsForm({ ...option(1, "Bagels", ""), ...option(2, "Pizza", " ") }),
    );
    expect(recipeFormFailure(blank.error!).errors.instructions).toEqual([
      "The choice starting with “Bagels” needs a label",
    ]);

    const nameless = parseRecipeFormData(
      stepsForm({
        ...option(1, "Bagels", "Then make"),
        ...option(2, "", "Then make"),
      }),
    );
    expect(recipeFormFailure(nameless.error!).errors.instructions).toEqual([
      "An option of the choice “Then make” needs a name",
    ]);

    const shared = parseRecipeFormData(
      stepsForm({
        ...option(1, "Cream cheese", "Frosting", "a"),
        ...option(2, "Buttercream", "Frosting", "a"),
        "instructions[3].text": "Chill.",
        ...option(4, "Ganache", "Frosting", "b"),
        ...option(5, "Glaze", "Frosting", "b"),
      }),
    );
    expect(recipeFormFailure(shared.error!).errors.instructions).toEqual([
      "Two choices are called “Frosting”: give each its own label",
    ]);

    /* Two worked-on sets side by side with one label: never merged. */
    const touching = parseRecipeFormData(
      stepsForm({
        ...option(1, "Vanilla", "Crumb", "a"),
        ...option(2, "Streusel", "Crumb", "a"),
        ...option(3, "Cream cheese", "Crumb", "b"),
        ...option(4, "Chocolate", "Crumb", "b"),
      }),
    );
    expect(recipeFormFailure(touching.error!).errors.instructions).toEqual([
      "Two choices next to each other can't share a label",
    ]);
  });

  it("a set as stored that breaks a rule saves unchanged (43-D4)", () => {
    /* A lone group with a `choice` (an ordinary group to readChoices). */
    const lone = parseRecipeFormData(
      stepsForm({ ...option(1, "Bagels", "Then make", null) }),
    );
    expect(lone.success).toBe(true);
    expect(JSON.parse(JSON.stringify(lone.data?.instructions))).toEqual([
      { name: "Dough", instructions: [{ text: "Mix." }] },
      {
        name: "Bagels",
        instructions: [{ text: "Bagels: bake." }],
        choice: "Then make",
      },
    ]);
    /* Two sets sharing a label. */
    const shared = parseRecipeFormData(
      stepsForm({
        ...option(1, "Cream cheese", "Frosting", null),
        ...option(2, "Buttercream", "Frosting", null),
        "instructions[3].text": "Chill.",
        ...option(4, "Ganache", "Frosting", null),
        ...option(5, "Glaze", "Frosting", null),
      }),
    );
    expect(shared.success).toBe(true);
    expect(
      shared.data?.instructions?.map((entry) =>
        "choice" in entry ? entry.choice : undefined,
      ),
    ).toEqual([
      undefined,
      "Frosting",
      "Frosting",
      undefined,
      "Frosting",
      "Frosting",
    ]);
  });

  it("a recipe with no choice parses as before", () => {
    const result = parseRecipeFormData(
      stepsForm({
        "instructions[1].name": "Bagels",
        "instructions[1].instructions[0].text": "Boil.",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.instructions))).toEqual([
      { name: "Dough", instructions: [{ text: "Mix." }] },
      { name: "Bagels", instructions: [{ text: "Boil." }] },
    ]);
  });
});

describe("the curation write path judges every set (45e2, De2-6 reversed)", () => {
  const steps = (...entries: unknown[]) => ({
    name: "Everything Dough",
    instructions: [
      { name: "Dough", instructions: [{ text: "Mix." }] },
      ...entries,
    ],
  });
  const option = (name: string, choice: string) => ({
    name,
    choice,
    instructions: [{ text: `${name}: bake.` }],
  });
  function issues(raw: unknown, schema: "input" | "patch" = "input") {
    try {
      parseInput(
        schema === "input" ? RecipeInputSchema : RecipePatchSchema,
        schema === "input"
          ? raw
          : { instructions: (raw as { instructions: unknown }).instructions },
      );
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe("validation");
      return (
        (error as ValidationError).details as {
          issues: { path: string; message: string }[];
        }
      ).issues;
    }
  }

  it("takes a set that keeps the rules", () => {
    expect(
      issues(
        steps(option("Bagels", "Then make"), option("Pizza", "Then make")),
      ),
    ).toEqual([]);
  });

  it("refuses a set of one and two sets of one label, in the form's words", () => {
    expect(issues(steps(option("Bagels", "Then make")))).toEqual([
      {
        path: "instructions.1.choice",
        message: "The choice “Then make” needs at least two options",
      },
    ]);
    const shared = steps(
      option("Cream cheese", "Frosting"),
      option("Buttercream", "Frosting"),
      { text: "Chill." },
      option("Ganache", "Frosting"),
      option("Glaze", "Frosting"),
    );
    expect(issues(shared)).toEqual([
      {
        path: "instructions.4.choice",
        message: "Two choices are called “Frosting”: give each its own label",
      },
    ]);
    expect(issues(shared, "patch")).toEqual([
      {
        path: "instructions.4.choice",
        message: "Two choices are called “Frosting”: give each its own label",
      },
    ]);
    expect(
      issues(
        steps(option("Bagels", "Then make"), option("bagels", "Then make")),
      ),
    ).toEqual([
      {
        path: "instructions.2.name",
        message: "The choice “Then make” has two options called “bagels”",
      },
    ]);
  });

  it("a write without instructions, or with prose steps, is not judged", () => {
    expect(issues({ name: "Just a name" })).toEqual([]);
    expect(issues({ name: "Prose", instructions: ["Mix.", "Bake."] })).toEqual(
      [],
    );
  });
});
