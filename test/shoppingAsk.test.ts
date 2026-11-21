// 49b: the shopping list's "same thing, different names" asked of a model —
// the proposal for any names (`proposalForKeys`), the check a revise's and a
// find's answer go through (`shoppingAskCheck`), the spec and the prompts
// (condensed, nothing decided or proposed sent), and the job with `fetch`
// stubbed — never a real model.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mergedAmountInUnit,
  proposalForKeys,
  proposalRowsFor,
} from "recipe-website-common/util/shoppingConsolidate";
import {
  SHOPPING_EQUIVALENTS,
  amountInUnit,
  knownDifferent,
  knownDifferentPair,
  mergeIdOf,
  roundMetric,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import { shoppingNameOf } from "recipe-website-common/util/shoppingView";
import {
  isShoppingAskResult,
  stillOpen,
  type ShoppingModelProposal,
} from "recipe-website-common/util/shoppingAsk";
import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  checkFindAnswer,
  checkReviseAnswer,
  readableAmount,
} from "../websites/recipe-website/editor/controller/llm/shoppingAskCheck";
import {
  FIND_SYSTEM_PROMPT,
  REVISE_SYSTEM_PROMPT,
  SHOPPING_THINK_TOKENS,
  findUserPrompt,
  reviseUserPrompt,
  runShoppingAsk,
  shoppingAskCalls,
  shoppingAskContext,
  shoppingAskPrompt,
  shoppingAskSpecOf,
  shoppingAskThinks,
  type ShoppingAskSpec,
} from "../websites/recipe-website/editor/controller/llm/shoppingAsk";
import { editModels } from "../websites/recipe-website/editor/controller/llm/askEdit";
import { estimateTokens } from "../websites/recipe-website/editor/controller/llm/client";
import {
  jobLabel,
  jobResources,
} from "../websites/recipe-website/editor/controller/jobs/kinds";

const shoppingKeyOf = (text: string) => shoppingNameOf(text).key;

let next = 0;
/** Ids in insertion order, as ULIDs would sort. */
function item(text: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  next += 1;
  return { id: `01j${String(next).padStart(8, "0")}`, text, ...extra };
}

const SETTINGS: ShoppingSettings = DEFAULT_SHOPPING_SETTINGS;
const quantitiesOff: ShoppingSettings = {
  ...SETTINGS,
  features: { ...SETTINGS.features, quantities: false },
};

/** Roger's flour, the fixture's pancakes and crêpes, and a salt the table leaves alone. */
function list(): ShoppingItem[] {
  return [
    item("2 cups all-purpose flour", {
      recipe: "buttermilk-pancakes",
      recipeName: "Buttermilk Pancakes",
    }),
    item("2 large eggs", {
      recipe: "buttermilk-pancakes",
      recipeName: "Buttermilk Pancakes",
    }),
    item("1 1/2 cups buttermilk", {
      recipe: "buttermilk-pancakes",
      recipeName: "Buttermilk Pancakes",
    }),
    item("1 teaspoon salt", {
      recipe: "buttermilk-pancakes",
      recipeName: "Buttermilk Pancakes",
    }),
    item("1 cup white flour", { recipe: "crepes", recipeName: "Crêpes" }),
    item("2 eggs", { recipe: "crepes", recipeName: "Crêpes" }),
    item("1/2 cup low-fat buttermilk", {
      recipe: "crepes",
      recipeName: "Crêpes",
    }),
    item("1 pinch sea salt", { recipe: "crepes", recipeName: "Crêpes" }),
  ];
}

const FLOUR = ["all purpose flour", "white flour"];
const SALT = ["salt", "sea salt"];
const BUTTERMILK = ["buttermilk", "low fat buttermilk"];
const local = editModels({ RECIPE_LLM_URL: "http://127.0.0.1:9" });

function merged(keys: string[], extra: Partial<ShoppingMerge> = {}) {
  return {
    id: mergeIdOf(keys),
    keys: [...keys].sort(),
    status: "merged" as const,
    decidedAt: "2026-11-21T00:00:00.000Z",
    ...extra,
  };
}

function apart(keys: string[]) {
  return { ...merged(keys), status: "apart" as const };
}

describe("a proposal for any names (proposalForKeys)", () => {
  it("is the list's own merged row for those names: the sum, the line, Da3's shape", () => {
    const items = list();
    const proposal = proposalForKeys(items, SETTINGS, [], FLOUR, {
      reason: "Both are flour",
    });
    expect(proposal).toMatchObject({
      id: mergeIdOf(FLOUR),
      name: "all-purpose flour",
      amount: "3 cups",
      estimated: false,
      line: "3 cups all-purpose flour",
      reason: "Both are flour",
    });
    expect(proposal!.rows.map((row) => row.key)).toEqual(FLOUR);
    expect(proposal!.rows[1].sources[0]).toMatchObject({
      text: "1 cup white flour",
      recipeName: "Crêpes",
    });
  });

  it("takes a name and an amount of its own; under two names on the list is none", () => {
    const items = list();
    expect(
      proposalForKeys(items, SETTINGS, [], FLOUR, {
        name: "plain flour",
        amount: "360 g",
        reason: "",
      }),
    ).toMatchObject({ name: "plain flour", line: "360 g plain flour" });
    expect(
      proposalForKeys(items, SETTINGS, [], ["salt", "kosher salt"], {
        reason: "",
      }),
    ).toBeUndefined();
    expect(
      proposalForKeys(
        items,
        { ...SETTINGS, features: { ...SETTINGS.features, merge: false } },
        [],
        FLOUR,
        { reason: "" },
      ),
    ).toBeUndefined();
  });
});

