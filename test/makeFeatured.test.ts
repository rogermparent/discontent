import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  featuredOfQuery,
  featureName,
  isFeatured,
  kindOfQuery,
  MAKE_KINDS,
  toggleFeature,
  withFeature,
  withKind,
  withoutFeature,
  withoutFeatures,
} from "recipe-website-common/components/MakePage/kinds";
import {
  addCandidates,
  countFromItems,
  featureScope,
  namesAndMore,
} from "recipe-website-common/components/MakePage/makeMath";
import {
  parseSettings,
  useMakeSettings,
} from "recipe-website-common/components/MakePage/useInventory";
import { saveDiff } from "recipe-website-common/components/MakePage/SavedInventory";
import {
  analyzeMakeable,
  missingLines,
  prepareCorpus,
  pullCounts,
  whatIf,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";

/*
 * 41h — the Make page, redesigned: featured ingredients in the query, Count
 * from, the add field's what-if, each label's pull, and the settings that
 * grew `source` and `view`.
 */

const recipe = (slug: string, ingredients: string[]): MakeRecipe => ({
  slug,
  name: slug.replace(/-/g, " "),
  ingredients,
});

/* A small bar: three sours, a highball, and a lime-free stirred drink. */
const CORPUS: MakeRecipe[] = [
  recipe("daiquiri", [
    "2 oz white rum",
    "1 oz lime juice",
    "3/4 oz simple syrup",
  ]),
  recipe("gimlet", ["2 oz gin", "3/4 oz lime juice", "3/4 oz simple syrup"]),
  recipe("whiskey-sour", [
    "2 oz bourbon",
    "3/4 oz lemon juice",
    "3/4 oz simple syrup",
  ]),
  recipe("moscow-mule", [
    "2 oz vodka",
    "1/2 oz lime juice",
    "4 oz ginger beer",
  ]),
  recipe("martini", ["2 1/2 oz gin", "1/2 oz dry vermouth"]),
];
const prepared = prepareCorpus(CORPUS);
const judge = (items: string[]) =>
  analyzeMakeable(CORPUS, prepared, items, { staples: [] });

describe("featured ingredients in the query (41h)", () => {
  it("reads the top-level ingredient terms back, once each", () => {
    expect(featuredOfQuery("")).toEqual([]);
    expect(featuredOfQuery("tag:drink ingredient:lime")).toEqual(["lime"]);
    expect(
      featuredOfQuery('ingredient:lime tag:sour ingredient:"simple syrup"'),
    ).toEqual(["lime", "simple syrup"]);
    expect(featuredOfQuery("ingredient:lime ingredient:Lime")).toEqual([
      "lime",
    ]);
    /* Excluded, or inside an OR: the person's own query, not a feature. */
    expect(featuredOfQuery("-ingredient:lime")).toEqual([]);
    expect(featuredOfQuery("ingredient:lime OR ingredient:lemon")).toEqual([]);
    /* As typed, not as the parser folds it. */
    expect(featuredOfQuery('tag:drink ingredient:"St-Germain"')).toEqual([
      "St-Germain",
    ]);
  });

  it("writes a feature as an ingredient: term, quoted when it must be", () => {
    expect(withFeature("", "lime")).toBe("ingredient:lime");
    expect(withFeature("tag:drink", "lime juice")).toBe(
      'tag:drink ingredient:"lime juice"',
    );
    /* Already featured: unchanged. */
    expect(withFeature("tag:drink ingredient:lime", "Lime")).toBe(
      "tag:drink ingredient:lime",
    );
    /* An OR at the top keeps its meaning. */
    expect(withFeature("tag:a OR tag:b", "lime")).toBe(
      "(tag:a OR tag:b) ingredient:lime",
    );
    /* A dangling operator never takes the feature into an OR. */
    expect(withFeature("tag:drink OR", "lime")).toBe(
      "tag:drink ingredient:lime",
    );
    expect(withFeature("tag:drink or ", "lime")).toBe(
      "tag:drink ingredient:lime",
    );
    /* A label's parenthetical stays off the feature. */
    expect(withFeature("", "aperitif (Gnista)")).toBe("ingredient:aperitif");
    expect(featureName("(Gnista)")).toBe("Gnista");
  });

  it("takes a feature out and leaves the rest", () => {
    expect(withoutFeature("tag:drink ingredient:lime", "lime")).toBe(
      "tag:drink",
    );
    expect(
      withoutFeature(
        'ingredient:lime tag:sour ingredient:"simple syrup"',
        "simple syrup",
      ),
    ).toBe("ingredient:lime tag:sour");
    expect(withoutFeature("tag:drink -ingredient:lime", "lime")).toBe(
      "tag:drink -ingredient:lime",
    );
  });

  it("presses a label by its own name only, and toggles it exactly", () => {
    expect(isFeatured("lime", ["Lime"])).toBe(true);
    expect(isFeatured("lime juice", ["lime"])).toBe(false);
    expect(isFeatured("ginger beer", ["gin"])).toBe(false);
    expect(isFeatured("non-alcoholic gin", ["gin"])).toBe(false);
    expect(isFeatured("aperitif (Gnista)", ["aperitif"])).toBe(true);

    expect(toggleFeature("tag:drink", "lime")).toBe(
      "tag:drink ingredient:lime",
    );
    expect(toggleFeature("tag:drink ingredient:lime", "Lime")).toBe(
      "tag:drink",
    );
    /* With gin featured, tapping ginger beer features it too. */
    expect(toggleFeature("tag:drink ingredient:gin", "ginger beer")).toBe(
      'tag:drink ingredient:gin ingredient:"ginger beer"',
    );
  });

  it("takes every feature out for the search language", () => {
    expect(withoutFeatures('tag:drink ingredient:gin ingredient:"lime"')).toBe(
      "tag:drink",
    );
    expect(withoutFeatures("tag:drink -ingredient:gin")).toBe(
      "tag:drink -ingredient:gin",
    );
  });

  it("keeps features through a kind switch, and the kind through features", () => {
    const drinks = MAKE_KINDS.find((kind) => kind.id === "drinks")!;
    const food = MAKE_KINDS.find((kind) => kind.id === "food")!;
    expect(withKind("ingredient:lime", drinks)).toBe(
      "tag:drink ingredient:lime",
    );
    expect(withKind("tag:drink ingredient:lime", food)).toBe(
      "-tag:drink ingredient:lime",
    );
    expect(kindOfQuery(withFeature("tag:drink", "lime"))).toBe(drinks);
    expect(MAKE_KINDS.map((kind) => kind.word)).toEqual([
      "recipes",
      "dishes",
      "drinks",
    ]);
  });
});

describe("the featured scope goes through the matcher (41h, Dh7)", () => {
  const BAR: MakeRecipe[] = [
    ...CORPUS,
    recipe("dark-n-stormy", ["2 oz dark rum", "4 oz ginger beer"]),
    recipe("zero-proof-gin-tonic", [
      "2 oz non-alcoholic gin",
      "4 oz tonic water",
    ]),
    recipe("dry-martini", ["2 1/2 oz gin", "1/4 oz extra dry vermouth"]),
  ];
  const bar = prepareCorpus(BAR);
  const scope = (...featured: string[]) =>
    featureScope(BAR, bar, featured).map((each) => each.slug);

  it("means gin by gin, not ginger beer or a non-alcoholic gin", () => {
    expect(scope("gin")).toEqual(["gimlet", "martini", "dry-martini"]);
    expect(scope("ginger beer")).toEqual(["moscow-mule", "dark-n-stormy"]);
    expect(scope("non-alcoholic gin")).toEqual(["zero-proof-gin-tonic"]);
  });

  it("meets a line the way the inventory would", () => {
    /* "extra dry vermouth" is a dry vermouth; "dry vermouth" covers both. */
    expect(scope("extra dry vermouth")).toEqual(["martini", "dry-martini"]);
    expect(scope("dry vermouth")).toEqual(["martini", "dry-martini"]);
    /* "lime" meets "lime juice" (a derived form). */
    expect(scope("lime")).toEqual(["daiquiri", "gimlet", "moscow-mule"]);
    /* A parenthetical label is the item with an alias, as on the list. */
    expect(scope("gin (Tanqueray)")).toEqual(scope("gin"));
  });

  it("needs every feature, and is the whole scope with none", () => {
    expect(scope("gin", "lime")).toEqual(["gimlet"]);
    expect(scope()).toHaveLength(BAR.length);
  });
});

describe("Count from (41h)", () => {
  const browser = ["gin", "lime juice"];
  const saved = ["Gin", "simple syrup"];

  it("counts this browser's list by default, and with no second list", () => {
    expect(countFromItems("browser", browser, saved)).toBe(browser);
    expect(countFromItems("saved", browser)).toBe(browser);
    expect(countFromItems("both", browser)).toBe(browser);
  });

  it("counts the second list, or the union of both", () => {
    expect(countFromItems("saved", browser, saved)).toBe(saved);
    expect(countFromItems("both", browser, saved)).toEqual([
      "gin",
      "lime juice",
      "simple syrup",
    ]);
  });

  it("makes more from the union than from either list", () => {
    const can = (items: string[]) =>
      judge(items).canMake.map((match) => match.recipe.slug);
    expect(can(browser)).toEqual([]);
    expect(can(saved)).toEqual([]);
    expect(can(countFromItems("both", browser, saved))).toEqual(["gimlet"]);
  });
});

describe("the add field's what-if (41h)", () => {
  const analysis = judge(["gin", "simple syrup", "white rum"]);
  const missing = missingLines(analysis);
  const ifAdded = (item: string) => whatIf(item, analysis, prepared.aliases);

  it("tallies what the one- and two-away recipes miss", () => {
    const lime = missing.find((line) => line.requirement.text.includes("lime"));
    expect(lime?.unlocks.sort()).toEqual(["daiquiri", "gimlet"]);
    /* Buy next is the same tally, ranked and cut. */
    expect(analysis.buyNext[0]).toMatchObject({
      item: "lime juice",
      unlocks: 2,
      recipes: ["daiquiri", "gimlet"],
    });
  });

  it("says what one more item would finish and help", () => {
    expect(ifAdded("lime juice")).toEqual({
      item: "lime juice",
      unlocks: ["daiquiri", "gimlet"],
      helps: 0,
    });
    /* "lime" meets "lime juice" (a derived form), so it finishes them too. */
    expect(ifAdded("lime").unlocks.sort()).toEqual(["daiquiri", "gimlet"]);
    expect(ifAdded("dry vermouth").unlocks).toEqual(["martini"]);
    expect(ifAdded("bourbon")).toMatchObject({
      unlocks: [],
      helps: 1,
    });
    expect(ifAdded("tonic")).toMatchObject({
      unlocks: [],
      helps: 0,
    });
  });

  it("judges per recipe: two lines one item meets finish a two-away recipe", () => {
    const corpus = [
      recipe("rum-rickey", [
        "2 oz white rum",
        "1 oz lime juice",
        "1 lime wedge",
      ]),
      recipe("rum-sour", [
        "2 oz white rum",
        "1 oz lime juice",
        "1 oz simple syrup",
        "1 egg white",
      ]),
    ];
    const own = prepareCorpus(corpus);
    const two = analyzeMakeable(corpus, own, ["white rum"], { staples: [] });
    expect(two.twoAway.map((match) => match.recipe.slug)).toEqual([
      "rum-rickey",
    ]);
    /* Per line, it would have said "0 now · 2 closer". */
    expect(whatIf("lime", two, own.aliases)).toEqual({
      item: "lime",
      unlocks: ["rum-rickey"],
      helps: 0,
    });
    /* Closer: a two-away recipe left one away. */
    const sour = analyzeMakeable(corpus, own, ["white rum", "egg white"], {
      staples: [],
    });
    expect(whatIf("simple syrup", sour, own.aliases)).toMatchObject({
      unlocks: [],
      helps: 1,
    });
  });

  it("suggests names from the scope that match at a word start, best first", () => {
    const suggest = (typed: string, scoped = CORPUS) =>
      addCandidates({
        typed,
        scoped,
        prepared,
        analysis,
        have: ["gin", "simple syrup", "white rum"],
        staples: [],
      });
    expect(suggest("li")).toEqual([
      { name: "lime juice", unlocks: 2, helps: 0 },
    ]);
    /* "juice" starts a word of both juices; lime finishes more. */
    expect(suggest("juice").map((candidate) => candidate.name)).toEqual([
      "lime juice",
      "lemon juice",
    ]);
    /* What the list already covers is never offered. */
    expect(suggest("gin")).toEqual([
      { name: "ginger beer", unlocks: 0, helps: 0 },
    ]);
    expect(suggest("")).toEqual([]);
    /* Only names the scope uses. */
    expect(
      suggest(
        "v",
        CORPUS.filter((each) => each.slug === "martini"),
      ),
    ).toEqual([{ name: "dry vermouth", unlocks: 1, helps: 0 }]);
  });
});

describe("pull (41h)", () => {
  it("counts the makeable recipes each item is used in", () => {
    const items = [
      "gin",
      "lime juice",
      "simple syrup",
      "dry vermouth",
      "tonic",
    ];
    const analysis = judge(items);
    expect(analysis.canMake.map((match) => match.recipe.slug)).toEqual([
      "gimlet",
      "martini",
    ]);
    const pulls = pullCounts(items, analysis.canMake, prepared);
    expect(Object.fromEntries(pulls)).toEqual({
      gin: 2,
      "lime juice": 1,
      "simple syrup": 1,
      "dry vermouth": 1,
      tonic: 0,
    });
  });
});

describe("Buy next's names (41h)", () => {
  it("names three and counts the rest, without a source's parenthetical", () => {
    expect(namesAndMore(["Southside (Imbibe)"])).toBe("Southside");
    expect(namesAndMore(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });
});

describe("Save to editor's diff (41h)", () => {
  it("adds what only this browser has and removes what only the saved list has", () => {
    expect(
      saveDiff(["gin", "Lime Juice", "vodka"], ["lime juice", "tonic water"]),
    ).toEqual({ add: ["gin", "vodka"], remove: ["tonic water"] });
    expect(saveDiff(["gin"], ["Gin"])).toEqual({ add: [], remove: [] });
  });
});

describe("make-settings-v1 grew source and view (41h)", () => {
  afterEach(() => localStorage.clear());

  it("reads a value from before 41h as this browser's list and photo cards", () => {
    expect(parseSettings('{"countClose":false,"staples":["salt"]}')).toEqual({
      countClose: false,
      staples: ["salt"],
    });
    localStorage.setItem("make-settings-v1", '{"countClose":false}');
    const { result } = renderHook(() => useMakeSettings());
    expect(result.current.source).toBe("browser");
    expect(result.current.view).toBe("photos");
    expect(result.current.countClose).toBe(false);
  });

  it("drops a source or view it doesn't know", () => {
    expect(parseSettings('{"source":"cloud","view":"grid"}')).toEqual({});
    expect(parseSettings('{"source":"both","view":"specs"}')).toEqual({
      source: "both",
      view: "specs",
    });
  });

  it("stores a choice only while it differs from the default", () => {
    localStorage.setItem("make-settings-v1", '{"countClose":false}');
    const { result } = renderHook(() => useMakeSettings());
    act(() => result.current.setSource("both"));
    expect(result.current.source).toBe("both");
    expect(JSON.parse(localStorage.getItem("make-settings-v1")!)).toEqual({
      countClose: false,
      source: "both",
    });
    act(() => result.current.setView("specs"));
    act(() => result.current.setSource("browser"));
    expect(JSON.parse(localStorage.getItem("make-settings-v1")!)).toEqual({
      countClose: false,
      view: "specs",
    });
  });
});
