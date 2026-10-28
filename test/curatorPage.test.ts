// @vitest-environment node
//
// 44d: the curator page's logic — what a run changed (from its tool
// results), the conversation fold (rows, statuses, durations, segments),
// the phrases and words, ⌘K's hand-off rule, the links that stay in the
// app, a write the loop cut still counted (its summary), and the
// server's list of conversations and a run's changes over a temp job store
// and content directory. Never a model.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { processIdentity } from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";

import {
  WRITE_SUMMARY_MAX_ITEMS,
  assignedNote,
  changeCount,
  changesToShow,
  runChanges,
  writeSummary,
} from "../websites/recipe-website/editor/controller/agent/changes";
import {
  buildConversation,
  claudeModelName,
  costText,
  modelWords,
  stopWords,
  tokenText,
  toolPhrase,
} from "../websites/recipe-website/editor/controller/agent/conversation";
import {
  askLine,
  curatorRunChanges,
  curatorSetup,
  listCuratorRuns,
} from "../websites/recipe-website/editor/controller/agent/curator";
import {
  curatorHref,
  curatorOffers,
} from "../websites/recipe-website/editor/controller/agent/handoff";
import { runAgent } from "../websites/recipe-website/editor/controller/agent/loop";
import type { TranscriptRecord } from "../websites/recipe-website/editor/controller/agent/transcript";
import type {
  AgentMessage,
  AgentTool,
  AgentUsage,
} from "../websites/recipe-website/editor/controller/agent/types";
import {
  emptyUsage,
  ollamaMessages,
  type ChatToolsRequest,
  type ChatToolsResult,
} from "../websites/recipe-website/editor/controller/llm/tools";
import {
  askOffers,
  readsLikeQuestion,
} from "../websites/recipe-website/editor/controller/ask/question";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  transcriptPath,
  writeJobMeta,
  type JobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  detailText,
  fixedSitePath,
  hostsOf,
  siteSlugsOf,
  sitePath,
} from "../websites/recipe-website/editor/src/curator/links";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

let callN = 0;

function call(name: string, input: unknown) {
  callN += 1;
  return { id: `call_${callN}`, name, input };
}

/** An assistant turn with `calls`, and each call's result after it. */
function turn(
  calls: {
    call: ReturnType<typeof call>;
    result: unknown;
    isError?: boolean;
  }[],
  text = "",
): AgentMessage[] {
  return [
    { role: "assistant", text, toolCalls: calls.map((entry) => entry.call) },
    ...calls.map((entry): AgentMessage => ({
      role: "tool",
      toolCallId: entry.call.id,
      name: entry.call.name,
      content:
        typeof entry.result === "string"
          ? entry.result
          : JSON.stringify(entry.result),
      ...(entry.isError ? { isError: true } : {}),
    })),
  ];
}

const USAGE: AgentUsage = {
  inputTokens: 1_200,
  outputTokens: 80,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 9, 21, 12, 0, seconds)).toISOString();
}

/* ------------------------------------------------------------------ */
/* runChanges                                                           */
/* ------------------------------------------------------------------ */