describe("the revise check (Db1)", () => {
  const items = list();
  const target = {
    id: mergeIdOf(FLOUR),
    keys: FLOUR,
    merged: false,
    rows: proposalRowsFor(items, SETTINGS, FLOUR),
    line: "3 cups all-purpose flour",
  };
  const ask = { items, settings: SETTINGS, merges: [] };
  const merge = (extra: Record<string, unknown> = {}) => ({
    verdict: "merge",
    items: [1, 2],
    name: "all-purpose flour",
    unit: "",
    reason: "Both are flour.",
    ...extra,
  });

  it("a merge with the list's sum sends neither a name nor an amount, only the note", () => {
    const checked = checkReviseAnswer(merge(), target, ask, "take a look");
    expect(checked).toMatchObject({
      status: "merge",
      proposal: { line: "3 cups all-purpose flour" },
      decision: { keys: FLOUR, status: "merged", note: "take a look" },
    });
    if (checked.status !== "merge") throw new Error("not a merge");
    expect(checked).not.toHaveProperty("unit");
    expect(checked.decision).not.toHaveProperty("name");
    expect(checked.decision).not.toHaveProperty("amount");
    /* "" is the list's own name (49c). */
    expect(
      checkReviseAnswer(merge({ name: "" }), target, ask, "x"),
    ).toMatchObject({
      status: "merge",
      proposal: { line: "3 cups all-purpose flour" },
    });
    /* "cup" is the unit the list says already: nothing converted. */
    const cups = checkReviseAnswer(merge({ unit: "cup" }), target, ask, "x");
    expect(cups).toMatchObject({ status: "merge" });
    expect(cups).not.toHaveProperty("unit");
    expect(cups).not.toHaveProperty("decision.amount");
  });

  it("“use grams” (Dc1): the model names the unit, the list does the sum, ≈ for a density", () => {
    const checked = checkReviseAnswer(
      merge({ unit: "g", name: "plain flour" }),
      target,
      ask,
      "use grams, call it plain flour",
    );
    expect(checked).toMatchObject({
      status: "merge",
      unit: "g",
      proposal: {
        line: "≈ 360 g plain flour",
        amount: "≈ 360 g",
        estimated: true,
      },
      decision: {
        keys: FLOUR,
        name: "plain flour",
        amount: "≈ 360 g",
        note: "use grams, call it plain flour",
      },
    });
    expect(checked).not.toHaveProperty("ignored");
    /* "grams" reads as g; pounds through the same density, written as the
     * list writes weight (under a pound, ounces). */
    expect(
      checkReviseAnswer(merge({ unit: "grams" }), target, ask, "x"),
    ).toMatchObject({ proposal: { amount: "≈ 360 g" } });
    expect(
      checkReviseAnswer(merge({ unit: "lb" }), target, ask, "x"),
    ).toMatchObject({ proposal: { amount: "≈ 12¾ oz" } });
  });

  it("an amount the model works out anyway is ignored, and said for the job log", () => {
    const checked = checkReviseAnswer(
      merge({
        unit: "990.75 g",
        name: "≈ 990.75 g all-purpose flour",
        amount: "≈ 990.75 g",
        estimated: false,
      }),
      target,
      ask,
      "use grams",
    );
    expect(checked).toMatchObject({
      status: "merge",
      unit: "g",
      proposal: { line: "≈ 360 g all-purpose flour" },
      decision: { amount: "≈ 360 g" },
    });
    if (checked.status !== "merge") throw new Error("not a merge");
    expect(checked.decision).not.toHaveProperty("name");
    expect(checked.ignored).toEqual([
      "the model gave an amount (“≈ 990.75 g”); the list works amounts out itself",
      "the model put an amount in the name (“≈ 990.75 g”); the list works amounts out itself",
      "the model gave “990.75 g” for the unit; only the unit is used",
    ]);
    /* "00 flour" has no unit after its number: a name, kept whole. */
    expect(
      checkReviseAnswer(merge({ name: "00 flour" }), target, ask, "x"),
    ).toMatchObject({ decision: { name: "00 flour" } });
  });

  it("a unit the lines can't be given in is said plainly, as no model's fault", () => {
    const garlic = [
      item("2 cloves garlic", { recipe: "a", recipeName: "A" }),
      item("3 garlic cloves", { recipe: "b", recipeName: "B" }),
    ];
    const keys = ["garlic", "garlic clove"];
    const asked = {
      id: mergeIdOf(keys),
      keys,
      merged: false,
      rows: proposalRowsFor(garlic, SETTINGS, keys),
      line: "5 cloves garlic",
    };
    expect(
      checkReviseAnswer(
        merge({ unit: "g", name: "" }),
        asked,
        { items: garlic, settings: SETTINGS, merges: [] },
        "use grams",
      ),
    ).toEqual({
      status: "refused",
      cannotConvert: true,
      problem:
        "the list can't give garlic in grams: 5 cloves is a count, not a weight or a volume",
    });
    /* Cups of a name with no density on file: no grams either. */
    const nuts = [item("1 cup walnuts"), item("1/2 cup walnut halves")];
    const walnut = ["walnut", "walnut half"];
    expect(
      checkReviseAnswer(
        merge({ unit: "g", name: "" }),
        {
          id: mergeIdOf(walnut),
          keys: walnut,
          merged: false,
          rows: proposalRowsFor(nuts, SETTINGS, walnut),
          line: "1½ cups walnuts",
        },
        { items: nuts, settings: SETTINGS, merges: [] },
        "use grams",
      ),
    ).toMatchObject({
      status: "refused",
      cannotConvert: true,
      problem:
        "the list can't give walnut in grams: it has no weight for a cup of walnut on file, so 1½ cups can't be converted",
    });
    expect(
      checkReviseAnswer(merge({ unit: "pinch" }), target, ask, "x"),
    ).toMatchObject({
      status: "refused",
      problem:
        "it asked for “pinch”, which is not a unit the list can give an amount in",
    });
  });

  it("refuses an item that was not asked about and a name that is too long", () => {
    expect(
      checkReviseAnswer(merge({ items: [1, 9] }), target, ask, "x"),
    ).toEqual({
      status: "refused",
      problem: "it names item 9, which is not one of the 2 lines asked about",
    });
    expect(
      checkReviseAnswer(merge({ items: [1] }), target, ask, "x"),
    ).toMatchObject({
      status: "refused",
      problem: "a merge needs two or more of the lines asked about",
    });
    expect(
      checkReviseAnswer(merge({ name: "x".repeat(121) }), target, ask, "x"),
    ).toEqual({
      status: "refused",
      problem: "the name is over 120 characters",
    });
    expect(checkReviseAnswer("yes", target, ask, "x")).toMatchObject({
      status: "refused",
    });
    expect(
      checkReviseAnswer({ verdict: "maybe" }, target, ask, "x"),
    ).toMatchObject({
      status: "refused",
      problem: "it answered neither “merge” nor “apart”",
    });
    expect(readableAmount("2 cups")).toBe(true);
    expect(readableAmount("≈ 450 g")).toBe(true);
    expect(readableAmount("some")).toBe(false);
  });

  it("a unit with quantities off is not the model's to set", () => {
    const checked = checkReviseAnswer(
      merge({ unit: "g" }),
      { ...target, rows: proposalRowsFor(items, quantitiesOff, FLOUR) },
      { ...ask, settings: quantitiesOff },
      "x",
    );
    expect(checked).toMatchObject({ status: "merge" });
    expect(checked).not.toHaveProperty("unit");
    expect(checked).not.toHaveProperty("decision.amount");
  });

  it("“apart”: the asked names kept apart, with the note; a merged row's is replaced in place", () => {
    expect(
      checkReviseAnswer(
        { verdict: "apart", items: [], reason: "One is salted." },
        target,
        ask,
        "these are different",
      ),
    ).toEqual({
      status: "apart",
      reason: "One is salted.",
      decision: {
        keys: FLOUR,
        status: "apart",
        note: "these are different",
      },
    });
  });

  it("a merged row the model narrows replaces its decision; the narrower merge is not absorbed back", () => {
    const three = [...items, item("1 cup unbleached flour")];
    const keys = ["all purpose flour", "unbleached flour", "white flour"];
    const decision = merged(keys, { name: "flour" });
    const row = {
      id: decision.id,
      keys,
      merged: true,
      rows: proposalRowsFor(three, SETTINGS, keys),
      line: "4 cups flour",
    };
    const checked = checkReviseAnswer(
      merge({ items: [1, 2], name: "all-purpose flour" }),
      row,
      { items: three, settings: SETTINGS, merges: [decision] },
      "only these two",
    );
    expect(checked).toMatchObject({
      status: "merge",
      proposal: { line: "3 cups all-purpose flour" },
      decision: {
        keys: FLOUR,
        status: "merged",
        name: "all-purpose flour",
        note: "only these two",
        replaces: decision.id,
      },
    });
    /* Kept apart: the same names, so the same id — no `replaces` needed. */
    const kept = checkReviseAnswer(
      { verdict: "apart" },
      row,
      { items: three, settings: SETTINGS, merges: [decision] },
      "no",
    );
    expect(kept).toMatchObject({ status: "apart", decision: { keys } });
    if (kept.status === "apart") {
      expect(kept.decision).not.toHaveProperty("replaces");
    }
  });
});

