// @vitest-environment node
//
// 46e: the by-term row carries `totalTime` when the recipe has one, so a term
// page's card can show the time in place of the date. Version "3".

import { describe, expect, it } from "vitest";
import { recipeTagTaxonomy } from "../websites/recipe-website/common/controller/recipeTagTaxonomy";
import type { RecipeEntryValue } from "../websites/recipe-website/common/controller/types";

const project = (value: RecipeEntryValue) =>
  recipeTagTaxonomy.project!({
    key: [1_790_000_000_000, "banana-bread"],
    value,
    id: "banana-bread",
  });

describe("recipeTagTaxonomy's by-term row", () => {
  it("carries the total time when the recipe has one", () => {
    expect(
      project({
        name: "Banana Bread",
        image: "banana.jpg",
        tags: ["bread"],
        prepTime: 15,
        cookTime: 60,
        totalTime: 75,
        description: "Not on the row",
        ingredients: ["3 bananas"],
      }),
    ).toEqual({
      slug: "banana-bread",
      date: 1_790_000_000_000,
      name: "Banana Bread",
      image: "banana.jpg",
      tags: ["bread"],
      totalTime: 75,
    });
  });

  it("leaves the key out when there is no total, not undefined", () => {
    const row = project({ name: "Banana Bread", prepTime: 15, cookTime: 60 });
    expect(row).toEqual({
      slug: "banana-bread",
      date: 1_790_000_000_000,
      name: "Banana Bread",
    });
    expect(Object.keys(row)).not.toContain("totalTime");
    expect(
      Object.keys(project({ name: "Banana Bread", totalTime: 0 })),
    ).not.toContain("totalTime");
  });

  it("is version 3, so the stamp rebuilds every instance once (39b)", () => {
    expect(recipeTagTaxonomy.version).toBe("3");
  });
});