describe("runChanges", () => {
  it("reads every write from its result, one commit per write call", () => {
    const messages: AgentMessage[] = [
      { role: "user", text: "find braises" },
      ...turn([
        {
          call: call("recipe_search", { query: "braise" }),
          result: { recipes: [] },
        },
        {
          call: call("recipe_create", { recipe: { name: "Pork Braise" } }),
          result: {
            slug: "pork-braise",
            date: 1,
            path: "p",
            url: "/recipe/pork-braise",
          },
        },
        {
          call: call("recipe_import", { url: "https://example.com/a" }),
          result: { slug: "imported-a", date: 2, path: "p", url: "u" },
        },
        {
          call: call("recipe_import", {
            url: "https://video.example/v",
            all: true,
          }),
          result: {
            batch: true,
            found: [],
            recipes: [
              { n: 1, name: "Side One", status: "imported", slug: "side-one" },
              { n: 2, name: "Side Two", status: "existing", slug: "side-two" },
              { n: 3, name: "Side Three", status: "failed" },
            ],
          },
        },
        {
          call: call("term_assign", {
            slug: "braises",
            add: ["pork-braise", "old-stew"],
          }),
          result: {
            slug: "braises",
            tag: "braises",
            updated: ["pork-braise", "old-stew"],
            unchanged: [],
            missing: [],
          },
        },
        {
          call: call("term_assign", {
            slug: "weeknight",
            add: ["plan-a"],
            type: "group",
          }),
          result: {
            slug: "weeknight",
            updated: ["plan-a"],
            unchanged: [],
            missing: [],
          },
        },
        {
          call: call("term_assign", { slug: "noop", add: ["pork-braise"] }),
          result: {
            slug: "noop",
            updated: [],
            unchanged: ["pork-braise"],
            missing: [],
          },
        },
        {
          call: call("group_create", { group: { name: "Sunday" } }),
          result: { slug: "sunday", date: 1, path: "p", url: "u" },
        },
        {
          call: call("feature", { target: "x" }),
          result: { slug: "featured-x" },
        },
        {
          call: call("inventory_add", { items: ["gin"] }),
          result: {
            items: ["gin"],
            added: ["gin"],
            removed: [],
            changed: true,
            path: "p",
          },
        },
        {
          call: call("shopping_add", { items: ["eggs"] }),
          result: { added: [], items: [], changed: false },
        },
        {
          call: call("recipe_import_list", {
            url: "https://example.com/roundup",
            all: true,
            term: "pies",
          }),
          result: {
            url: "u",
            total: 2,
            picked: [1, 2],
            remaining: [],
            requests: 3,
            results: [
              {
                n: 1,
                url: "a",
                name: "Pie A",
                status: "imported",
                slug: "pie-a",
              },
              {
                n: 2,
                url: "b",
                name: "Pie B",
                status: "existing",
                slug: "pie-b",
              },
            ],
            term: { slug: "pies", created: true, updated: ["pie-a", "pie-b"] },
          },
        },
      ]),
    ];
    const changes = runChanges(messages);
    expect(changes.recipes).toEqual([
      { slug: "pork-braise", name: "Pork Braise", change: "created" },
      { slug: "imported-a", change: "imported" },
      { slug: "side-one", name: "Side One", change: "imported" },
      { slug: "old-stew", change: "updated" },
      { slug: "pie-a", name: "Pie A", change: "imported" },
    ]);
    expect(changes.terms).toEqual([
      { slug: "braises" },
      { slug: "weeknight" },
      { slug: "pies" },
    ]);
    expect(changes.groups).toEqual([{ slug: "plan-a" }, { slug: "sunday" }]);
    expect(changes.places).toEqual(["featured", "inventory"]);
    /* create, import, batch 1, assign ×2, group, feature, inventory, roundup 1 + its term. */
    expect(changes.commits).toBe(10);
    expect(changeCount(changes)).toBe(5 + 3 + 2 + 2);
  });

  it("skips errors, dry runs, unparseable results and calls with no result", () => {
    const messages: AgentMessage[] = [
      ...turn([
        {
          call: call("recipe_create", { recipe: { name: "X" } }),
          result: { error: { code: "slug_conflict", message: "taken" } },
          isError: true,
        },
        {
          call: call("recipe_create", { recipe: { name: "Y" }, dryRun: true }),
          result: { dryRun: true, slug: "y", conflict: false },
        },
        {
          call: call("recipe_import", { url: "https://e.com", dryRun: true }),
          result: { dryRun: true, slug: "z" },
        },
        {
          call: call("recipe_update", { slug: "w" }),
          result: "not json [… cut: 3 more characters]",
        },
        {
          call: call("recipe_update", { slug: "v" }),
          result: { error: "not run: the run was cancelled" },
          isError: true,
        },
      ]),
      {
        role: "assistant",
        text: "",
        toolCalls: [call("recipe_create", { recipe: { name: "Never" } })],
      },
    ];
    const changes = runChanges(messages);
    expect(changes).toEqual({
      recipes: [],
      terms: [],
      groups: [],
      places: [],
      commits: 0,
    });
  });

  it("keeps a recipe's strongest change: created, then tagged, reads created", () => {
    const messages = [
      ...turn([
        { call: call("recipe_update", { slug: "a" }), result: { slug: "a" } },
        {
          call: call("recipe_create", { recipe: { name: "A" } }),
          result: { slug: "a" },
        },
        {
          call: call("recipe_set_image", {
            slug: "a",
            url: "https://e.com/a.jpg",
          }),
          result: { slug: "a" },
        },
      ]),
    ];
    expect(runChanges(messages).recipes).toEqual([
      { slug: "a", name: "A", change: "created" },
    ]);
    expect(runChanges(messages).commits).toBe(3);
  });

  it("still counts a write whose result the loop cut for the model (its summary)", async () => {
    /* A batch import whose `recipes` comes after a long `found`, and a late
     * shopping_add: both results are cut to a small context's share. */
    const found = Array.from({ length: 400 }, (_, index) => ({
      name: `Candidate recipe number ${index}`,
      url: `https://example.com/recipes/${index}`,
    }));
    const writes: AgentTool[] = [
      {
        name: "recipe_import",
        description: "Import.",
        inputSchema: { type: "object", properties: {} },
        run: async () => ({
          batch: true,
          found,
          recipes: [
            { status: "imported", slug: "braise-a", name: "Braise A" },
            { status: "skipped", slug: "braise-b" },
            { status: "imported", slug: "braise-c", name: "Braise C" },
          ],
        }),
      },
      {
        name: "shopping_add",
        description: "Add.",
        inputSchema: { type: "object", properties: {} },
        run: async () => ({ changed: true, items: found }),
      },
    ];
    const replies: ChatToolsResult[] = [
      {
        message: {
          role: "assistant",
          text: "",
          toolCalls: [
            { id: "i1", name: "recipe_import", input: {} },
            { id: "s1", name: "shopping_add", input: {} },
          ],
        },
        stop: "tool_use",
        usage: emptyUsage(),
        model: "scripted",
        api: "ollama",
        durationMs: 1,
      },
      {
        message: { role: "assistant", text: "done", toolCalls: [] },
        stop: "end",
        usage: emptyUsage(),
        model: "scripted",
        api: "ollama",
        durationMs: 1,
      },
    ];
    const sent: ChatToolsRequest[] = [];
    const result = await runAgent({
      system: "s",
      prompt: "import braises and list them",
      tools: writes,
      config: { url: "http://localhost:11434", model: "m", api: "ollama" },
      model: async (request) => {
        sent.push(request);
        return replies[sent.length - 1];
      },
      numCtx: 4096,
    });
    expect(result.stopReason).toBe("done");
    const results = result.transcript.filter(
      (m): m is Extract<AgentMessage, { role: "tool" }> => m.role === "tool",
    );
    for (const message of results) {
      expect(message.content).toMatch(/\[… cut: \d+ more characters\]$/);
    }
    expect(results.map((message) => message.summary)).toEqual([
      {
        commits: 2,
        recipes: [
          { slug: "braise-a", name: "Braise A", change: "imported" },
          { slug: "braise-c", name: "Braise C", change: "imported" },
        ],
      },
      { commits: 1, places: ["shopping"] },
    ]);
    const changes = runChanges(result.transcript);
    expect(changes.commits).toBe(3);
    expect(changes.recipes.map((recipe) => recipe.slug)).toEqual([
      "braise-a",
      "braise-c",
    ]);
    expect(changes.places).toEqual(["shopping"]);
    /* Without the summary the cut content counts nothing (the old bug). */
    expect(
      runChanges(
        result.transcript.map((message) =>
          message.role === "tool"
            ? { ...message, summary: undefined }
            : message,
        ),
      ).commits,
    ).toBe(0);
    /* The summary is never sent to the model. */
    const wire = JSON.stringify(
      ollamaMessages(sent[1].system, sent[1].messages),
    );
    expect(wire).not.toContain("summary");
    expect(wire).not.toContain('"commits"');
  });

  it("summarizes only writes that wrote, with capped lists", () => {
    expect(writeSummary("recipe_search", {}, { recipes: [] })).toBeUndefined();
    expect(
      writeSummary("recipe_create", { dryRun: true }, { slug: "x" }),
    ).toBeUndefined();
    expect(
      writeSummary("shopping_add", {}, { changed: false }),
    ).toBeUndefined();
    expect(
      writeSummary("recipe_update", {}, { error: { code: "not_found" } }),
    ).toBeUndefined();
    expect(
      writeSummary("recipe_update", { slug: "a" }, '{"slug":"a"}'),
    ).toEqual({ commits: 1, recipes: [{ slug: "a", change: "updated" }] });
    const updated = Array.from({ length: 100 }, (_, index) => `r-${index}`);
    const big = writeSummary(
      "term_assign",
      { slug: "korean" },
      { slug: "korean", updated },
    );
    expect(big?.commits).toBe(1);
    expect(big?.terms).toEqual(["korean"]);
    expect(big?.recipes).toHaveLength(WRITE_SUMMARY_MAX_ITEMS);
  });
});

