// 49b: the shopping list's "same thing, different names" asked of a model —
// the proposal for any names (`proposalForKeys`), the check a revise's and a
// find's answer go through (`shoppingAskCheck`), the spec and the prompts
// (condensed, nothing decided or proposed sent), and the job with `fetch`
// stubbed — never a real model.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  proposalForKeys,
  proposalRowsFor,
} from "recipe-website-common/util/shoppingConsolidate";
import {
  mergeIdOf,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
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
  findUserPrompt,
  reviseUserPrompt,
  runShoppingAsk,
  shoppingAskPrompt,
  shoppingAskSpecOf,
  type ShoppingAskSpec,
} from "../websites/recipe-website/editor/controller/llm/shoppingAsk";
import { editModels } from "../websites/recipe-website/editor/controller/llm/askEdit";
import { estimateTokens } from "../websites/recipe-website/editor/controller/llm/client";
import {
  jobLabel,
  jobResources,
} from "../websites/recipe-website/editor/controller/jobs/kinds";

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
    item("1 pinch sea salt", { recipe: "crepes", recipeName: "Crêpes" }),
  ];
}

const FLOUR = ["all purpose flour", "white flour"];
const SALT = ["salt", "sea salt"];
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
    amount: "",
    estimated: false,
    reason: "Both are flour.",
    ...extra,
  });

  it("a merge with the list's sum sends neither a name nor an amount, only the note", () => {
    const checked = checkReviseAnswer(merge(), target, ask, "take a look");
    expect(checked).toMatchObject({
      status: "merge",
      amountFromModel: false,
      proposal: { line: "3 cups all-purpose flour" },
      decision: { keys: FLOUR, status: "merged", note: "take a look" },
    });
    if (checked.status !== "merge") throw new Error("not a merge");
    expect(checked.decision).not.toHaveProperty("name");
    expect(checked.decision).not.toHaveProperty("amount");
    /* "3 cups" is the sum, said again: no amount of its own. */
    expect(
      checkReviseAnswer(merge({ amount: "3 cups" }), target, ask, "x"),
    ).toMatchObject({ status: "merge", amountFromModel: false });
  });

  it("“use grams”: the model's amount, marked ≈ when converted, and its name when new", () => {
    const checked = checkReviseAnswer(
      merge({ amount: "360 g", estimated: true, name: "plain flour" }),
      target,
      ask,
      "use grams, call it plain flour",
    );
    expect(checked).toMatchObject({
      status: "merge",
      amountFromModel: true,
      proposal: { line: "≈ 360 g plain flour", amount: "≈ 360 g" },
      decision: {
        keys: FLOUR,
        name: "plain flour",
        amount: "≈ 360 g",
        note: "use grams, call it plain flour",
      },
    });
  });

  it("refuses an item that was not asked about, an amount it can't read and an empty name", () => {
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
      checkReviseAnswer(merge({ amount: "plenty" }), target, ask, "x"),
    ).toEqual({
      status: "refused",
      problem: "the amount “plenty” can't be read as an amount",
    });
    expect(checkReviseAnswer(merge({ name: "  " }), target, ask, "x")).toEqual({
      status: "refused",
      problem: "the name is empty",
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

  it("an amount with quantities off is not the model's to set", () => {
    expect(
      checkReviseAnswer(
        merge({ amount: "plenty" }),
        { ...target, rows: proposalRowsFor(items, quantitiesOff, FLOUR) },
        { ...ask, settings: quantitiesOff },
        "x",
      ),
    ).toMatchObject({ status: "merge", amountFromModel: false });
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
    "salt",
    "sea salt",
  ]);
  const ask = { items, settings: SETTINGS, merges: [] as ShoppingMerge[] };

  it("keeps a good group as a proposal in Da3's shape, its name when new", () => {
    const at = (key: string) => names.findIndex((row) => row.key === key) + 1;
    const checked = checkFindAnswer(
      {
        groups: [
          {
            items: [at("salt"), at("sea salt")],
            name: "salt",
            reason: "Both are salt.",
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
      proposal: { id: mergeIdOf(SALT), reason: "Both are salt." },
      decision: { keys: SALT, status: "merged" },
    });
    expect(checked.proposals[0].decision).not.toHaveProperty("name");
    expect(checked.proposals[0].proposal.rows).toHaveLength(2);
  });

  it("drops unknown items, groups under two, a number twice, and anything decided or proposed", () => {
    const at = (key: string) => names.findIndex((row) => row.key === key) + 1;
    const checked = checkFindAnswer(
      {
        groups: [
          { items: [at("egg"), 42], name: "eggs", reason: "" },
          { items: [at("salt"), at("sea salt")], name: "salt", reason: "" },
          { items: [at("sea salt"), at("buttermilk")], name: "x", reason: "" },
          { items: [at("egg"), at("buttermilk")], name: " ", reason: "" },
        ],
      },
      names,
      ask,
    );
    expect(checked).toMatchObject({
      status: "found",
      dropped: [
        "group 1: item 42 is not one of the 4 names",
        "group 1: fewer than two names",
        "group 3: fewer than two names",
        "group 4: no name",
      ],
    });
    if (checked.status !== "found") throw new Error("not found");
    expect(checked.proposals.map((each) => each.decision.keys)).toEqual([SALT]);

    const group = { items: [at("salt"), at("sea salt")], name: "salt" };
    expect(
      checkFindAnswer({ groups: [group] }, names, {
        ...ask,
        merges: [apart(SALT)],
      }),
    ).toMatchObject({
      proposals: [],
      dropped: ["group 1 (salt + sea salt): kept apart already"],
    });
    expect(
      checkFindAnswer({ groups: [group] }, names, ask, [SALT]),
    ).toMatchObject({
      proposals: [],
      dropped: ["group 1 (salt + sea salt): already proposed"],
    });
    expect(checkFindAnswer({ found: [] }, names, ask)).toMatchObject({
      status: "refused",
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
    /* The flours are the table's proposal: left out. The ticked sugar too. */
    expect(spec.names?.map((row) => row.key)).toEqual([
      "egg",
      "buttermilk",
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
        "1. egg — 4",
        "2. buttermilk — 1½ cups",
        "3. salt — 1 tsp",
        "4. sea salt",
        "",
        "Kept apart already (do not group again): 3+4",
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
      "egg",
      "buttermilk",
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
      name: "all-purpose flour",
      amount: "360 g",
      estimated: true,
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
      amount: "",
      estimated: false,
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
      groups: [{ items: [3, 4], name: "salt", reason: "Both are salt." }],
    });
    const result = await runShoppingAsk(spec, { models: local });
    expect((calls[0].body.messages as { content: string }[])[0].content).toBe(
      FIND_SYSTEM_PROMPT,
    );
    expect(result).toMatchObject({
      task: "find",
      status: "found",
      names: 4,
      dropped: [],
      proposals: [{ decision: { keys: SALT } }],
    });
  });

  it("is listed with its note, and takes the GPU's line only for a local model", () => {
    const spec = revise();
    expect(jobLabel(spec)).toBe(
      'ask about all-purpose flour + white flour: "use grams"',
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
