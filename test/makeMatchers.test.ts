import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "recipe-website-common/util/ingredientNames";
import {
  canonicalItem,
  canonicalItems,
  matcherForTyped,
  matcherMeets,
  matcherOf,
  matcherText,
  MATCHERS,
} from "recipe-website-common/util/matchers";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareCorpus,
  probablyOnHand,
  pullCounts,
  satisfies,
  whatIf,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";
import {
  addCandidates,
  matcherMembers,
  refineMatcher,
} from "recipe-website-common/components/MakePage/makeMath";
import {
  exportInventory,
  parseInventoryText,
} from "recipe-website-common/util/inventoryText";

const BEAN = MATCHERS.find((matcher) => matcher.id === "bean")!;

/** Does `any bean` meet the one requirement a line yields? */
function meets(line: string, item = "any bean"): boolean {
  const [requirement] = parseIngredientLine(line);
  return satisfies(parseInventoryItem(item), requirement);
}

const RECIPES: MakeRecipe[] = [
  {
    slug: "chickpea-salad",
    name: "Chickpea Cucumber Salad",
    ingredients: [
      "1 (15 oz) can chickpeas, drained and rinsed",
      "1 cucumber, diced",
    ],
  },
  {
    slug: "black-bean-salad",
    name: "Black Bean and Corn Salad",
    ingredients: ["2 cans (15 oz each) black beans, drained", "1 cup corn"],
  },
  {
    slug: "two-bean-salad",
    name: "Two Bean Salad",
    ingredients: [
      "1 (15 oz) can chickpeas, drained and rinsed",
      "1 (15 oz) can kidney beans, drained and rinsed",
      "1 red onion, diced",
    ],
  },
  {
    slug: "green-bean-salad",
    name: "Green Bean Salad",
    ingredients: ["1 lb green beans, trimmed", "1 red onion, diced"],
  },
  {
    slug: "vanilla-custard",
    name: "Vanilla Custard",
    ingredients: ["1 vanilla bean, split", "2 cups cream"],
  },
];

describe("matcher text (42m2, Dm2-1)", () => {
  it("reads the spellings of `any bean` and keeps `any bean`", () => {
    for (const text of [
      "any bean",
      "any beans",
      "Any Beans",
      "beans",
      "bean",
      "all beans",
      "any kind of beans",
      "any type of bean",
      "beans (any kind)",
      "beans, any",
      "✱ any bean",
    ]) {
      expect(matcherOf(text), text).toBe(BEAN);
      expect(canonicalItem(text), text).toBe("any bean");
    }
    expect(matcherText(BEAN)).toBe("any bean");
  });

  it("leaves every other item as written", () => {
    for (const text of [
      "black beans",
      "green beans",
      "mixed beans",
      "canned beans",
      "beans (Goya)",
      "vanilla bean",
      "any",
      "lime",
    ]) {
      expect(matcherOf(text), text).toBeUndefined();
      expect(canonicalItem(text), text).toBe(text);
    }
    expect(canonicalItems(["beans", "lime"])).toEqual(["any bean", "lime"]);
  });

  it("round-trips through Export and Import as text", () => {
    const exported = exportInventory(["any bean", "lime"]);
    expect(exported).toBe("any bean\nlime");
    expect(parseInventoryText(exported).items).toEqual(["any bean", "lime"]);
    expect(matcherOf(parseInventoryText(exported).items[0])).toBe(BEAN);
  });

  it("offers the matcher for a family begun in the add field", () => {
    expect(matcherForTyped("bean")).toBe(BEAN);
    expect(matcherForTyped("Beans")).toBe(BEAN);
    expect(matcherForTyped("bea")).toBe(BEAN);
    expect(matcherForTyped("any b")).toBe(BEAN);
    expect(matcherForTyped("any bean")).toBe(BEAN);
    expect(matcherForTyped("be")).toBeUndefined();
    expect(matcherForTyped("black bean")).toBeUndefined();
    expect(matcherForTyped("beer")).toBeUndefined();
    expect(matcherForTyped("any")).toBeUndefined();
  });
});

