// @vitest-environment node
//
// 50b: "Tidy with the model" — the structural check (each refusal, and 49's
// judgements as warnings), the delta arithmetic in the view, the model list
// with why a model is not offered, `num_ctx` sizing, the trimmed steps, and
// the kept runs in a real git repository (accept → one layer, skip, stale).
// Never a real model: `fetch` is stubbed.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  SHOPPING_LIST_PATHS,
  addToShopping,
  decideTidySuggestion,
  patchShopping,
  readShopping,
  readShoppingLayers,
  readShoppingView,
  readTidyRuns,
  reviseTidySuggestion,
  writeTidyRun,
} from "../websites/recipe-website/editor/controller/curation/shopping";
import {
  checkTidyAnswer,
  type TidyPromptRow,
} from "../websites/recipe-website/editor/controller/llm/shoppingTidyCheck";
import {
  TIDY_ANSWER_TOKENS,
  TIDY_SYSTEM_PROMPT,
  TIDY_THINK_TOKENS,
  runShoppingTidy,
  storedTidySpec,
  tidyContext,
  tidyModels,
  tidyPrompt,
  tidyThinks,
  trimSteps,
} from "../websites/recipe-website/editor/controller/llm/shoppingTidy";
import {
  STREAM_AFTER_MS,
  estimateTokens,
  joinStream,
  LLM_NUM_CTX,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  PACKAGE_GUESS_WARNING,
  parseTidyRun,
  serializeTidyRun,
  tidyRunView,
  type TidyRun,
} from "recipe-website-common/util/shoppingTidy";
import {
  buildShoppingView,
  formatShoppingText,
} from "recipe-website-common/util/shoppingView";
import { normalizeShoppingSettings } from "recipe-website-common/util/shoppingTypes";
import type { ShoppingLayer } from "recipe-website-common/util/shoppingLayers";

vi.setConfig({ testTimeout: 30_000 });

const RUN = "01k" + "a".repeat(23);
const THIRD = "01k" + "c".repeat(23);

function row(
  n: number,
  name: string,
  extra: Partial<TidyPromptRow> = {},
): TidyPromptRow {
  return {
    n,
    key: `name:${name}`,
    nameKey: name,
    ids: [`item${String(n).padStart(8, "0")}`],
    label: extra.amount ? `${extra.amount} ${name}` : name,
    name,
    lines: [{ text: name, recipe: "Bars" }],
    ...extra,
  };
}

const ROWS: TidyPromptRow[] = [
  row(1, "strained pear poaching liquid", { amount: "1½ cups" }),
  row(2, "vegetable shortening"),
  row(3, "vegetable oil", { amount: "1 cup" }),
  row(4, "salt", { amount: "1 tsp" }),
  row(5, "table salt", { amount: "½ tsp" }),
  row(6, "baking powder", { amount: "2½ tsp" }),
  row(7, "baking soda", { amount: "2 tsp" }),
  row(8, "heavy cream", { amount: "2⅜ cups", label: "≈ 2⅜ cups heavy cream" }),
  row(9, "sprinkles", { optional: true }),
];

const answer = (...suggestions: Record<string, unknown>[]) => ({ suggestions });
const suggestion = (
  ops: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) => ({
  kind: "drop",
  title: "A title",
  reason: "A reason.",
  ops,
  confidence: 0.5,
  ...extra,
});

