// @vitest-environment node
//
// 46e: the by-term row carries `totalTime` when the recipe has one, so a term
// page's card can show the time in place of the date. Version "3".
// 48a: without a total it carries `prepTime` and `cookTime`, and the card
// shows their sum (`cardTime`). Version "4".

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

  it("carries prep and cook when there is no total (48a)", () => {
    const row = project({ name: "Banana Bread", prepTime: 15, cookTime: 60 });
    expect(row).toEqual({
      slug: "banana-bread",
      date: 1_790_000_000_000,
      name: "Banana Bread",
      prepTime: 15,
      cookTime: 60,
    });
    expect(Object.keys(row)).not.toContain("totalTime");
    expect(project({ name: "Banana Bread", cookTime: 60 })).toEqual({
      slug: "banana-bread",
      date: 1_790_000_000_000,
      name: "Banana Bread",
      cookTime: 60,
    });
  });

  it("leaves the keys out when there are no times, not undefined", () => {
    for (const value of [
      { name: "Banana Bread" },
      { name: "Banana Bread", totalTime: 0, prepTime: 0, cookTime: 0 },
    ]) {
      expect(Object.keys(project(value))).toEqual(["slug", "date", "name"]);
    }
  });

  it("is version 4, so the stamp rebuilds every instance once (39b)", () => {
    expect(recipeTagTaxonomy.version).toBe("4");
  });
});
