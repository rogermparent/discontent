// @vitest-environment node
//
// 45d: blank rows out of an import, whatever shape the caller's lines take
// (the curation input carries prose strings beside `Ingredient` /
// `Instruction` objects — the photo picker's batch does).

import { describe, expect, it } from "vitest";

import {
  dropBlankIngredients,
  dropBlankSteps,
  withoutBlankRows,
} from "recipe-website-common/util/blankRows";
import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";

describe("blankRows", () => {
  it("keeps prose lines and steps, dropping only the blank ones", () => {
    const lines = [
      "2 eggs",
      " ",
      { ingredient: "" },
    ] as unknown as Ingredient[];
    expect(dropBlankIngredients(lines)).toEqual(["2 eggs"]);
    const steps = [
      "Mix and bake.",
      "",
      { name: "Glaze", instructions: ["Whisk.", "  "] },
    ] as unknown as InstructionEntry[];
    expect(dropBlankSteps(steps)).toEqual([
      "Mix and bake.",
      { name: "Glaze", instructions: ["Whisk."] },
    ]);
  });

  it("answers the same recipe when nothing was blank", () => {
    const recipe = {
      ingredients: [{ ingredient: "flour" }],
      instructions: [{ name: "Dough", instructions: [{ text: "Mix." }] }],
    };
    expect(withoutBlankRows(recipe)).toBe(recipe);
  });
});
