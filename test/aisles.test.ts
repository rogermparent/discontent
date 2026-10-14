import { describe, expect, it } from "vitest";
import {
  AISLE_LABELS,
  AISLES,
  aisleFor,
  aisleKey,
  DEFAULT_AISLE_WORDS,
  isAisle,
} from "recipe-website-common/util/aisles";
import {
  nameKey,
  parseIngredientLine,
} from "recipe-website-common/util/ingredientNames";

/** The aisle of the first name a line yields, as the shopping list reads it. */
function lineAisle(line: string): string {
  const [requirement] = parseIngredientLine(line);
  return aisleFor(nameKey(requirement.alternatives[0]));
}

describe("AISLES", () => {
  it("lists the aisles in walking order, each with a label", () => {
    expect(AISLES).toEqual([
      "produce",
      "meat-fish",
      "dairy-eggs",
      "bakery",
      "pantry",
      "spices",
      "frozen",
      "other",
    ]);
    expect(AISLE_LABELS["meat-fish"]).toBe("Meat & fish");
    for (const aisle of AISLES) expect(AISLE_LABELS[aisle]).toBeTruthy();
    expect(isAisle("pantry")).toBe(true);
    expect(isAisle("deli")).toBe(false);
  });

  it("keeps the default list to known aisles, and a few hundred entries", () => {
    const entries = Object.entries(DEFAULT_AISLE_WORDS);
    expect(entries.length).toBeGreaterThan(250);
    for (const [, aisle] of entries) expect(isAisle(aisle)).toBe(true);
  });
});

describe("aisleFor", () => {
  it("reads a name through the key: folded, singular", () => {
    expect(aisleKey("Green Onions")).toBe("green onion");
    expect(aisleKey("jalapeño")).toBe("jalapeno");
    expect(aisleFor("Green Onions")).toBe("produce");
    expect(aisleFor("jalapeño")).toBe("produce");
  });

  it("answers an exact entry first", () => {
    expect(aisleFor("garlic")).toBe("produce");
    expect(aisleFor("baking powder")).toBe("pantry");
    expect(aisleFor("cream of tartar")).toBe("spices");
    expect(aisleFor("salt")).toBe("spices");
  });

  it("finds a known phrase anywhere in a name, longest first", () => {
    expect(aisleFor("light brown sugar")).toBe("pantry");
    expect(aisleFor("full fat sour cream")).toBe("dairy-eggs");
    expect(aisleFor("low sodium chicken broth")).toBe("pantry");
    expect(aisleFor("full fat coconut milk")).toBe("pantry");
    expect(aisleFor("creamy peanut butter")).toBe("pantry");
    /* `garlic clove` beats the spice `clove`; `celery rib` the meat `rib`. */
    expect(aisleFor("garlic clove")).toBe("produce");
    expect(aisleFor("celery rib")).toBe("produce");
    /* `red pepper flake` beats `red pepper`, which beats `pepper`. */
    expect(aisleFor("red pepper flake")).toBe("spices");
    expect(aisleFor("roasted red pepper")).toBe("produce");
    expect(aisleFor("black pepper")).toBe("spices");
  });

  it("falls back to the last word, then any word", () => {
    expect(aisleFor("yukon gold potato")).toBe("produce");
    expect(aisleFor("sharp white cheddar cheese")).toBe("dairy-eggs");
    expect(aisleFor("chicken thigh")).toBe("meat-fish");
    expect(aisleFor("kalamata olive")).toBe("pantry");
    /* No `thigh` entry: the last word fails, `chicken` answers. */
    expect(aisleFor("chicken thigh fillet")).toBe("meat-fish");
    /* The last word wins over an earlier one: tomato *paste*, pumpkin *puree*. */
    expect(aisleFor("double concentrated tomato paste")).toBe("pantry");
    expect(aisleFor("pumpkin puree")).toBe("pantry");
  });

  it("keeps ground meat as meat and sends ground spices to the rack", () => {
    expect(aisleFor("ground beef")).toBe("meat-fish");
    expect(aisleFor("lean ground beef")).toBe("meat-fish");
    expect(aisleFor("ground pork")).toBe("meat-fish");
    expect(aisleFor("ground cumin")).toBe("spices");
    /* Fresh ginger is produce; ground ginger is not. */
    expect(aisleFor("ginger")).toBe("produce");
    expect(aisleFor("ground ginger")).toBe("spices");
    expect(aisleFor("powdered ginger")).toBe("spices");
    expect(aisleFor("ground almond")).toBe("pantry");
  });

  it("sends a dried herb to the rack and dried fruit to the pantry", () => {
    expect(aisleFor("basil")).toBe("produce");
    expect(aisleFor("dried basil")).toBe("spices");
    expect(aisleFor("dried oregano")).toBe("spices");
    expect(aisleFor("dried cranberry")).toBe("pantry");
  });

  it("shelves by a leading frozen, canned or pickled", () => {
    expect(aisleFor("pea")).toBe("produce");
    expect(aisleFor("frozen pea")).toBe("frozen");
    expect(aisleFor("frozen mixed berry")).toBe("frozen");
    expect(aisleFor("canned corn")).toBe("pantry");
    expect(aisleFor("pickled red onion")).toBe("pantry");
    expect(aisleFor("puff pastry")).toBe("frozen");
  });

  it("answers other for what nothing knows, or what is made not bought", () => {
    expect(aisleFor("piping bag")).toBe("other");
    expect(aisleFor("")).toBe("other");
    expect(aisleFor("sourdough starter")).toBe("other");
    expect(aisleFor("sourdough bread")).toBe("bakery");
  });

  it("lets an override win over everything, keyed by nameKey", () => {
    expect(aisleFor("tofu")).toBe("produce");
    expect(aisleFor("tofu", { tofu: "dairy-eggs" })).toBe("dairy-eggs");
    expect(aisleFor("ground beef", { "ground beef": "frozen" })).toBe("frozen");
    /* Read through the key, so a typed override still meets the name. */
    expect(aisleFor("green onion", { "Green Onions": "other" })).toBe("other");
    /* Only the name it names. */
    expect(aisleFor("garlic", { tofu: "dairy-eggs" })).toBe("produce");
    /* A value that is no aisle is ignored. */
    expect(
      aisleFor("garlic", { garlic: "deli" } as unknown as Record<
        string,
        "other"
      >),
    ).toBe("produce");
  });

  it("reads a non-alcoholic name like its alcoholic one", () => {
    expect(aisleFor("ginger beer@na")).toBe("pantry");
  });

  it("places real lines through parseIngredientLine", () => {
    expect(lineAisle("2 cloves garlic, minced")).toBe("produce");
    expect(lineAisle("1 lb ground beef")).toBe("meat-fish");
    expect(lineAisle("1 tsp ground cumin")).toBe("spices");
    expect(lineAisle("1 cup half-and-half")).toBe("dairy-eggs");
    /* The unit `can` is gone before the name: tomatoes read as fresh. */
    expect(lineAisle("1 (14 oz) can diced tomatoes")).toBe("produce");
    expect(lineAisle("2 cups frozen peas")).toBe("frozen");
    expect(lineAisle("1/2 cup confectioners' sugar")).toBe("pantry");
    expect(lineAisle("3 scallions, thinly sliced")).toBe("produce");
    expect(lineAisle("2 chipotle peppers in adobo sauce")).toBe("pantry");
    expect(lineAisle("1 jalapeño pepper, seeded")).toBe("produce");
  });
});
