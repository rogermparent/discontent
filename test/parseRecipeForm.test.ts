// @vitest-environment node
//
// The browser form's half of the drink spec (25a/D3): the four inputs are
// always mounted, so an untouched Drink section still posts four empty strings,
// and what this pins is that none of them — nor an empty `drink` object —
// reaches `recipe.json`. The curation half is pinned in `curation.test.ts`.
//
// 45d: blank ingredient and step rows are dropped rather than refused, and
// every refusal says where it is ("Step 2 has no text").

import { describe, expect, it } from "vitest";

import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import { recipeFormFailure } from "../websites/recipe-website/editor/controller/recipeFormErrors";

function recipeForm(fields: Record<string, string>): FormData {
  const formData = new FormData();
  formData.set("name", "Daiquiri");
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("parseRecipeFormData — drink", () => {
  it("drops an all-blank Drink section", () => {
    const result = parseRecipeFormData(
      recipeForm({
        "drink.method": "",
        "drink.glass": " ",
        "drink.ice": "",
        "drink.garnish": "",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.drink).toBeUndefined();
  });

  it("trims what was typed and drops the blank parts", () => {
    const result = parseRecipeFormData(
      recipeForm({
        "drink.method": "shake",
        "drink.glass": "  coupe ",
        "drink.ice": "",
        "drink.garnish": " lime wheel",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.drink))).toEqual({
      method: "shake",
      glass: "coupe",
      garnish: "lime wheel",
    });
  });

  it("rejects a method that is not one of the four", () => {
    const result = parseRecipeFormData(
      recipeForm({ "drink.method": "swizzle" }),
    );
    expect(result.success).toBe(false);
  });
});

/** A refusal as the action answers it: its errors and its message. */
function refusal(fields: Record<string, string>) {
  const result = parseRecipeFormData(recipeForm(fields));
  expect(result.success).toBe(false);
  if (result.success) throw new Error("parsed");
  return recipeFormFailure(result.error);
}

describe("parseRecipeFormData — blank rows (45d)", () => {
  it("saves Roger's Everything Dough: a group's empty last step is dropped", () => {
    /* What the form posted after importing brianlagerstrom.com's page on
     * 2026-10-22: the LARGE LOAF group's fifth step was empty. Before 45d
     * this failed with `fieldErrors.instructions` only — a key no field
     * showed — and the bare "Error parsing recipe". */
    const result = parseRecipeFormData(
      recipeForm({
        "ingredients[0].ingredient": "450 g warm water",
        "instructions[0].name": "THE EVERYTHING DOUGH RECIPE:",
        "instructions[0].instructions[0].name": "",
        "instructions[0].instructions[0].text": "Combine the warm water.",
        "instructions[1].name": "LARGE LOAF:",
        "instructions[1].instructions[0].name": "",
        "instructions[1].instructions[0].text": "Flip cold dough out.",
        "instructions[1].instructions[1].name": "",
        "instructions[1].instructions[1].text": "",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.instructions))).toEqual([
      {
        name: "THE EVERYTHING DOUGH RECIPE:",
        instructions: [{ text: "Combine the warm water." }],
      },
      {
        name: "LARGE LOAF:",
        instructions: [{ text: "Flip cold dough out." }],
      },
    ]);
  });

  it("drops blank ingredient rows, headings included, keeping the rest as typed", () => {
    const result = parseRecipeFormData(
      recipeForm({
        "ingredients[0].ingredient": "",
        "ingredients[1].ingredient": "  1 cup water ",
        "ingredients[2].ingredient": " ",
        "ingredients[2].type": "heading",
        "ingredients[3].ingredient": "Sauce:",
        "ingredients[3].type": "heading",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.ingredients))).toEqual([
      { ingredient: "  1 cup water " },
      { ingredient: "Sauce:", type: "heading" },
    ]);
  });

  it("an all-blank list is no list, as an untouched one is", () => {
    const result = parseRecipeFormData(
      recipeForm({
        "ingredients[0].ingredient": "",
        "instructions[0].name": "",
        "instructions[0].text": "",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.data?.ingredients).toBeUndefined();
    expect(result.data?.instructions).toBeUndefined();
  });

  it("drops a blank step and a blank group, and keeps the steps' own names", () => {
    const result = parseRecipeFormData(
      recipeForm({
        "instructions[0].name": "",
        "instructions[0].text": "Mix.",
        "instructions[1].name": "",
        "instructions[1].text": "  ",
        "instructions[2].name": "",
        "instructions[2].instructions[0].name": "",
        "instructions[2].instructions[0].text": "",
        "instructions[3].name": "Rest",
        "instructions[3].text": "Rest an hour.",
      }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data?.instructions))).toEqual([
      { text: "Mix." },
      { name: "Rest", text: "Rest an hour." },
    ]);
  });
});

describe("recipeFormFailure — every problem says where it is (45d)", () => {
  it("names the step by its number in reading order, as the form shows it", () => {
    const { errors, message } = refusal({
      "instructions[0].text": "Mix.",
      "instructions[1].name": "Dough",
      "instructions[1].instructions[0].text": "Knead.",
      "instructions[1].instructions[1].text": "",
      "instructions[1].instructions[2].name": "Shape",
      "instructions[1].instructions[2].text": "",
    });
    expect(errors).toEqual({ instructions: ["Step 4 has no text"] });
    expect(message).toBe("Couldn't save: 1 problem — Steps.");
  });

  it("a group shows no number: it is named by its first step, its place or its name", () => {
    const { errors, message } = refusal({
      "instructions[0].name": "",
      "instructions[0].instructions[0].text":
        "Divide cold dough into four 300 g pieces.",
      "instructions[1].name": "Topping",
      "instructions[2].name": "Glaze",
      "instructions[2].instructions[0].name": "",
      "instructions[2].instructions[0].text": "",
      "instructions[3].name": "",
      "instructions[3].instructions[0].name": "Brush",
      "instructions[3].instructions[0].text": "",
    });
    expect(errors).toEqual({
      instructions: [
        "The group starting “Divide cold dough into four…” needs a name",
        "Group “Topping” has no steps",
        "Group “Glaze” has only empty steps",
        "Step 3 has no text",
        "The group after step 2 needs a name",
      ],
    });
    expect(message).toBe("Couldn't save: 5 problems — Steps.");
  });

  it("the first group with nothing before it, and a timeline event by number", () => {
    const { errors } = refusal({
      "instructions[0].name": "",
      "instructions[0].instructions[0].name": "Shape",
      "instructions[0].instructions[0].text": "",
      "timelines[0].events[0].defaultLength.minutes": "5",
      "timelines[0].events[1].defaultLength.minutes": "soon",
    });
    expect(errors).toEqual({
      instructions: ["Step 1 has no text", "The first group needs a name"],
      timelines: ["Timeline 1, event 2: Invalid number"],
    });
  });

  it("counts every problem, even two that read alike", () => {
    const { errors, message } = refusal({
      "prepTime.hours": "x",
      "prepTime.minutes": "y",
    });
    expect(errors).toEqual({ prepTime: ["Prep time: Invalid number"] });
    expect(message).toBe("Couldn't save: 2 problems — Times.");
  });

  it("a video link that is not a URL, a missing name, and a bad time", () => {
    const formData = new FormData();
    formData.set("name", "");
    formData.set("videoUrl", "not a url");
    formData.set("prepTime.minutes", "ten");
    formData.set("instructions[0].name", "Note");
    formData.set("instructions[0].text", "");
    const result = parseRecipeFormData(formData);
    expect(result.success).toBe(false);
    if (result.success) return;
    const { errors, message } = recipeFormFailure(result.error);
    expect(errors).toEqual({
      name: ["Name is required"],
      videoUrl: ["Video link isn't a URL"],
      prepTime: ["Prep time: Invalid number"],
      instructions: ["Step 1 has no text"],
    });
    /* The sections in page order. */
    expect(message).toBe(
      "Couldn't save: 4 problems — Recipe, Picture, Steps, Times.",
    );
  });

  it("a source link that is not a URL says which link", () => {
    const { errors, message } = refusal({ "source.url": "example dot com" });
    expect(errors).toEqual({ source: ["Source link isn't a URL"] });
    expect(message).toBe("Couldn't save: 1 problem — Source.");
  });
});
