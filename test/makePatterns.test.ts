import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "recipe-website-common/util/ingredientNames";
import {
  canonicalItem,
  looksLikePattern,
  matcherForTyped,
  matcherOf,
  patternError,
  patternOf,
  prefixForTyped,
  PATTERN_MAX_LENGTH,
  unsafeRepeat,
} from "recipe-website-common/util/matchers";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareCorpus,
  pullCounts,
  satisfies,
  whatIf,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";
import {
  addCandidates,
  matcherMembers,
  mostUsed,
  refineMatcher,
} from "recipe-website-common/components/MakePage/makeMath";
import {
  dedupeItems,
  inventoryKey,
  parseInventoryText,
} from "recipe-website-common/util/inventoryText";

/** Does `item` meet the one requirement `line` yields? */
function meets(item: string, line: string): boolean {
  const [requirement] = parseIngredientLine(line);
  return satisfies(parseInventoryItem(item), requirement);
}

const RECIPES: MakeRecipe[] = [
  {
    slug: "three-bean-salad",
    name: "Three Bean Salad",
    ingredients: [
      "1 (15 oz) can black beans, drained",
      "1 lb green beans, trimmed",
      "1 (15 oz) can kidney beans, drained",
      "1 red onion, diced",
    ],
  },
  {
    slug: "chickpea-salad",
    name: "Chickpea Salad",
    ingredients: ["1 can chickpeas, drained", "1 red onion, diced"],
  },
  {
    slug: "egg-salad",
    name: "Egg Salad",
    ingredients: ["6 eggs, hard-boiled", "1/3 cup mayo", "1 tsp dijon"],
  },
  {
    slug: "potato-salad",
    name: "Potato Salad",
    ingredients: [
      "2 lb potatoes",
      "1/2 cup mayonnaise",
      "1 red onion, diced",
      "2 tbsp chopped parsley, for garnish",
    ],
  },
  {
    slug: "balela",
    name: "Balela Salad",
    ingredients: [
      "1/2 cup to 1 cup Italian parsley – chopped",
      "1 (15 oz) can black beans",
      "1 cup crumbled mild feta cheese",
    ],
  },
  {
    slug: "greek-salad",
    name: "Greek Salad",
    ingredients: ["4 oz feta", "1 cucumber", "1 red onion"],
  },
  {
    slug: "vanilla-custard",
    name: "Vanilla Custard",
    ingredients: ["1 vanilla bean, split", "2 cups cream"],
  },
];