describe("the find check (Db2)", () => {
  const items = list();
  const names = proposalRowsFor(items, SETTINGS, [
    "egg",
    "buttermilk",
    "low fat buttermilk",
    "salt",
    "sea salt",
  ]);
  const ask = { items, settings: SETTINGS, merges: [] as ShoppingMerge[] };
  const at = (key: string) => names.findIndex((row) => row.key === key) + 1;

  it("keeps a good group as a proposal in Da3's shape, its name when new", () => {
    const checked = checkFindAnswer(
      {
        groups: [
          {
            items: [at("buttermilk"), at("low fat buttermilk")],
            name: "buttermilk",
            reason: "Both are buttermilk.",
          },
        ],
      },
      names,
      ask,
    );
    expect(checked).toMatchObject({ status: "found", dropped: [] });
    if (checked.status !== "found") throw new Error("not found");
    expect(checked.proposals).toHaveLength(1);
    expect(checked.proposals[0]).toMatchObject({
      proposal: {
        id: mergeIdOf(BUTTERMILK),
        reason: "Both are buttermilk.",
        line: "2 cups buttermilk",
      },
      decision: { keys: BUTTERMILK, status: "merged" },
    });
    expect(checked.proposals[0].decision).not.toHaveProperty("name");
    expect(checked.proposals[0].proposal.rows).toHaveLength(2);
  });

  it("drops unknown items, groups under two, a number twice, and anything decided or proposed", () => {
    const checked = checkFindAnswer(
      {
        groups: [
          { items: [at("egg"), 42], name: "eggs", reason: "" },
          {
            items: [at("buttermilk"), at("low fat buttermilk")],
            name: "buttermilk",
            reason: "",
          },
          {
            items: [at("low fat buttermilk"), at("egg")],
            name: "x",
            reason: "",
          },
          { items: [at("egg"), at("salt")], name: " ", reason: "" },
          { items: [at("egg"), "3"], name: "egg", reason: "" },
        ],
      },
      names,
      ask,
    );
    expect(checked).toMatchObject({
      status: "found",
      dropped: [
        "group 1: item 42 is not one of the 5 names",
        "group 1: fewer than two names",
        "group 3: fewer than two names",
        "group 4: no name",
        'group 5: item "3" is not one of the 5 names',
        "group 5: fewer than two names",
      ],
    });
    if (checked.status !== "found") throw new Error("not found");
    expect(checked.proposals.map((each) => each.decision.keys)).toEqual([
      BUTTERMILK,
    ]);

    const group = {
      items: [at("buttermilk"), at("low fat buttermilk")],
      name: "buttermilk",
    };
    expect(
      checkFindAnswer({ groups: [group] }, names, {
        ...ask,
        merges: [apart(BUTTERMILK)],
      }),
    ).toMatchObject({
      proposals: [],
      dropped: [
        "group 1 (buttermilk + low fat buttermilk): kept apart already",
      ],
    });
    expect(
      checkFindAnswer({ groups: [group] }, names, ask, [BUTTERMILK]),
    ).toMatchObject({
      proposals: [],
      dropped: ["group 1 (buttermilk + low fat buttermilk): already proposed"],
    });
    /* A kept-apart pair inside a bigger group: its Merge would undo it. */
    expect(
      checkFindAnswer(
        {
          groups: [
            {
              items: [at("buttermilk"), at("salt"), at("sea salt")],
              name: "x",
            },
          ],
        },
        names,
        { ...ask, merges: [apart(SALT)] },
      ),
    ).toMatchObject({
      proposals: [],
      dropped: ["group 1 (buttermilk + salt + sea salt): kept apart already"],
    });
    expect(checkFindAnswer({ found: [] }, names, ask)).toMatchObject({
      status: "refused",
    });
  });
});

