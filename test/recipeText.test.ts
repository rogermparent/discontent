// @vitest-environment node
//
// Epic 28, 28d: recipe markdown is stored with `\n` line endings only.

import { mkdtemp, readJSON, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeRecipeText } from "../websites/recipe-website/common/util/recipeText";
import {
  createRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";

const scratch: string[] = [];
afterEach(async () => {
  for (const directory of scratch.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("normalizeRecipeText", () => {
  it("normalises the description, steps and group names, and nothing else", () => {
    expect(
      normalizeRecipeText({
        name: "A\r\nB",
        description: "One\r\nTwo\rThree",
        instructions: [
          { text: "1. Mix\r\nwell\r\n\r\nthen bake" },
          {
            name: "Glaze\r\n",
            instructions: [{ name: "x", text: "Whisk\r\nit" }],
          },
        ],
      }),
    ).toEqual({
      name: "A\r\nB",
      description: "One\nTwo\nThree",
      instructions: [
        { text: "1. Mix\nwell\n\nthen bake" },
        { name: "Glaze\n", instructions: [{ name: "x", text: "Whisk\nit" }] },
      ],
    });
  });

  it("leaves a recipe without the fields alone", () => {
    expect(normalizeRecipeText({ name: "Plain" })).toEqual({ name: "Plain" });
  });
});

describe("the curation seats store \\n", () => {
  it("on create and on update", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recipe-text-"));
    scratch.push(dir);
    const ctx = { contentDirectory: dir };
    const created = await createRecipe(ctx, {
      name: "Crlf Soup",
      description: "Hot.\r\nVery hot.",
      instructions: ["1. Boil\r\nwater\r\n\r\nthen wait"],
    });
    const file = join(dir, "recipes", "data", created.slug, "recipe.json");
    let stored = await readJSON(file);
    expect(stored.description).toBe("Hot.\nVery hot.");
    expect(stored.instructions[0].text).toBe("1. Boil\nwater\n\nthen wait");

    await updateRecipe(ctx, created.slug, { description: "Cold\r\nnow" });
    stored = await readJSON(file);
    expect(stored.description).toBe("Cold\nnow");
  });
});
