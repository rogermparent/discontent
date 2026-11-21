// Epic 50, 50a: the shopping list as layers — base → rules → layers — and
// the deterministic fixes found on Roger's real list (54 items: The Best
// Pumpkin Bars, Pear Panna Cotta Cake, Maine Potato Doughnuts). Pure.

import { describe, expect, it } from "vitest";

import {
  formatAmount,
  parseAmount,
} from "recipe-website-common/util/ingredientAmount";
import {
  BUILT_IN_LEAVE_OFF,
  canonicalShoppingLayer,
  isStaleLayer,
  leaveOffVerdicts,
  parseShoppingLayer,
  parseShoppingRule,
  ruleIdOf,
  type ShoppingLayer,
  type ShoppingLayerOp,
  type ShoppingRule,
} from "recipe-website-common/util/shoppingLayers";
import {
  listLayers,
  promptRowsOf,
} from "recipe-website-common/util/shoppingChanges";
import { mergeIdOf } from "recipe-website-common/util/shoppingMerges";
import {
  DEFAULT_SHOPPING_SETTINGS,
  type ShoppingFeatures,
  type ShoppingItem,
  type ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";
import {
  buildShoppingView,
  formatShoppingText,
  shoppingNameOf,
  type ShoppingRow,
  type ShoppingView,
} from "recipe-website-common/util/shoppingView";

let next = 0;
function item(text: string, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  next += 1;
  return { id: `01j${String(next).padStart(8, "0")}`, text, ...extra };
}

let layerCount = 0;
function layer(
  ops: ShoppingLayerOp[],
  extra: Partial<ShoppingLayer> = {},
): ShoppingLayer {
  layerCount += 1;
  return {
    id: `01kaaaaaaaaaaaaaaaaaaaaa${String(layerCount).padStart(2, "0")}`,
    ops,
    by: { kind: "you" },
    at: "2026-11-21T00:00:00.000Z",
    on: true,
    ...extra,
  };
}

function settings(features: Partial<ShoppingFeatures> = {}): ShoppingSettings {
  return {
    ...DEFAULT_SHOPPING_SETTINGS,
    features: { ...DEFAULT_SHOPPING_SETTINGS.features, ...features },
  };
}

function rows(view: ShoppingView): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.checked,
  ];
}

function labels(view: ShoppingView): string[] {
  return rows(view).map((row) => row.label);
}

function compose(
  items: ShoppingItem[],
  layers: ShoppingLayer[] = [],
  rules: ShoppingRule[] = [],
  features: Partial<ShoppingFeatures> = {},
) {
  return buildShoppingView(items, settings(features), [], [], [], {
    layers,
    rules,
  });
}

