// @vitest-environment node
//
// 45e2: step groups that look like alternatives — parallel endings of shared
// work — proposed as a set (G5: a suggestion only; nothing sets `choice`).

import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import { suggestChoices } from "../websites/recipe-website/common/util/suggestChoices";
import { descriptionRecipe } from "../websites/recipe-website/editor/controller/descriptionRecipe";
import type {
  InstructionEntry,
  InstructionGroup,
} from "../websites/recipe-website/common/controller/types";

/* Brian Lagerstrom's Everything Dough description, as the e2e's yt-dlp
 * fixture holds it. */
const EVERYTHING_DOUGH: string = JSON.parse(
  readFileSync(
    new URL(
      "../websites/recipe-website/editor/playwright/fixtures/yt-dlp/responses/everything-dough.json",
      import.meta.url,
    ),
    "utf8",
  ),
).output.description;

/** A group of `n` steps. */
function group(name: string, ...steps: string[]): InstructionGroup {
  return {
    name,
    instructions: (steps.length ? steps : ["Do it."]).map((text) => ({ text })),
  };
}

const step = (text: string): InstructionEntry => ({ text });

describe("suggestChoices — the positives", () => {
  it("the everything-dough video: the dough's steps, then five bakes", () => {
    const instructions = descriptionRecipe(EVERYTHING_DOUGH)?.instructions;
    expect(instructions).toBeDefined();
    const names = instructions!
      .slice(4)
      .map((entry) => (entry as InstructionGroup).name);
    expect(names).toEqual([
      "Large Loaf",
      "Baguettes",
      "Pizza",
      "Bagels",
      "Soft Pretzels",
    ]);
    expect(suggestChoices(instructions)).toEqual([
      { label: "Then make", groups: [4, 5, 6, 7, 8] },
    ]);
  });

  it("Roger's draft (45d's bug): the same description behind a channel line", () => {
    const draft = descriptionRecipe(
      `Channel: Brian Lagerstrom \n\n---\n\n${EVERYTHING_DOUGH}`,
    );
    expect(suggestChoices(draft?.instructions)).toEqual([
      { label: "Then make", groups: [4, 5, 6, 7, 8] },
    ]);
  });

  it("a dough group first, then the shapes (a page's own sections)", () => {
    expect(
      suggestChoices([
        group("The everything dough", "Mix.", "Rest.", "Refrigerate."),
        group("Large loaf:", "Shape.", "Proof.", "Bake."),
        group("Baguettes:", "Divide.", "Shape.", "Bake."),
        group("For bagels", "Divide.", "Boil.", "Bake."),
      ]),
    ).toEqual([{ label: "Then make", groups: [1, 2, 3] }]);
  });

  it("a cake framework: two crumbs, two frostings, then the assembly", () => {
    expect(
      suggestChoices([
        group("Prep", "Heat the oven to 350°F.", "Line two 8-inch pans."),
        group(
          "Vanilla crumb",
          "Cream the butter and sugar.",
          "Add the eggs and vanilla.",
          "Bake for 30 minutes.",
        ),
        group(
          "Chocolate crumb",
          "Whisk the cocoa with hot coffee.",
          "Fold into the batter.",
          "Bake for 32 minutes.",
        ),
        group(
          "Cream cheese frosting",
          "Beat the cream cheese and butter.",
          "Add the powdered sugar.",
        ),
        group(
          "Chocolate buttercream frosting",
          "Beat the butter.",
          "Add the cocoa and powdered sugar.",
        ),
        group("Assemble", "Stack the layers.", "Frost the outside."),
      ]),
    ).toEqual([
      { label: "Crumb", groups: [1, 2] },
      { label: "Frosting", groups: [3, 4] },
    ]);
  });

  it("one prefix before a colon: “Frosting: …”", () => {
    expect(
      suggestChoices([
        step("Bake the cupcakes."),
        group("Frosting: cream cheese", "Beat.", "Pipe."),
        group("Frosting: brown butter", "Brown.", "Beat."),
      ]),
    ).toEqual([{ label: "Frosting", groups: [1, 2] }]);
  });

  it("ways to cook it: “Oven”, “Slow cooker”, “Instant Pot”", () => {
    expect(
      suggestChoices([
        group("Prep the beans", "Rinse and soak overnight."),
        group("Stovetop", "Simmer 2 hours."),
        group("Slow cooker", "Cook on low 8 hours."),
        group("Instant Pot", "Pressure cook 40 minutes."),
      ]),
    ).toEqual([{ label: "Method", groups: [1, 2, 3] }]);
  });

  it("a label the recipe already has is not proposed twice", () => {
    expect(
      suggestChoices([
        group("Dough", "Mix."),
        { ...group("Bagels", "Boil."), choice: "Then make" },
        { ...group("Pretzels", "Dip."), choice: "Then make" },
        step("Cool."),
        group("Pizza", "Stretch.", "Bake."),
        group("Calzones", "Fold.", "Bake."),
      ]),
    ).toEqual([{ label: "Then make 2", groups: [4, 5] }]);
  });

  it("prose strings in a curation input are read as steps", () => {
    expect(
      suggestChoices([
        "Mix the dough.",
        group("Bagels", "Boil.", "Bake."),
        group("Pretzels", "Dip.", "Bake."),
      ] as unknown as InstructionEntry[]),
    ).toEqual([{ label: "Then make", groups: [1, 2] }]);
  });
});