/* ------------------------------------------------------------------ */
/* buildConversation                                                    */
/* ------------------------------------------------------------------ */

function message(
  job: string,
  t: string,
  message: AgentMessage,
): TranscriptRecord {
  return { t, type: "message", job, message };
}

function start(job: string, t: string, continues?: string): TranscriptRecord {
  return {
    t,
    type: "start",
    job,
    model: "qwen3:8b",
    api: "ollama",
    tools: ["recipe_search"],
    ...(continues ? { continues } : {}),
  };
}

function end(
  job: string,
  t: string,
  turns: number,
  toolCalls: number,
): TranscriptRecord {
  return {
    t,
    type: "end",
    job,
    stop: "done",
    usage: USAGE,
    model: "qwen3:8b",
    api: "ollama",
    turns,
    toolCalls,
    trimmed: 0,
    durationMs: 9_000,
  };
}

describe("buildConversation", () => {
  it("folds asks, turns, rows with durations, and an earlier run's end", () => {
    const records: TranscriptRecord[] = [
      start("A", at(0)),
      message("A", at(0), { role: "user", text: "find braises" }),
      message("A", at(2), {
        role: "assistant",
        text: "",
        toolCalls: [
          { id: "c1", name: "recipe_search", input: { query: "braise" } },
          {
            id: "c2",
            name: "web_fetch",
            input: { url: "https://www.sallysbakingaddiction.com/x" },
          },
        ],
      }),
      message("A", at(3), {
        role: "tool",
        toolCallId: "c1",
        name: "recipe_search",
        content: '{"recipes":[]}',
      }),
      message("A", at(7), {
        role: "tool",
        toolCallId: "c2",
        name: "web_fetch",
        content: '{"error":{"code":"fetch_failed","message":"403"}}',
        isError: true,
      }),
      message("A", at(8), {
        role: "assistant",
        text: "Found none.",
        toolCalls: [],
      }),
      end("A", at(8), 2, 2),
      start("B", at(20), "A"),
      message("B", at(20), { role: "user", text: "and two more" }),
      message("B", at(22), {
        role: "assistant",
        text: "Looking.",
        toolCalls: [
          { id: "c3", name: "recipe_get", input: { slug: "x" } },
          { id: "c4", name: "recipe_get", input: { slug: "y" } },
        ],
      }),
    ];
    const live = buildConversation(records, { live: true });
    expect(live.items.map((item) => item.kind)).toEqual([
      "user",
      "assistant",
      "assistant",
      "end",
      "user",
      "assistant",
    ]);
    const first = live.items[1];
    expect(first.kind === "assistant" && first.tools).toMatchObject([
      {
        id: "c1",
        status: "done",
        durationMs: 1_000,
        phrase: "Searched your recipes for “braise”",
      },
      {
        id: "c2",
        status: "error",
        durationMs: 4_000,
        phrase: "Fetched sallysbakingaddiction.com",
      },
    ]);
    const last = live.items[5];
    expect(
      last.kind === "assistant" && last.tools.map((row) => row.status),
    ).toEqual(["running", "waiting"]);
    /* The newest run's numbers; the conversation's first ask. */
    expect(live).toMatchObject({
      turns: 1,
      toolCalls: 0,
      firstAsk: "find braises",
      asks: 2,
    });
    expect(live.start?.job).toBe("B");
    expect(live.end).toBeUndefined();

    /* Ended without their results: never run. */
    const over = buildConversation(records, { live: false });
    const lastOver = over.items[5];
    expect(
      lastOver.kind === "assistant" && lastOver.tools.map((row) => row.status),
    ).toEqual(["not_run", "not_run"]);
  });

  it("reads a stop's “not run” answer as not run, and the newest end as the run's", () => {
    const records: TranscriptRecord[] = [
      start("A", at(0)),
      message("A", at(0), { role: "user", text: "go" }),
      message("A", at(1), {
        role: "assistant",
        text: "",
        toolCalls: [
          {
            id: "c1",
            name: "recipe_import",
            input: { url: "https://e.com/r" },
          },
        ],
      }),
      message("A", at(2), {
        role: "tool",
        toolCallId: "c1",
        name: "recipe_import",
        content: '{"error":"not run: the run was cancelled"}',
        isError: true,
      }),
      { ...end("A", at(2), 1, 1), stop: "cancelled" } as TranscriptRecord,
    ];
    const conversation = buildConversation(records, { live: false });
    const turn1 = conversation.items[1];
    expect(turn1.kind === "assistant" && turn1.tools[0]).toMatchObject({
      status: "not_run",
      phrase: "Imported from e.com",
    });
    expect(
      turn1.kind === "assistant" && turn1.tools[0].durationMs,
    ).toBeUndefined();
    expect(conversation.end?.stop).toBe("cancelled");
    /* The newest run's end is the footer's, not a line of its own. */
    expect(conversation.items.map((item) => item.kind)).toEqual([
      "user",
      "assistant",
    ]);
    expect(stopWords(conversation.end)).toBe("Stopped by you");
  });
});