describe("the composition: base → rules → layers (Da4, Da5)", () => {
  it("without a compose, the view is the base and has nothing left off", () => {
    const items = [item("2 cups water"), item("1 cup flour")];
    const view = buildShoppingView(items, settings());
    expect(labels(view)).toEqual(["2 cups water", "1 cup flour"]);
    expect(view.leftOff).toEqual([]);
    expect(view.counts.leftOff).toBeUndefined();
    expect(rows(view).every((row) => row.changes === undefined)).toBe(true);
  });

  it("leaves water off, built in, with its reason, and a rule brings it back", () => {
    const items = [
      item("1/4 cup (60 g) cold water"),
      item("20 g cold water"),
      item("1 cup flour"),
    ];
    const view = compose(items);
    expect(labels(view)).toEqual(["1 cup flour"]);
    expect(view.leftOff).toHaveLength(1);
    expect(view.leftOff[0]).toMatchObject({
      reason: "tap water",
      source: "built-in",
      key: "water",
    });
    expect(view.leftOff[0].row.ids).toHaveLength(2);
    expect(view.counts.leftOff).toBe(1);
    /* Not in the copy text: Shop and the text are the composed list. */
    expect(formatShoppingText(view)).not.toContain("water");

    const restored: ShoppingRule = {
      id: ruleIdOf("leave-off", "water"),
      kind: "leave-off",
      key: "water",
      leaveOff: false,
      decidedAt: "",
    };
    const back = compose(items, [], [restored]);
    expect(labels(back)).toContain("≈ 130 g water");
    expect(back.leftOff).toEqual([]);
  });

  it("a leave-off rule takes a name off every list, with its reason", () => {
    const items = [item("1 cup ice"), item("1 lime")];
    const rule: ShoppingRule = {
      id: ruleIdOf("leave-off", "ice"),
      kind: "leave-off",
      key: "ice",
      leaveOff: true,
      reason: "the freezer makes it",
      decidedAt: "",
    };
    const view = compose(items, [], [rule]);
    expect(labels(view)).toEqual(["1 lime"]);
    expect(view.leftOff[0]).toMatchObject({
      reason: "the freezer makes it",
      source: "rule",
      id: rule.id,
    });
  });

  it("applies layers in id order, whatever order they come in", () => {
    const vanilla = item("1 tsp vanilla extract");
    const first = layer([{ op: "rename", ids: [vanilla.id], name: "vanilla" }]);
    const second = layer([
      { op: "rename", ids: [vanilla.id], name: "Mexican vanilla" },
    ]);
    const view = compose([vanilla], [second, first]);
    expect(labels(view)).toEqual(["1 tsp Mexican vanilla"]);
    expect(rows(view)[0].changes?.map((change) => change.text)).toEqual([
      "renamed to vanilla",
      "renamed to Mexican vanilla",
    ]);
  });

  it("a layer turned off applies nothing, and its file is kept to turn back on", () => {
    const vanilla = item("1 tsp vanilla extract");
    const off = layer([{ op: "rename", ids: [vanilla.id], name: "vanilla" }], {
      on: false,
    });
    const view = compose([vanilla], [off]);
    expect(labels(view)).toEqual(["1 tsp vanilla extract"]);
    expect(rows(view)[0].changes).toBeUndefined();
  });

  it("a layer whose items are all gone is stale and applies nothing", () => {
    const egg = item("2 eggs");
    const stale = layer([{ op: "rename", ids: ["01jgone00001"], name: "x" }]);
    expect(isStaleLayer(stale, new Set([egg.id]))).toBe(true);
    expect(isStaleLayer(stale, new Set(["01jgone00001"]))).toBe(false);
    const view = compose([egg], [stale]);
    expect(labels(view)).toEqual(["2 eggs"]);
    const [listing] = listLayers([stale], [egg]);
    expect(listing.stale).toBe(true);
    expect(listing.text).toBe("Rename lines no longer on the list to x");
  });

  it("an op applies to whatever ids remain", () => {
    const egg = item("2 eggs");
    const renamed = layer([
      { op: "rename", ids: ["01jgone00002", egg.id], name: "hen eggs" },
    ]);
    expect(labels(compose([egg], [renamed]))).toEqual(["2 hen eggs"]);
  });

  it("merges rows by item id, sums them, and a later rename of one of its ids reaches the merged row", () => {
    const cinnamon = item("1 1/2 teaspoons ground cinnamon", {
      recipe: "bars",
      recipeName: "Pumpkin Bars",
    });
    const sugar = item("1/3 cup granulated sugar", { recipeName: "Bars" });
    const flour = item("1 cup flour");
    const merge = layer(
      [{ op: "merge", ids: [cinnamon.id, sugar.id], name: "cinnamon sugar" }],
      { reason: "make it from what you are buying" },
    );
    const rename = layer([
      { op: "rename", ids: [sugar.id], name: "homemade cinnamon sugar" },
    ]);
    const view = compose([cinnamon, sugar, flour], [merge, rename]);
    const merged = rows(view).find((row) => row.ids.includes(cinnamon.id))!;
    expect(merged.ids).toEqual([cinnamon.id, sugar.id]);
    expect(merged.name).toBe("homemade cinnamon sugar");
    /* Two volumes of one family add up: 1½ tsp + ⅓ cup is 17½ tsp. */
    expect(merged.label).toBe("5 tbsp + 2½ tsp homemade cinnamon sugar");
    expect(merged.key).toBe(`layer:${merge.id}:0`);
    expect(merged.asWritten).toEqual([
      "1½ tsp cinnamon",
      "⅓ cup granulated sugar",
    ]);
    expect(merged.changes).toEqual([
      expect.objectContaining({
        source: "layer",
        id: merge.id,
        op: "merge",
        by: { kind: "you" },
        reason: "make it from what you are buying",
        text: "merged 1½ tsp cinnamon + ⅓ cup granulated sugar",
      }),
      expect.objectContaining({ id: rename.id, op: "rename" }),
    ]);
    expect(labels(view)).toContain("1 cup flour");
  });

  it("a drop after a merge drops the merged row whole, with who and why", () => {
    const a = item("1 cup white flour");
    const b = item("2 cups all-purpose flour");
    const merge = layer([{ op: "merge", ids: [a.id, b.id] }]);
    const drop = layer(
      [{ op: "drop", ids: [b.id], reason: "in the pantry already" }],
      { by: { kind: "model", model: "qwen3:8b" } },
    );
    const view = compose([a, b], [merge, drop]);
    expect(rows(view)).toEqual([]);
    expect(view.leftOff).toHaveLength(1);
    expect(view.leftOff[0]).toMatchObject({
      source: "layer",
      id: drop.id,
      reason: "in the pantry already",
      by: { kind: "model", model: "qwen3:8b" },
    });
    expect(view.leftOff[0].row.ids).toEqual([a.id, b.id]);
    /* A later op on a dropped row reaches nothing. */
    const rename = layer([{ op: "rename", ids: [a.id], name: "flour" }]);
    expect(rows(compose([a, b], [merge, drop, rename]))).toEqual([]);
  });

  it("a merge with only one of its rows on the list does nothing, and says so", () => {
    const a = item("1 cup flour");
    const merge = layer([{ op: "merge", ids: [a.id, "01jgone00003"] }]);
    const [row] = rows(compose([a], [merge]));
    expect(row.label).toBe("1 cup flour");
    expect(row.changes?.[0].skipped).toBe(
      "only one of its rows is on the list",
    );
  });

  it("converts an amount into a unit with a density, marked ≈, and refuses without one", () => {
    const flour = item("2 cups all purpose flour");
    const grams = layer([{ op: "amount", ids: [flour.id], unit: "g" }]);
    const [row] = rows(compose([flour], [grams]));
    expect(row.label).toBe("≈ 240 g all purpose flour");
    expect(row.estimated).toBe(true);
    expect(row.changes?.[0].text).toBe("in g: ≈ 240 g");

    const walnuts = item("1 1/2 cups walnuts");
    const asked = layer([{ op: "amount", ids: [walnuts.id], unit: "g" }]);
    const [nuts] = rows(compose([walnuts], [asked]));
    expect(nuts.label).toBe("1½ cups walnuts");
    expect(nuts.changes?.[0].skipped).toBe(
      "no weight for a cup of walnut on file, so 1½ cups can't be converted",
    );

    /* Within a kind no density is needed: 2 lb → 32 oz exactly. */
    const beef = item("2 lb ground beef");
    const ounces = layer([{ op: "amount", ids: [beef.id], unit: "oz" }]);
    expect(labels(compose([beef], [ounces]))).toEqual(["32 oz ground beef"]);
  });

  it("an amount of the person's own stands; with quantities off it is skipped", () => {
    const eggs = item("10 eggs");
    const own = layer([{ op: "amount", ids: [eggs.id], amount: "1 dozen" }]);
    expect(labels(compose([eggs], [own]))).toEqual(["1 dozen eggs"]);
    const [quiet] = rows(compose([eggs], [own], [], { quantities: false }));
    expect(quiet.label).not.toContain("dozen");
    expect(quiet.changes?.[0].skipped).toBe("amounts are switched off");
  });

  it("a note shows under its row and in the copy text; an aisle moves it", () => {
    const liquid = item("1 1/2 cups strained pear poaching liquid");
    const changed = layer([
      { op: "note", ids: [liquid.id], text: "or make from ~4 pears" },
      { op: "aisle", ids: [liquid.id], aisle: "pantry" },
    ]);
    const view = compose([liquid], [changed]);
    const [row] = rows(view);
    expect(row.notes).toEqual(["or make from ~4 pears"]);
    expect(row.aisle).toBe("pantry");
    expect(formatShoppingText(view)).toBe(
      "Pantry:\n1½ cups strained pear poaching liquid\n  · or make from ~4 pears",
    );
  });

  it("a rule's merge is the first step of a changed row's chain", () => {
    const a = item("1 cup white flour");
    const b = item("2 cups all-purpose flour");
    const keys = ["all purpose flour", "white flour"];
    const merges = [
      {
        id: mergeIdOf(keys),
        keys,
        status: "merged" as const,
        decidedAt: "",
      },
    ];
    const view = buildShoppingView([a, b], settings(), [], [], merges, {});
    const [row] = rows(view);
    expect(row.merge?.id).toBe(mergeIdOf(keys));
    expect(row.changes?.[0]).toMatchObject({ source: "rule", op: "merge" });
    expect(row.asWritten).toEqual([
      "1 cup white flour",
      "2 cups all purpose flour",
    ]);
  });

  it("works with merge off too: a layer merge joins two raw lines", () => {
    const a = item("2 eggs");
    const b = item("1 egg");
    const merge = layer([{ op: "merge", ids: [a.id, b.id] }]);
    const view = compose([a, b], [merge], [], { merge: false });
    expect(labels(view)).toEqual(["3 eggs"]);
  });

  it("left-off rows follow a store's narrowing", () => {
    const water = item("2 cups water");
    const view = buildShoppingView(
      [water],
      settings({ stores: true }),
      [],
      [],
      [],
      {},
    );
    expect(view.leftOff[0].row.store).toBe("hannaford");
  });
});

