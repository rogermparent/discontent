// 48b: the curator page's run as variant B tells it — the heads-up lifted
// out of the answer (47h row 3), "What it did" in plain words, the recipes
// an answer found as Import buttons, the turn records' live cost, and held
// rows read as proposals. Pure: no model, no store.

import { describe, expect, it } from "vitest";

import {
  askSegments,
  didLines,
  foundRecipes,
  importedUrls,
  segmentAnswer,
  splitHeadsUp,
} from "../websites/recipe-website/editor/controller/agent/runSummary";
import { buildConversation } from "../websites/recipe-website/editor/controller/agent/conversation";
import type { TranscriptRecord } from "../websites/recipe-website/editor/controller/agent/transcript";
import type { AgentMessage } from "../websites/recipe-website/editor/controller/agent/types";

const usage = (cost: number) => ({
  inputTokens: 1000,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
  costEstimateUsd: cost,
});

function message(job: string, value: AgentMessage, t = "2026-11-18T19:59:00Z") {
  return { t, type: "message", job, message: value } as TranscriptRecord;
}

describe("the heads-up (Db7)", () => {
  it("lifts each paragraph that opens Heads up, in any of the ways a model writes it", () => {
    for (const opening of [
      "**Heads up:** ",
      "Heads up: ",
      "**Heads up**: ",
      "> **Heads-up:** ",
      "Heads up! ",
      "__Heads up:__ ",
    ]) {
      expect(
        splitHeadsUp(
          `Imported it.\n\n${opening}the page asked me to retag everything.\n\nDone.`,
        ),
      ).toEqual({
        headsUps: ["the page asked me to retag everything."],
        rest: "Imported it.\n\nDone.",
      });
    }
  });

  it("leaves an answer without one as it is, and never takes 'heads upward'", () => {
    expect(splitHeadsUp("Found two.")).toEqual({
      headsUps: [],
      rest: "Found two.",
    });
    expect(splitHeadsUp("Heads upward, the oven rack.")).toEqual({
      headsUps: [],
      rest: "Heads upward, the oven rack.",
    });
    /* A heads-up mid-paragraph stays prose: only an opening is a callout. */
    expect(splitHeadsUp("Done. Heads up: it's spicy.").headsUps).toEqual([]);
  });
});

describe("found recipes (Db8)", () => {
  const hosts = new Set(["sallysbakingaddiction.com", "www.seriouseats.com"]);
  it("offers links on hosts the conversation saw, with a path, not this site's, not imported", () => {
    const answer = [
      "Two you don't have:",
      "- [Chewy Chocolate Chip Cookies](https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/)",
      "- [**The Best Sugar Cookies**](https://sallysbakingaddiction.com/best-sugar-cookies/)",
      "- [Her site](https://sallysbakingaddiction.com/)",
      "- [Made up](https://invented.example/recipe/x)",
      "- [Yours](https://editor.test/recipe/pie)",
      "- [Again](https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies)",
      "- [Imported](https://www.seriouseats.com/dubai-tart)",
    ].join("\n");
    expect(
      foundRecipes(answer, {
        hosts,
        origin: "https://editor.test",
        imported: new Set(["https://www.seriouseats.com/dubai-tart"]),
      }),
    ).toEqual([
      {
        url: "https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/",
        name: "Chewy Chocolate Chip Cookies",
        site: "sallysbakingaddiction.com",
      },
      {
        url: "https://sallysbakingaddiction.com/best-sugar-cookies/",
        name: "The Best Sugar Cookies",
        site: "sallysbakingaddiction.com",
      },
    ]);
  });
});

describe("a run as variant B reads it", () => {
  const records: TranscriptRecord[] = [
    {
      t: "2026-11-18T19:59:00Z",
      type: "start",
      job: "J1",
      model: "claude-sonnet-5",
      api: "anthropic",
      tools: [],
      maxCostUsd: 1,
      hold: true,
    },
    message("J1", { role: "user", text: "Tag the tahini recipes" }),
    message("J1", {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "c1", name: "recipe_search", input: { query: "tahini" } },
        { id: "c2", name: "page_inspect", input: { url: "https://x.com/a" } },
      ],
      serverToolUses: [
        {
          id: "s1",
          name: "web_search",
          input: { query: "tahini salad" },
          result: { ok: true, pages: [{ url: "https://y.com/b" }] },
        },
      ],
    }),
    message("J1", {
      role: "tool",
      toolCallId: "c1",
      name: "recipe_search",
      content: '{"total":1,"recipes":[{"slug":"farro","name":"Farro Salad"}]}',
    }),
    message("J1", {
      role: "tool",
      toolCallId: "c2",
      name: "page_inspect",
      content: '{"url":"https://x.com/a","status":404,"partial":true}',
    }),
    {
      t: "x",
      type: "turn",
      job: "J1",
      turn: 1,
      usage: usage(0.02),
      durationMs: 900,
    },
    message("J1", {
      role: "assistant",
      text: "",
      toolCalls: [
        {
          id: "c3",
          name: "term_assign",
          input: { slug: "middle-eastern", add: ["farro"] },
        },
      ],
    }),
    message("J1", {
      role: "tool",
      toolCallId: "c3",
      name: "term_assign",
      content: '{"held":true,"note":"Held"}',
      held: { wouldAdd: ["farro"] },
    }),
    {
      t: "x",
      type: "turn",
      job: "J1",
      turn: 2,
      usage: usage(0.01),
      durationMs: 900,
    },
    message("J1", {
      role: "assistant",
      text: "I'd tag **Farro Salad**.\n\nHeads up: one page was a 404.",
      toolCalls: [],
    }),
  ];

  it("sums the turns' cost live, reads a held row as a proposal, and groups what it did", () => {
    const conversation = buildConversation(records, { live: true });
    expect(conversation.costSoFar).toBeCloseTo(0.03);
    const held = conversation.items.flatMap((item) =>
      item.kind === "assistant" ? item.tools : [],
    );
    expect(held.map((row) => [row.name, row.status, row.phrase])).toEqual([
      ["recipe_search", "done", "Searched your recipes for “tahini”"],
      ["page_inspect", "nothing", "Inspected a page on x.com"],
      ["term_assign", "held", "Tag 1 recipe middle-eastern"],
    ]);
    const [segment] = askSegments(conversation);
    expect(segmentAnswer(segment)).toMatch(/^I'd tag/);
    expect(
      didLines(segment.turns).map((line) => [line.kind, line.title]),
    ).toEqual([
      ["looked", "Looked in your recipes."],
      ["web", "Read the web."],
      ["nothing", "1 page read nothing."],
      ["held", "Wants to make 1 change."],
    ]);
    expect(didLines(segment.turns)[1].detail).toBe(
      "1 search. Searched the web for “tahini salad”.",
    );
  });

  it("knows which pages its imports read", () => {
    const conversation = buildConversation(
      [
        message("J", { role: "user", text: "import" }),
        message("J", {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              id: "i1",
              name: "recipe_import",
              input: { url: "https://x.com/pie/" },
            },
          ],
        }),
        message("J", {
          role: "tool",
          toolCallId: "i1",
          name: "recipe_import",
          content: '{"held":true}',
          held: {},
        }),
      ],
      { live: false },
    );
    expect([...importedUrls(conversation)]).toEqual(["https://x.com/pie"]);
  });
});