describe("49c: the stricter find check (Dc3)", () => {
  /*
   * The list of 49b's real check: what qwen3:8b grouped, thinking off, on
   * the scratch clone's six recipes and pumpkin bars (find2.json).
   */
  const lines = [
    "1 1/2 teaspoons baking powder",
    "1 teaspoon baking soda",
    "1 teaspoon salt",
    "1 teaspoon kosher salt",
    "1 tablespoon olive oil",
    "1 tablespoon butter",
    "1 1/2 teaspoons ground cinnamon",
    "2 teaspoons pumpkin pie spice",
    "1 cup packed light brown sugar",
    "1/3 cup granulated sugar",
    "1/2 cup unsalted butter",
    "1/2 cup salted butter",
    "1 cup powdered sugar",
    "2 tablespoons coarse sugar",
    "1 teaspoon cumin",
    "1/2 teaspoon black pepper",
    "1 teaspoon garlic powder",
    "1/4 teaspoon nutmeg",
    "1/4 cup salted caramel sauce",
    "1 teaspoon lemon zest",
    "1/2 cup taco sauce",
    "1 tablespoon capers",
    "2 tablespoons parsley",
    "1 onion",
    "1 1/2 lb yukon gold potatoes",
    "2 apples",
    "1 cup buttermilk",
    "1/2 cup low-fat buttermilk",
    "1 jalapeño",
    "1 jalapeño pepper",
    "1 red bell pepper",
    "1 bell pepper",
    "1 teaspoon fine sea salt",
    "1/2 teaspoon flaky sea salt",
  ];
  const items = lines.map((text) => item(text));
  const names = proposalRowsFor(
    items,
    SETTINGS,
    items.map((each) => shoppingKeyOf(each.text)),
  );
  const ask = { items, settings: SETTINGS, merges: [] as ShoppingMerge[] };
  const at = (key: string) => {
    const index = names.findIndex((row) => row.key === key);
    if (index < 0) throw new Error(`no row ${key}`);
    return index + 1;
  };
  const one = (keys: string[], name: string) =>
    checkFindAnswer(
      { groups: [{ items: keys.map(at), name, reason: "" }] },
      names,
      ask,
    );

  it("leaves out every nonsense group of the real check, each with a reason", () => {
    const cases: [string[], string, string][] = [
      [
        ["baking powder", "baking soda"],
        "leavening agents",
        "baking powder and baking soda are different things to buy (leavening)",
      ],
      [
        ["olive oil", "butter"],
        "oil",
        "butter and olive oil are different things to buy (a fat and an oil)",
      ],
      [
        ["salt", "kosher salt"],
        "salt",
        "kosher salt and salt are different things to buy (salt)",
      ],
      [
        ["unsalted butter", "salted butter"],
        "butter",
        "salted butter and unsalted butter are different things to buy (butter)",
      ],
      [
        ["light brown sugar", "granulated sugar"],
        "sugar",
        "granulated sugar and light brown sugar are different things to buy (sugar)",
      ],
      [
        ["cinnamon", "pumpkin pie spice"],
        "spices",
        "cinnamon and pumpkin pie spice are different things to buy (a spice and a blend)",
      ],
      [
        ["powdered sugar", "coarse sugar"],
        "powdered sugar",
        "coarse sugar and powdered sugar are different things to buy (sugar)",
      ],
    ];
    for (const [group, name, why] of cases) {
      const words = [...group].sort().join(" + ");
      expect(one(group, name), words).toMatchObject({
        status: "found",
        proposals: [],
        dropped: [`group 1 (${words}): ${why}`],
      });
    }
  });

  it("leaves out groups over 3, names that share no word, and a category or stranger for a name", () => {
    const numbers = (name: string, count: number) =>
      checkFindAnswer(
        {
          groups: [
            {
              items: Array.from({ length: count }, (_, index) => index + 1),
              name,
              reason: "",
            },
          ],
        },
        names,
        ask,
      );
    expect(numbers("spices and seasonings", 6)).toMatchObject({
      proposals: [],
      dropped: ["group 1: 6 names — a group is a pair, or 3 at most"],
    });
    expect(numbers("ingredients for dishes", 8)).toMatchObject({
      dropped: ["group 1: 8 names — a group is a pair, or 3 at most"],
    });
    expect(one(["taco sauce", "lemon zest"], "taco sauce")).toMatchObject({
      dropped: [
        "group 1 (lemon zest + taco sauce): lemon zest and taco sauce share no word, so they are not one product",
      ],
    });
    /* Bell peppers share only "pepper", which names different things. */
    expect(one(["jalapeno pepper", "red bell pepper"], "pepper")).toMatchObject(
      {
        dropped: [
          "group 1 (jalapeno pepper + red bell pepper): jalapeno pepper and red bell pepper share no word, so they are not one product",
        ],
      },
    );
    expect(
      one(["fine sea salt", "flaky sea salt"], "sea salt seasoning"),
    ).toMatchObject({
      dropped: [
        "group 1 (fine sea salt + flaky sea salt): “sea salt seasoning” is a category, not the name of one of them",
      ],
    });
    expect(one(["fine sea salt", "flaky sea salt"], "sea salt")).toMatchObject({
      dropped: [
        "group 1 (fine sea salt + flaky sea salt): “sea salt” is not the name of one of them",
      ],
    });
  });

  it("keeps the same product under two names: a word in front, a kind of its head", () => {
    for (const [group, name] of [
      [["buttermilk", "low fat buttermilk"], "buttermilk"],
      [["jalapeno", "jalapeno pepper"], "jalapeño"],
      [["bell pepper", "red bell pepper"], "red bell peppers"],
      [["fine sea salt", "flaky sea salt"], "flaky sea salt"],
    ] as [string[], string][]) {
      const checked = one(group, name);
      expect(checked, group.join(" + ")).toMatchObject({
        status: "found",
        dropped: [],
      });
      if (checked.status === "found") {
        expect(checked.proposals).toHaveLength(1);
      }
    }
  });

  it("scallions and green onions: 43n's synonyms make them one name, so the list has one row", () => {
    const onions = [item("2 scallions"), item("1/4 cup green onions")];
    expect(shoppingKeyOf("2 scallions")).toBe(shoppingKeyOf("green onions"));
    expect(
      proposalRowsFor(onions, SETTINGS, ["green onion"]).map(
        (row) => row.sources.length,
      ),
    ).toEqual([2]);
  });

  it("the table never proposes a known-different pair, and reads the same list", () => {
    for (const set of SHOPPING_EQUIVALENTS) {
      expect(knownDifferentPair(set.members), set.key).toBeUndefined();
    }
    expect(knownDifferent("kosher salt", "coarse kosher salt")).toBeUndefined();
    expect(knownDifferent("olive oil", "extra virgin olive oil")?.what).toBe(
      "olive oil",
    );
    expect(knownDifferent("butter", "canola oil")?.what).toBe(
      "a fat and an oil",
    );
    expect(knownDifferent("garlic", "garlic powder")?.what).toBe("garlic");
  });
});