describe("suggestChoices — the negatives", () => {
  it("sequential sections: Dough → Filling → Assembly", () => {
    expect(
      suggestChoices([
        group("Dough", "Mix.", "Chill."),
        group("Filling", "Cook the apples.", "Cool."),
        group("Assembly", "Roll the dough.", "Add the filling.", "Bake."),
      ]),
    ).toEqual([]);
  });

  it("“For the sauce” / “For the pasta”", () => {
    expect(
      suggestChoices([
        step("Bring a large pot of salted water to a boil."),
        group("For the sauce", "Sauté the garlic.", "Add the tomatoes."),
        group("For the pasta", "Cook the pasta.", "Toss with the sauce."),
      ]),
    ).toEqual([]);
  });

  it("a form and a dish made from another: the review's four", () => {
    /* Steps that never name each other, so only the names can tell: the
     * second is built from the first, so both are made. */
    const shared = step("Mix everything into a dough.");
    for (const [first, second] of [
      ["Tortillas", "Tacos"],
      ["Burger buns", "Burgers"],
      ["Meatballs", "Sandwich"],
      ["Pastry", "Tart"],
    ]) {
      expect(
        suggestChoices([
          shared,
          group(first, "Do the thing 1.", "Do the thing 2."),
          group(second, "Do the other 1.", "Do the other 2."),
        ]),
      ).toEqual([]);
    }
    /* Forms of one kind still read as a choice. */
    expect(
      suggestChoices([
        shared,
        group("Pizza", "Stretch.", "Bake."),
        group("Calzones", "Fold.", "Bake."),
      ]),
    ).toEqual([{ label: "Then make", groups: [1, 2] }]);
    expect(
      suggestChoices([
        step("Make the batter."),
        group("Cupcakes", "Fill the liners.", "Bake 18 minutes."),
        group("Layer cake", "Fill two pans.", "Bake 30 minutes."),
      ]),
    ).toEqual([{ label: "Then make", groups: [1, 2] }]);
  });

  it("a single group", () => {
    expect(
      suggestChoices([step("Mix."), group("Bagels", "Boil.", "Bake.")]),
    ).toEqual([]);
  });

  it("nothing shared before: a set never opens the recipe", () => {
    expect(
      suggestChoices([
        group("Bagels", "Boil.", "Bake."),
        group("Pretzels", "Dip.", "Bake."),
      ]),
    ).toEqual([]);
  });

  it("names that stage or count: “First rise”, “Second rise”, “Day 1”", () => {
    expect(
      suggestChoices([
        step("Mix."),
        group("First rise", "Rest 1 hour."),
        group("Second rise", "Rest 45 minutes."),
        group("Day 1", "Mix."),
        group("Day 2", "Bake."),
      ]),
    ).toEqual([]);
  });

  it("a shared noun led by verbs: “Make the dough”, “Shape the dough”", () => {
    expect(
      suggestChoices([
        step("Weigh everything."),
        group("Make the dough", "Mix.", "Knead."),
        group("Shape the dough", "Divide.", "Roll."),
      ]),
    ).toEqual([]);
  });

  it("parts both used: “Dry ingredients”, “Wet ingredients”", () => {
    expect(
      suggestChoices([
        step("Heat the oven."),
        group("Dry ingredients", "Whisk the flour."),
        group("Wet ingredients", "Whisk the eggs."),
      ]),
    ).toEqual([]);
  });

  it("two sauces a later step uses together", () => {
    expect(
      suggestChoices([
        step("Boil the noodles."),
        group("Meat sauce", "Brown the beef.", "Simmer."),
        group("Bechamel sauce", "Make a roux.", "Whisk in milk."),
        group(
          "Assemble",
          "Layer the noodles, the meat sauce and the bechamel sauce.",
        ),
      ]),
    ).toEqual([]);
  });

  it("an option whose steps name a sibling", () => {
    expect(
      suggestChoices([
        step("Mix the dough."),
        group("Pizza", "Stretch.", "Bake."),
        group("Calzone", "Make it like the pizza, folded.", "Bake."),
      ]),
    ).toEqual([]);
  });

  it("options of very different sizes", () => {
    expect(
      suggestChoices([
        step("Mix."),
        group("Bagels", "Boil."),
        group(
          "Pretzels",
          "Divide.",
          "Rest.",
          "Roll.",
          "Twist.",
          "Boil.",
          "Salt.",
          "Bake.",
        ),
      ]),
    ).toEqual([]);
  });

  it("groups already a choice, and unnamed groups", () => {
    expect(
      suggestChoices([
        step("Mix."),
        { ...group("Bagels", "Boil."), choice: "Then make" },
        { ...group("Pretzels", "Dip."), choice: "Then make" },
        group("", "Shape."),
        group("", "Bake."),
      ]),
    ).toEqual([]);
    expect(suggestChoices(undefined)).toEqual([]);
  });
});
