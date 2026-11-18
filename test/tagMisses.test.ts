// @vitest-environment node
//
// 48a (Roger's pick 46-d-tag): the tagging post-check — for each term a
// curator run tagged recipes with, the recipes its own searches found that
// its `term_assign` calls left out. Read off the tool results (a search's
// `found`, kept from the uncut result), never written. Never a model.

import { describe, expect, it, vi } from "vitest";

import {
  FOUND_MAX,
  MISSED_MAX,
  missedNote,
  runChanges,
  searchFound,
  tagMisses,
} from "../websites/recipe-website/editor/controller/agent/changes";
import { runAgent } from "../websites/recipe-website/editor/controller/agent/loop";
import type {
  AgentMessage,
  AgentTool,
  AgentToolCall,
  AgentToolResultMessage,
} from "../websites/recipe-website/editor/controller/agent/types";
import {
  emptyUsage,
  type ChatToolsRequest,
  type ChatToolsResult,
} from "../websites/recipe-website/editor/controller/llm/tools";

let callN = 0;

function call(name: string, input: unknown) {
  callN += 1;
  return { id: `call_${callN}`, name, input };
}

function turn(
  calls: {
    call: ReturnType<typeof call>;
    result: unknown;
    isError?: boolean;
  }[],
): AgentMessage[] {
  return [
    {
      role: "assistant",
      text: "",
      toolCalls: calls.map((entry) => entry.call),
    },
    ...calls.map((entry): AgentMessage => ({
      role: "tool",
      toolCallId: entry.call.id,
      name: entry.call.name,
      content: JSON.stringify(entry.result),
      ...(entry.isError ? { isError: true } : {}),
    })),
  ];
}

const row = (slug: string, tags: string[] = []) => ({
  slug,
  name: slug.replace(/-/g, " "),
  date: 1,
  tags,
});

const korean = {
  total: 4,
  recipes: [
    row("bulgogi"),
    row("bibimbap"),
    row("kimchi-stew", ["Korean"]),
    row("korean-fried-chicken"),
  ],
};

describe("tagMisses", () => {
  it("lists what the search found and the assign left out", () => {
    const messages = [
      { role: "user" as const, text: "tag the korean recipes korean" },
      ...turn([
        { call: call("recipe_search", { query: "korean" }), result: korean },
      ]),
      ...turn([
        {
          call: call("term_assign", {
            slug: "korean",
            add: ["bulgogi", "korean-fried-chicken"],
          }),
          result: {
            slug: "korean",
            updated: ["bulgogi", "korean-fried-chicken"],
            added: ["bulgogi", "korean-fried-chicken"],
            alreadyTagged: [],
          },
        },
      ]),
    ];
    /* kimchi-stew already carries Korean: not missed. */
    expect(tagMisses(messages)).toEqual([
      {
        term: "korean",
        missed: [{ slug: "bibimbap", name: "bibimbap" }],
        missedCount: 1,
        unseen: 0,
      },
    ]);
    const [term] = runChanges(messages).terms;
    expect(term).toMatchObject({
      slug: "korean",
      added: 2,
      missed: [{ slug: "bibimbap", name: "bibimbap" }],
      missedCount: 1,
    });
    expect(missedNote(term)).toBe(
      "The search also found 1 recipe it did not tag",
    );
  });

  it("reads only the searches that found something it tagged", () => {
    const messages = [
      ...turn([
        { call: call("recipe_search", { query: "korean" }), result: korean },
        {
          call: call("recipe_search", { query: "dessert" }),
          result: { total: 1, recipes: [row("brownies")] },
        },
      ]),
      ...turn([
        {
          call: call("term_assign", {
            slug: "korean",
            add: ["bulgogi", "bibimbap", "korean-fried-chicken"],
          }),
          result: { slug: "korean", updated: ["bulgogi"], added: ["bulgogi"] },
        },
      ]),
    ];
    expect(tagMisses(messages)).toEqual([]);
    expect(runChanges(messages).terms[0].missed).toBeUndefined();
  });

  it("does not count a recipe the run took the term off", () => {
    const messages = [
      ...turn([
        { call: call("recipe_search", { query: "korean" }), result: korean },
        {
          call: call("term_assign", {
            slug: "korean",
            add: ["bulgogi", "korean-fried-chicken"],
            remove: ["bibimbap"],
          }),
          result: { slug: "korean", updated: ["bulgogi"] },
        },
      ]),
    ];
    expect(tagMisses(messages)).toEqual([]);
  });

  it("skips failed assigns and plans, and says what the search did not return", () => {
    const failed = [
      ...turn([
        { call: call("recipe_search", { query: "korean" }), result: korean },
        {
          call: call("term_assign", { slug: "korean", add: ["bulgogi"] }),
          result: { error: { code: "busy", message: "held" } },
          isError: true,
        },
        {
          call: call("term_assign", {
            slug: "korean",
            add: ["bulgogi"],
            type: "group",
          }),
          result: { slug: "korean", updated: ["bulgogi"] },
        },
      ]),
    ];
    expect(tagMisses(failed)).toEqual([]);

    const paged = [
      ...turn([
        {
          call: call("recipe_search", { query: "korean", limit: 2 }),
          result: { total: 9, recipes: [row("bulgogi"), row("bibimbap")] },
        },
        {
          call: call("term_assign", {
            slug: "korean",
            add: ["bulgogi", "bibimbap"],
          }),
          result: { slug: "korean", updated: ["bulgogi", "bibimbap"] },
        },
      ]),
    ];
    const [miss] = tagMisses(paged);
    expect(miss).toEqual({
      term: "korean",
      missed: [],
      missedCount: 0,
      unseen: 7,
    });
    const [term] = runChanges(paged).terms;
    expect(term.missed).toBeUndefined();
    expect(term.unseen).toBe(7);
    expect(missedNote(term)).toBe(
      "The search had 7 more matches than it returned",
    );
  });

  it("caps the names it lists, and counts the rest", () => {
    const many = Array.from({ length: MISSED_MAX + 5 }, (_, i) =>
      row(`stew-${i}`),
    );
    const messages = [
      ...turn([
        {
          call: call("recipe_search", { query: "stew" }),
          result: { total: many.length + 1, recipes: [row("tagged"), ...many] },
        },
        {
          call: call("term_assign", { slug: "stews", add: ["tagged"] }),
          result: { slug: "stews", updated: ["tagged"] },
        },
      ]),
    ];
    const [miss] = tagMisses(messages);
    expect(miss.missed).toHaveLength(MISSED_MAX);
    expect(miss.missedCount).toBe(MISSED_MAX + 5);
    expect(missedNote({ missedCount: miss.missedCount, unseen: 3 })).toBe(
      `The search also found ${MISSED_MAX + 5} recipes it did not tag, and 3 more it did not return`,
    );
  });
});