describe("the structural check (Db4)", () => {
  it("keeps a well-formed suggestion, its ops in 50a's vocabulary by item id", () => {
    const checked = checkTidyAnswer(
      answer(
        suggestion(
          [
            { op: "drop", rows: [2], text: "fry in the vegetable oil" },
            { op: "add", rows: [3], text: "+2½ qt" },
          ],
          { kind: "combine", title: "Fry in the oil you're buying" },
        ),
      ),
      ROWS,
      RUN,
    );
    expect(checked.leftOut).toEqual([]);
    expect(checked.suggestions).toEqual([
      {
        id: `${RUN}-1`,
        kind: "combine",
        title: "Fry in the oil you're buying",
        reason: "A reason.",
        ops: [
          {
            op: "drop",
            ids: ["item00000002"],
            reason: "fry in the vegetable oil",
          },
          { op: "amount", ids: ["item00000003"], add: "2½ qt" },
        ],
        warnings: [],
        confidence: 0.5,
      },
    ]);
  });

  it("refuses rows that are not on the list, or a row changed after it was left off", () => {
    const checked = checkTidyAnswer(
      answer(
        suggestion([{ op: "drop", rows: [40], text: "gone" }], {
          title: "Invented",
        }),
        suggestion(
          [
            { op: "drop", rows: [2], text: "use oil" },
            { op: "note", rows: [2], text: "or lard" },
          ],
          { title: "Twice" },
        ),
      ),
      ROWS,
      RUN,
    );
    expect(checked.suggestions).toEqual([]);
    expect(checked.leftOut).toEqual([
      "“Invented” names row 40, which is not on the list.",
      "“Twice” changes vegetable shortening after leaving it off.",
    ]);
  });

  it("refuses a malformed op, an amount that does not read, and a leave-off with no reason", () => {
    const cases: [Record<string, unknown>[], string][] = [
      [
        [{ op: "explode", rows: [1], text: "" }],
        "which the list has no change for",
      ],
      [[{ op: "drop", rows: [], text: "x" }], "names no rows"],
      [[{ op: "merge", rows: [4], text: "salt" }], "with nothing"],
      [[{ op: "rename", rows: [4], text: "" }], "renames salt to nothing"],
      [
        [{ op: "add", rows: [3], text: "some more" }],
        "not an amount the list reads",
      ],
      [
        [{ op: "package", rows: [8], text: "a carton" }],
        "has no size the list reads",
      ],
      [
        [{ op: "package", rows: [3, 8], text: "1 quart" }],
        "each row needs its own",
      ],
      [
        [{ op: "unit", rows: [8], text: "pinch" }],
        "a unit the list can't give",
      ],
      [[{ op: "drop", rows: [1], text: "" }], "off without saying why"],
      [[], "changes nothing"],
    ];
    for (const [ops, why] of cases) {
      const checked = checkTidyAnswer(answer(suggestion(ops)), ROWS, RUN);
      expect(checked.suggestions, why).toEqual([]);
      expect(checked.leftOut[0], why).toContain(why);
    }
    expect(checkTidyAnswer("nonsense", ROWS, RUN).leftOut).toEqual([
      "The answer was not a list of suggestions.",
    ]);
  });

  it("49's refusals are warnings now: known different, more than three, no shared head", () => {
    const leavening = checkTidyAnswer(
      answer(
        suggestion([{ op: "merge", rows: [6, 7], text: "leavening" }], {
          kind: "merge",
        }),
      ),
      ROWS,
      RUN,
    );
    expect(leavening.leftOut).toEqual([]);
    expect(leavening.suggestions[0].warnings).toEqual([
      "49's rules keep leavening apart (baking powder and baking soda)",
    ]);
    /* Salt and table salt: one kind of the known-different list, alike. */
    const salts = checkTidyAnswer(
      answer(
        suggestion([{ op: "merge", rows: [4, 5], text: "salt" }], {
          kind: "merge",
        }),
      ),
      ROWS,
      RUN,
    );
    expect(salts.suggestions[0].warnings).toEqual([]);
    const four = checkTidyAnswer(
      answer(
        suggestion([{ op: "merge", rows: [2, 3, 4, 5], text: "" }], {
          kind: "merge",
        }),
      ),
      ROWS,
      RUN,
    );
    expect(four.suggestions[0].warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("49's rules"),
        "Merges 4 rows; 49's check took at most 3",
      ]),
    );
  });

  it("a store size keeps the needed amount under the row and says it is a guess", () => {
    const checked = checkTidyAnswer(
      answer(
        suggestion(
          [{ op: "package", rows: [8], text: "1 quart heavy cream" }],
          { kind: "store-size" },
        ),
      ),
      ROWS,
      RUN,
    );
    expect(checked.suggestions[0].ops).toEqual([
      { op: "amount", ids: ["item00000008"], amount: "1 quart" },
      { op: "note", ids: ["item00000008"], text: "≈ 2⅜ cups needed" },
    ]);
    expect(checked.suggestions[0].warnings).toEqual([PACKAGE_GUESS_WARNING]);
  });

  it("a package size that is the amount already changes nothing", () => {
    const checked = checkTidyAnswer(
      answer(
        suggestion([{ op: "package", rows: [3], text: "1 cup" }], {
          kind: "store-size",
          title: "Same again",
        }),
      ),
      ROWS,
      RUN,
    );
    expect(checked.suggestions).toEqual([]);
    expect(checked.leftOut[0]).toContain("“Same again” changes nothing");
  });

  it("check at home moves rows to the check section; a lone drop of a needed row is said", () => {
    const checked = checkTidyAnswer(
      answer(
        suggestion([{ op: "check", rows: [4, 6], text: "" }], {
          kind: "check",
        }),
        suggestion([{ op: "drop", rows: [3], text: "you have some" }]),
        suggestion([{ op: "drop", rows: [9], text: "optional decoration" }]),
      ),
      ROWS,
      RUN,
    );
    expect(checked.suggestions[0].ops).toEqual([
      { op: "aisle", ids: ["item00000004", "item00000006"], aisle: "check" },
    ]);
    expect(checked.suggestions[1].warnings).toEqual([
      "Leaves off vegetable oil, which a recipe needs, with nothing else on the list for it",
    ]);
    /* Sprinkles are optional: no warning. */
    expect(checked.suggestions[2].warnings).toEqual([]);
    expect(checked.suggestions.map((each) => each.id)).toEqual([
      `${RUN}-1`,
      `${RUN}-2`,
      `${RUN}-3`,
    ]);
  });

  it("a suggestion skipped before, or made twice, is left out", () => {
    const ops = [{ op: "drop", rows: [9], text: "optional decoration" }];
    const first = checkTidyAnswer(answer(suggestion(ops)), ROWS, RUN);
    const again = checkTidyAnswer(
      answer(suggestion(ops, { title: "Sprinkles again" }), suggestion(ops)),
      ROWS,
      RUN,
      { skipped: first.suggestions },
    );
    expect(again.suggestions).toEqual([]);
    expect(again.leftOut[0]).toBe(
      "“Sprinkles again” repeats a suggestion skipped or made already.",
    );
  });
});

