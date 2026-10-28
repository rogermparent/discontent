import { describe, expect, it } from "vitest";
import {
  parseIngredientLine,
  requirementLabel,
} from "recipe-website-common/util/ingredientNames";
import { beanKindOf, beanKinds } from "recipe-website-common/util/beans";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareCorpus,
  satisfies,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";
import type { Requirement } from "recipe-website-common/util/ingredientNames";
import { parseSettings } from "recipe-website-common/components/MakePage/useInventory";

/**
 * A bean line (42m's `isBeanLine`, gone with its tier in 43m): every
 * alternative a family bean, and no infusion's flavour.
 */
function isBeanLine(requirement: Requirement): boolean {
  return (
    !requirement.loose &&
    requirement.alternatives.length > 0 &&
    requirement.alternatives.every((name) => beanKinds(name) !== undefined)
  );
}

/** The kind of the one requirement a line yields, if it is a bean line. */
function lineKind(line: string): string | undefined {
  const [requirement] = parseIngredientLine(line);
  return isBeanLine(requirement)
    ? beanKindOf(requirementLabel(requirement))
    : undefined;
}

describe("the bean family (42m)", () => {
  it("knows the canned and dried beans, however the line is written", () => {
    expect(lineKind("1 (15 oz) can chickpeas, drained and rinsed")).toBe(
      "chickpea",
    );
    expect(lineKind("1 (15-ounce) can garbanzo beans")).toBe("chickpea");
    expect(lineKind("2 cups cooked black beans")).toBe("black");
    expect(lineKind("2 cans (15 oz each) black beans, drained")).toBe("black");
    expect(lineKind("1 can low-sodium black beans")).toBe("black");
    expect(lineKind("1 can dark red kidney beans")).toBe("red");
    expect(lineKind("1 can pinto beans")).toBe("pinto");
    expect(lineKind("1 cup cranberry beans")).toBe("pinto");
    expect(lineKind("15 oz cannellini beans")).toBe("white");
    expect(lineKind("1 can no-salt-added cannellini beans")).toBe("white");
    expect(lineKind("1 can great northern beans, rinsed")).toBe("white");
    expect(lineKind("1 cup dried navy beans")).toBe("white");
    expect(lineKind("1 cup frozen lima beans")).toBe("butter");
    expect(lineKind("1 can butter beans")).toBe("butter");
    expect(lineKind("1 can black-eyed peas")).toBe("pea");
    expect(lineKind("1/2 cup adzuki beans")).toBe("red");
    expect(lineKind("1 cup mung beans")).toBe("mung");
    expect(lineKind("1 cup fava beans")).toBe("fava");
    expect(lineKind("1 can flageolet beans")).toBe("white");
    expect(lineKind("1 can mixed beans")).toBe("any");
    expect(lineKind("1 can bean medley")).toBe("any");
    expect(lineKind("1 (15 oz) can beans, any kind")).toBe("any");
  });

  it("names inventory items the same way", () => {
    expect(beanKindOf("black beans")).toBe("black");
    expect(beanKindOf("can of pinto beans")).toBe("pinto");
    expect(beanKindOf("15-ounce can chickpeas")).toBe("chickpea");
    expect(beanKindOf("canned beans")).toBe("any");
    expect(beanKindOf("Garbanzos")).toBe("chickpea");
  });

  it("leaves out green beans and the beans that aren't pulses (Dm1)", () => {
    for (const line of [
      "1 lb green beans, trimmed",
      "1 cup wax beans",
      "1 cup string beans",
      "1 cup runner beans",
      "1 cup edamame",
      "1 cup green peas",
      "1 cup bean sprouts",
      "1 vanilla bean",
      "1 cup coffee beans",
      "1 cup cocoa beans",
      "1 cup jelly beans",
      "1 can refried beans",
      "1 can baked beans",
      "1 can chili beans",
      "1 tbsp black bean paste",
      "1 (19 oz) can romano beans",
      "1 cup soybeans",
    ]) {
      expect(lineKind(line), line).toBeUndefined();
    }
    expect(beanKindOf("green beans")).toBeUndefined();
  });

  it("takes in lentils and split peas since 46h (43-Dm1–Dm4)", () => {
    expect(lineKind("1 cup lentils")).toBe("lentil");
    expect(lineKind("1 cup dried green lentils")).toBe("lentil");
    expect(lineKind("1 cup split peas")).toBe("split pea");
    expect(beanKindOf("lentils")).toBe("lentil");
  });

  it("counts an A-or-B line only when both are beans", () => {
    expect(
      isBeanLine(parseIngredientLine("1 can black or pinto beans")[0]),
    ).toBe(true);
    expect(
      isBeanLine(parseIngredientLine("1 cup chickpeas or lentils")[0]),
    ).toBe(true);
    expect(
      isBeanLine(parseIngredientLine("1 cup chickpeas or green beans")[0]),
    ).toBe(false);
  });

  /** Every kind each alternative of a line's one requirement names. */
  const kindsOf = (text: string) =>
    parseIngredientLine(text)[0].alternatives.map((name) => beanKinds(name));

  it("reads 42n's shapes: a name in parentheses, borlotti, adzuki, flageolet", () => {
    expect(lineKind("1 (15 oz) can cranberry beans (borlotti), drained")).toBe(
      "pinto",
    );
    expect(lineKind("2 cups cooked borlotti beans")).toBe("pinto");
    expect(lineKind("1 cup fava beans (broad beans)")).toBe("fava");
    expect(lineKind("1 (15 oz) can kidney beans (rajma), drained")).toBe("red");
    expect(lineKind("1/2 cup dried adzuki beans")).toBe("red");
    expect(lineKind("1 (14 oz) can flageolet beans, rinsed")).toBe("white");
  });

  it("counts an (or …) line as any of its beans, a bare variety too", () => {
    const multi = "1 (15 oz) can black beans (or pinto or cannellini beans)";
    expect(isBeanLine(parseIngredientLine(multi)[0])).toBe(true);
    /* Three alternatives since 43n split `(or pinto or cannellini beans)`. */
    expect(kindsOf(multi)).toEqual([["black"], ["pinto"], ["white"]]);
    for (const [line, kinds] of [
      ["1 cup black beans (or pinto)", [["black"], ["pinto"]]],
      ["1 can chickpeas (or navy)", [["chickpea"], ["white"]]],
      ["1 can black beans (or kidney)", [["black"], ["red"]]],
      ["1 cup cannellini (or borlotti)", [["white"], ["pinto"]]],
      ["1/2 cup mung beans (or adzuki)", [["mung"], ["red"]]],
    ] as const) {
      expect(isBeanLine(parseIngredientLine(line)[0]), line).toBe(true);
      expect(kindsOf(line), line).toEqual(kinds);
    }
    /* A bare colour, cranberry or butter names something else. */
    expect(beanKindOf("black")).toBeUndefined();
    expect(beanKindOf("cranberry")).toBeUndefined();
    expect(beanKindOf("butter")).toBeUndefined();
    expect(
      isBeanLine(parseIngredientLine("1 can black beans (or green beans)")[0]),
    ).toBe(false);
  });
});