/* ------------------------------------------------------------------ */
/* Words                                                                */
/* ------------------------------------------------------------------ */

describe("the page's words", () => {
  it("phrases tool calls, sharpened by their results, falling back to the name", () => {
    expect(
      toolPhrase({
        id: "1",
        name: "web_search",
        input: { query: "pork shoulder braise" },
      }),
    ).toBe("Searched the web for “pork shoulder braise”");
    expect(
      toolPhrase(
        {
          id: "1",
          name: "recipe_import",
          input: { url: "https://www.example.com/x" },
        },
        '{"slug":"braise"}',
      ),
    ).toBe("Imported braise from example.com");
    expect(
      toolPhrase(
        {
          id: "1",
          name: "term_assign",
          input: { slug: "korean", add: ["a", "b", "c", "d"] },
        },
        '{"updated":["a","b","c","d"]}',
      ),
    ).toBe("Tagged 4 recipes korean");
    expect(
      toolPhrase({
        id: "1",
        name: "term_assign",
        input: { slug: "korean", add: ["a"] },
      }),
    ).toBe("Tagged 1 recipe korean");
    expect(
      toolPhrase({
        id: "1",
        name: "recipe_create",
        input: { recipe: { name: "Pork Braise" } },
      }),
    ).toBe("Created “Pork Braise”");
    expect(toolPhrase({ id: "1", name: "made_up_tool", input: {} })).toBe(
      "made_up_tool",
    );
  });

  it("says how a run stopped", () => {
    const base = { error: undefined, turns: 40, toolCalls: 80 };
    expect(stopWords({ ...base, stop: "done" })).toBe("Finished");
    expect(stopWords({ ...base, stop: "budget:turns" })).toBe(
      "Stopped: reached 40 turns",
    );
    expect(stopWords({ ...base, stop: "budget:tool_calls" })).toBe(
      "Stopped: reached 80 tool calls",
    );
    expect(
      stopWords({ ...base, stop: "error", error: "the model is down" }),
    ).toBe("Error: the model is down");
    expect(
      stopWords(undefined, {
        status: "failed",
        failure: "No model is configured",
      }),
    ).toBe("Error: No model is configured");
    expect(stopWords(undefined, { status: "cancelled" })).toBe(
      "Stopped by you",
    );
    /* 46d: the cost budget, named with its amount. */
    expect(stopWords({ ...base, stop: "budget:cost", maxCostUsd: 1 })).toBe(
      "Stopped at the cost budget ($1.00)",
    );
    expect(stopWords({ ...base, stop: "budget:cost", maxCostUsd: 2.5 })).toBe(
      "Stopped at the cost budget ($2.50)",
    );
    expect(stopWords({ ...base, stop: "budget:cost" })).toBe(
      "Stopped at the cost budget",
    );
  });

  it("says what a term_assign added and what already carried the term (46d)", () => {
    expect(
      toolPhrase(
        {
          id: "c",
          name: "term_assign",
          input: { slug: "korean", add: ["a", "b", "c"] },
        },
        JSON.stringify({
          slug: "korean",
          updated: ["a"],
          unchanged: ["b", "c"],
          missing: [],
          added: ["a"],
          alreadyTagged: ["b", "c"],
        }),
      ),
    ).toBe("Tagged 1 recipe korean (2 already were)");
    const summary = writeSummary(
      "term_assign",
      { slug: "korean", add: ["a", "b", "c"] },
      {
        slug: "korean",
        updated: ["a"],
        unchanged: ["b", "c"],
        missing: [],
        added: ["a"],
        alreadyTagged: ["b", "c"],
      },
    );
    expect(summary).toEqual({
      commits: 1,
      recipes: [{ slug: "a", change: "updated" }],
      terms: ["korean"],
      assigned: [{ term: "korean", added: 1, alreadyTagged: 2 }],
    });
    /* Nothing added: nothing written or committed, but "already tagged"
     * is still said. */
    const noop = writeSummary(
      "term_assign",
      { slug: "korean", add: ["b", "c", "e"] },
      {
        slug: "korean",
        updated: [],
        unchanged: ["b", "c", "e"],
        missing: [],
        added: [],
        alreadyTagged: ["b", "c", "e"],
      },
    );
    expect(noop).toEqual({
      commits: 0,
      assigned: [{ term: "korean", added: 0, alreadyTagged: 3 }],
    });
    const noopRun = runChanges([
      {
        role: "assistant",
        text: "",
        toolCalls: [
          { id: "n1", name: "term_assign", input: { slug: "korean" } },
        ],
      },
      {
        role: "tool",
        toolCallId: "n1",
        name: "term_assign",
        content: "{}",
        summary: noop!,
      },
    ]);
    expect(noopRun.terms).toEqual([
      { slug: "korean", added: 0, alreadyTagged: 3, unchanged: true },
    ]);
    expect(changeCount(noopRun)).toBe(0);
    expect(noopRun.commits).toBe(0);
    expect(changesToShow(noopRun)).toBe(true);
    expect(assignedNote(noopRun.terms[0])).toBe("3 already tagged");
    /* Read from a result with no summary too (an older transcript's). */
    expect(
      runChanges([
        {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              id: "n2",
              name: "term_assign",
              input: { slug: "korean", add: ["b"] },
            },
          ],
        },
        {
          role: "tool",
          toolCallId: "n2",
          name: "term_assign",
          content: JSON.stringify({
            slug: "korean",
            updated: [],
            unchanged: ["b"],
            added: [],
            alreadyTagged: ["b"],
          }),
        },
      ]).terms,
    ).toEqual([
      { slug: "korean", added: 0, alreadyTagged: 1, unchanged: true },
    ]);
    expect(
      changesToShow({
        recipes: [],
        terms: [],
        groups: [],
        places: [],
        commits: 0,
      }),
    ).toBe(false);
    /* The row says it in the same words. */
    expect(
      toolPhrase(
        {
          id: "c",
          name: "term_assign",
          input: { slug: "korean", add: ["b", "c", "e"] },
        },
        JSON.stringify({
          slug: "korean",
          updated: [],
          unchanged: ["b", "c", "e"],
          added: [],
          alreadyTagged: ["b", "c", "e"],
        }),
      ),
    ).toBe("3 recipes already tagged korean");
    /* A mixed call names its removes too. */
    expect(
      toolPhrase(
        {
          id: "c",
          name: "term_assign",
          input: { slug: "korean", add: ["a", "b"], remove: ["x", "y"] },
        },
        JSON.stringify({
          slug: "korean",
          updated: ["a", "x", "y"],
          unchanged: ["b"],
          added: ["a"],
          alreadyTagged: ["b"],
        }),
      ),
    ).toBe("Tagged 1 recipe korean (1 already was); untagged 2 recipes");
    expect(
      toolPhrase({
        id: "c",
        name: "term_assign",
        input: { slug: "korean", add: ["a", "b"], remove: ["x"] },
      }),
    ).toBe("Tagged 2 recipes korean; untagged 1 recipe");
    /* Over a run, per term, from the summaries. */
    const changes = runChanges([
      {
        role: "assistant",
        text: "",
        toolCalls: [
          { id: "t1", name: "term_assign", input: { slug: "korean" } },
          { id: "t2", name: "term_assign", input: { slug: "korean" } },
        ],
      },
      {
        role: "tool",
        toolCallId: "t1",
        name: "term_assign",
        content: "{}",
        summary: summary!,
      },
      {
        role: "tool",
        toolCallId: "t2",
        name: "term_assign",
        content: "{}",
        summary: {
          commits: 1,
          terms: ["korean"],
          recipes: [{ slug: "d", change: "updated" }],
          assigned: [{ term: "korean", added: 1, alreadyTagged: 0 }],
        },
      },
    ]);
    expect(changes.terms).toEqual([
      { slug: "korean", added: 2, alreadyTagged: 2 },
    ]);
    expect(assignedNote(changes.terms[0])).toBe("added 2, 2 already tagged");
    expect(assignedNote({ added: 1, alreadyTagged: 0 })).toBe("added 1");
    expect(assignedNote({})).toBeUndefined();
  });

  it("names the model in words, and numbers in short", () => {
    expect(claudeModelName("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(claudeModelName("claude-haiku-4-5-20251001")).toBe(
      "Claude Haiku 4.5",
    );
    expect(claudeModelName("some-model")).toBe("some-model");
    expect(
      modelWords({
        model: "claude-sonnet-5",
        api: "anthropic",
        url: "https://api.anthropic.com",
      }),
    ).toBe("Claude Sonnet 5 through the API");
    expect(
      modelWords({
        model: "qwen3:8b",
        api: "ollama",
        url: "http://127.0.0.1:11434",
      }),
    ).toBe("qwen3:8b on this machine");
    expect(
      modelWords({
        model: "qwen3:14b",
        api: "openai",
        url: "http://gpu-box:8080/v1",
      }),
    ).toBe("qwen3:14b on gpu-box");
    expect(tokenText(812)).toBe("812");
    expect(tokenText(12_345)).toBe("12.3k");
    expect(costText(0.4249)).toBe("about $0.42");
    expect(costText(0.004)).toBe("under $0.01");
    expect(askLine("\n  Find pies\nsecond line")).toBe("Find pies");
  });

  it("says what runs it, never the key, and whether it can search", () => {
    expect(curatorSetup({})).toBeUndefined();
    expect(curatorSetup({ RECIPE_LLM_URL: "http://localhost:11434" })).toEqual({
      model: "qwen3:8b on this machine",
      api: "local",
      search: false,
      newerWebTools: false,
    });
    expect(
      curatorSetup({
        RECIPE_LLM_URL: "http://localhost:11434",
        RECIPE_SEARCH_URL: "http://127.0.0.1:8888",
      })?.search,
    ).toBe(true);
    const claude = curatorSetup({
      RECIPE_LLM_API: "anthropic",
      RECIPE_LLM_API_KEY: "sk-ant-secret-0000",
    });
    expect(claude).toEqual({
      model: "Claude Sonnet 5 through the API",
      api: "anthropic",
      search: true,
      newerWebTools: true,
    });
    expect(JSON.stringify(claude)).not.toContain("sk-ant");
    /* 46d: a Haiku has no newer web tools: the box is not offered. */
    expect(
      curatorSetup({
        RECIPE_LLM_API: "anthropic",
        RECIPE_LLM_API_KEY: "sk-ant-secret-0000",
        RECIPE_LLM_MODEL: "claude-haiku-4-5",
      })?.newerWebTools,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* ⌘K's hand-off, links, disclosures                                    */
/* ------------------------------------------------------------------ */

describe("⌘K's hand-off to the curator", () => {
  it("offers fetch requests, never searches or a bare verb", () => {
    for (const text of [
      "find three pork shoulder braises I don't have yet",
      "Grab me a good focaccia",
      "get me two tagine recipes",
      "import https://www.sallysbakingaddiction.com/pie/",
      "fetch the cookies from that roundup",
      "look up a gochujang glaze",
      "add some Thanksgiving pie recipes",
    ]) {
      expect(curatorOffers(text), text).toBe(true);
    }
    for (const text of [
      "find",
      "import ",
      "pork shoulder",
      "find tag:dessert",
      "find -nuts cookies",
      "what drinks can I make with lime",
      "add salt",
      "getaway cake",
    ]) {
      expect(curatorOffers(text), text).toBe(false);
    }
    expect(curatorHref("  import https://e.com/x  ")).toBe(
      "/curator?prompt=import%20https%3A%2F%2Fe.com%2Fx",
    );
  });

  it("leaves Ask's own rules where they were (43q)", () => {
    /* A fetch request is still an offered, unhighlighted Ask: Enter stays on the search. */
    expect(askOffers("find three pork shoulder braises")).toBe(true);
    expect(readsLikeQuestion("find three pork shoulder braises")).toBe(false);
    expect(readsLikeQuestion("what drinks can I make with lime")).toBe(true);
  });

  it("keeps this site's links in the app and cuts long disclosures", () => {
    expect(sitePath("/recipe/pork-braise")).toBe("/recipe/pork-braise");
    expect(sitePath("//evil.example/x")).toBeUndefined();
    expect(
      sitePath("http://editor.test/recipe/x?a=1#b", "http://editor.test"),
    ).toBe("/recipe/x?a=1#b");
    expect(
      sitePath("https://elsewhere.test/recipe/x", "http://editor.test"),
    ).toBeUndefined();
    expect(
      sitePath("javascript:alert(1)", "http://editor.test"),
    ).toBeUndefined();
    /* 46d: this site's page on a host the model made up opens in the app —
     * when its slug is one this site's tools answered with. */
    const hosts = hostsOf([
      "https://www.bonappetit.com/recipe/chili",
      "not a url",
    ]);
    expect([...hosts]).toEqual(["www.bonappetit.com"]);
    const slugs = siteSlugsOf([
      { role: "user", text: "tag korean things" },
      {
        role: "tool",
        toolCallId: "t1",
        name: "recipe_search",
        content:
          '{"total":2,"recipes":[{"slug":"pork-braise","name":"Pork braise"},{"slug": "bulgogi"',
      },
      {
        role: "tool",
        toolCallId: "t2",
        name: "term_assign",
        content: "{}",
        summary: { commits: 1, terms: ["korean"], groups: ["week-12"] },
      },
      {
        role: "tool",
        toolCallId: "t3",
        name: "web_fetch",
        content:
          '<untrusted_page_text tool="web_fetch">\n{"slug":"x"}\n</untrusted_page_text>',
      },
      {
        role: "tool",
        toolCallId: "t4",
        name: "recipe_get",
        content: '{"error":{"code":"not_found","slug":"gone"}}',
        isError: true,
      },
    ]);
    expect([...slugs].sort()).toEqual([
      "bulgogi",
      "korean",
      "pork-braise",
      "week-12",
    ]);
    const known = { hosts, slugs };
    expect(
      fixedSitePath(
        "https://roger.recipe/recipe/pork-braise",
        known,
        "http://editor.test",
      ),
    ).toBe("/recipe/pork-braise");
    expect(
      fixedSitePath("https://your-site.com/tags/korean/", known, undefined),
    ).toBe("/tags/korean/");
    expect(
      fixedSitePath("https://x.example/group/week-12#mon", known, undefined),
    ).toBe("/group/week-12#mon");
    /* A real site's recipe page stays a real link: its host was seen, or
     * its slug is none of this site's (even on a host never seen). */
    expect(
      fixedSitePath(
        "https://www.bonappetit.com/recipe/chili",
        known,
        "http://editor.test",
      ),
    ).toBeUndefined();
    expect(
      fixedSitePath("https://bonappetit.com/recipe/x", known, undefined),
    ).toBeUndefined();
    expect(
      fixedSitePath(
        "https://www.seriouseats.com/recipe/bulgogi-x",
        known,
        undefined,
      ),
    ).toBeUndefined();
    /* A slug only a web page's text named is not this site's. */
    expect(
      fixedSitePath("https://roger.recipe/recipe/x", known, undefined),
    ).toBeUndefined();
    /* Not one of this site's pages, this origin, or not a web link. */
    expect(
      fixedSitePath(
        "https://allrecipes.com/recipe/123/chili/",
        known,
        undefined,
      ),
    ).toBeUndefined();
    expect(
      fixedSitePath("https://roger.recipe/about", known, undefined),
    ).toBeUndefined();
    expect(
      fixedSitePath(
        "http://editor.test/recipe/pork-braise",
        known,
        "http://editor.test",
      ),
    ).toBeUndefined();
    expect(
      fixedSitePath(
        "javascript:alert(1)//recipe/pork-braise",
        known,
        undefined,
      ),
    ).toBeUndefined();
    expect(detailText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(detailText("<b>page</b>")).toBe("<b>page</b>");
    expect(detailText("x".repeat(30), 10)).toBe(
      "xxxxxxxxxx\n… (20 more characters)",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The server: conversations and a run's changes                        */
/* ------------------------------------------------------------------ */

describe("listCuratorRuns and curatorRunChanges", () => {
  let dir: string;
  let contentDirectory: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "curator-jobs-"));
    contentDirectory = await mkdtemp(join(tmpdir(), "curator-content-"));
    vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await closeCachedEnvironments();
    await rm(dir, { recursive: true, force: true });
    await rm(contentDirectory, { recursive: true, force: true });
  });

  let clock = Date.UTC(2026, 9, 21, 12);

  async function job(
    spec: { prompt: string; continues?: string },
    records: TranscriptRecord[] | ((id: string) => TranscriptRecord[]),
    status: JobMeta["status"] = "done",
  ): Promise<string> {
    clock += 60_000;
    const id = ulid(clock);
    const meta: JobMeta = {
      id,
      kind: "agent",
      label: `ask: "${spec.prompt}"`,
      status,
      tier: "interactive",
      resources: [],
      /* This process: a live one stays live (not an orphan to settle). */
      ...processIdentity(),
      queuedAt: clock,
      ...(status === "done" ? { endedAt: clock + 1_000 } : {}),
      spec: { kind: "agent", contentDirectory, ...spec },
      result: { stopReason: "done" },
    };
    await writeJobMeta(dir, meta);
    const lines = typeof records === "function" ? records(id) : records;
    await writeFile(
      transcriptPath(dir, id),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    return id;
  }

  it("lists conversations by their newest run, named by the first ask", async () => {
    const first = await job({ prompt: "Find pork braises\nplease" }, (id) => [
      start(id, at(0)),
      message(id, at(0), { role: "user", text: "Find pork braises\nplease" }),
      ...turn([
        {
          call: {
            id: "k1",
            name: "recipe_create",
            input: { recipe: { name: "Braise" } },
          },
          result: { slug: "braise" },
        },
      ]).map((m) => message(id, at(1), m)),
      end(id, at(2), 1, 1),
    ]);
    const firstLines = (id: string): TranscriptRecord[] => [
      start(first, at(0)),
      message(first, at(0), {
        role: "user",
        text: "Find pork braises\nplease",
      }),
      ...turn([
        {
          call: {
            id: "k1",
            name: "recipe_create",
            input: { recipe: { name: "Braise" } },
          },
          result: { slug: "braise" },
        },
      ]).map((m) => message(first, at(1), m)),
      end(first, at(2), 1, 1),
      start(id, at(10), first),
      message(id, at(10), { role: "user", text: "and tag it braises" }),
      ...turn([
        {
          call: {
            id: "k2",
            name: "term_assign",
            input: { slug: "braises", add: ["braise"] },
          },
          result: { slug: "braises", updated: ["braise"] },
        },
      ]).map((m) => message(id, at(11), m)),
      end(id, at(12), 1, 1),
    ];
    const followUp = await job(
      { prompt: "and tag it braises", continues: first },
      firstLines,
    );
    const other = await job(
      { prompt: "Which recipes use gochujang?" },
      (id) => [
        start(id, at(0)),
        message(id, at(0), {
          role: "user",
          text: "Which recipes use gochujang?",
        }),
      ],
      "running",
    );

    const runs = await listCuratorRuns({ dir });
    /* The running one's process (this one) is alive: still running. */
    expect(runs.map((row) => row.id)).toEqual([other, followUp]);
    expect(runs[1]).toMatchObject({
      id: followUp,
      ask: "Find pork braises",
      asks: 2,
      status: "done",
      stopReason: "done",
      /* The recipe and the term. */
      changes: 2,
    });
    expect(runs[0]).toMatchObject({
      ask: "Which recipes use gochujang?",
      asks: 1,
      status: "running",
      changes: 0,
    });
    expect(await listCuratorRuns({ dir, limit: 1 })).toHaveLength(1);
  });

  it("reads a run's changes with each recipe's card, a deleted one marked missing", async () => {
    await createRecipe(
      { contentDirectory },
      {
        name: "Pork Braise",
        ingredients: ["2 lb pork shoulder"],
        tags: ["dinner"],
      },
    );
    const id = await job({ prompt: "make a braise" }, (id) => [
      start(id, at(0)),
      message(id, at(0), { role: "user", text: "make a braise" }),
      ...turn([
        {
          call: {
            id: "m1",
            name: "recipe_create",
            input: { recipe: { name: "Pork Braise" } },
          },
          result: { slug: "pork-braise" },
        },
        {
          call: { id: "m2", name: "recipe_update", input: { slug: "gone" } },
          result: { slug: "gone" },
        },
      ]).map((m) => message(id, at(1), m)),
    ]);
    const changes = await curatorRunChanges(id.slice(-8), {
      dir,
      contentDirectory,
    });
    expect(changes.commits).toBe(2);
    expect(changes.recipes).toEqual([
      expect.objectContaining({
        slug: "pork-braise",
        name: "Pork Braise",
        change: "created",
        tags: ["dinner"],
      }),
      { slug: "gone", name: "gone", change: "updated", missing: true },
    ]);
    expect(typeof changes.recipes[0].date).toBe("number");
  });
});
