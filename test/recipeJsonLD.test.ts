// What the export's `<script type="application/ld+json">` carries (26d): the
// lists it always had, plus the description, yield, ISO-8601 times, video and
// — for a drink — its category and method.

import { describe, expect, it } from "vitest";

import { buildRecipeJsonLD } from "recipe-website-common/components/View/JsonLD";
import type { Recipe } from "recipe-website-common/controller/types";
import {
  minutesToDuration,
  parseDurationToMinutes,
} from "recipe-website-common/util/isoDuration";

const ROOT = "http://localhost:3000";

describe("minutesToDuration", () => {
  it("writes hours and minutes, dropping a zero part", () => {
    expect(minutesToDuration(90)).toBe("PT1H30M");
    expect(minutesToDuration(45)).toBe("PT45M");
    expect(minutesToDuration(120)).toBe("PT2H");
  });

  it("is undefined for nothing, zero and nonsense", () => {
    expect(minutesToDuration(undefined)).toBeUndefined();
    expect(minutesToDuration(0)).toBeUndefined();
    expect(minutesToDuration(Number.NaN)).toBeUndefined();
  });

  it("round-trips through the importer's parser", () => {
    for (const minutes of [5, 60, 95, 600]) {
      expect(parseDurationToMinutes(minutesToDuration(minutes))).toBe(minutes);
    }
  });
});

describe("buildRecipeJsonLD", () => {
  const stew: Recipe = {
    name: "Stew",
    date: 0,
    description: "A **slow** stew.\n\nServe it hot.",
    recipeYield: "4 bowls",
    prepTime: 20,
    cookTime: 90,
    ingredients: [{ ingredient: "1 onion" }],
    instructions: [{ text: "Simmer." }],
  };

  it("carries the description, yield and ISO-8601 times", () => {
    const jsonLD = buildRecipeJsonLD(stew, "/img/stew.jpg");
    expect(jsonLD).toMatchObject({
      "@type": "Recipe",
      name: "Stew",
      image: `${ROOT}/img/stew.jpg`,
      description: "A slow stew. Serve it hot.",
      recipeYield: "4 bowls",
      prepTime: "PT20M",
      cookTime: "PT1H30M",
      /* No stored total: prep + cook, as the page shows it. */
      totalTime: "PT1H50M",
    });
    expect("recipeCategory" in jsonLD).toBe(false);
    expect("cookingMethod" in jsonLD).toBe(false);
    expect("video" in jsonLD).toBe(false);
  });

  it("omits what the recipe does not have, the image included", () => {
    const jsonLD = buildRecipeJsonLD({ name: "Toast", date: 0 }, undefined);
    for (const key of [
      "image",
      "description",
      "recipeYield",
      "prepTime",
      "cookTime",
      "totalTime",
    ]) {
      expect(key in jsonLD).toBe(false);
    }
  });

  it("makes a drink a Drink, with its method", () => {
    const jsonLD = buildRecipeJsonLD(
      {
        name: "Daiquiri",
        date: 0,
        totalTime: 5,
        drink: { method: "shake", glass: "coupe" },
      },
      undefined,
    );
    expect(jsonLD).toMatchObject({
      recipeCategory: "Drink",
      cookingMethod: "shake",
      totalTime: "PT5M",
    });
  });

  it("names a drink with no method only by category", () => {
    const jsonLD = buildRecipeJsonLD(
      { name: "Highball", date: 0, drink: { glass: "highball" } },
      undefined,
    );
    expect(jsonLD).toMatchObject({ recipeCategory: "Drink" });
    expect("cookingMethod" in jsonLD).toBe(false);
  });

  it("carries a video, made absolute when it is an upload", () => {
    expect(
      buildRecipeJsonLD(stew, undefined, "https://www.youtube.com/watch?v=x")
        .video,
    ).toEqual({
      "@type": "VideoObject",
      name: "Stew",
      contentUrl: "https://www.youtube.com/watch?v=x",
    });
    expect(
      buildRecipeJsonLD(stew, undefined, "/uploads/recipe/stew/uploads/s.mp4")
        .video,
    ).toMatchObject({
      contentUrl: `${ROOT}/uploads/recipe/stew/uploads/s.mp4`,
    });
  });
});
