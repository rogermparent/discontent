// @vitest-environment node
//
// 44c: the `agent` job kind, end to end over a scripted model. The Claude
// API is `fetch` stubbed per turn — never a real model here or in CI, and
// KEY is a made-up string — against a temp content directory and a temp job
// store. Pinned: a run that searches then creates (the recipe exists after,
// the steps are the loop's, the transcript holds every message and an end
// record, nothing secret); what the model is offered (the 45, our
// web_fetch, Claude's server web_search, none of the 14 held back, the skill
// in the system prompt with its Claude-Code-only parts cut); a follow-up
// reads the run back as history and holds the whole conversation; a
// continue of a live run is refused; a cancel mid-tool stops the import and
// its steps nest under the tool's; the transcript is pruned with its job;
// `recipes agent --json`.

import {
  appendFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { main } from "../websites/recipe-website/editor/cli/index";
import { AGENT_HELD_BACK } from "../websites/recipe-website/editor/controller/agent/tools";
import {
  AGENT_TRANSCRIPT_MAX_BYTES,
  ConversationTooLongError,
  continueLockPath,
  getAgentRunView,
  startAgentRun,
} from "../websites/recipe-website/editor/controller/agent/runs";
import { processIdentity } from "@discontent/cms/git/fileLock";
import type { AgentJobResult } from "../websites/recipe-website/editor/controller/agent/job";
import {
  readTranscript,
  type TranscriptRecord,
} from "../websites/recipe-website/editor/controller/agent/transcript";
import { LOCAL_AGENT_TOOLS } from "../websites/recipe-website/editor/controller/agent/prompt";
import {
  ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
  ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER,
} from "../websites/recipe-website/editor/controller/llm/tools";
import {
  AGENT_MAX_COST_CEILING_USD,
  agentCostBudget,
} from "../websites/recipe-website/editor/controller/agent/job";
import { takesNewerWebTools } from "../websites/recipe-website/editor/controller/llm/client";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { cancelJob } from "../websites/recipe-website/editor/controller/jobs/run";
import {
  pruneJobs,
  readJobLog,
  readJobMeta,
  transcriptPath,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  buildStepTree,
  walkSteps,
  type StepNode,
} from "../websites/recipe-website/editor/controller/jobs/timeline";
import { retrySpecFor } from "../websites/recipe-website/editor/controller/jobs/kinds";

/** Not a real key: a made-up string shaped like one. */
const KEY = "sk-ant-test-0000-not-a-real-key-44c";
const CLAUDE_URL = "https://claude.test";

interface ModelCall {
  body: {
    system: { text: string }[];
    messages: { role: string; content: Record<string, unknown>[] }[];
    tools: Record<string, unknown>[];
  };
}

type Turn = {
  content: unknown[];
  stop?: string;
  usage?: Record<string, unknown>;
  container?: unknown;
};

const text = (value: string) => ({ type: "text", text: value });
const toolUse = (id: string, name: string, input: unknown) => ({
  type: "tool_use",
  id,
  name,
  input,
});

/**
 * `fetch`: the Claude API answers `turns` in order (a turn may be a
 * function, for one that waits); any other URL goes to `page`.
 */
function stubFetch(
  turns: (Turn | ((signal?: AbortSignal) => Promise<Response>))[],
  page?: (url: string, init?: RequestInit) => Promise<Response>,
): ModelCall[] {
  const calls: ModelCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith(CLAUDE_URL)) {
        calls.push({ body: JSON.parse(String(init?.body)) });
        const turn = turns[calls.length - 1];
        if (!turn) throw new Error(`no scripted turn ${calls.length}`);
        if (typeof turn === "function") return turn(init?.signal ?? undefined);
        return new Response(
          JSON.stringify({
            id: `msg_${calls.length}`,
            type: "message",
            role: "assistant",
            model: "claude-sonnet-5",
            content: turn.content,
            stop_reason: turn.stop ?? "end_turn",
            usage: turn.usage ?? { input_tokens: 1000, output_tokens: 50 },
            ...(turn.container ? { container: turn.container } : {}),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (page) return page(url, init);
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return calls;
}

let dir: string;
let contentDirectory: string;
let ctx: CurationContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-jobs-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "agent-jobs-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  vi.stubEnv("RECIPE_LLM_API", "anthropic");
  vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
  vi.stubEnv("RECIPE_LLM_URL", CLAUDE_URL);
  vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");
  vi.stubEnv("RECIPE_SEARCH_URL", "");
  vi.stubEnv("RECIPE_JOBS_FOLLOW_MS", "20");
  ctx = { contentDirectory };
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

async function transcriptOf(job: string): Promise<TranscriptRecord[]> {
  return (await readTranscript(dir, job)).records;
}

const PIE = {
  name: "Apple Pie",
  ingredients: ["6 apples", "1 pie crust"],
  instructions: ["Fill the crust.", "Bake."],
};

/** Search, create, answer: the run every test here starts from. */
function searchThenCreate() {
  return stubFetch([
    {
      content: [
        text("Looking first."),
        toolUse("toolu_01", "recipe_search", { query: "apple pie" }),
      ],
      stop: "tool_use",
    },
    {
      content: [toolUse("toolu_02", "recipe_create", { recipe: PIE })],
      stop: "tool_use",
    },
    { content: [text("Created [Apple Pie](/recipe/apple-pie).")] },
  ]);
}

describe("the agent job kind", () => {
  it("searches, creates, and keeps the conversation beside the job", async () => {
    const calls = searchThenCreate();
    const started = await startAgentRun(ctx, { prompt: "make an apple pie" });
    expect(started.status).toBe("running");
    await started.done;

    /* The recipe is there. */
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    expect((await backend.getRecipe("apple-pie")).recipe.name).toBe(
      "Apple Pie",
    );

    /* The job: done, a small result, the label the ask. */
    const meta = await readJobMeta(dir, started.job);
    expect(meta).toMatchObject({
      kind: "agent",
      status: "done",
      label: 'ask: "make an apple pie"',
    });
    const result = meta?.result as AgentJobResult;
    expect(result).toMatchObject({
      text: "Created [Apple Pie](/recipe/apple-pie).",
      stopReason: "done",
      turns: 3,
      toolCalls: 2,
      model: "claude-sonnet-5",
      api: "anthropic",
    });
    expect(result.usage.inputTokens).toBe(3000);
    expect(result.usage.costEstimateUsd).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("transcript");

    /* The steps are the loop's: a turn, a tool, a turn, a tool, a turn. */
    const { lines } = await readJobLog(dir, started.job);
    const tree = buildStepTree(lines);
    expect(tree.steps.map((node) => node.step)).toEqual([
      "agent.turn",
      "recipe_search",
      "agent.turn",
      "recipe_create",
      "agent.turn",
    ]);

    /* The transcript: start, every message as it happened, end. */
    const records = await transcriptOf(started.job);
    expect(records.map((record) => record.type)).toEqual([
      "start",
      "message",
      "message",
      "message",
      "message",
      "message",
      "message",
      "end",
    ]);
    expect(records[0]).toMatchObject({
      type: "start",
      job: started.job,
      model: "claude-sonnet-5",
      api: "anthropic",
      serverTools: ["web_search"],
    });
    const messages = records.flatMap((record) =>
      record.type === "message" ? [record.message] : [],
    );
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(messages[0]).toEqual({ role: "user", text: "make an apple pie" });
    /* Claude's blocks are kept for a follow-up (Ea4). */
    expect(messages[1]).toMatchObject({
      role: "assistant",
      raw: { api: "anthropic" },
    });
    expect(records.at(-1)).toMatchObject({
      type: "end",
      stop: "done",
      model: "claude-sonnet-5",
      turns: 3,
      toolCalls: 2,
    });
    expect(
      (records.at(-1) as Extract<TranscriptRecord, { type: "end" }>)
        .costEstimate,
    ).toBeGreaterThan(0);

    /* Never a key or a header. */
    const raw = await readFile(transcriptPath(dir, started.job), "utf8");
    expect(raw).not.toContain(KEY);
    expect(raw).not.toMatch(/x-api-key|authorization/i);

    /* The view: the steps and the transcript, raw blocks left out. */
    const view = await getAgentRunView(started.job, { dir });
    expect(view.live).toBe(false);
    expect(view.transcript).toHaveLength(8);
    expect(JSON.stringify(view.transcript)).not.toContain('"raw"');
    expect(view.transcriptNext).toBe(Buffer.byteLength(raw));
    const tail = await getAgentRunView(started.job, {
      dir,
      transcriptFrom: view.transcriptNext,
    });
    expect(tail.transcript).toEqual([]);

    /* The second turn carried the search's result back. */
    expect(calls).toHaveLength(3);
    expect(calls[1].body.messages.at(-1)?.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_01",
    });
  });

  it("offers Claude the 45, our web_fetch and its server web_search — none held back", async () => {
    const calls = stubFetch([{ content: [text("Nothing to do.")] }]);
    const started = await startAgentRun(ctx, { prompt: "hello" });
    await started.done;

    const { tools, system } = calls[0].body;
    const names = tools.map((tool) => String(tool.name));
    expect(names).toHaveLength(47);
    for (const held of AGENT_HELD_BACK) expect(names).not.toContain(held);
    /* Our fetch, a client tool with a schema (44a's finding, E6). */
    expect(tools.find((tool) => tool.name === "web_fetch")).toHaveProperty(
      "input_schema",
    );
    /* Claude's search, declared, never ours beside it. */
    expect(tools.filter((tool) => tool.name === "web_search")).toEqual([
      { type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: 5 },
    ]);

    /* The skill, with the editor's preamble and without Claude Code's parts. */
    const prompt = system.map((block) => block.text).join("\n");
    expect(prompt).toContain("inside Roger's recipe editor");
    expect(prompt).toContain("<untrusted_page_text>");
    expect(prompt).toMatch(/Today is \d{4}-\d{2}-\d{2} \(/);
    expect(prompt).toContain("## 6b. A roundup");
    expect(prompt).toContain("# Worked transcripts");
    expect(prompt).not.toContain("$ARGUMENTS");
    expect(prompt).not.toContain("## Fallback (CLI)");
    expect(prompt).not.toContain("pnpm --silent recipes");
    expect(prompt).not.toContain("claude-code-only");
    expect(prompt).not.toContain("allowed-tools:");
  });

  it("offers a local model the subset, and SearXNG's web_search only when set", async () => {
    vi.stubEnv("RECIPE_LLM_API", "openai");
    vi.stubEnv("RECIPE_LLM_URL", "http://model.test/v1");
    vi.stubEnv("RECIPE_LLM_API_KEY", "");
    vi.stubEnv("RECIPE_SEARCH_URL", "http://127.0.0.1:8888");
    const bodies: {
      tools: { function: { name: string } }[];
      messages: { content: string }[];
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { role: "assistant", content: "Nothing to do." },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 900, completion_tokens: 9 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const started = await startAgentRun(ctx, { prompt: "hello" });
    await started.done;
    const names = bodies[0].tools.map((tool) => tool.function.name);
    expect(names).toEqual([...LOCAL_AGENT_TOOLS, "web_fetch", "web_search"]);
    for (const held of AGENT_HELD_BACK) expect(names).not.toContain(held);
    const system = bodies[0].messages[0].content;
    /* 44e: the condensed curator, not the server's instructions or the skill. */
    expect(system).toContain("## Workflow");
    expect(system).toContain("**Search the site first**");
    expect(system).not.toContain(
      "Manage and search a recipe website's content.",
    );
    expect(system).not.toContain("## 6b. A roundup");
    /* The tools' local view: short descriptions (44e). */
    const imports = bodies[0].tools.find(
      (tool) => tool.function.name === "recipe_import",
    ) as unknown as { function: { description: string } };
    expect(imports.function.description.length).toBeLessThan(400);

    vi.stubEnv("RECIPE_SEARCH_URL", "");
    bodies.length = 0;
    await (
      await startAgentRun(ctx, { prompt: "hello" })
    ).done;
    expect(bodies[0].tools.map((tool) => tool.function.name)).not.toContain(
      "web_search",
    );
    expect(bodies[0].messages[0].content).toContain("There is no web search");
  });

  it("stops a Claude run at its cost budget (46d): a clean stop, said in the job and the transcript", async () => {
    vi.stubEnv("RECIPE_AGENT_MAX_COST_USD", "0.25");
    /* Claude Sonnet 5: 100k input + 1k output tokens ≈ $0.21 a turn. */
    const usage = { input_tokens: 100_000, output_tokens: 1_000 };
    const calls = stubFetch([
      {
        content: [toolUse("toolu_c1", "recipe_search", { query: "pie" })],
        stop: "tool_use",
        usage,
      },
      {
        content: [toolUse("toolu_c2", "recipe_search", { query: "tart" })],
        stop: "tool_use",
        usage,
      },
      { content: [text("never reached")] },
    ]);
    const started = await startAgentRun(ctx, { prompt: "find pies" });
    await started.done;
    /* $0.21 spent, and a turn like it would pass $0.25: no second call. */
    expect(calls).toHaveLength(1);

    const meta = await readJobMeta(dir, started.job);
    /* A budget's end is not a failure (44c). */
    expect(meta?.status).toBe("done");
    expect(meta?.result).toMatchObject({
      stopReason: "budget:cost",
      maxCostUsd: 0.25,
      error:
        "Stopped at the cost budget ($0.25): about $0.21 spent, and another turn like the last (about $0.21) would pass it",
      turns: 1,
      toolCalls: 1,
    });
    const records = await transcriptOf(started.job);
    expect(records[0]).toMatchObject({ type: "start", maxCostUsd: 0.25 });
    expect(records.at(-1)).toMatchObject({
      type: "end",
      stop: "budget:cost",
      maxCostUsd: 0.25,
    });
    const { lines } = await readJobLog(dir, started.job);
    expect(JSON.stringify(lines)).toContain(
      "Stopped at the cost budget ($0.25)",
    );
  });

  it("gives a Claude run the newer web tools when asked, keeps them on a follow-up, and a local model ignores them (46d)", async () => {
    const calls = stubFetch([
      { content: [text("Searched.")], container: { id: "container_01" } },
      { content: [text("Again.")] },
      { content: [text("Basic.")] },
      { content: [text("Haiku.")] },
    ]);
    const first = await startAgentRun(ctx, {
      prompt: "find cookies",
      newerWebTools: true,
    });
    await first.done;
    const search = (index: number) =>
      calls[index].body.tools.filter((tool) => tool.name === "web_search");
    expect(search(0)).toEqual([
      {
        type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER,
        name: "web_search",
        max_uses: 5,
      },
    ]);
    expect((await readJobMeta(dir, first.job))?.spec).toMatchObject({
      newerWebTools: true,
    });
    expect((await readJobMeta(dir, first.job))?.result).toMatchObject({
      newerWebTools: true,
      maxCostUsd: 1,
    });
    expect((await transcriptOf(first.job))[0]).toMatchObject({
      type: "start",
      newerWebTools: true,
    });

    /* A follow-up keeps the conversation's setting, and its container. */
    const second = await startAgentRun(ctx, {
      prompt: "two more",
      runId: first.job,
    });
    await second.done;
    expect(search(1)[0].type).toBe(ANTHROPIC_WEB_SEARCH_TOOL_TYPE_NEWER);
    expect((calls[1].body as Record<string, unknown>).container).toBe(
      "container_01",
    );
    expect((await readJobMeta(dir, second.job))?.spec).toMatchObject({
      newerWebTools: true,
    });

    /* The default stays basic. */
    const third = await startAgentRun(ctx, { prompt: "plain" });
    await third.done;
    expect(search(2)[0].type).toBe(ANTHROPIC_WEB_SEARCH_TOOL_TYPE);
    expect((await readJobMeta(dir, third.job))?.spec).not.toHaveProperty(
      "newerWebTools",
    );

    /* 46d: a Haiku does not take them: the basic search, and the log says why. */
    vi.stubEnv("RECIPE_LLM_MODEL", "claude-haiku-4-5");
    const haiku = await startAgentRun(ctx, {
      prompt: "find cookies",
      newerWebTools: true,
    });
    await haiku.done;
    expect(search(3)[0].type).toBe(ANTHROPIC_WEB_SEARCH_TOOL_TYPE);
    expect(calls[3].body as Record<string, unknown>).not.toHaveProperty(
      "container",
    );
    expect((await readJobMeta(dir, haiku.job))?.result).not.toHaveProperty(
      "newerWebTools",
    );
    expect(JSON.stringify((await readJobLog(dir, haiku.job)).lines)).toContain(
      "ignored newerWebTools: claude-haiku-4-5 does not take them",
    );
    expect(takesNewerWebTools("claude-haiku-5-5")).toBe(false);
    expect(takesNewerWebTools("claude-opus-4-6")).toBe(true);
    expect(takesNewerWebTools("claude-sonnet-4-5-20250929")).toBe(false);
    vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");

    /* A local model has no server tools: ignored, and the log says so. */
    vi.stubEnv("RECIPE_LLM_API", "openai");
    vi.stubEnv("RECIPE_LLM_URL", "http://model.test/v1");
    vi.stubEnv("RECIPE_LLM_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { role: "assistant", content: "ok" },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 9, completion_tokens: 1 },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const local = await startAgentRun(ctx, {
      prompt: "find cookies",
      newerWebTools: true,
    });
    await local.done;
    const result = (await readJobMeta(dir, local.job))?.result as
      AgentJobResult | undefined;
    expect(result?.stopReason).toBe("done");
    expect(result).not.toHaveProperty("newerWebTools");
    expect(result).not.toHaveProperty("maxCostUsd");
    expect(JSON.stringify((await readJobLog(dir, local.job)).lines)).toContain(
      "ignored newerWebTools",
    );
  });

  it("follows up on a run: its transcript is the history, and the new one holds it all", async () => {
    searchThenCreate();
    const first = await startAgentRun(ctx, { prompt: "make an apple pie" });
    await first.done;

    const calls = stubFetch([{ content: [text("One more: done.")] }]);
    const second = await startAgentRun(ctx, {
      prompt: "and one more like that",
      runId: first.job,
    });
    expect(second.continues).toBe(first.job);
    await second.done;

    /* The model saw the whole conversation, the new ask last. */
    const sent = calls[0].body.messages;
    expect(sent[0]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "make an apple pie" }],
    });
    expect(JSON.stringify(sent)).toContain("toolu_02");
    expect(JSON.stringify(sent.at(-1))).toContain("and one more like that");

    const meta = await readJobMeta(dir, second.job);
    expect(meta?.label).toBe('follow-up: "and one more like that"');
    expect(meta?.result).toMatchObject({
      continues: first.job,
      stopReason: "done",
    });

    /* The first run's lines, verbatim, then the follow-up's own. */
    const before = await transcriptOf(first.job);
    const after = await transcriptOf(second.job);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after[before.length]).toMatchObject({
      type: "start",
      job: second.job,
      continues: first.job,
    });
    expect(
      after
        .slice(before.length)
        .filter((record) => record.type === "message")
        .map((record) =>
          record.type === "message" ? record.message.role : undefined,
        ),
    ).toEqual(["user", "assistant"]);

    /* A run is never retried: ask again, or follow up. */
    await expect(
      retrySpecFor(meta as NonNullable<typeof meta>, ctx),
    ).rejects.toMatchObject({ code: "usage" });
  });

  it("refuses to continue a live run, or a job that is not a run", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubFetch([
      async (signal) => {
        await Promise.race([
          waiting,
          new Promise((_, reject) =>
            signal?.addEventListener("abort", () => reject(signal.reason)),
          ),
        ]);
        return new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [text("ok")],
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    ]);
    const live = await startAgentRun(ctx, { prompt: "slow" });
    await expect(
      startAgentRun(ctx, { prompt: "more", runId: live.job }),
    ).rejects.toMatchObject({ code: "job_live" });
    release();
    await live.done;

    await expect(
      startAgentRun(ctx, {
        prompt: "more",
        runId: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    /* The prompt cap, and no model at all. */
    await expect(
      startAgentRun(ctx, { prompt: "x".repeat(4_001) }),
    ).rejects.toMatchObject({ code: "usage" });
    vi.stubEnv("RECIPE_LLM_API", "");
    vi.stubEnv("RECIPE_LLM_URL", "");
    await expect(startAgentRun(ctx, { prompt: "hi" })).rejects.toMatchObject({
      code: "usage",
    });
  });

  it("starts one follow-up of a run however many are asked at once (44c review)", async () => {
    stubFetch([{ content: [text("ok")] }]);
    const first = await startAgentRun(ctx, { prompt: "make an apple pie" });
    await first.done;

    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = async (signal?: AbortSignal) => {
      await Promise.race([
        waiting,
        new Promise((_, reject) =>
          signal?.addEventListener("abort", () => reject(signal.reason)),
        ),
      ]);
      return new Response(
        JSON.stringify({
          id: "msg_slow",
          type: "message",
          role: "assistant",
          content: [text("more")],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    stubFetch([slow, slow]);

    /* A double-click: two follow-ups of one run, at once. */
    const both = await Promise.allSettled([
      startAgentRun(ctx, { prompt: "and another", runId: first.job }),
      startAgentRun(ctx, { prompt: "and another", runId: first.job }),
    ]);
    const started = both.filter((entry) => entry.status === "fulfilled");
    const refused = both.filter((entry) => entry.status === "rejected");
    expect(started).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "job_live",
    });
    const live = (
      started[0] as PromiseFulfilledResult<
        Awaited<ReturnType<typeof startAgentRun>>
      >
    ).value;

    /* Later, while that follow-up runs: refused, naming it. */
    await expect(
      startAgentRun(ctx, { prompt: "a third", runId: first.job }),
    ).rejects.toMatchObject({
      code: "job_live",
      job: live.job,
      message: expect.stringContaining(
        `already being continued by ${live.job}`,
      ),
    });

    release();
    await live.done;
    const runs = (await readdir(dir)).filter((name) =>
      name.endsWith(".meta.json"),
    );
    expect(runs).toHaveLength(2);
    /* The guard leaves nothing behind. */
    expect(
      (await readdir(dir)).filter((name) => name.includes(".continue.lock")),
    ).toEqual([]);
  });

  it("waits for another process's follow-up start, and refuses past the wait", async () => {
    stubFetch([{ content: [text("ok")] }, { content: [text("more")] }]);
    const first = await startAgentRun(ctx, { prompt: "make an apple pie" });
    await first.done;

    /* Another live process (pid 1, on this host and pid namespace) holds it. */
    const lock = continueLockPath(dir, first.job);
    await writeFile(
      lock,
      JSON.stringify({
        ...processIdentity(),
        pid: 1,
        nonce: "another-process",
        continueId: "01JOTHERPROCESSOTHERPROCES",
      }),
    );
    await expect(
      startAgentRun(
        ctx,
        { prompt: "and another", runId: first.job },
        { continueLockWaitMs: 150 },
      ),
    ).rejects.toMatchObject({
      code: "job_live",
      message: expect.stringContaining("another process"),
    });
    /* Its lock is left to it. */
    await expect(readFile(lock, "utf8")).resolves.toContain("another-process");

    /* Once it lets go, the follow-up starts. */
    await rm(lock);
    const second = await startAgentRun(ctx, {
      prompt: "and another",
      runId: first.job,
    });
    await second.done;
    expect(second.continues).toBe(first.job);
  });

  it("refuses a follow-up from another content directory, or of a conversation too long", async () => {
    stubFetch([{ content: [text("ok")] }]);
    const first = await startAgentRun(ctx, { prompt: "make an apple pie" });
    await first.done;

    const elsewhere = await mkdtemp(join(tmpdir(), "agent-jobs-other-"));
    try {
      await expect(
        startAgentRun(
          { contentDirectory: elsewhere },
          { prompt: "and another", runId: first.job },
        ),
      ).rejects.toMatchObject({
        code: "usage",
        message: expect.stringContaining("not this content directory"),
      });
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }

    await appendFile(
      transcriptPath(dir, first.job),
      `${JSON.stringify({ type: "note", pad: "x".repeat(AGENT_TRANSCRIPT_MAX_BYTES) })}\n`,
    );
    await expect(
      startAgentRun(ctx, { prompt: "and another", runId: first.job }),
    ).rejects.toBeInstanceOf(ConversationTooLongError);
    await expect(
      startAgentRun(ctx, { prompt: "and another", runId: first.job }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("start a new one"),
    });
  });

  it("reads a transcript from its offset, a line at a time if it must", async () => {
    const file = transcriptPath(dir, "01JTRANSCRIPTREADTRANSCRIP");
    const line = (n: number, pad = "") =>
      `${JSON.stringify({ t: "x", type: "start", job: `j${n}`, pad })}\n`;
    await writeFile(file, line(1) + line(2, "y".repeat(500)) + '{"type":"st');
    const id = "01JTRANSCRIPTREADTRANSCRIP";

    const all = await readTranscript(dir, id);
    expect(all.records.map((record) => record.job)).toEqual(["j1", "j2"]);
    /* The partial last line is left for next time. */
    expect(all.next).toBe(
      Buffer.byteLength(line(1) + line(2, "y".repeat(500))),
    );
    expect(await readTranscript(dir, id, all.next)).toEqual({
      records: [],
      next: all.next,
    });

    /* From the second line's offset: only it. */
    const second = await readTranscript(dir, id, Buffer.byteLength(line(1)));
    expect(second.records.map((record) => record.job)).toEqual(["j2"]);

    /* A cap smaller than a line: one line per read, the long one whole. */
    const first = await readTranscript(dir, id, 0, { maxBytes: 40 });
    expect(first.records.map((record) => record.job)).toEqual(["j1"]);
    expect(first.more).toBe(true);
    const next = await readTranscript(dir, id, first.next, { maxBytes: 40 });
    expect(next.records.map((record) => record.job)).toEqual(["j2"]);
    expect(next.next).toBe(all.next);

    /* The line finished: read from where it was left. */
    await appendFile(file, 'art","job":"j3"}\n');
    const last = await readTranscript(dir, id, all.next);
    expect(last.records.map((record) => record.job)).toEqual(["j3"]);
  });

  it("stops an import in flight when the run is cancelled, its steps under the tool's", async () => {
    let pageSignal: AbortSignal | undefined;
    let fetched!: () => void;
    const pageFetched = new Promise<void>((resolve) => {
      fetched = resolve;
    });
    stubFetch(
      [
        {
          content: [
            toolUse("toolu_01", "recipe_import", {
              url: "https://93.184.215.14/apple-pie/",
            }),
          ],
          stop: "tool_use",
        },
      ],
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          pageSignal = init?.signal ?? undefined;
          fetched();
          pageSignal?.addEventListener("abort", () =>
            reject(pageSignal?.reason),
          );
        }),
    );
    const started = await startAgentRun(ctx, { prompt: "import this pie" });
    await pageFetched;
    expect(pageSignal?.aborted).toBe(false);
    expect(cancelJob(started.job)).toBe(true);
    await started.done;

    expect(pageSignal?.aborted).toBe(true);
    const meta = await readJobMeta(dir, started.job);
    expect(meta?.status).toBe("cancelled");
    expect(meta?.result).toMatchObject({ stopReason: "cancelled" });

    /* The import ran inside the run's job: its steps under the tool call's. */
    const tree = buildStepTree((await readJobLog(dir, started.job)).lines);
    const tool = tree.flat.find((node) => node.step === "recipe_import");
    expect(tool).toBeDefined();
    const nested = walkSteps((tool as StepNode).children);
    expect(nested.length).toBeGreaterThan(0);
    expect(tool?.status).toBe("failed");
    /* No job of its own: the store holds the run alone. */
    const metas = (await readdir(dir)).filter((name) =>
      name.endsWith(".meta.json"),
    );
    expect(metas).toEqual([`${started.job}.meta.json`]);

    /* The transcript answers the call and ends cancelled. */
    const records = await transcriptOf(started.job);
    const result = records.find(
      (record) => record.type === "message" && record.message.role === "tool",
    );
    expect(result).toMatchObject({
      message: { toolCallId: "toolu_01", name: "recipe_import" },
    });
    expect(records.at(-1)).toMatchObject({ type: "end", stop: "cancelled" });
  });

  it("prunes a run's transcript with the run", async () => {
    stubFetch([{ content: [text("ok")] }]);
    const started = await startAgentRun(ctx, { prompt: "hello" });
    await started.done;
    const file = transcriptPath(dir, started.job);
    await expect(readFile(file, "utf8")).resolves.toContain('"type":"end"');
    await pruneJobs(dir, { force: true, count: 0 });
    await expect(readFile(file, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("agentCostBudget (46d)", () => {
  const claude = { api: "anthropic" as const, model: "claude-sonnet-5" };

  it("caps a priced Claude model at $1 unless the env says otherwise", () => {
    expect(agentCostBudget(claude, {})).toEqual({ maxCostUsd: 1 });
    expect(
      agentCostBudget(claude, { RECIPE_AGENT_MAX_COST_USD: "2.5" }),
    ).toEqual({ maxCostUsd: 2.5 });
    expect(
      agentCostBudget(claude, { RECIPE_AGENT_MAX_COST_USD: "$0.40" }),
    ).toEqual({ maxCostUsd: 0.4 });
    for (const bad of [
      "0",
      "-1",
      "lots",
      String(AGENT_MAX_COST_CEILING_USD + 1),
    ]) {
      const budget = agentCostBudget(claude, {
        RECIPE_AGENT_MAX_COST_USD: bad,
      });
      expect(budget.maxCostUsd).toBe(1);
      expect(budget.ignored).toContain("RECIPE_AGENT_MAX_COST_USD=");
    }
  });

  it("gives no cap to a local model", () => {
    expect(
      agentCostBudget(
        { api: "ollama", model: "qwen3:8b" },
        { RECIPE_AGENT_MAX_COST_USD: "1" },
      ),
    ).toEqual({});
    /* A model on Claude's API that is not Claude's has no price at all. */
    const unpriced = agentCostBudget(
      { api: "anthropic", model: "mystery-model" },
      {},
    );
    expect(unpriced.maxCostUsd).toBeUndefined();
    expect(unpriced.unpriced).toContain("no cost budget");
  });

  it("keeps the cap for an unlisted Claude model, priced at the highest listed rates", () => {
    const unlisted = agentCostBudget(
      { api: "anthropic", model: "claude-unknown-9" },
      {},
    );
    expect(unlisted.maxCostUsd).toBe(1);
    expect(unlisted.unpriced).toContain(
      "estimated at the highest listed price",
    );
    expect(
      agentCostBudget(
        { api: "anthropic", model: "claude-unknown-9" },
        { RECIPE_AGENT_MAX_COST_USD: "2" },
      ).maxCostUsd,
    ).toBe(2);
  });
});

describe("recipes agent", () => {
  function captureStdout(): { text: () => string } {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(
      (() => true) as typeof process.stderr.write,
    );
    return { text: () => chunks.join("") };
  }

  it("--json prints one object at the end, and exits 0", async () => {
    searchThenCreate();
    const out = captureStdout();
    const code = await main([
      "agent",
      "make",
      "an apple pie",
      "--json",
      "--content-dir",
      contentDirectory,
    ]);
    expect(code).toBe(0);
    const lines = out.text().trim().split("\n");
    expect(lines).toHaveLength(1);
    const outcome = JSON.parse(lines[0]);
    expect(outcome).toMatchObject({
      status: "done",
      stopReason: "done",
      text: "Created [Apple Pie](/recipe/apple-pie).",
      turns: 3,
      toolCalls: 2,
      model: "claude-sonnet-5",
    });
    expect(typeof outcome.job).toBe("string");
  });

  it("prints the run as it goes without --json, and exits 1 on an error", async () => {
    searchThenCreate();
    const out = captureStdout();
    expect(
      await main([
        "agent",
        "make an apple pie",
        "--content-dir",
        contentDirectory,
      ]),
    ).toBe(0);
    const printed = out.text();
    expect(printed).toContain("> make an apple pie");
    expect(printed).toContain('→ recipe_search {"query":"apple pie"}');
    expect(printed).toContain("← recipe_create: ok");
    expect(printed).toContain("Created [Apple Pie](/recipe/apple-pie).");
    expect(printed).toMatch(/^done$/m);

    /* A refusal ends the run on an error. */
    stubFetch([{ content: [text("No.")], stop: "refusal" }]);
    const failed = captureStdout();
    expect(
      await main([
        "agent",
        "do a thing",
        "--json",
        "--content-dir",
        contentDirectory,
      ]),
    ).toBe(1);
    expect(JSON.parse(failed.text().trim())).toMatchObject({
      status: "failed",
      stopReason: "error",
    });
  });

  it("refuses an empty or over-long ask before anything runs", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const out = captureStdout();
    expect(
      await main(["agent", "--json", "--content-dir", contentDirectory]),
    ).toBe(1);
    expect(JSON.parse(out.text().trim()).error.code).toBe("usage");
    expect(
      await main([
        "agent",
        "x".repeat(4_001),
        "--json",
        "--content-dir",
        contentDirectory,
      ]),
    ).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