describe("pattern syntax (43m)", () => {
  it("reads a word with a star as a word prefix, and folds its text", () => {
    expect(patternOf("bean*")).toMatchObject({
      kind: "prefix",
      text: "bean*",
    });
    expect(canonicalItem("Bean*")).toBe("bean*");
    expect(canonicalItem("  Black  B*  ")).toBe("black b*");
    expect(patternOf("bean *")?.text).toBe("bean*");
  });

  it("reads /…/ as a regular expression, keeping its text", () => {
    expect(patternOf("/may(o|onnaise)/")).toMatchObject({
      kind: "regex",
      text: "/may(o|onnaise)/",
    });
    /* An `i` flag is tolerated: matching is case-insensitive anyway. */
    expect(canonicalItem("/May(o|onnaise)/i")).toBe("/May(o|onnaise)/");
  });

  it("keeps `bean*` a prefix and `beans` the family, as before", () => {
    expect(matcherOf("bean*")?.kind).toBe("prefix");
    expect(matcherOf("beans")?.kind).toBe("family");
    expect(canonicalItem("beans")).toBe("any bean");
    expect(matcherOf("black beans")).toBeUndefined();
    expect(matcherOf("salt & pepper")).toBeUndefined();
  });

  it("says what is wrong with a pattern it can't use", () => {
    expect(patternError("/may(/")).toMatch(/^That isn't a pattern/);
    expect(patternError("/may")).toMatch(/Close the pattern with a slash/);
    expect(patternError("//")).toMatch(/Put something between/);
    expect(patternError(`/${"a".repeat(PATTERN_MAX_LENGTH + 1)}/`)).toMatch(
      /at most 64 characters/,
    );
    expect(patternError("b*")).toMatch(/at least 2 letters/);
    expect(patternError("bean*")).toBeUndefined();
    expect(patternError("lime")).toBeUndefined();
    /* A broken pattern keeps its spelling, so it can be read and fixed. */
    expect(canonicalItem("/may(/")).toBe("/may(/");
  });

  it("tells a pattern from plain text by its shape", () => {
    expect(looksLikePattern("bean*")).toBe(true);
    expect(looksLikePattern("/may")).toBe(true);
    expect(looksLikePattern("bean")).toBe(false);
    expect(looksLikePattern("any bean")).toBe(false);
  });

  it("keys a regular expression as written, and never splits it on commas", () => {
    /* `fold` would drop the caret: two different patterns, one key. */
    expect(inventoryKey("/^gin/")).not.toBe(inventoryKey("/gin/"));
    expect(dedupeItems(["/^gin/", "/gin/"])).toEqual(["/^gin/", "/gin/"]);
    expect(inventoryKey("bean*")).not.toBe(inventoryKey("bean"));
    expect(parseInventoryText("/ch(ee|i){1,2}se/").items).toEqual([
      "/ch(ee|i){1,2}se/",
    ]);
    expect(parseInventoryText("lime, bean*").items).toEqual(["lime", "bean*"]);
  });
});

describe("regex safety (43m)", () => {
  it("refuses a repeat of a repeat, and backreferences", () => {
    for (const body of [
      "(a+)+",
      "(a+)+$",
      "(\\w*)*x",
      "(a|a)*",
      "((ab)+){2,}",
      "(?:a+)+",
      "(x+x+)+y",
    ]) {
      expect(unsafeRepeat(body), body).toMatch(/repeats a repeat/);
    }
    expect(unsafeRepeat("(a)\\1")).toMatch(/Backreferences/);
    expect(unsafeRepeat("(?<x>a)\\k<x>")).toMatch(/Backreferences/);
  });

  it("refuses more than three unbounded repeats", () => {
    expect(unsafeRepeat(".*.*.*")).toBeUndefined();
    expect(unsafeRepeat(".*.*.*.*x")).toMatch(/at most 3/);
  });

  it("lets ordinary patterns through", () => {
    for (const body of [
      "may(o|onnaise)",
      "^(red|green) bell",
      "chil(e|i|ies)",
      "feta|ricotta",
      "(ab)*",
      "(a+)?",
      "\\bgin\\b",
      "[a-z]+ syrup",
      "(?:dark|light) rum",
      "x{2}",
    ]) {
      expect(unsafeRepeat(body), body).toBeUndefined();
      expect(patternError(`/${body}/`), body).toBeUndefined();
    }
  });

  it("stays fast at its worst over a corpus of long names", () => {
    /* Three unbounded repeats and no match: the cubic worst case it allows. */
    const pattern = parseInventoryItem("/.*.*.*q/");
    expect(pattern.matcher?.error).toBeUndefined();
    const corpus: MakeRecipe[] = Array.from({ length: 2000 }, (_, i) => ({
      slug: `r${i}`,
      name: `R${i}`,
      ingredients: [`1 cup ${"abcdefgh ".repeat(11)}${i}`],
    }));
    const started = performance.now();
    const analysis = analyzeMakeable(corpus, prepareCorpus(corpus), [
      "/.*.*.*q/",
    ]);
    const elapsed = performance.now() - started;
    expect(analysis.canMake).toEqual([]);
    expect(elapsed).toBeLessThan(5000);
  });
});

describe("pattern items meet lines (43m)", () => {
  it("bean* meets every line with a word starting “bean”, never chickpeas", () => {
    expect(meets("bean*", "1 (15 oz) can black beans")).toBe(true);
    expect(meets("bean*", "1 lb green beans")).toBe(true);
    expect(meets("bean*", "1 vanilla bean, split")).toBe(true);
    expect(meets("bean*", "1 can chickpeas")).toBe(false);
    /* Plural typed: the names keep the singular. */
    expect(meets("beans*", "1 lb green beans")).toBe(true);
    /* At a word start, not inside one. */
    expect(meets("ean*", "1 lb green beans")).toBe(false);
  });

  it("a prefix reaches the synonym 43n folds a name into", () => {
    expect(meets("mayo*", "1/3 cup mayo")).toBe(true);
    expect(meets("mayo*", "1/2 cup mayonnaise")).toBe(true);
    expect(
      meets("parsley*", "1/2 cup to 1 cup Italian parsley – chopped"),
    ).toBe(true);
    expect(meets("feta*", "1 cup crumbled mild feta cheese")).toBe(true);
  });

  it("/may(o|onnaise)/ meets both spellings, case-insensitively", () => {
    expect(meets("/may(o|onnaise)/", "1/3 cup Mayo")).toBe(true);
    expect(meets("/MAY(O|ONNAISE)/", "1/2 cup mayonnaise")).toBe(true);
    expect(meets("/may(o|onnaise)/", "1 tsp dijon")).toBe(false);
    /* Over the normalized name: accents off, as names are. */
    expect(meets("/crème/", "1 cup crème fraîche")).toBe(true);
  });

  it("a plain item stays exact: `bean` and `mayo` mean what they say", () => {
    expect(meets("feta", "1 cup crumbled mild feta cheese")).toBe(true);
    expect(meets("parsley", "1 lb green beans")).toBe(false);
    expect(meets("bean", "1 lb green beans")).toBe(false);
  });

  it("a broken pattern meets nothing, and is never close to anything", () => {
    const broken = parseInventoryItem("/may(/");
    expect(broken.matcher?.error).toBeDefined();
    expect(broken.names).toEqual([]);
    expect(meets("/may(/", "1/3 cup mayo")).toBe(false);
  });

  it("counts for can make, pull and what-if, like any item", () => {
    const prepared = prepareCorpus(RECIPES);
    const analysis = analyzeMakeable(
      RECIPES,
      prepared,
      ["eggs", "/may(o|onnaise)/", "dijon mustard"],
      { staples: [] },
    );
    expect(analysis.canMake.map((match) => match.recipe.slug)).toEqual([
      "egg-salad",
    ]);
    expect(
      pullCounts(["/may(o|onnaise)/"], analysis.canMake, prepared).get(
        "/may(o|onnaise)/",
      ),
    ).toBe(1);
    /* Three Bean Salad two away — green and kidney — which bean* finishes. */
    const before = analyzeMakeable(
      RECIPES,
      prepared,
      ["red onion", "black beans"],
      { staples: [] },
    );
    expect(whatIf("bean*", before, prepared.aliases).unlocks).toContain(
      "three-bean-salad",
    );
  });
});

describe("refining a pattern (43m)", () => {
  const prepared = prepareCorpus(RECIPES);

  it("lists the names it matches in scope, with their recipes", () => {
    expect(matcherMembers(matcherOf("bean*")!, RECIPES, prepared)).toEqual([
      { name: "black bean", recipes: 2 },
      { name: "green bean", recipes: 1 },
      { name: "kidney bean", recipes: 1 },
      { name: "vanilla bean", recipes: 1 },
    ]);
    expect(
      matcherMembers(matcherOf("/may(o|onnaise)/")!, RECIPES, prepared),
    ).toEqual([{ name: "mayonnaise", recipes: 2 }]);
    /* A broken one lists nothing. */
    expect(matcherMembers(matcherOf("/may(/")!, RECIPES, prepared)).toEqual([]);
  });

  it("keeps only the names chosen, in its place", () => {
    expect(
      refineMatcher(["lime", "bean*", "corn"], "bean*", [
        "black bean",
        "kidney bean",
      ]),
    ).toEqual(["lime", "black bean", "kidney bean", "corn"]);
  });
});

describe("the add field offers patterns, never over a name (43m)", () => {
  const prepared = prepareCorpus(RECIPES);
  const analysis = analyzeMakeable(RECIPES, prepared, ["red onion"], {
    staples: [],
  });
  const suggest = (typed: string, have = ["red onion"]) =>
    addCandidates({
      typed,
      scoped: RECIPES,
      prepared,
      analysis,
      have,
      staples: [],
    });

  it("ends plain text with “Match every line with …”", () => {
    const candidates = suggest("bean");
    const last = candidates[candidates.length - 1];
    expect(last).toMatchObject({
      name: "bean*",
      pattern: { names: 4, every: true },
    });
    /* The family is still offered, and the plain names first. */
    expect(candidates.map((candidate) => candidate.name)).toContain("any bean");
    expect(candidates.findIndex((c) => c.pattern)).toBe(candidates.length - 1);
  });

  it("offers a typed pattern as itself, and nothing for a broken one", () => {
    expect(suggest("/may(o|onnaise)/")).toEqual([
      {
        name: "/may(o|onnaise)/",
        unlocks: 0,
        helps: expect.any(Number),
        pattern: { names: 1 },
      },
    ]);
    expect(suggest("/may(")).toEqual([]);
    expect(suggest("bean*", ["red onion", "Bean*"])).toEqual([]);
  });

  it("leaves the row out when it matches nothing here, or the list has it", () => {
    expect(suggest("quince").some((c) => c.pattern)).toBe(false);
    expect(suggest("bean", ["red onion", "bean*"]).some((c) => c.pattern)).toBe(
      false,
    );
    expect(prefixForTyped("any bean")).toBeUndefined();
    expect(prefixForTyped("b")).toBeUndefined();
    expect(matcherForTyped("bean*")).toBeUndefined();
  });
});

describe("Most used here (43m, start from nothing)", () => {
  const prepared = prepareCorpus(RECIPES);

  it("ranks normalized names by the recipes that ask for them", () => {
    const rows = mostUsed({
      scoped: RECIPES,
      prepared,
      have: [],
      staples: [],
    });
    expect(rows[0]).toEqual({ name: "red onion", recipes: 4 });
    /* "mild feta cheese" and "feta" are one name (43n). */
    expect(rows).toContainEqual({ name: "feta cheese", recipes: 2 });
    /* "mayo" and "mayonnaise" too. */
    expect(rows).toContainEqual({ name: "mayonnaise", recipes: 2 });
    expect(rows).toContainEqual({ name: "black bean", recipes: 2 });
  });

  it("skips optional lines, staples and what's on hand", () => {
    const rows = mostUsed({
      scoped: RECIPES,
      prepared,
      have: ["red onion"],
      staples: ["eggs"],
    });
    const names = rows.map((row) => row.name);
    expect(names).not.toContain("red onion");
    expect(names).not.toContain("egg");
    /* The parsley garnish is optional: only Balela's Italian parsley counts. */
    expect(names).not.toContain("parsley");
    expect(names).toContain("italian parsley");
    /* A pattern on the list covers what it matches. */
    const withPattern = mostUsed({
      scoped: RECIPES,
      prepared,
      have: ["bean*"],
      staples: [],
    }).map((row) => row.name);
    expect(withPattern).not.toContain("black bean");
    expect(withPattern).not.toContain("green bean");
  });

  it("counts within the scope, and stops at the limit", () => {
    const greek = RECIPES.filter((recipe) => recipe.slug === "greek-salad");
    expect(
      mostUsed({ scoped: greek, prepared, have: [], staples: [] }),
    ).toEqual([
      { name: "cucumber", recipes: 1 },
      { name: "feta cheese", recipes: 1 },
      { name: "red onion", recipes: 1 },
    ]);
    expect(
      mostUsed({
        scoped: RECIPES,
        prepared,
        have: [],
        staples: [],
        limit: 2,
      }),
    ).toHaveLength(2);
  });
});