describe("storage: layers and rules read back as written", () => {
  it("round-trips a layer through its canonical form", () => {
    const stored = layer(
      [
        {
          op: "merge",
          ids: ["01j00000001", "01j00000002"],
          name: "x",
          amount: "1 cup",
        },
        { op: "rename", ids: ["01j00000001"], name: "y" },
        { op: "drop", ids: ["01j00000003"], reason: "the recipe makes it" },
        { op: "amount", ids: ["01j00000004"], unit: "g" },
        { op: "amount", ids: ["01j00000004"], amount: "4 tsp" },
        { op: "note", ids: ["01j00000005"], text: "or make it" },
        { op: "aisle", ids: ["01j00000006"], aisle: "produce" },
      ],
      {
        reason: "tidy",
        note: "for the model",
        from: "s1",
        by: { kind: "model", model: "qwen3:8b" },
      },
    );
    const bytes = JSON.stringify(canonicalShoppingLayer(stored));
    const back = parseShoppingLayer(JSON.parse(bytes), stored.id);
    expect(back).toEqual(stored);
    expect(Object.keys(back!)).toEqual([
      "id",
      "ops",
      "reason",
      "note",
      "by",
      "at",
      "on",
      "from",
    ]);
  });

  it("reads leniently: unknown ops dropped, no ops or id is no layer, on unless false", () => {
    const id = "01kaaaaaaaaaaaaaaaaaaaaazz";
    expect(
      parseShoppingLayer(
        {
          ops: [
            { op: "explode", ids: ["01j00000001"] },
            { op: "merge", ids: ["01j00000001"] },
            { op: "amount", ids: ["01j00000001"], amount: "1", unit: "g" },
            { op: "drop", ids: ["01j00000001"], reason: "gone" },
          ],
          by: { kind: "robot" },
        },
        id,
      ),
    ).toEqual({
      id,
      ops: [{ op: "drop", ids: ["01j00000001"], reason: "gone" }],
      by: { kind: "you" },
      at: "",
      on: true,
    });
    expect(parseShoppingLayer({ ops: [] }, id)).toBeNull();
    expect(
      parseShoppingLayer(
        { ops: [{ op: "drop", ids: ["01j00000001"], reason: "x" }] },
        "not-a-ulid",
      ),
    ).toBeNull();
    expect(
      parseShoppingLayer(
        { on: false, ops: [{ op: "drop", ids: ["01j00000001"], reason: "x" }] },
        id,
      )?.on,
    ).toBe(false);
  });

  it("a rule's id is its key's; a file under another name is not read", () => {
    const id = ruleIdOf("leave-off", "water");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    const raw = { kind: "leave-off", key: "water", leaveOff: false };
    expect(parseShoppingRule(raw, id)).toEqual({
      id,
      kind: "leave-off",
      key: "water",
      leaveOff: false,
      decidedAt: "",
    });
    expect(parseShoppingRule(raw, "0000000000000000")).toBeNull();
    expect(
      parseShoppingRule({ kind: "other", key: "x", leaveOff: true }),
    ).toBeNull();
  });

  it("the built-in set covers water as recipes write it, and a rule wins over it", () => {
    for (const name of [
      "water",
      "cold water",
      "warm water",
      "hot water",
      "boiling water",
      "tap water",
      "ice water",
    ]) {
      expect(BUILT_IN_LEAVE_OFF.has(shoppingNameOf(name).key)).toBe(true);
    }
    for (const name of [
      "tonic water",
      "coconut water",
      "sparkling water",
      "ice",
    ]) {
      expect(BUILT_IN_LEAVE_OFF.has(shoppingNameOf(name).key)).toBe(false);
    }
    const verdicts = leaveOffVerdicts([
      {
        id: "a",
        kind: "leave-off",
        key: "water",
        leaveOff: false,
        decidedAt: "",
      },
    ]);
    expect(verdicts.has("water")).toBe(false);
    expect(verdicts.get("tap water")).toEqual({
      reason: "tap water",
      builtIn: true,
    });
  });
});