describe("a bare `beans` names only the family (42m, Dm7)", () => {
  const meets = (item: string, line: string) =>
    satisfies(parseInventoryItem(item), parseIngredientLine(line)[0]);

  it("meets family beans and lines that ask for beans", () => {
    expect(meets("beans", "1 can black beans, drained")).toBe(true);
    /* 42m2 (Dm2-6): a bare "beans" is the `any bean` matcher, which meets
     * every family bean — chickpeas too. */
    expect(meets("beans", "1 (15 oz) can chickpeas")).toBe(true);
    expect(meets("beans", "1 can mixed beans")).toBe(true);
    expect(meets("beans", "1 cup canned beans")).toBe(true);
    expect(meets("beans", "1 (15 oz) can beans, any kind")).toBe(true);
    expect(meets("canned beans", "1 can beans")).toBe(true);
  });

  it("never meets green, wax, string, vanilla, coffee, cocoa or jelly beans", () => {
    for (const line of [
      "1 lb green beans, trimmed",
      "1 cup wax beans",
      "1 cup string beans",
      "1 vanilla bean, split",
      "1/4 cup coffee beans",
      "2 tbsp cocoa beans",
      "1 cup jelly beans",
    ]) {
      expect(meets("beans", line), line).toBe(false);
    }
  });

  it("works the other way: green beans don't meet a line asking for beans", () => {
    expect(meets("green beans", "1 (15 oz) can beans")).toBe(false);
    expect(meets("black beans", "1 (15 oz) can beans")).toBe(true);
    /* Each still meets its own line. */
    expect(meets("green beans", "1 lb green beans")).toBe(true);
    expect(meets("vanilla bean", "1 vanilla bean")).toBe(true);
  });
});

describe("the bean-swap tier is gone (43m)", () => {
  const salad: MakeRecipe = {
    slug: "chickpea-salad",
    name: "Chickpea Salad",
    ingredients: [
      "1 (15 oz) can chickpeas, drained and rinsed",
      "1 cucumber, diced",
    ],
  };

  it("leaves a chickpea salad one away with black beans on hand, and says no more", () => {
    const analysis = analyzeMakeable(
      [salad],
      prepareCorpus([salad]),
      ["black beans", "cucumber"],
      { pantryStaples: false },
    );
    expect(analysis.oneAway.map((match) => match.recipe.slug)).toEqual([
      "chickpea-salad",
    ]);
    expect(analysis).not.toHaveProperty("beanSwap");
    expect(analysis.oneAway[0]).not.toHaveProperty("swaps");
    /* What replaces it: `any bean` (or `bean*`) on the list meets the line. */
    const matched = analyzeMakeable(
      [salad],
      prepareCorpus([salad]),
      ["any bean", "cucumber"],
      { pantryStaples: false },
    );
    expect(matched.canMake.map((match) => match.recipe.slug)).toEqual([
      "chickpea-salad",
    ]);
  });
});

describe("make-settings-v1 after 43m", () => {
  it("reads past the retired beanSwaps and countClose, keeping the rest", () => {
    expect(parseSettings(JSON.stringify({ beanSwaps: false }))).toEqual({});
    expect(
      parseSettings(JSON.stringify({ countClose: false, view: "specs" })),
    ).toEqual({ view: "specs" });
  });
});
