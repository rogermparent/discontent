// @vitest-environment node
//
// The browser form's half of the drink spec (25a/D3): the four inputs are
// always mounted, so an untouched Drink section still posts four empty strings,
// and what this pins is that none of them — nor an empty `drink` object —
// reaches `recipe.json`. The curation half is pinned in `curation.test.ts`.

import { describe, expect, it } from "vitest";

import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";

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
