// @vitest-environment node
//
// 48b: the curator's held writes (Db1–Db3) and its review. The Claude API
// is `fetch` stubbed per turn — never a real model — against a temp content
// directory and a temp job store. Pinned: the held list is the registry's
// writes; a held run writes nothing and answers the model "held" (a dry
// run's slug for a create, the split for a tag), a model's own dry run is
// not held; the transcript keeps a preview and no summary, and nothing of it
// reaches the wire; Save applies the ticked calls in order (a create before
// the tag that names it), narrows a tag, skips the rest, refuses a second
// decision or a widened add; What changed and the recent runs count what was
// saved; a follow-up's model is told what was decided; the CLI's runs still
// write at once; the per-ask model choice.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { recipeToolDefinitions } from "../websites/recipe-website/editor/mcp/registry";
import {
  AGENT_TOOL_NAMES,
  recipeAgentTools,
} from "../websites/recipe-website/editor/controller/agent/tools";
import {
  HELD_WRITE_TOOLS,
  UNHELD_WRITES,
  decisionsNote,
  heldCalls,
  heldPhrase,
  narrowedAdd,
} from "../websites/recipe-website/editor/controller/agent/held";
import {
  applyReview,
  curatorReview,
} from "../websites/recipe-website/editor/controller/agent/review";
import {
  curatorRunChanges,
  listCuratorRuns,
  curatorSetup,
  curatorPaletteSummary,
} from "../websites/recipe-website/editor/controller/agent/curator";
import {
  curatorModelFor,
  curatorModels,
} from "../websites/recipe-website/editor/controller/agent/job";
import { startAgentRun } from "../websites/recipe-website/editor/controller/agent/runs";
import {
  historyOf,
  readTranscript,
  type TranscriptRecord,
} from "../websites/recipe-website/editor/controller/agent/transcript";
import { runChanges } from "../websites/recipe-website/editor/controller/agent/changes";
import {
  claudeMessages,
  ollamaMessages,
} from "../websites/recipe-website/editor/controller/llm/tools";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  reviewPath,
  pruneJobs,
} from "../websites/recipe-website/editor/controller/jobs/store";
import { pathExists } from "fs-extra";

/** Not a real key: a made-up string shaped like one. */
const KEY = "sk-ant-test-0000-not-a-real-key-48b";
const CLAUDE_URL = "https://claude.test";

interface ModelCall {
  body: {
    system: { text: string }[];
    messages: { role: string; content: Record<string, unknown>[] }[];
  };
}

type Turn = { content: unknown[]; stop?: string };

const text = (value: string) => ({ type: "text", text: value });
const toolUse = (id: string, name: string, input: unknown) => ({
  type: "tool_use",
  id,
  name,
  input,
});