describe("the delta, summed by the list (Db3)", () => {
  const settings = normalizeShoppingSettings({
    features: { stores: false, onHand: false },
  });
  const items = [
    { id: "aaaaaaaaaa01", text: "1 cup vegetable oil" },
    { id: "aaaaaaaaaa02", text: "1 1/2 tsp ground cinnamon" },
    { id: "aaaaaaaaaa03", text: "2 cups granulated sugar" },
  ];
  const layer = (ops: ShoppingLayer["ops"]): ShoppingLayer => ({
    id: "01k" + "b".repeat(23),
    ops,
    by: { kind: "model", model: "qwen3:8b" },
    at: "",
    on: true,
  });
  const labels = (layers: ShoppingLayer[]) =>
    buildShoppingView(items, settings, [], [], [], { layers })
      .stores.flatMap((each) => each.sections)
      .flatMap((section) => section.rows)
      .map((each) => each.label);

  it("adds as the list writes amounts, and says a delta it can't read", () => {
    expect(
      labels([
        layer([
          { op: "amount", ids: ["aaaaaaaaaa01"], add: "2½ qt" },
          { op: "amount", ids: ["aaaaaaaaaa02"], add: "1 tbsp" },
          { op: "amount", ids: ["aaaaaaaaaa03"], add: "¼ cup" },
        ]),
      ]),
    ).toEqual(
      expect.arrayContaining([
        "11 cups vegetable oil",
        "1½ tbsp cinnamon",
        "2¼ cups granulated sugar",
      ]),
    );
    const view = buildShoppingView(items, settings, [], [], [], {
      layers: [layer([{ op: "amount", ids: ["aaaaaaaaaa01"], add: "lots" }])],
    });
    const oil = view.stores[0].sections
      .flatMap((section) => section.rows)
      .find((each) => each.name.includes("oil"))!;
    expect(oil.label).toBe("1 cup vegetable oil");
    expect(oil.changes?.[0].skipped).toContain("not an amount");
    expect(formatShoppingText(view)).toContain("1 cup vegetable oil");
  });
});