describe("searchFound", () => {
  it("keeps a search's slugs, names and tags, capped", () => {
    expect(searchFound("recipe_search", korean)).toEqual({
      total: 4,
      recipes: [
        { slug: "bulgogi", name: "bulgogi" },
        { slug: "bibimbap", name: "bibimbap" },
        { slug: "kimchi-stew", name: "kimchi stew", tags: ["Korean"] },
        { slug: "korean-fried-chicken", name: "korean fried chicken" },
      ],
    });
    const rows = Array.from({ length: FOUND_MAX + 10 }, (_, i) =>
      row(`r-${i}`),
    );
    expect(
      searchFound("recipe_search", { total: rows.length, recipes: rows })
        ?.recipes,
    ).toHaveLength(FOUND_MAX);
  });

  it("is nothing for another tool, an error or a cut result", () => {
    expect(searchFound("recipe_list", korean)).toBeUndefined();
    expect(
      searchFound("recipe_search", { error: { code: "busy" } }),
    ).toBeUndefined();
    expect(searchFound("recipe_search", '{"recipes":[{"slug"')).toBeUndefined();
  });

  it("is kept on the tool result by the loop, from the uncut result", async () => {
    const search: AgentTool = {
      name: "recipe_search",
      description: "search",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      run: async () => korean,
    };
    const reply = (
      text: string,
      toolCalls: AgentToolCall[] = [],
    ): ChatToolsResult => ({
      message: { role: "assistant", text, toolCalls },
      stop: toolCalls.length ? "tool_use" : "end",
      usage: { ...emptyUsage(), inputTokens: 10, outputTokens: 1 },
      model: "scripted",
      api: "ollama",
      durationMs: 1,
    });
    let turns = 0;
    const model = vi.fn(async (_request: ChatToolsRequest) => {
      turns += 1;
      return turns === 1
        ? reply("", [
            { id: "c1", name: "recipe_search", input: { query: "k" } },
          ])
        : reply("done");
    });
    const result = await runAgent({
      system: "s",
      prompt: "p",
      tools: [search],
      config: {
        url: "http://localhost:11434",
        model: "qwen3:8b",
        api: "ollama",
      },
      model,
    });
    const tool = result.transcript.find(
      (message): message is AgentToolResultMessage => message.role === "tool",
    );
    expect(tool?.found).toEqual(searchFound("recipe_search", korean));
  });
});
