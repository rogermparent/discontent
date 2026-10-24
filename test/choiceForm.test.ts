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
  suggestionFits,
} from "../websites/recipe-website/common/components/Form/Instructions/choiceEdits";
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

describe("choiceRuns / choiceProblems", () => {
  it("reads a set as one run, and finds nothing wrong with it", () => {
    expect(choiceRuns(DOUGH)).toEqual([
      { start: 1, end: 4, label: "Then make" },
    ]);
    expect(choiceProblems(DOUGH)).toEqual([]);
  });

  it("a set of one needs a second option", () => {
    expect(
      choiceProblems([group("Dough"), group("Bagels", "Then make")]),
    ).toEqual([
      {
        index: 1,
        field: "choice",
        message: "The choice “Then make” needs at least two options",
      },
    ]);
  });

  it("a blank label is one set still, and needs a label", () => {
    const blank = [group("Dough"), group("Bagels", ""), group("Pizza", " ")];
    expect(choiceRuns(blank)).toEqual([{ start: 1, end: 3, label: "" }]);
    expect(choiceProblems(blank).map((p) => p.message)).toEqual([
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
    expect(choiceProblems(two)).toEqual([
      {
        index: 4,
        field: "choice",
        message: "Two choices are called “frosting”: give each its own label",
      },
    ]);
  });

  it("option names are required, and unique in their set", () => {
    expect(
      choiceProblems([
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
    expect(labelProblem(DOUGH, " ")).toBe(
      "Give the choice a label, such as “Then make”.",
    );
    expect(labelProblem(DOUGH, "then make")).toBe(
      "Another choice is already called “Then make”.",
    );
    expect(labelProblem(DOUGH, "Then make", choiceRuns(DOUGH)[0])).toBe(
      undefined,
    );
    expect(labelProblem(DOUGH, "Crumb")).toBeUndefined();
  });

  it("“Not a choice” drops the label and the yields", () => {
    const [run] = choiceRuns(DOUGH);
    const undone = notChoice(DOUGH, run);
    expect(undone[1]).toEqual(group("Bagels"));
    expect(choiceRuns(undone)).toEqual([]);
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
    expect(pizza.renamed).toBe("Pizza");
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
  const option = (index: number, name: string, choice: string) => ({
    [`instructions[${index}].name`]: name,
    [`instructions[${index}].choice`]: choice,
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
        ...option(1, "Cream cheese", "Frosting"),
        ...option(2, "Buttercream", "Frosting"),
        "instructions[3].text": "Chill.",
        ...option(4, "Ganache", "Frosting"),
        ...option(5, "Glaze", "Frosting"),
      }),
    );
    expect(recipeFormFailure(shared.error!).errors.instructions).toEqual([
      "Two choices are called “Frosting”: give each its own label",
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