describe("the models a run may pick (Db2)", () => {
  const LOCAL = { RECIPE_LLM_URL: "http://127.0.0.1:11434" };

  it("the local default, other installed models, and Claude with why not", () => {
    const { choices } = tidyModels(
      { ...LOCAL, RECIPE_LLM_TIDY_MODELS: "qwen3:14b, llama3:70b" },
      ["qwen3:8b", "qwen3:14b"],
    );
    expect(choices.models.map((each) => [each.id, each.default])).toEqual([
      ["qwen3:8b", true],
      ["qwen3:14b", undefined],
    ]);
    expect(choices.unavailable).toEqual([
      {
        id: "llama3:70b",
        words: "llama3:70b on this machine",
        why: "Not installed here: `ollama pull llama3:70b` to offer it",
      },
      {
        id: "claude",
        words: "Claude Sonnet 5 through the API",
        why: "Not set up here: add RECIPE_LLM_CLAUDE_API_KEY to this editor's editor/.env to offer it",
      },
    ]);
  });

  it("Claude with a key; the Pi's Claude only; RECIPE_LLM_TIDY_MODEL picks the default", () => {
    const both = tidyModels(
      {
        ...LOCAL,
        RECIPE_LLM_CLAUDE_API_KEY: "sk-test",
        RECIPE_LLM_TIDY_MODELS: "qwen3:14b",
        RECIPE_LLM_TIDY_MODEL: "qwen3:14b",
      },
      undefined,
    );
    expect(both.choices.models.map((each) => each.id)).toEqual([
      "qwen3:8b",
      "qwen3:14b",
      "claude",
    ]);
    expect(both.choices.models.find((each) => each.default)?.id).toBe(
      "qwen3:14b",
    );
    expect(both.choices.unavailable).toEqual([]);
    expect(JSON.stringify(both.choices)).not.toContain("sk-test");
    const pi = tidyModels({
      RECIPE_LLM_API: "anthropic",
      RECIPE_LLM_API_KEY: "sk-pi",
    });
    expect(pi.choices.models.map((each) => [each.id, each.default])).toEqual([
      ["claude", true],
    ]);
  });
});

