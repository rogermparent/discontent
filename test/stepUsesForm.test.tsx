// 47f: a step's stored "uses" through the edit form and the write schema.
// The form posts nothing for a step the person did not touch, posts a stored
// list back as stored (an empty one and a name no line goes by included),
// and stores names — not line numbers — on the first edit. The browser
// builds FormData from the DOM as the page does, and the editor's own
// `parseRecipeFormData` reads it. The picker is Radix's and is driven in
// Playwright (`step-uses.spec.ts`).

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import RecipeFields from "recipe-website-common/components/Form";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import type {
  InstructionEntry,
  Recipe,
} from "recipe-website-common/controller/types";
import { allLinesUsed } from "recipe-website-common/components/Form/sections";
import { recipeToFormValues } from "recipe-website-common/components/Form/formContext";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import {
  RecipeInputSchema,
  RecipePatchSchema,
  toInstructions,
} from "../websites/recipe-website/editor/controller/curation/schema";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const m = (n: string) => `<Multiplyable baseNumber="${n}" />`;

/** An eggnog in two bowls, as an import leaves it: nothing stored. */
const EGGNOG: Recipe = {
  name: "Eggnog",
  date: 1_760_400_000_000,
  ingredients: [
    { ingredient: `${m("4")} egg yolks` },
    { ingredient: `${m("1/3")} cup sugar, plus ${m("1")} tablespoon` },
    { ingredient: `${m("1")} pint whole milk` },
    { ingredient: `${m("1")} cup heavy cream` },
    { ingredient: `${m("4")} egg whites` },
  ],
  instructions: [
    { text: "Beat the egg yolks, then add the 1/3 cup sugar." },
    {
      name: "Finish",
      instructions: [
        { text: "Stir in the milk and cream." },
        { text: "Whisk the egg whites into the mixture." },
      ],
    },
  ],
};

/** The same with a list on two steps: one out of order, one empty. */
const STORED: Recipe = {
  ...EGGNOG,
  instructions: [
    { text: "Beat the egg yolks, then add the 1/3 cup sugar." },
    {
      name: "Finish",
      instructions: [
        {
          text: "Stir in the milk and cream.",
          uses: ["heavy cream", "bourbon", "whole milk"],
        },
        { text: "Whisk the egg whites into the mixture.", uses: [] },
      ],
    },
  ],
};

async function renderForm(recipe: Recipe) {
  const view = render(
    <RecipeFormShell action={() => {}} recipe={recipe} slug="eggnog">
      <RecipeFields recipe={recipe} slug="eggnog" />
    </RecipeFormShell>,
  );
  /* Let the Lexical fields mount and mirror their values. */
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return view;
}

/** The steps as they would land in recipe.json. */
function posted(container: HTMLElement): InstructionEntry[] {
  const form = container.querySelector("form#recipe-form") as HTMLFormElement;
  const parsed = parseRecipeFormData(new FormData(form));
  expect(parsed.success).toBe(true);
  return JSON.parse(JSON.stringify(parsed.data!.instructions));
}

const uses = (step: number) =>
  screen.getByRole("group", { name: `What step ${step} uses` });
const chips = (step: number) =>
  within(uses(step))
    .queryAllByTestId("step-uses-chip")
    .map((chip) => chip.textContent);