describe("49c: an amount in the asked-for unit (Dc1)", () => {
  it("7¼ cups and 3 tbsp of flour in grams: ≈ 890 g, estimated", () => {
    const flour = [
      item("7 1/4 cups all-purpose flour"),
      item("3 tablespoons flour"),
    ];
    expect(
      mergedAmountInUnit(flour, ["all purpose flour", "flour"], "g"),
    ).toEqual({ ok: true, text: "890 g", estimated: true, unchanged: false });
  });

  it("rounds as a cook writes it, converts US and metric exactly, and says what it can't", () => {
    expect(roundMetric(7.4, "g", "kg")).toBe("7 g");
    expect(roundMetric(43, "g", "kg")).toBe("45 g");
    expect(roundMetric(892.5, "g", "kg")).toBe("890 g");
    expect(roundMetric(1_234, "g", "kg")).toBe("1.2 kg");
    const lb = {
      parts: [{ qty: 2, unit: "lb", family: "us-weight" as const }],
    };
    expect(amountInUnit(lb, "g")).toEqual({
      ok: true,
      text: "910 g",
      estimated: false,
      unchanged: false,
    });
    expect(amountInUnit(lb, "oz")).toMatchObject({ ok: true, unchanged: true });
    const cups = {
      parts: [{ qty: 2, unit: "cup", family: "us-volume" as const }],
    };
    expect(amountInUnit(cups, "ml")).toMatchObject({ text: "475 ml" });
    expect(amountInUnit(cups, "g")).toEqual({
      ok: false,
      why: "density",
      part: "2 cups",
    });
    expect(amountInUnit(cups, "g", 200)).toMatchObject({
      text: "400 g",
      estimated: true,
    });
    expect(
      amountInUnit(
        { parts: [{ qty: 3, unit: "", family: "count" as const }] },
        "g",
        120,
      ),
    ).toEqual({ ok: false, why: "count", part: "3" });
    expect(amountInUnit({ parts: [] }, "g")).toEqual({
      ok: false,
      why: "none",
    });
  });
});