describe("context and thinking (Db8)", () => {
  it("num_ctx holds the prompt, the answer and the thinking, or nothing fits", () => {
    const prompt = { system: TIDY_SYSTEM_PROMPT, user: "x".repeat(6_000) };
    const needed =
      estimateTokens(prompt.system) +
      estimateTokens(prompt.user) +
      TIDY_ANSWER_TOKENS +
      TIDY_THINK_TOKENS;
    const thinking = tidyContext(prompt, true)!;
    expect(thinking).toBeGreaterThanOrEqual(needed);
    expect(tidyContext(prompt, false)!).toBeLessThanOrEqual(thinking);
    expect(
      tidyContext({ system: "", user: "x".repeat(3 * LLM_NUM_CTX) }, false),
    ).toBeUndefined();
    const ollama = { api: "ollama" } as Parameters<typeof tidyThinks>[0];
    /* Off unless asked (Db8: 8b thinking did not answer in 10 minutes). */
    expect(tidyThinks(ollama, {})).toBe(false);
    expect(tidyThinks(ollama, { RECIPE_LLM_TIDY_THINK: "1" })).toBe(true);
    expect(
      tidyThinks({ api: "anthropic" } as Parameters<typeof tidyThinks>[0], {}),
    ).toBe(false);
  });

  it("a long call streams, and the chunks are one answer (Tb1)", () => {
    expect(STREAM_AFTER_MS).toBeLessThan(300_000);
    expect(
      joinStream(
        [
          '{"model":"qwen3:8b","message":{"role":"assistant","content":"","thinking":"Hmm"},"done":false}',
          '{"model":"qwen3:8b","message":{"role":"assistant","content":"{\\"suggestions\\":"},"done":false}',
          '{"model":"qwen3:8b","message":{"role":"assistant","content":"[]}"},"done":true,"prompt_eval_count":10,"eval_count":5}',
          "",
        ].join("\n"),
      ),
    ).toEqual({
      model: "qwen3:8b",
      message: {
        role: "assistant",
        content: '{"suggestions":[]}',
        thinking: "Hmm",
      },
      done: true,
      prompt_eval_count: 10,
      eval_count: 5,
    });
  });

  it("steps are trimmed to what bears on buying", () => {
    expect(
      trimSteps([
        { text: "Preheat the oven to 350°F. Butter a pan." },
        {
          text: "Fill a Dutch oven with oil or shortening to a depth of 2½ inches. Set over medium heat.",
        },
        {
          name: "Jelly",
          instructions: [
            {
              text: "Heat 1/2 the poaching liquid in a pan. If desired, toss them in cinnamon sugar.",
            },
          ],
        },
      ]),
    ).toEqual([
      "Fill a Dutch oven with oil or shortening to a depth of 2½ inches.",
      "Heat 1/2 the poaching liquid in a pan.",
      "If desired, toss them in cinnamon sugar.",
    ]);
  });
});

// --- the kept runs, in a real repository ----------------------------------------

const AUTHOR = { name: "Test Curator", email: "curator@test.local" };
let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "shopping-tidy-"));
  git = simpleGit({ baseDir: contentDirectory });
  await git.init();
  await git.addConfig("user.email", AUTHOR.email);
  await git.addConfig("user.name", AUTHOR.name);
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
  ctx = { contentDirectory, author: AUTHOR };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const LOCAL_ENV = { RECIPE_LLM_URL: "http://127.0.0.1:9" };