describe("`any bean` meets every family bean (42m2)", () => {
  it("meets the canned and dried beans, however the line is written", () => {
    for (const line of [
      "1 (15 oz) can chickpeas, drained and rinsed",
      "1 (15-ounce) can garbanzo beans",
      "2 cups cooked black beans",
      "1 can low-sodium black beans",
      "1 can dark red kidney beans",
      "1 can pinto beans",
      "15 oz cannellini beans",
      "1 cup dried navy beans",
      "1 cup frozen lima beans",
      "1 can black-eyed peas",
      "1 can mixed beans",
      "1 (15 oz) can beans, any kind",
      "1 can black beans or pinto beans",
    ]) {
      expect(meets(line), line).toBe(true);
    }
  });

  it("never meets green, wax or vanilla beans, lentils or refried beans", () => {
    for (const line of [
      "1 lb green beans, trimmed",
      "1 cup wax beans",
      "1 cup string beans",
      "1 cup edamame",
      "1 cup lentils",
      "1 cup split peas",
      "1 cup bean sprouts",
      "1 vanilla bean",
      "1 cup coffee beans",
      "1 cup jelly beans",
      "1 can refried beans",
      "1 can baked beans",
    ]) {
      expect(meets(line), line).toBe(false);
    }
  });

  it("a bare `beans` on the list means the same as `any bean` (Dm2-6)", () => {
    expect(meets("1 lb green beans, trimmed", "beans")).toBe(false);
    expect(meets("1 vanilla bean", "beans")).toBe(false);
    expect(meets("1 can chickpeas", "beans")).toBe(true);
  });

  it("meets an A-or-B line through either name, never an infusion's flavour", () => {
    const [orLine] = parseIngredientLine("1 cup chickpeas or lentils");
    expect(matcherMeets(BEAN, orLine)).toBe(true);
    const loose = { ...orLine, loose: true };
    expect(matcherMeets(BEAN, loose)).toBe(false);
  });

  it("counts for can make, and leaves green beans and vanilla out", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(
      RECIPES,
      prepared,
      ["any bean", "cucumber", "corn", "red onion", "cream"],
      { staples: [] },
    );
    expect(analysis.canMake.map((match) => match.recipe.slug)).toEqual([
      "black-bean-salad",
      "chickpea-salad",
      "two-bean-salad",
    ]);
    expect(analysis.oneAway.map((match) => match.recipe.slug).sort()).toEqual([
      "green-bean-salad",
      "vanilla-custard",
    ]);
  });

  it("works as an always-have staple too", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(RECIPES, prepared, ["cucumber"], {
      staples: ["any bean"],
    });
    expect(analysis.canMake.map((match) => match.recipe.slug)).toEqual([
      "chickpea-salad",
    ]);
  });

  it("folds bean lines on the shopping list as probably on hand", () => {
    const [chickpeas] = parseIngredientLine("1 can chickpeas");
    const [green] = parseIngredientLine("1 lb green beans");
    const items = [parseInventoryItem("any bean")];
    expect(probablyOnHand(chickpeas, items, [])).toBe(true);
    expect(probablyOnHand(green, items, [])).toBe(false);
  });

  it("counts its pull, and its what-if", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(
      RECIPES,
      prepared,
      ["any bean", "cucumber", "corn"],
      { staples: [] },
    );
    expect(
      pullCounts(["any bean", "corn"], analysis.canMake, prepared),
    ).toEqual(
      new Map([
        ["any bean", 2],
        ["corn", 1],
      ]),
    );
    const without = analyzeMakeable(RECIPES, prepared, ["cucumber", "corn"], {
      staples: [],
    });
    expect(whatIf("any bean", without, prepared.aliases).unlocks).toEqual([
      "black-bean-salad",
      "chickpea-salad",
    ]);
  });
});

describe("the matcher and the bean-swap tier never double-count (42m2)", () => {
  it("leaves the tier nothing for beans the matcher already meets", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(
      RECIPES,
      prepared,
      ["any bean", "red onion"],
      { staples: [], beanSwaps: true },
    );
    expect(analysis.beanSwap).toEqual([]);
    expect(analysis.canMake.map((match) => match.recipe.slug)).toContain(
      "two-bean-salad",
    );
    /* Each recipe in one bucket only. */
    const slugs = [
      ...analysis.canMake,
      ...analysis.oneAway,
      ...analysis.twoAway,
      ...analysis.further,
    ].map((match) => match.recipe.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("swaps as before once the matcher is refined to one bean", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(
      RECIPES,
      prepared,
      ["black bean", "red onion"],
      { staples: [], beanSwaps: true },
    );
    expect(analysis.beanSwap.map((match) => match.recipe.slug)).toEqual([
      "two-bean-salad",
    ]);
  });
});

describe("refining a matcher (42m2)", () => {
  it("lists the family's members in scope, with their recipes", () => {
    const prepared = prepareCorpus([
      ...RECIPES,
      {
        slug: "mixed-bean-chili",
        name: "Mixed Bean Chili",
        ingredients: ["2 cans mixed beans", "1 can chickpeas (optional)"],
      },
    ]);
    const members = matcherMembers(
      BEAN,
      [...prepared.recipes.values()].map((entry) => entry.recipe),
      prepared,
    );
    /* Specific beans only, required lines only, most used first. */
    expect(members).toEqual([
      { name: "chickpea", recipes: 2 },
      { name: "black bean", recipes: 1 },
      { name: "kidney bean", recipes: 1 },
    ]);
    expect(matcherMembers(BEAN, RECIPES.slice(0, 1), prepared)).toEqual([
      { name: "chickpea", recipes: 1 },
    ]);
  });

  it("replaces the matcher with the chosen beans, in its place", () => {
    expect(
      refineMatcher(["lime", "any bean", "corn"], "any bean", ["chickpea"]),
    ).toEqual(["lime", "chickpea", "corn"]);
    expect(
      refineMatcher(["any bean", "chickpea"], "any bean", [
        "chickpea",
        "black bean",
      ]),
    ).toEqual(["chickpea", "black bean"]);
  });
});

describe("the add field offers the matcher (42m2)", () => {
  const prepared = prepareCorpus(RECIPES);
  const analysis = analyzeMakeable(RECIPES, prepared, ["cucumber", "corn"], {
    staples: [],
  });
  const suggest = (typed: string, have = ["cucumber", "corn"]) =>
    addCandidates({
      typed,
      scoped: RECIPES,
      prepared,
      analysis,
      have,
      staples: [],
    });

  it("names the kinds it matches, ranked by its what-if", () => {
    const candidates = suggest("bean");
    expect(candidates[0]).toEqual({
      name: "any bean",
      unlocks: 2,
      helps: 0,
      matcher: { kinds: 3 },
    });
    expect(candidates.map((candidate) => candidate.name)).toContain(
      "black bean",
    );
  });

  it("is not offered once the list holds it, nor for other words", () => {
    expect(
      suggest("bean", ["cucumber", "any bean"]).some(
        (candidate) => candidate.matcher,
      ),
    ).toBe(false);
    expect(suggest("cuc").some((candidate) => candidate.matcher)).toBe(false);
  });
});