describe("the edit form's editable uses (47f)", () => {
  it("an untouched recipe stores nothing: the chips are the guess, and say so", async () => {
    const { container } = await renderForm(EGGNOG);
    expect(chips(1)).toEqual(["egg yolk", "granulated sugar"]);
    expect(chips(2)).toEqual(["milk", "heavy cream"]);
    expect(chips(3)).toEqual(["egg white"]);
    for (const step of [1, 2, 3]) {
      expect(uses(step).getAttribute("data-stored")).toBe("false");
      expect(uses(step).textContent).toContain("guessed from the text");
      expect(
        within(uses(step)).queryByRole("button", {
          name: `Back to automatic for step ${step}`,
        }),
      ).toBeNull();
    }
    expect(container.querySelector('input[name$=".usesSet"]')).toBeNull();
    expect(container.querySelector('input[name*=".uses["]')).toBeNull();
    expect(posted(container)).toEqual(EGGNOG.instructions);
  });

  it("a stored list posts back as stored: its order, an empty one, a name no line goes by", async () => {
    const { container } = await renderForm(STORED);
    /* Step 1 is still the guess. */
    expect(uses(1).getAttribute("data-stored")).toBe("false");
    /* Step 2: the stored order, and the name that matches nothing, dashed. */
    expect(uses(2).getAttribute("data-stored")).toBe("true");
    expect(chips(2)).toEqual(["heavy cream", "bourbon", "milk"]);
    expect(uses(2).textContent).not.toContain("guessed from the text");
    expect(
      within(uses(2)).getByTestId("step-uses-unresolved").textContent,
    ).toContain("No ingredient called “bourbon”.");
    /* Step 3 brings nothing in, and says so. */
    expect(chips(3)).toEqual([]);
    expect(uses(3).textContent).toContain("nothing");
    expect(posted(container)).toEqual(STORED.instructions);
  });

  it("removing a chip stores the rest by name; Back to automatic stores nothing again", async () => {
    const { container } = await renderForm(EGGNOG);
    fireEvent.click(
      within(uses(2)).getByRole("button", {
        name: "Remove milk from step 2",
      }),
    );
    expect(chips(2)).toEqual(["heavy cream"]);
    expect(uses(2).getAttribute("data-stored")).toBe("true");
    /* Focus stays in the list: the chip that took its place. */
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Remove heavy cream from step 2",
    );
    const steps = posted(container);
    expect(steps[0]).toEqual(EGGNOG.instructions![0]);
    expect(steps[1]).toEqual({
      name: "Finish",
      instructions: [
        { text: "Stir in the milk and cream.", uses: ["heavy cream"] },
        { text: "Whisk the egg whites into the mixture." },
      ],
    });

    /* The last chip off: an empty list is stored, not no list. */
    fireEvent.click(
      within(uses(2)).getByRole("button", {
        name: "Remove heavy cream from step 2",
      }),
    );
    expect(chips(2)).toEqual([]);
    expect(
      (posted(container)[1] as { instructions: unknown[] }).instructions[0],
    ).toEqual({ text: "Stir in the milk and cream.", uses: [] });

    fireEvent.click(
      within(uses(2)).getByRole("button", {
        name: "Back to automatic for step 2",
      }),
    );
    expect(chips(2)).toEqual(["milk", "heavy cream"]);
    expect(uses(2).getAttribute("data-stored")).toBe("false");
    expect(posted(container)).toEqual(EGGNOG.instructions);
  });

  it("removing the name that matches nothing keeps the others as written", async () => {
    const { container } = await renderForm(STORED);
    fireEvent.click(
      within(uses(2)).getByRole("button", {
        name: "Remove bourbon from step 2",
      }),
    );
    expect(within(uses(2)).queryByTestId("step-uses-unresolved")).toBeNull();
    expect(
      (posted(container)[1] as { instructions: unknown[] }).instructions[0],
    ).toEqual({
      text: "Stir in the milk and cream.",
      uses: ["heavy cream", "whole milk"],
    });
  });

  it("a stored line counts as named for the Steps section's check", () => {
    const values = (instructions: InstructionEntry[]) =>
      recipeToFormValues({ ...EGGNOG, instructions });
    /* The whites are named by no step's text … */
    const silent: InstructionEntry[] = [
      { text: "Beat the egg yolks with the sugar, milk and cream." },
      { text: "Fold the two bowls together." },
    ];
    expect(allLinesUsed(values(silent))).toBe(false);
    /* … until a step stores them. */
    expect(
      allLinesUsed(values([silent[0], { ...silent[1], uses: ["egg whites"] }])),
    ).toBe(true);
  });
});

describe("parseRecipeFormData reads a step's uses (47f)", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    data.set("name", "Eggnog");
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return parseRecipeFormData(data).data!.instructions;
  };

  it("no marker, no list — whatever names ride along", () => {
    expect(
      form({
        "instructions[0].text": "Beat.",
        "instructions[0].uses[0]": "egg yolks",
      }),
    ).toEqual([{ name: undefined, text: "Beat." }]);
  });

  it("the marker alone is an empty list; names are trimmed and blanks dropped", () => {
    expect(
      form({
        "instructions[0].text": "Fold.",
        "instructions[0].usesSet": "1",
        "instructions[1].name": "Finish",
        "instructions[1].instructions[0].text": "Stir.",
        "instructions[1].instructions[0].usesSet": "1",
        "instructions[1].instructions[0].uses[0]": " heavy cream ",
        "instructions[1].instructions[0].uses[1]": "  ",
        "instructions[1].instructions[0].uses[2]": "milk",
      }),
    ).toEqual([
      { name: undefined, text: "Fold.", uses: [] },
      {
        name: "Finish",
        instructions: [
          { name: undefined, text: "Stir.", uses: ["heavy cream", "milk"] },
        ],
      },
    ]);
  });
});

describe("the write schema takes a step's uses (47f)", () => {
  it("on a step and on a group's step, trimmed, an empty list kept", () => {
    const parsed = RecipeInputSchema.parse({
      name: "Eggnog",
      instructions: [
        "Beat the yolks.",
        { text: "Stir.", uses: [" heavy cream ", "milk"] },
        { name: "Finish", instructions: [{ text: "Fold.", uses: [] }] },
      ],
    });
    expect(toInstructions(parsed.instructions!)).toEqual([
      { text: "Beat the yolks." },
      { text: "Stir.", uses: ["heavy cream", "milk"] },
      { name: "Finish", instructions: [{ text: "Fold.", uses: [] }] },
    ]);
    /* A patch carries it the same way. */
    expect(
      RecipePatchSchema.parse({
        instructions: [{ text: "Stir.", uses: ["milk"] }],
      }).instructions,
    ).toEqual([{ text: "Stir.", uses: ["milk"] }]);
  });

  it("refuses a blank name, a list that is not one, and `uses` on a group", () => {
    const bad = (instructions: unknown[]) =>
      RecipeInputSchema.safeParse({ name: "Eggnog", instructions }).success;
    expect(bad([{ text: "Stir.", uses: ["  "] }])).toBe(false);
    expect(bad([{ text: "Stir.", uses: "milk" }])).toBe(false);
    expect(bad([{ text: "Stir.", uses: [3] }])).toBe(false);
    expect(
      bad([{ name: "Finish", uses: ["milk"], instructions: [{ text: "A" }] }]),
    ).toBe(false);
    /* A name no line goes by is not this layer's to refuse. */
    expect(bad([{ text: "Stir.", uses: ["saffron"] }])).toBe(true);
  });
});