describe("the spec and the prompts", () => {
  it("find: names still to buy, condensed, with nothing merged, proposed or ticked", () => {
    const items = [...list(), item("1 cup sugar", { checked: true })];
    const spec = shoppingAskSpecOf(
      { items, settings: SETTINGS, merges: [apart(SALT)] },
      { task: "find" },
      local,
    );
    /* The flours are the table's proposal: left out. The ticked sugar too.
     * Sorted by last word (Dc4), so a chunk keeps the buttermilks together. */
    expect(spec.names?.map((row) => row.key)).toEqual([
      "buttermilk",
      "low fat buttermilk",
      "egg",
      "salt",
      "sea salt",
    ]);
    expect(spec.proposed).toEqual([FLOUR]);
    expect(spec.backend).toBe("local");
    const { system, user } = shoppingAskPrompt(spec);
    expect(system).toBe(FIND_SYSTEM_PROMPT);
    expect(user).toBe(
      [
        "Names:",
        "1. buttermilk — 1½ cups",
        "2. low fat buttermilk — ½ cup",
        "3. egg — 4",
        "4. salt — 1 tsp",
        "5. sea salt",
        "",
        "Kept apart already (do not group again): 4+5",
      ].join("\n"),
    );
    /* No recipe, no line as written: a small model's prompt. */
    expect(user).not.toContain("Pancakes");
    /* The fixture list's size, for the Results. */
    expect(estimateTokens(system) + estimateTokens(user)).toBeLessThan(400);
  });

  it("find with a merged row: its names stay out; with no decided pairs, no kept-apart line", () => {
    const items = list();
    const spec = shoppingAskSpecOf(
      { items, settings: SETTINGS, merges: [merged(FLOUR)] },
      { task: "find" },
      local,
    );
    expect(spec.names?.map((row) => row.key)).toEqual([
      "buttermilk",
      "low fat buttermilk",
      "egg",
      "salt",
      "sea salt",
    ]);
    expect(spec.proposed).toEqual([]);
    expect(findUserPrompt(spec.names!, spec.merges)).not.toContain(
      "Kept apart",
    );
  });

  it("revise: the proposal's rows with their lines and recipes, the list's line, the note", () => {
    const items = list();
    const spec = shoppingAskSpecOf(
      { items, settings: SETTINGS, merges: [] },
      { task: "revise", id: mergeIdOf(FLOUR), note: "use grams" },
      local,
    );
    expect(spec.target).toMatchObject({
      id: mergeIdOf(FLOUR),
      keys: FLOUR,
      merged: false,
      line: "3 cups all-purpose flour",
    });
    /* Only the asked names' lines travel in the spec. */
    expect(spec.items.map((each) => each.text)).toEqual([
      "2 cups all-purpose flour",
      "1 cup white flour",
    ]);
    const { system, user } = shoppingAskPrompt(spec);
    expect(system).toBe(REVISE_SYSTEM_PROMPT);
    expect(user).toBe(reviseUserPrompt(spec.target!, "use grams"));
    expect(user).toBe(
      [
        "Rows:",
        "1. all purpose flour — 2 cups: 2 cups all-purpose flour (Buttermilk Pancakes)",
        "2. white flour — 1 cup: 1 cup white flour (Crêpes)",
        "",
        "As one row it would be: 3 cups all-purpose flour",
        "",
        "Note: use grams",
      ].join("\n"),
    );
  });

  it("refuses what it can't ask: no note, no such id, one name, merge off, no model", () => {
    const items = list();
    const read = { items, settings: SETTINGS, merges: [] };
    expect(() =>
      shoppingAskSpecOf(
        read,
        { task: "revise", id: mergeIdOf(FLOUR), note: " " },
        local,
      ),
    ).toThrow("Type a note");
    expect(() =>
      shoppingAskSpecOf(
        read,
        { task: "revise", id: "0123456789abcdef", note: "x" },
        local,
      ),
    ).toThrow('No proposal or merge "0123456789abcdef"');
    expect(() =>
      shoppingAskSpecOf(
        read,
        { task: "revise", keys: ["salt", "kosher salt"], note: "x" },
        local,
      ),
    ).toThrow("Two or more of these names");
    expect(() =>
      shoppingAskSpecOf(
        {
          ...read,
          settings: {
            ...SETTINGS,
            features: { ...SETTINGS.features, merge: false },
          },
        },
        { task: "find" },
        local,
      ),
    ).toThrow("Merge is switched off");
    expect(() => shoppingAskSpecOf(read, { task: "find" }, {})).toThrow(
      "no model is set up",
    );
  });
});