function stubModel(answerData: unknown) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body ?? "{}")));
      return new Response(
        JSON.stringify({
          model: "qwen3:8b",
          message: { role: "assistant", content: JSON.stringify(answerData) },
          done: true,
          prompt_eval_count: 900,
          eval_count: 200,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

async function listWithThree() {
  await addToShopping(ctx, {
    items: ["1 cup vegetable oil", "vegetable shortening", "sprinkles"],
  });
  return readShopping(ctx);
}

describe("runs are kept (Db5)", () => {
  it("a run is one commit; Accept writes one layer from it, Skip is recorded, a gone item makes one stale", async () => {
    await listWithThree();
    const configs = tidyModels(LOCAL_ENV, ["qwen3:8b"]);
    const spec = await storedTidySpec(ctx, {}, configs);
    expect(spec.rows.map((each) => each.n)).toEqual([1, 2, 3]);
    const oil = spec.rows.find((each) => each.name === "vegetable oil")!;
    const fat = spec.rows.find((each) => each.name === "vegetable shortening")!;
    const sprinkles = spec.rows.find((each) => each.name === "sprinkles")!;
    const calls = stubModel(
      answer(
        suggestion(
          [
            { op: "drop", rows: [fat.n], text: "fry in the vegetable oil" },
            { op: "add", rows: [oil.n], text: "2½ qt" },
          ],
          { kind: "combine", title: "Fry in the oil" },
        ),
        suggestion([{ op: "drop", rows: [sprinkles.n], text: "optional" }], {
          title: "Sprinkles are decoration",
        }),
      ),
    );
    const result = await runShoppingTidy(spec, {
      ctx,
      configs,
      env: LOCAL_ENV,
    });
    expect(result).toMatchObject({ task: "tidy", status: "done" });
    /* Not thinking by default (Db8), and a context that holds the answer. */
    expect(calls[0].think).toBe(false);
    expect((calls[0].options as { num_ctx: number }).num_ctx).toBe(
      tidyContext(tidyPrompt(spec), false),
    );
    const [run] = await readTidyRuns(ctx);
    expect(run.suggestions).toHaveLength(2);
    expect((await git.log()).latest?.message).toBe(
      "Update shopping list: tidy with qwen3:8b (current): 2 suggestions",
    );

    const [combine, decoration] = run.suggestions;
    const accepted = await decideTidySuggestion(ctx, combine.id, "accept");
    expect(accepted.changed).toBe(true);
    const [layer] = await readShoppingLayers(ctx);
    expect(layer).toMatchObject({
      from: combine.id,
      by: { kind: "model", model: "qwen3:8b" },
      reason: "Fry in the oil",
      on: true,
    });
    const committed = await git.raw([
      "show",
      "--name-only",
      "--format=%s",
      "HEAD",
    ]);
    expect(committed).toContain(
      "Update shopping list: accept: Fry in the oil (qwen3:8b)",
    );
    expect(committed).toContain(
      `${SHOPPING_LIST_PATHS.layers}/${layer.id}.json`,
    );
    expect(committed).toContain(`${SHOPPING_LIST_PATHS.tidy}/${run.id}.json`);
    const { text } = await readShoppingView(ctx);
    expect(text).toContain("11 cups vegetable oil");
    expect(
      (await decideTidySuggestion(ctx, combine.id, "accept")).changed,
    ).toBe(false);

    await decideTidySuggestion(ctx, decoration.id, "skip");
    const [kept] = await readTidyRuns(ctx);
    const { items } = await readShopping(ctx);
    expect(
      tidyRunView(kept, items).suggestions.map((each) => each.status),
    ).toEqual(["accepted", "skipped"]);

    /* A second run on current is told what was skipped and done. */
    const next = await storedTidySpec(ctx, {}, configs);
    expect(next.skipped.map((each) => each.title)).toEqual([
      "Sprinkles are decoration",
    ]);
    expect(next.accepted).toEqual(["Fry in the oil"]);
    expect(tidyPrompt(next).user).toContain("do not suggest these again");
    /* On the original, the accepted layer is not applied. */
    const original = await storedTidySpec(ctx, { on: "original" }, configs);
    expect(original.rows.map((each) => each.label)).toContain(
      "vegetable shortening",
    );
    expect(next.rows.map((each) => each.label)).not.toContain(
      "vegetable shortening",
    );

    /* The sprinkles leave the list: a pending suggestion on them is stale. */
    const third: TidyRun = {
      ...kept,
      id: THIRD,
      suggestions: [{ ...decoration, id: `${THIRD}-1` }],
      status: {},
    };
    await writeTidyRun(ctx, third);
    await patchShopping(ctx, { remove: sprinkles.ids });
    const after = await readShopping(ctx);
    const view = tidyRunView(
      (await readTidyRuns(ctx)).find((each) => each.id === third.id)!,
      after.items,
    );
    expect(view.suggestions[0].status).toBe("stale");
    await expect(
      decideTidySuggestion(ctx, `${THIRD}-1`, "accept"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("no longer on the list"),
    });
    expect(
      toErrorObject(
        await decideTidySuggestion(
          ctx,
          `${"01k" + "z".repeat(23)}-1`,
          "skip",
        ).catch((error: unknown) => error),
      ).error.code,
    ).toBe("not_found");
  });

  it("the same change is never accepted twice; a revised card takes the old one's place, pending again", async () => {
    await listWithThree();
    const configs = tidyModels(LOCAL_ENV, ["qwen3:8b"]);
    const spec = await storedTidySpec(ctx, {}, configs);
    const fat = spec.rows.find((each) => each.name === "vegetable shortening")!;
    const sprinkles = spec.rows.find((each) => each.name === "sprinkles")!;
    const opsOn = (rows: typeof spec.rows) => [
      {
        op: "note",
        rows: [rows.find((each) => each.name === fat.name)!.n],
        text: "or vegetable oil",
      },
    ];
    const ops = opsOn(spec.rows);
    stubModel(
      answer(
        suggestion(ops, { title: "Fry in the oil" }),
        suggestion([{ op: "drop", rows: [sprinkles.n], text: "optional" }], {
          title: "Sprinkles",
        }),
      ),
    );
    await runShoppingTidy(spec, { ctx, configs, env: LOCAL_ENV });
    const [first] = await readTidyRuns(ctx);
    await decideTidySuggestion(ctx, first.suggestions[0].id, "accept");
    /* "Run it against the original": the same card again, warned … */
    const original = await storedTidySpec(ctx, { on: "original" }, configs);
    stubModel(
      answer(
        suggestion(opsOn(original.rows), { title: "Fry in the oil, again" }),
      ),
    );
    await runShoppingTidy(original, { ctx, configs, env: LOCAL_ENV });
    const [again] = await readTidyRuns(ctx);
    expect(again.suggestions[0].warnings).toContain(
      "Already on this list as a change",
    );
    /* … and refused at Accept: its amounts would count twice. */
    await expect(
      decideTidySuggestion(ctx, again.suggestions[0].id, "accept"),
    ).rejects.toMatchObject({
      message: expect.stringContaining("on this list already"),
    });
    expect(await readShoppingLayers(ctx)).toHaveLength(1);
    /* On the current list it is left out as a repeat. */
    const current = await storedTidySpec(ctx, {}, configs);
    stubModel(
      answer(suggestion(opsOn(current.rows), { title: "Fry once more" })),
    );
    const result = await runShoppingTidy(current, {
      ctx,
      configs,
      env: LOCAL_ENV,
    });
    expect(result).toMatchObject({ status: "done" });
    const [third] = await readTidyRuns(ctx);
    expect(third.suggestions).toEqual([]);
    expect(third.leftOut[0]).toContain("repeats a suggestion");

    /* Db6: a skipped card asked again is pending, with the same id. */
    const card = first.suggestions[1];
    await decideTidySuggestion(ctx, card.id, "skip");
    const revised = {
      ...card,
      title: "Sprinkles, as asked",
      revised: { note: "keep them", at: "now", model: "qwen3:8b" },
    };
    const kept = await reviseTidySuggestion(ctx, revised);
    expect(kept.suggestions[1]).toEqual(revised);
    expect(kept.status[card.id]).toBeUndefined();
    expect((await git.log()).latest?.message).toBe(
      "Update shopping list: revise: Sprinkles → Sprinkles, as asked",
    );
    /* Refused once accepted. */
    await expect(
      reviseTidySuggestion(ctx, { ...first.suggestions[0], title: "x" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("accepted") });
  });

  it("a stored run reads back as written, leniently", () => {
    const run: TidyRun = {
      id: RUN,
      model: "qwen3:8b",
      choice: "qwen3:8b",
      on: "original",
      at: "2026-11-21T00:00:00.000Z",
      think: true,
      suggestions: [
        {
          id: `${RUN}-1`,
          kind: "check",
          title: "Check at home",
          reason: "Staples.",
          ops: [{ op: "aisle", ids: ["item00000004"], aisle: "check" }],
          warnings: [],
        },
      ],
      status: { [`${RUN}-1`]: { status: "skipped", at: "x" } },
      leftOut: ["“Invented” names row 40, which is not on the list."],
    };
    expect(parseTidyRun(JSON.parse(serializeTidyRun(run)), RUN)).toEqual(run);
    /* An op the list does not know is dropped; a suggestion of another run is not read. */
    const raw = JSON.parse(serializeTidyRun(run));
    raw.suggestions.push({
      ...raw.suggestions[0],
      id: `01k${"b".repeat(23)}-1`,
    });
    raw.suggestions[0].ops.push({ op: "explode", ids: ["item00000004"] });
    expect(parseTidyRun(raw, RUN)?.suggestions).toEqual(run.suggestions);
  });
});
