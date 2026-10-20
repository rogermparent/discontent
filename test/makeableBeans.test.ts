import { describe, expect, it } from "vitest";
import {
  parseIngredientLine,
  requirementLabel,
} from "recipe-website-common/util/ingredientNames";
import {
  beanFor,
  beanKindOf,
  beanKinds,
  isBeanLine,
} from "recipe-website-common/util/beans";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareCorpus,
  satisfies,
  type MakeableOptions,
  type MakeRecipe,
  type RecipeMatch,
} from "recipe-website-common/util/makeable";
import { parseSettings } from "recipe-website-common/components/MakePage/useInventory";

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

  it("leaves out green beans, lentils and the beans that aren't pulses (Dm1)", () => {
    for (const line of [
      "1 lb green beans, trimmed",
      "1 cup wax beans",
      "1 cup string beans",
      "1 cup runner beans",
      "1 cup edamame",
      "1 cup lentils",
      "1 cup split peas",
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
    expect(beanKindOf("lentils")).toBeUndefined();
  });

  it("counts an A-or-B line only when both are beans", () => {
    expect(
      isBeanLine(parseIngredientLine("1 can black or pinto beans")[0]),
    ).toBe(true);
    expect(
      isBeanLine(parseIngredientLine("1 cup chickpeas or lentils")[0]),
    ).toBe(false);
  });

  it("swaps in the line's own kind first, then a named bean, then a mix", () => {
    const beans = [
      { text: "mixed beans", kind: "any" },
      { text: "black beans", kind: "black" },
      { text: "navy beans", kind: "white" },
    ];
    const line = (text: string) => parseIngredientLine(text)[0];
    expect(beanFor(line("1 can cannellini beans"), beans)?.text).toBe(
      "navy beans",
    );
    expect(beanFor(line("1 can chickpeas"), beans)?.text).toBe("black beans");
    expect(
      beanFor(line("1 can chickpeas"), [{ text: "mixed beans", kind: "any" }])
        ?.text,
    ).toBe("mixed beans");
    expect(beanFor(line("1 can chickpeas"), [])).toBeUndefined();
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
    /* The swap prefers a bean the line itself names. */
    expect(
      beanFor(parseIngredientLine(multi)[0], [
        { text: "chickpeas", kind: "chickpea" },
        { text: "navy beans", kind: "white" },
      ])?.text,
    ).toBe("navy beans");
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

const recipe = (name: string, ingredients: string[]): MakeRecipe => ({
  slug: name.toLowerCase().replace(/[^a-z]+/g, "-"),
  name,
  ingredients,
});

const CHICKPEA_SALAD = recipe("Chickpea Salad", [
  "1 (15 oz) can chickpeas, drained and rinsed",
  "1 cucumber, diced",
  "2 tbsp olive oil",
]);
const TWO_BEAN_SALAD = recipe("Two Bean Salad", [
  "1 can chickpeas, drained",
  "1 can kidney beans, drained",
  "1 red onion",
]);
const BLACK_BEAN_SALSA = recipe("Black Bean Salsa", [
  "1 can black beans",
  "1 cup corn",
]);
const CHICKPEA_TOMATO = recipe("Chickpea Tomato Salad", [
  "1 can chickpeas",
  "2 tomatoes",
]);
const GREEN_BEAN_SALAD = recipe("Green Bean Salad", [
  "1 lb green beans, trimmed",
  "1 shallot",
]);
const CORPUS = [
  CHICKPEA_SALAD,
  TWO_BEAN_SALAD,
  BLACK_BEAN_SALSA,
  CHICKPEA_TOMATO,
  GREEN_BEAN_SALAD,
];

function judge(inventory: string[], options: MakeableOptions = {}) {
  return analyzeMakeable(CORPUS, prepareCorpus(CORPUS), inventory, {
    pantryStaples: false,
    beanSwaps: true,
    ...options,
  });
}

const slugs = (matches: RecipeMatch[]) => matches.map((m) => m.recipe.slug);
const swapsOf = (match: RecipeMatch | undefined) =>
  match?.swaps?.map(({ requirement, use }) => [
    requirementLabel(requirement),
    use,
  ]);

describe("the bean-swap tier (42m)", () => {
  it("puts a chickpea recipe in the tier with black beans on hand", () => {
    const analysis = judge(["black beans", "cucumber", "olive oil", "corn"]);
    expect(slugs(analysis.canMake)).toEqual(["black-bean-salsa"]);
    expect(slugs(analysis.beanSwap)).toEqual(["chickpea-salad"]);
    expect(swapsOf(analysis.beanSwap[0])).toEqual([
      ["canned chickpea", "black beans"],
    ]);
  });

  it("covers two bean lines with one bean on hand", () => {
    const analysis = judge(["pinto beans", "red onion"]);
    const twoBean = analysis.beanSwap.find(
      (m) => m.recipe.slug === "two-bean-salad",
    );
    expect(swapsOf(twoBean)).toEqual([
      ["canned chickpea", "pinto beans"],
      ["canned kidney bean", "pinto beans"],
    ]);
  });

  it("never touches can-make, and leaves the other buckets as they were", () => {
    const inventory = ["black beans", "cucumber", "olive oil", "corn"];
    const on = judge(inventory);
    const off = judge(inventory, { beanSwaps: false });
    expect(off.beanSwap).toEqual([]);
    expect(slugs(on.canMake)).toEqual(slugs(off.canMake));
    expect(slugs(on.oneAway)).toEqual(slugs(off.oneAway));
    expect(slugs(on.twoAway)).toEqual(slugs(off.twoAway));
    expect(slugs(on.further)).toEqual(slugs(off.further));
    expect(on.buyNext).toEqual(off.buyNext);
    /* The swap recipe is still one away: it is missing chickpeas. */
    expect(slugs(on.oneAway)).toContain("chickpea-salad");
    expect(on.canMake.some((m) => m.swaps)).toBe(false);
  });

  it("leaves out a recipe that also misses something that isn't a bean", () => {
    /* No tomatoes: Chickpea Tomato Salad misses more than beans. */
    const analysis = judge(["black beans", "corn"]);
    expect(slugs(analysis.beanSwap)).not.toContain("chickpea-tomato-salad");
    expect(slugs(analysis.twoAway)).toContain("chickpea-tomato-salad");
  });

  it("does nothing without a family bean on hand, and green beans aren't one", () => {
    const analysis = judge(["green beans", "cucumber", "olive oil"]);
    expect(analysis.beanSwap).toEqual([]);
  });

  it("never lets a family bean stand in for green beans", () => {
    const analysis = judge(["black beans", "shallot"]);
    expect(slugs(analysis.beanSwap)).not.toContain("green-bean-salad");
  });

  it("takes an (or …) bean line, preferring a bean it names", () => {
    const salad = recipe("Pinto Salad", [
      "1 (15 oz) can black beans (or pinto or cannellini beans), drained",
      "1 cup corn",
    ]);
    const judgeWith = (inventory: string[]) =>
      analyzeMakeable([salad], prepareCorpus([salad]), inventory, {
        pantryStaples: false,
        beanSwaps: true,
      });
    /* Navy is a white bean, like the cannellini the line names. */
    const analysis = judgeWith(["chickpeas", "navy beans", "corn"]);
    expect(swapsOf(analysis.beanSwap[0])).toEqual([
      [
        "canned black bean or canned pinto bean or canned cannellini bean",
        "navy beans",
      ],
    ]);
    /* Cannellini itself meets the line (the strict tail rule): no swap. */
    const strict = judgeWith(["cannellini beans", "corn"]);
    expect(slugs(strict.canMake)).toEqual(["pinto-salad"]);
    expect(strict.beanSwap).toEqual([]);
  });

  it("is off unless asked for", () => {
    const analysis = analyzeMakeable(
      CORPUS,
      prepareCorpus(CORPUS),
      ["black beans", "cucumber", "olive oil"],
      { pantryStaples: false },
    );
    expect(analysis.beanSwap).toEqual([]);
    expect(analysis.oneAway.every((m) => m.swaps === undefined)).toBe(true);
  });
});

describe("make-settings-v1 and beanSwaps (42m)", () => {
  it("reads false, drops anything else, and leaves old values alone", () => {
    expect(parseSettings(JSON.stringify({ beanSwaps: false }))).toEqual({
      beanSwaps: false,
    });
    expect(parseSettings(JSON.stringify({ beanSwaps: "no" }))).toEqual({});
    /* A value from before 42m: no field, so the default (on) holds. */
    expect(
      parseSettings(JSON.stringify({ countClose: false, view: "specs" })),
    ).toEqual({ countClose: false, view: "specs" });
  });
});