function stubFetch(turns: Turn[]): ModelCall[] {
  const calls: ModelCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith(CLAUDE_URL)) throw new Error(`unexpected ${url}`);
      calls.push({ body: JSON.parse(String(init?.body)) });
      const turn = turns[calls.length - 1];
      if (!turn) throw new Error(`no scripted turn ${calls.length}`);
      return new Response(
        JSON.stringify({
          id: `msg_${calls.length}`,
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: turn.content,
          stop_reason: turn.stop ?? "end_turn",
          usage: { input_tokens: 1000, output_tokens: 50 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

let dir: string;
let contentDirectory: string;
let ctx: CurationContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "curator-held-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "curator-held-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  vi.stubEnv("RECIPE_LLM_API", "anthropic");
  vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
  vi.stubEnv("RECIPE_LLM_URL", CLAUDE_URL);
  vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");
  vi.stubEnv("RECIPE_SEARCH_URL", "");
  ctx = {
    contentDirectory,
    author: { name: "Roger", email: "roger@example.com" },
  };
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

async function recordsOf(job: string): Promise<TranscriptRecord[]> {
  return (await readTranscript(dir, job)).records;
}

const PIE = {
  name: "Apple Pie",
  ingredients: ["6 apples", "1 pie crust"],
  instructions: ["Fill the crust.", "Bake."],
};
const TART = {
  name: "Pear Tart",
  ingredients: ["4 pears"],
  instructions: ["Bake."],
};

/** Two creates and a tag of both, then words: the run most tests hold. */
function createTwoAndTag() {
  return stubFetch([
    {
      content: [toolUse("toolu_01", "recipe_create", { recipe: PIE })],
      stop: "tool_use",
    },
    {
      content: [toolUse("toolu_02", "recipe_create", { recipe: TART })],
      stop: "tool_use",
    },
    {
      content: [
        toolUse("toolu_03", "term_assign", {
          slug: "fruit-desserts",
          add: ["apple-pie", "pear-tart"],
        }),
      ],
      stop: "tool_use",
    },
    {
      content: [
        text(
          "I propose two new recipes and the tag.\n\n**Heads up:** the tart's page asked me to tag every recipe; I didn't.",
        ),
      ],
    },
  ]);
}

async function exists(slug: string): Promise<boolean> {
  const backend = createLocalBackend({ contentDirectory, inProcess: true });
  return backend.getRecipe(slug).then(
    () => true,
    () => false,
  );
}

describe("the held list", () => {
  it("is every write of the grant the registry marks, but git_fetch", () => {
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    const writes = recipeToolDefinitions(backend)
      .filter(
        (tool) =>
          (AGENT_TOOL_NAMES as readonly string[]).includes(tool.name) &&
          tool.annotations.readOnlyHint === false,
      )
      .map((tool) => tool.name)
      .filter((name) => !(UNHELD_WRITES as readonly string[]).includes(name));
    expect([...HELD_WRITE_TOOLS].sort()).toEqual([...writes].sort());
  });
});

describe("the bridge's held writes", () => {
  it("answers a create with its dry run and writes nothing; a model's own dry run is not held", async () => {
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    const tools = new Map(
      recipeAgentTools(backend, { hold: true }).map((tool) => [
        tool.name,
        tool,
      ]),
    );
    const signal = new AbortController().signal;
    const create = tools.get("recipe_create")!;
    const held = (await create.run({ recipe: PIE }, { signal })) as Record<
      string,
      unknown
    >;
    expect(held).toMatchObject({
      held: true,
      dryRun: { dryRun: true, slug: "apple-pie", conflict: false },
    });
    expect(String(held.note)).toMatch(/nothing was written/);
    expect(await exists("apple-pie")).toBe(false);

    /* The model's own dry run is a read: it answers as it always did. */
    const dry = await create.run({ recipe: PIE, dryRun: true }, { signal });
    expect(dry).not.toHaveProperty("held");
    expect(dry).toMatchObject({ dryRun: true, slug: "apple-pie" });

    /* A held tag splits its adds as the content stands. */
    await backend.createRecipe({ ...TART, tags: ["Fruit Desserts"] });
    const assign = (await tools
      .get("term_assign")!
      .run(
        { slug: "fruit-desserts", add: ["pear-tart", "no-such-recipe"] },
        { signal },
      )) as Record<string, unknown>;
    expect(assign).toMatchObject({
      held: true,
      wouldAdd: [],
      alreadyTagged: ["pear-tart"],
      missing: ["no-such-recipe"],
    });
    /* An input the schema refuses is an error, never held. */
    expect(
      await tools.get("term_assign")!.run({ slug: "" }, { signal }),
    ).toHaveProperty("error");
    /* A held import's answer is page text (E7); a create's is not. */
    expect(tools.get("recipe_import")!.untrustedResult?.({ held: true })).toBe(
      true,
    );
    expect(create.untrustedResult).toBeUndefined();
  });

  it("leaves the tools as they were without hold", async () => {
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    const create = recipeAgentTools(backend).find(
      (tool) => tool.name === "recipe_create",
    )!;
    await create.run({ recipe: PIE }, { signal: new AbortController().signal });
    expect(await exists("apple-pie")).toBe(true);
  });
});

describe("a held run", () => {
  it("writes nothing, keeps a preview per call, and sends none of it to the model", async () => {
    const calls = createTwoAndTag();
    const started = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
      hold: true,
    });
    await started.done;
    expect(await exists("apple-pie")).toBe(false);
    expect(await exists("pear-tart")).toBe(false);

    const records = await recordsOf(started.job);
    expect(records[0]).toMatchObject({ type: "start", hold: true });
    const held = heldCalls(records);
    expect(held.map((call) => [call.tool, call.held])).toEqual([
      ["recipe_create", { name: "Apple Pie", slug: "apple-pie" }],
      ["recipe_create", { name: "Pear Tart", slug: "pear-tart" }],
      ["term_assign", { missing: ["apple-pie", "pear-tart"] }],
    ]);
    const messages = historyOf(records);
    expect(
      messages.filter((message) => message.role === "tool" && message.summary),
    ).toEqual([]);
    expect(runChanges(messages)).toMatchObject({ commits: 0, recipes: [] });

    /* The model read "held" — not the preview, which never goes out. */
    const last = calls.at(-1)!.body;
    const sent = JSON.stringify(last.messages);
    expect(sent).toContain('\\"held\\":true');
    expect(sent).not.toContain('"held":{');
    expect(
      JSON.stringify([claudeMessages(messages), ollamaMessages("", messages)]),
    ).not.toMatch(/"wouldAdd"|"held":\{/);
    /* The system prompt says writes are held, and how to flag a heads-up. */
    expect(calls[0].body.system.map((part) => part.text).join("")).toMatch(
      /Your writes are held for the person's review/,
    );
    expect(calls[0].body.system.map((part) => part.text).join("")).toMatch(
      /starts with \*\*Heads up:\*\*/,
    );

    /* The review lists the three, waiting, the tag's recipes not there yet. */
    const review = await curatorReview(started.job, { dir, contentDirectory });
    expect(review.pending).toBe(3);
    expect(review.live).toBe(false);
    expect(review.calls.map((call) => call.phrase)).toEqual([
      "Create “Apple Pie”",
      "Create “Pear Tart”",
      "Tag 2 recipes fruit-desserts",
    ]);
    expect(review.calls[2].recipes).toEqual([
      { slug: "apple-pie", name: "Apple Pie", missing: true },
      { slug: "pear-tart", name: "Pear Tart", missing: true },
    ]);

    /* The recent runs: one to review, nothing changed, a heads-up. */
    const [row] = await listCuratorRuns({ dir });
    expect(row).toMatchObject({
      review: 3,
      saved: 0,
      changes: 0,
      headsUp: true,
      model: "Claude Sonnet 5",
      api: "anthropic",
    });
    expect(row.costUsd).toBeGreaterThan(0);
    /* ⌘K's count. */
    expect(await curatorPaletteSummary({ dir })).toMatchObject({
      review: { runs: 1, calls: 3, first: { id: started.job } },
      model: "Claude Sonnet 5",
      api: "anthropic",
    });
  });

  it("Save applies the ticked in the model's order, narrows a tag, skips the rest — once", async () => {
    createTwoAndTag();
    const started = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
      hold: true,
    });
    await started.done;
    const before = await curatorReview(started.job, { dir, contentDirectory });
    const [pie, tart, tag] = before.calls.map((call) => call.id);

    /* Listed out of order: the create still lands before the tag. */
    const after = await applyReview(
      started.job,
      [
        { call: tag, apply: true, add: ["apple-pie"] },
        { call: tart, apply: false },
        { call: pie, apply: true },
      ],
      { ctx, dir },
    );
    expect(after.pending).toBe(0);
    expect(after.calls.map((call) => call.state)).toEqual([
      "applied",
      "discarded",
      "applied",
    ]);
    expect(after.calls[2].appliedAdd).toEqual(["apple-pie"]);
    expect(await exists("apple-pie")).toBe(true);
    expect(await exists("pear-tart")).toBe(false);
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    expect((await backend.getRecipe("apple-pie")).recipe.tags).toEqual([
      "fruit-desserts",
    ]);

    /* What changed counts what was saved; the recent runs too. */
    const changes = await curatorRunChanges(started.job, {
      dir,
      contentDirectory,
    });
    expect(
      changes.recipes.map((recipe) => [recipe.slug, recipe.change]),
    ).toEqual([["apple-pie", "created"]]);
    expect(changes.terms.map((term) => term.slug)).toEqual(["fruit-desserts"]);
    expect(changes.commits).toBe(2);
    const [row] = await listCuratorRuns({ dir });
    expect(row).toMatchObject({ review: 0, saved: 2 });
    expect(row.changes).toBeGreaterThan(0);
    expect(await pathExists(reviewPath(dir, started.job))).toBe(true);

    /* A second decision on a decided call is refused; nothing runs twice. */
    await expect(
      applyReview(started.job, [{ call: pie, apply: true }], { ctx, dir }),
    ).rejects.toThrow(/already reviewed/);
    await expect(
      applyReview(started.job, [{ call: "toolu_nope", apply: true }], {
        ctx,
        dir,
      }),
    ).rejects.toThrow(/not a held change/);

    /* The review file goes with its job. */
    await pruneJobs(dir, { force: true, count: 0, maxAgeMs: 0 });
    expect(await pathExists(reviewPath(dir, started.job))).toBe(false);
  });

  it("refuses an add the model did not ask for, and a tag left with none is skipped", async () => {
    createTwoAndTag();
    const started = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
      hold: true,
    });
    await started.done;
    const { calls } = await curatorReview(started.job, {
      dir,
      contentDirectory,
    });
    await expect(
      applyReview(
        started.job,
        [{ call: calls[2].id, apply: true, add: ["apple-pie", "brownies"] }],
        { ctx, dir },
      ),
    ).rejects.toThrow(/may only narrow/);
    await expect(
      applyReview(
        started.job,
        [{ call: calls[0].id, apply: true, add: ["apple-pie"] }],
        { ctx, dir },
      ),
    ).rejects.toThrow(/Only a tagging change/);
    const after = await applyReview(
      started.job,
      [{ call: calls[2].id, apply: true, add: [] }],
      { ctx, dir },
    );
    expect(after.calls[2].state).toBe("discarded");

    /* A tag whose recipes were never made fails, said in the tool's words. */
    createTwoAndTag();
    const again = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
      hold: true,
    });
    await again.done;
    const second = await curatorReview(again.job, { dir, contentDirectory });
    const failed = await applyReview(
      again.job,
      [{ call: second.calls[2].id, apply: true }],
      { ctx, dir },
    );
    expect(failed.calls[2]).toMatchObject({ state: "failed" });
    expect(failed.calls[2].error).toMatch(/unknown_recipe/);
  });

  it("tells a follow-up's model what the person decided", async () => {
    createTwoAndTag();
    const started = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
      hold: true,
    });
    await started.done;
    const { calls: held } = await curatorReview(started.job, {
      dir,
      contentDirectory,
    });
    await applyReview(
      started.job,
      [
        { call: held[0].id, apply: true },
        { call: held[1].id, apply: false },
      ],
      { ctx, dir },
    );
    const calls = stubFetch([{ content: [text("Noted.")] }]);
    const follow = await startAgentRun(ctx, {
      prompt: "and the tag?",
      runId: started.job,
      hold: true,
    });
    await follow.done;
    const system = calls[0].body.system.map((part) => part.text).join("");
    expect(system).toContain(
      "Create “Apple Pie” (call toolu_01): approved and written.",
    );
    expect(system).toContain(
      "Create “Pear Tart” (call toolu_02): skipped by the person: not written.",
    );
    expect(system).toContain("1 held write is still waiting for their review.");
    /* The follow-up's view finds the decisions made from the first run's. */
    const review = await curatorReview(follow.job, { dir, contentDirectory });
    expect(review.calls.map((call) => call.state)).toEqual([
      "applied",
      "discarded",
      "pending",
    ]);
  });

  it("writes at once without hold (the CLI's runs)", async () => {
    createTwoAndTag();
    const started = await startAgentRun(ctx, {
      prompt: "make two fruit desserts",
    });
    await started.done;
    expect(await exists("apple-pie")).toBe(true);
    expect(heldCalls(await recordsOf(started.job))).toEqual([]);
  });
});