describe("a found proposal still open (stillOpen)", () => {
  const items = list();
  const found: ShoppingModelProposal = {
    proposal: proposalForKeys(items, SETTINGS, [], SALT, { reason: "" })!,
    decision: { keys: SALT, status: "merged" },
  };
  it("goes once a decision covers its names or the table proposes them", () => {
    expect(stillOpen(found, [], [])).toBe(true);
    expect(stillOpen(found, [merged(["salt", "kosher salt"])], [])).toBe(false);
    expect(stillOpen(found, [apart(SALT)], [])).toBe(false);
    expect(stillOpen(found, [apart(["salt", "pepper"])], [])).toBe(true);
    expect(stillOpen(found, [], [found.proposal])).toBe(false);
  });
});

describe("the shopping-merge job", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubModel(answer: unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
        return new Response(
          JSON.stringify({
            model: "qwen3:8b",
            message: {
              role: "assistant",
              content:
                typeof answer === "string" ? answer : JSON.stringify(answer),
            },
            done: true,
            prompt_eval_count: 300,
            eval_count: 40,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    return calls;
  }

  const revise = (): ShoppingAskSpec =>
    shoppingAskSpecOf(
      { items: list(), settings: SETTINGS, merges: [] },
      { task: "revise", id: mergeIdOf(FLOUR), note: "use grams" },
      local,
    );

  it("asks once, with a JSON schema and no tools, and answers a marked suggestion", async () => {
    const calls = stubModel({
      verdict: "merge",
      items: [1, 2],
      name: "",
      unit: "g",
      reason: "Flour by weight.",
    });
    const result = await runShoppingAsk(revise(), { models: local });
    expect(calls).toHaveLength(1);
    const body = calls[0].body as {
      messages: { role: string; content: string }[];
      format: { required?: string[] };
      tools?: unknown;
      think?: boolean;
    };
    expect(body.format.required).toContain("verdict");
    expect(body.tools).toBeUndefined();
    expect(body.think).toBe(true);
    expect(body.messages[0].content).toBe(REVISE_SYSTEM_PROMPT);
    expect(body.messages[1].content).toMatch(/Note: use grams$/);
    expect(result).toMatchObject({
      task: "revise",
      status: "merge",
      note: "use grams",
      model: "local model qwen3:8b",
      backend: "local",
      promptTokens: 300,
      outputTokens: 40,
      proposal: { line: "≈ 360 g all-purpose flour" },
      decision: { keys: FLOUR, amount: "≈ 360 g", note: "use grams" },
    });
    expect(isShoppingAskResult(result)).toBe(true);
  });

  it("a refused answer says why; an answer that is not JSON is a failure; no model asks nothing", async () => {
    stubModel({
      verdict: "merge",
      items: [1, 7],
      name: "flour",
      unit: "",
      reason: "",
    });
    expect(await runShoppingAsk(revise(), { models: local })).toMatchObject({
      status: "refused",
      problem: "it names item 7, which is not one of the 2 lines asked about",
    });
    stubModel("Sure! Merge them.");
    expect(await runShoppingAsk(revise(), { models: local })).toMatchObject({
      status: "failed",
      problem: expect.stringContaining("local model qwen3:8b failed"),
    });
    const calls = stubModel({});
    expect(await runShoppingAsk(revise(), { models: {} })).toMatchObject({
      status: "failed",
      problem: expect.stringContaining("no model is set up"),
    });
    expect(calls).toHaveLength(0);
  });

  it("find: the names, and the model's groups checked into proposals", async () => {
    const spec = shoppingAskSpecOf(
      { items: list(), settings: SETTINGS, merges: [] },
      { task: "find" },
      local,
    );
    const calls = stubModel({
      groups: [
        { items: [1, 2], name: "buttermilk", reason: "Both are buttermilk." },
        { items: [4, 5], name: "salt", reason: "Both are salt." },
      ],
    });
    const result = await runShoppingAsk(spec, { models: local });
    expect(calls).toHaveLength(1);
    expect((calls[0].body.messages as { content: string }[])[0].content).toBe(
      FIND_SYSTEM_PROMPT,
    );
    /* Dc4: a find never thinks. */
    expect(calls[0].body.think).toBeUndefined();
    expect(result).toMatchObject({
      task: "find",
      status: "found",
      names: 5,
      dropped: [
        "group 2 (salt + sea salt): salt and sea salt are different things to buy (salt)",
      ],
      proposals: [{ decision: { keys: BUTTERMILK } }],
    });
  });

  it("asks for a num_ctx that holds the prompt, the answer and the thinking (Dc2)", async () => {
    const spec = revise();
    const calls = stubModel({
      verdict: "merge",
      items: [1, 2],
      name: "",
      unit: "",
      reason: "",
    });
    await runShoppingAsk(spec, { models: local });
    const [call] = shoppingAskCalls(spec);
    const needed =
      estimateTokens(call.system) +
      estimateTokens(call.user) +
      256 +
      SHOPPING_THINK_TOKENS;
    const numCtx = (calls[0].body.options as { num_ctx: number }).num_ctx;
    expect(numCtx).toBeGreaterThanOrEqual(needed);
    /* 49b's real ask: 458 prompt + 4,754 out did not fit 4,096. */
    expect(numCtx).toBeGreaterThanOrEqual(458 + 4_754);
    expect(shoppingAskContext(spec, call, true)).toBe(numCtx);
    /* Thinking off, a find's: its prompt and every group it may answer. */
    const find = shoppingAskSpecOf(
      { items: list(), settings: SETTINGS, merges: [] },
      { task: "find" },
      local,
    );
    const [first] = shoppingAskCalls(find);
    expect(shoppingAskContext(find, first, false)).toBeGreaterThanOrEqual(
      estimateTokens(first.system) +
        estimateTokens(first.user) +
        64 +
        24 * first.names!,
    );
    /* RECIPE_LLM_EDIT_THINK=0 turns a revise's thinking off; a find never has it. */
    const ollama = { api: "ollama" } as Parameters<typeof shoppingAskThinks>[1];
    expect(shoppingAskThinks(spec, ollama, {})).toBe(true);
    expect(
      shoppingAskThinks(spec, ollama, { RECIPE_LLM_EDIT_THINK: "0" }),
    ).toBe(false);
    expect(shoppingAskThinks(find, ollama, {})).toBe(false);
  });

  it("a long find asks in chunks of names sorted by last word, numbered as the whole list", async () => {
    const many = Array.from({ length: 23 }, (_, index) => [
      item(`1 cup ${String.fromCharCode(97 + index)}rye flour`),
      item(`1 cup ${String.fromCharCode(97 + index)}rye meal`),
    ]).flat();
    const spec = shoppingAskSpecOf(
      { items: many, settings: SETTINGS, merges: [] },
      { task: "find" },
      local,
    );
    expect(spec.names).toHaveLength(46);
    const chunks = shoppingAskCalls(spec);
    expect(chunks.map((call) => [call.first, call.names])).toEqual([
      [1, 23],
      [24, 23],
    ]);
    expect(chunks[1].user.split("\n")[1]).toMatch(/^24\. /);
    /* The flours sort together, then the meals. */
    expect(spec.names![0].key).toMatch(/flour$/);
    expect(spec.names![45].key).toMatch(/meal$/);
    /* A number from the other chunk is unknown to this one. */
    const calls = stubModel({
      groups: [{ items: [1, 30], name: "arye flour", reason: "" }],
    });
    const result = await runShoppingAsk(spec, { models: local });
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ status: "found", proposals: [] });
    if (result.status !== "found") throw new Error("not found");
    expect(result.dropped).toContain(
      'group 1: item "30" is not one of the 46 names',
    );
  });

  it("is listed with its note, and takes the GPU's line only for a local model", () => {
    const spec = revise();
    expect(jobLabel(spec)).toBe(
      'ask about all purpose flour + white flour: "use grams"',
    );
    expect(jobResources(spec)).toEqual(["gpu"]);
    expect(jobResources({ ...spec, backend: "claude" })).toEqual([]);
    expect(
      jobLabel(
        shoppingAskSpecOf(
          { items: list(), settings: SETTINGS, merges: [] },
          { task: "find" },
          local,
        ),
      ),
    ).toBe("look for more merges on the shopping list");
  });
});