describe("rows for the model (50b)", () => {
  it("are compact: key, label, name, amount, aisle and the source lines with recipes", () => {
    const flour = item("2 cups all purpose flour", { recipeName: "Bars" });
    const view = compose([flour]);
    expect(promptRowsOf(view)).toEqual([
      {
        key: "name:all purpose flour",
        label: "2 cups all purpose flour",
        name: "all purpose flour",
        amount: "2 cups",
        aisle: "Pantry",
        lines: [{ text: "2 cups all purpose flour", recipe: "Bars" }],
      },
    ]);
  });
});

describe("the deterministic fixes, on Roger's real lines", () => {
  it("1. one name in cups and grams adds up through its density, marked ≈", () => {
    const flour = [
      item("2 cups (250g) all-purpose flour (spooned & leveled)"),
      item("10 g all-purpose flour"),
      item("2 cups all-purpose flour, plus more for work surface"),
    ];
    const cream = [
      item("1 3/4 cups (400 g) heavy whipping cream"),
      item("135 g heavy whipping cream"),
    ];
    const sugar = [
      item("1 cup (200g) packed light or dark brown sugar"),
      item("1/3 cup (65g) granulated sugar"),
      item("30 g sugar"),
      item("10 g sugar"),
      item("1 cup (200 g) sugar"),
      item("50 g sugar"),
      item("3/4 cup granulated sugar"),
    ];
    const view = buildShoppingView([...flour, ...cream, ...sugar], settings());
    expect(labels(view)).toEqual(
      expect.arrayContaining([
        "≈ 4⅛ cups all purpose flour",
        "≈ 2⅜ cups heavy cream",
        "≈ 2½ cups granulated sugar",
        "1 cup light brown sugar",
      ]),
    );
    const cups = rows(view).find((row) => row.name === "heavy cream")!;
    expect(cups.estimated).toBe(true);
    expect(cups.quantity).toBe("≈ 2⅜ cups");
    /* No density on file: the "+" form stays. */
    const cumin = buildShoppingView(
      [item("2 tsp ground cumin"), item("10 g ground cumin")],
      settings(),
    );
    expect(labels(cumin)).toEqual(["2 tsp + 10 g cumin"]);
  });

  it("2. a nounless left alternative shares the right's head", () => {
    const line =
      "1 cup lightly packed mashed russet or Yukon Gold potatoes (see “Notes,” below)";
    expect(shoppingNameOf(line).key).toBe("russet potato");
    expect(
      shoppingNameOf(line).requirement?.alternatives.map((name) =>
        name.words.join(" "),
      ),
    ).toEqual(["russet potato", "yukon gold potato"]);
    const [row] = rows(buildShoppingView([item(line)], settings()));
    expect(row.label).toBe("1 cup russet potatoes");
    expect(row.aisle).toBe("produce");
    /* Mashed is a preparation, as 43n's descriptive words are. */
    expect(shoppingNameOf("2 cups mashed potatoes").key).toBe("potato");
    expect(shoppingNameOf("1 lb red or yellow onions").key).toBe("red onion");
    /* What already read right still does. */
    expect(
      shoppingNameOf("1 cup (200g) packed light or dark brown sugar").key,
    ).toBe("light brown sugar");
    expect(shoppingNameOf("2 tbsp lemon or lime juice").key).toBe(
      "lemon juice",
    );
    expect(shoppingNameOf("1/4 cup honey or maple syrup").key).toBe("honey");
  });

  it("3. an optional: line is optional, and sprinkles stay sprinkles", () => {
    const line = "optional: sprinkles for decorating";
    const name = shoppingNameOf(line);
    expect(name.key).toBe("sprinkles");
    expect(name.requirement?.optional).toBe(true);
    const [row] = rows(
      buildShoppingView([item(line, { optional: true })], settings()),
    );
    expect(row.label).toBe("sprinkles");
    expect(row.aisle).toBe("pantry");
    expect(row.optional).toBe(true);
    expect(shoppingNameOf("1 cup rolled oats").key).toBe("rolled oats");
    expect(
      labels(buildShoppingView([item("2 sprinkles")], settings())),
    ).toEqual(["2 sprinkles"]);
  });

  it("4. teaspoons add up the way a cook writes them, never thirds of a tablespoon", () => {
    const vanilla = [
      item("1 1/2 teaspoons pure vanilla extract"),
      item("1 teaspoon pure vanilla extract"),
      item("1 1/2 teaspoons vanilla extract"),
    ];
    expect(labels(buildShoppingView(vanilla, settings()))).toEqual([
      "1 tbsp + 1 tsp vanilla extract",
    ]);
    const show = (line: string) => formatAmount(parseAmount(line)!);
    expect(show("4 1/2 tsp salt")).toBe("1½ tbsp");
    expect(show("5 tsp salt")).toBe("1 tbsp + 2 tsp");
    expect(show("2 tbsp salt")).toBe("2 tbsp");
    expect(show("2 tsp salt")).toBe("2 tsp");
    expect(show("1/3 cup sugar")).toBe("⅓ cup");
  });

  it("5. shortening or oil for frying stays the shortening, oil left to 50b", () => {
    const line =
      "Vegetable shortening or vegetable oil for frying (see “Notes,” below)";
    const name = shoppingNameOf(line);
    expect(name.key).toBe("vegetable shortening");
    expect(
      name.requirement?.alternatives.map((alt) => alt.words.join(" ")),
    ).toEqual(["vegetable shortening", "vegetable oil"]);
  });
});