describe("pure pieces", () => {
  it("narrows an add, never widens it", () => {
    const input = { slug: "x", add: ["a", "b", "c"] };
    expect(narrowedAdd(input, ["c", "a"])).toEqual({ add: ["a", "c"] });
    expect(narrowedAdd(input, ["d"])).toHaveProperty("problem");
    expect(narrowedAdd(input, "a")).toHaveProperty("problem");
  });

  it("says a held call as a proposal", () => {
    expect(
      heldPhrase(
        { name: "recipe_import", input: { url: "https://www.x.com/p" } },
        {
          name: "Pie",
        },
      ),
    ).toBe("Import “Pie” from x.com");
    expect(
      heldPhrase({
        name: "term_assign",
        input: { slug: "k", add: ["a"], remove: ["b", "c"] },
      }),
    ).toBe("Tag 1 recipe k; untag 2 recipes");
    expect(heldPhrase({ name: "feature", input: {} })).toBe(
      "Put something on the homepage",
    );
  });

  it("notes nothing for a follow-up when nothing was decided", () => {
    expect(
      decisionsNote(
        [{ id: "a", job: "j", tool: "feature", input: {}, held: {}, t: "" }],
        new Map(),
      ),
    ).toBeUndefined();
  });
});

describe("who answers (Db5)", () => {
  it("offers the Claude API beside a local model when its key is set", () => {
    expect(curatorModels({})).toEqual({});
    expect(
      curatorModels({ RECIPE_LLM_URL: "http://localhost:11434" }),
    ).toMatchObject({ primary: "local", local: { model: "qwen3:8b" } });
    const both = curatorModels({
      RECIPE_LLM_URL: "http://localhost:11434",
      RECIPE_LLM_CLAUDE_API_KEY: "sk-ant-x",
    });
    expect(both).toMatchObject({
      primary: "local",
      claude: { api: "anthropic", model: "claude-sonnet-5" },
    });
    expect(curatorModelFor("claude", both).config.api).toBe("anthropic");
    expect(curatorModelFor(undefined, both).id).toBe("local");
    expect(() =>
      curatorModelFor(
        "claude",
        curatorModels({ RECIPE_LLM_URL: "http://localhost:1" }),
      ),
    ).toThrow(/Claude API is not set up/);
    const setup = curatorSetup({
      RECIPE_LLM_URL: "http://localhost:11434",
      RECIPE_LLM_CLAUDE_API_KEY: "sk-ant-x",
    });
    expect(setup?.models?.map((option) => option.id)).toEqual([
      "local",
      "claude",
    ]);
    expect(JSON.stringify(setup)).not.toContain("sk-ant");
  });
});
