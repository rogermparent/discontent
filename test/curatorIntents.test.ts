// @vitest-environment node
//
// 51b: the curator's intents — the guess (rules, then one small call), the
// small readings in code, and each plan end to end through `runAgentJob` on
// a stand-in model (D11: never a real one): the plan's schema-bound calls
// are `standIn.chat`, the loop's turns `standIn.model`. The pages and the
// web search are served on 127.0.0.1 (several servers, so several sites),
// as the 44e harness serves its fixture. Pinned: online holds N imports and
// leaves out what you have by page and by close name (D2/D3); mine searches
// steps and notes for each expansion and answers fit / maybe / close but no
// (D8/D9); plan resolves named dishes by name, picks a course's dish, scales
// by servings and holds a tagged group; unset / any / organize are the loop;
// a follow-up is the loop; online without a web search falls back.

import { mkdtemp, rm } from "fs-extra";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import {
  runAgentJob,
  type AgentJobResult,
  type AgentJobSpec,
} from "../websites/recipe-website/editor/controller/agent/job";
import { startAgentRun } from "../websites/recipe-website/editor/controller/agent/runs";
import {
  guessIntent,
  type AgentIntentChoice,
} from "../websites/recipe-website/editor/controller/agent/intents/guess";
import { settleIntent } from "../websites/recipe-website/editor/controller/agent/intents/classify";
import {
  askSearch,
  interleave,
} from "../websites/recipe-website/editor/controller/agent/intents/mine";
import {
  checkPicks,
  fallbackSubject,
} from "../websites/recipe-website/editor/controller/agent/intents/online";
import {
  askedTag,
  checkCourses,
  checkDishes,
  coursesIn,
  holidayIn,
} from "../websites/recipe-website/editor/controller/agent/intents/plan";
import {
  askedCount,
  boundedCount,
  looksLikeRoundup,
  notRecipeHost,
  resolveDish,
  servingsScale,
  titleDish,
  yieldCount,
} from "../websites/recipe-website/editor/controller/agent/intents/text";
import { ORGANIZE_NOTE } from "../websites/recipe-website/editor/controller/agent/prompt";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
  type TranscriptRecord,
} from "../websites/recipe-website/editor/controller/agent/transcript";
import { heldCalls } from "../websites/recipe-website/editor/controller/agent/held";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { createTerm } from "../websites/recipe-website/editor/controller/curation/terms";
import { NO_JOB } from "../websites/recipe-website/editor/controller/jobs/context";
import {
  jobLabel,
  jobResources,
  jobTier,
} from "../websites/recipe-website/editor/controller/jobs/kinds";
import { runJob } from "../websites/recipe-website/editor/controller/jobs/run";
import type {
  ChatJsonRequest,
  ChatJsonResult,
} from "../websites/recipe-website/editor/controller/llm/client";
import type {
  ChatToolsRequest,
  ChatToolsResult,
} from "../websites/recipe-website/editor/controller/llm/tools";
import { setFetchGuardTesting } from "../websites/recipe-website/editor/controller/urlGuard";
import {
  answeredText,
  callRecords,
  checkAnswerSlugs,
  checkHeldGroup,
  checkNewImports,
} from "../websites/recipe-website/editor/scripts/agentMeasure";
import { existingBySource } from "../websites/recipe-website/editor/controller/curation/importList";
import { readAllRecipeRows } from "../websites/recipe-website/editor/controller/curation/recipes";
import { sourceUrlKey } from "recipe-website-common/util/roundupPage";

const MODEL_URL = "http://model.test:11434";

/* ------------------------------------------------------------------ */
/* The readings in code                                                */
/* ------------------------------------------------------------------ */

describe("the guess (rules)", () => {
  it("places the four cases as the baseline asked them", () => {
    expect(guessIntent("3 pulled pork recipes I don't already have")?.id).toBe(
      "online",
    );
    expect(
      guessIntent("recipes that work well in small batches with a milk frother")
        ?.id,
    ).toBe("mine");
    expect(
      guessIntent(
        "Plan Thanksgiving from its menu as a meal plan tagged thanksgiving; we bring 2 servings of the cranberry curd tart plus a simple side",
      )?.id,
    ).toBe("plan");
    expect(
      guessIntent(
        "Plan Christmas from its menu as a meal plan tagged christmas; we're making the pernil for 6, plus a breakfast and a dessert",
      )?.id,
    ).toBe("plan");
  });

  it("reads whole words, and leaves an undecided ask to the model", () => {
    expect(guessIntent("fried plantains")).toBeUndefined();
    expect(guessIntent("New England clam chowder")).toBeUndefined();
    expect(guessIntent("tag the soups as winter")?.id).toBe("organize");
    expect(guessIntent("import https://example.com/pie")).toMatchObject({
      id: "any",
      why: "it names a page",
    });
    expect(guessIntent("I bought eggs")?.id).toBe("any");
    expect(guessIntent("find new soup recipes online")?.id).toBe("online");
    expect(guessIntent("what can I make with leeks")?.id).toBe("mine");
  });
});

describe("the small readings", () => {
  it("counts what an ask names, bounded", () => {
    expect(askedCount("3 pulled pork recipes I don't already have")).toBe(3);
    expect(askedCount("find five new soups recipes")).toBe(5);
    expect(askedCount("a pulled pork recipe")).toBeUndefined();
    expect(askedCount("40 cookie recipes")).toBeUndefined();
    expect(boundedCount(11)).toBeUndefined();
    expect(boundedCount(2.5)).toBeUndefined();
    expect(boundedCount("4")).toBe(4);
  });

  it("reads a web title as a dish, and knows a list and a forum", () => {
    expect(titleDish("Pulled Pork Recipe - The Modern Proper")).toBe(
      "Pulled Pork Recipe",
    );
    expect(titleDish("Oven Pulled Pork | Serious Eats")).toBe(
      "Oven Pulled Pork",
    );
    expect(looksLikeRoundup("25 Best Pulled Pork Recipes")).toBe(true);
    expect(looksLikeRoundup("Pulled Pork Recipes - Allrecipes")).toBe(true);
    expect(looksLikeRoundup("Carolina Pulled Pork")).toBe(false);
    expect(notRecipeHost("https://www.pinterest.com/pin/1")).toBe(true);
    expect(notRecipeHost("https://www.reddit.com/r/food")).toBe(true);
    expect(notRecipeHost("https://cookthestory.com/pulled-pork")).toBe(false);
    expect(notRecipeHost("not a url")).toBe(true);
  });

  it("finds a named dish by name, then by its words, then close", () => {
    const recipes = [
      { slug: "pernil", name: "Pernil (Puerto Rican Roast Pork)" },
      { slug: "cranberry-curd-tart", name: "Cranberry Curd Tart" },
      { slug: "cranberry-sauce", name: "Cranberry Sauce" },
      { slug: "pork-roast", name: "Pork Roast" },
    ];
    expect(resolveDish("the cranberry curd tart", recipes)).toEqual({
      slug: "cranberry-curd-tart",
      name: "Cranberry Curd Tart",
      how: "name",
    });
    expect(resolveDish("the pernil", recipes)).toMatchObject({
      slug: "pernil",
      how: "words",
    });
    expect(resolveDish("cranberry curd tarts", recipes)?.slug).toBe(
      "cranberry-curd-tart",
    );
    expect(resolveDish("beef wellington", recipes)).toBeUndefined();
    /* A tie goes to the menu's. */
    const two = [
      { slug: "roast-pork-a", name: "Roast Pork" },
      { slug: "roast-pork-b", name: "Roast Pork" },
    ];
    expect(
      resolveDish("roast pork", two, new Set(["roast-pork-b"]))?.slug,
    ).toBe("roast-pork-b");
  });

  it("reads a yield, and scales servings to it sanely", () => {
    expect(yieldCount("8 servings")).toBe(8);
    expect(yieldCount("Serves 8-10")).toBe(8);
    expect(yieldCount("1 (9-inch) tart, 8 slices")).toBe(8);
    expect(yieldCount("Serves four")).toBe(4);
    expect(yieldCount("Servings: 6")).toBe(6);
    expect(yieldCount("8")).toBe(8);
    expect(yieldCount("6-8 people")).toBe(6);
    expect(yieldCount("One 9-inch pie, 8 slices")).toBe(8);
    expect(yieldCount("a big pot")).toBeUndefined();
    /* What a recipe makes is not how many it serves (51b review 1). */
    for (const made of [
      "1 9x13-inch pan",
      "4 dozen cookies",
      "Makes 2 loaves",
      "One 9-inch pie",
      "12 cookies",
      "1 (9-inch) tart",
    ]) {
      expect(yieldCount(made), made).toBeUndefined();
    }
    expect(servingsScale(2, 8)).toBe("1/4");
    expect(servingsScale(6, 8)).toBe("3/4");
    expect(servingsScale(12, 8)).toBe("1.5");
    expect(servingsScale(8, 8)).toBeUndefined();
    expect(servingsScale(500, 1)).toBe("10");
    expect(servingsScale(2, undefined)).toBeUndefined();
  });

  it("checks the model's picks, dishes and courses", () => {
    expect(
      checkPicks(
        { picks: [{ n: 2, why: "oven" }, { n: 2 }, { n: 9 }, { n: 1 }] },
        3,
        2,
      ),
    ).toEqual([{ n: 2, why: "oven" }, { n: 1 }]);
    expect(checkPicks("no", 3, 2)).toEqual([]);
    expect(
      checkDishes([
        { name: "Cranberry curd tart", servings: 2 },
        { name: "cranberry CURD tart", servings: 3 },
        { name: "", servings: 1 },
        { name: "Pernil", servings: 900 },
      ]),
    ).toEqual([
      { name: "Cranberry curd tart", servings: 2 },
      { name: "Pernil" },
    ]);
    expect(
      checkCourses([
        { course: "dessert", note: "" },
        { course: "side", note: "simple" },
        { course: "drinks", note: "" },
        { course: "side", note: "again" },
      ]),
    ).toEqual([{ course: "side", note: "simple" }, { course: "dessert" }]);
  });

  it("finds a holiday, a tag and the courses in an ask's words", () => {
    const holidays = [
      { slug: "christmas", label: "Christmas" },
      { slug: "christmas-eve", label: "Christmas Eve" },
      { slug: "thanksgiving", label: "Thanksgiving", aliases: ["turkey-day"] },
    ];
    expect(holidayIn("Plan Christmas Eve dinner", holidays)).toBe(
      "christmas-eve",
    );
    expect(holidayIn("plan turkey day", holidays)).toBe("thanksgiving");
    expect(holidayIn("plan the week", holidays)).toBeUndefined();
    expect(askedTag("as a meal plan tagged christmas; we're making")).toBe(
      "christmas",
    );
    expect(askedTag("plan the week")).toBeUndefined();
    expect(coursesIn("the pernil, plus a breakfast and a dessert")).toEqual([
      "breakfast",
      "dessert",
    ]);
  });

  it("widens a mine ask with its own words, and interleaves the searches", () => {
    expect(
      askSearch("recipes that work well in small batches with a milk frother"),
    ).toBe("milk frother");
    expect(interleave([["a", "b", "c"], ["b", "d"], ["e"]])).toEqual([
      "a",
      "b",
      "e",
      "d",
      "c",
    ]);
    expect(interleave([["a", "b", "c"]], 2)).toEqual(["a", "b"]);
    expect(fallbackSubject("3 pulled pork recipes I don't already have")).toBe(
      "pulled pork",
    );
  });

  it("scores a mine run's answer on its fits and maybes", () => {
    const outcome = {
      kind: "mine",
      fit: ["london-fog"],
      maybe: ["hot-chocolate"],
      no: ["slow-cooker-hot-chocolate"],
    };
    const text = "Close, but no: [x](/recipe/slow-cooker-hot-chocolate)";
    expect(answeredText(text, outcome)).toBe("london-fog\nhot-chocolate");
    expect(answeredText(text, undefined)).toBe(text);
  });
});

describe("settleIntent", () => {
  const config = {
    url: MODEL_URL,
    model: "qwen3.5:9b",
    api: "ollama" as const,
  };
  const chatOf = (data: unknown) =>
    vi.fn(async (): Promise<ChatJsonResult> => ({
      data,
      model: "qwen3.5:9b",
      durationMs: 5,
    }));

  it("takes an asked intent, the rules' guess, else one small call", async () => {
    const chat = chatOf({ intent: "mine", why: "your recipes" });
    const options = { config, job: NO_JOB, chat };
    expect(await settleIntent(undefined, "x", options)).toBeUndefined();
    expect(await settleIntent("plan", "x", options)).toEqual({
      id: "plan",
      by: "asked",
    });
    expect(
      await settleIntent("auto", "3 soups I don't already have", options),
    ).toMatchObject({ id: "online", by: "rules" });
    expect(chat).not.toHaveBeenCalled();
    expect(
      await settleIntent("auto", "soups for a cold night", options),
    ).toEqual({ id: "mine", by: "model", why: "your recipes" });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(
      (chat.mock.calls[0] as unknown as [ChatJsonRequest])[0].schemaName,
    ).toBe("intent_classify");
  });

  it("is the loop when the answer is no intent, or it is a follow-up", async () => {
    expect(
      await settleIntent("auto", "soups", {
        config,
        job: NO_JOB,
        chat: chatOf({ intent: "delete everything" }),
      }),
    ).toMatchObject({ id: "any", by: "default" });
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(
      await settleIntent("auto", "soups", {
        config,
        job: NO_JOB,
        chat: failing,
      }),
    ).toMatchObject({ id: "any", by: "default" });
    expect(
      await settleIntent("plan", "plan it", {
        config,
        job: NO_JOB,
        chat: failing,
        followUp: true,
      }),
    ).toMatchObject({ id: "any", by: "default" });
  });
});

/* ------------------------------------------------------------------ */
/* The plans, end to end                                               */
/* ------------------------------------------------------------------ */

let dir: string;
let contentDirectory: string;
let ctx: CurationContext;
const servers: Server[] = [];

/** A JSON-LD recipe page. */
function recipePage(name: string, yieldText = "6 servings"): string {
  const node = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description: `${name}, done well.`,
    recipeYield: yieldText,
    totalTime: "PT4H",
    recipeIngredient: ["4 lb pork shoulder", "1 tbsp salt", "1 cup sauce"],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Season the pork." },
      { "@type": "HowToStep", text: "Cook it low and slow, then shred." },
    ],
  };
  return `<!doctype html><html><head><title>${name}</title><script type="application/ld+json">${JSON.stringify(node)}</script></head><body><h1>${name}</h1></body></html>`;
}

/** A server on 127.0.0.1 answering `routes` by path; its origin. */
async function serve(
  routes: Record<string, (url: URL) => { type: string; body: string }>,
): Promise<string> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const route = routes[url.pathname];
    if (!route) {
      response.writeHead(404).end("not found");
      return;
    }
    const { type, body } = route(url);
    response.writeHead(200, { "content-type": type }).end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const html = (body: string) => () => ({ type: "text/html", body });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "intents-jobs-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "intents-content-"));
  ctx = { contentDirectory };
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  vi.stubEnv("RECIPE_LLM_API", "");
  vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
  vi.stubEnv("RECIPE_LLM_MODEL", "qwen3.5:9b");
  vi.stubEnv("RECIPE_AGENT_MODEL", "");
  vi.stubEnv("RECIPE_LLM_CLAUDE_API_KEY", "");
  vi.stubEnv("RECIPE_SEARCH_URL", "");
  vi.stubEnv("RECIPE_POLITE_GAP_MS", "0");
  setFetchGuardTesting({ allowHosts: ["127.0.0.1"] });
});

afterEach(async () => {
  setFetchGuardTesting(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

/** The stand-in's answers by schema name; a judge's by the slugs it is shown. */
function standInChat(
  answers: Record<string, unknown>,
  verdicts: Record<string, "fit" | "maybe" | "no"> = {},
) {
  const calls: ChatJsonRequest[] = [];
  const chat = async (request: ChatJsonRequest): Promise<ChatJsonResult> => {
    calls.push(request);
    if (request.schemaName === "recipe_judge") {
      const slugs = [...request.user.matchAll(/^## (\S+)$/gm)].map(
        (match) => match[1],
      );
      return {
        data: {
          verdicts: slugs.map((slug) => ({
            slug,
            why: `${slug} judged`,
            verdict: verdicts[slug] ?? "no",
          })),
        },
        model: "qwen3.5:9b",
        durationMs: 3,
        promptTokens: 100,
        outputTokens: 20,
      };
    }
    if (!(request.schemaName! in answers)) {
      throw new Error(`no stand-in answer for ${request.schemaName}`);
    }
    return {
      data: answers[request.schemaName!],
      model: "qwen3.5:9b",
      durationMs: 2,
      promptTokens: 50,
      outputTokens: 10,
    };
  };
  return { chat, calls };
}

/** The loop's stand-in: one answer, no tools; the requests it saw. */
function standInLoop(text = "Done in the loop.") {
  const requests: ChatToolsRequest[] = [];
  const model = async (request: ChatToolsRequest): Promise<ChatToolsResult> => {
    requests.push(request);
    return {
      message: { role: "assistant", text, toolCalls: [] },
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
      stop: "end",
      durationMs: 1,
    } as ChatToolsResult;
  };
  return { model, requests };
}

async function run(
  prompt: string,
  intent: AgentIntentChoice | undefined,
  standIn: Parameters<typeof runAgentJob>[1]["standIn"],
  extra: Partial<AgentJobSpec> = {},
): Promise<{
  job: string;
  result: AgentJobResult;
  records: TranscriptRecord[];
}> {
  const spec: AgentJobSpec = {
    kind: "agent",
    contentDirectory,
    prompt,
    hold: true,
    ...(intent ? { intent } : {}),
    ...extra,
  };
  const outcome = await runJob(
    {
      kind: "agent",
      label: jobLabel(spec),
      spec,
      tier: jobTier(spec),
      resources: jobResources(spec),
    },
    (job) =>
      runAgentJob(spec, {
        ctx,
        job,
        dir,
        testing: { allowHosts: ["127.0.0.1"] },
        standIn,
      }),
    { dir, mirror: null },
  );
  const text = (await readTranscriptText(dir, outcome.job)) ?? "";
  return {
    job: outcome.job,
    result: outcome.result as AgentJobResult,
    records: transcriptRecords(text),
  };
}

function toolNames(records: TranscriptRecord[]): string[] {
  return historyOf(records).flatMap((message) =>
    message.role === "assistant"
      ? message.toolCalls.map((call) => call.name)
      : [],
  );
}

describe("online: new recipes from the web (D2, D3)", () => {
  it("holds N imports, leaving out what you have by page and by name", async () => {
    const sites = await Promise.all(
      ["carolina", "oven", "tacos", "sandwiches", "proper", "mine"].map(
        (name) =>
          serve({
            [`/${name}`]: html(
              recipePage(
                {
                  carolina: "Carolina Pulled Pork",
                  oven: "Oven Pulled Pork Shoulder",
                  tacos: "Pulled Pork Tacos",
                  sandwiches: "Slow Cooker Pulled Pork Sandwiches",
                  proper: "Pulled Pork",
                  mine: "Smoky Pulled Pork Bowls",
                }[name]!,
              ),
            ),
          }).then((origin) => ({ name, url: `${origin}/${name}` })),
      ),
    );
    const at = Object.fromEntries(sites.map((site) => [site.name, site.url]));
    const searchQueries: string[] = [];
    const search = await serve({
      "/search": (url) => {
        const q = url.searchParams.get("q") ?? "";
        searchQueries.push(q);
        const results = q.includes("site:")
          ? []
          : [
              {
                title: "Pulled Pork Recipe - The Modern Proper",
                url: at.proper,
              },
              { title: "25 Best Pulled Pork Recipes", url: `${at.oven}x` },
              {
                title: "Pulled pork pin",
                url: "https://www.pinterest.com/pin/1",
              },
              { title: "Smoky Pulled Pork Bowls", url: at.mine },
              { title: "Carolina Pulled Pork", url: at.carolina },
              { title: "Oven Pulled Pork Shoulder", url: at.oven },
              { title: "Pulled Pork Tacos", url: at.tacos },
              {
                title: "Slow Cooker Pulled Pork Sandwiches",
                url: at.sandwiches,
              },
            ];
        return {
          type: "application/json",
          body: JSON.stringify({
            results: results.map((row) => ({ ...row, content: "pork" })),
          }),
        };
      },
    });
    vi.stubEnv("RECIPE_SEARCH_URL", search);

    await createRecipe(ctx, { name: "Pulled Pork", date: 1_000 });
    await createRecipe(ctx, {
      name: "Pork Bowls",
      date: 2_000,
      source: { url: at.mine },
    });
    const before = (
      await createLocalBackend({
        contentDirectory,
        inProcess: true,
      }).searchRecipes("pork", { limit: 50 })
    ).total;

    const { chat, calls } = standInChat({
      intent_online_ask: { subject: "pulled pork", count: 3, constraints: [] },
      intent_online_pick: {
        picks: [
          { n: 3, why: "a shredded-pork taco night" },
          { n: 1, why: "a vinegar sauce" },
          { n: 1, why: "again" },
        ],
      },
    });
    const { result, records } = await run(
      "3 pulled pork recipes I don't already have",
      "auto",
      { chat },
    );

    expect(result.stopReason).toBe("done");
    expect(result.intent).toMatchObject({ id: "online", by: "rules" });
    expect(records[0]).toMatchObject({
      type: "start",
      intent: { id: "online", by: "rules" },
    });
    /* The steps: the bank, the web (preferred site first), the reads, the imports. */
    const names = toolNames(records);
    expect(names.slice(0, 3)).toEqual([
      "recipe_search",
      "web_search",
      "web_search",
    ]);
    expect(searchQueries[0]).toContain("site:sallysbakingaddiction.com");
    const inspects = historyOf(records).flatMap((message) =>
      message.role === "assistant"
        ? message.toolCalls.filter((call) => call.name === "page_inspect")
        : [],
    );
    expect(inspects.length).toBeGreaterThan(0);
    expect(inspects.length).toBeLessThanOrEqual(6);
    for (const call of inspects) {
      expect(call.input).toMatchObject({ llm: "off" });
      /* Never the page you have, the close name, the list or the pin. */
      expect([
        at.mine,
        at.proper,
        "https://www.pinterest.com/pin/1",
      ]).not.toContain((call.input as { url: string }).url);
    }

    /* Three held imports, the model's picks first, a repeat ignored. */
    const held = heldCalls(records);
    expect(held.map((call) => call.tool)).toEqual([
      "recipe_import",
      "recipe_import",
      "recipe_import",
    ]);
    expect(held.map((call) => (call.input as { url: string }).url)).toEqual([
      at.tacos,
      at.carolina,
      at.oven,
    ]);
    expect(held[0].held.slug).toBe("pulled-pork-tacos");
    expect(calls.map((call) => call.schemaName)).toEqual([
      "intent_online_ask",
      "intent_online_pick",
    ]);

    /* What was set aside, and said. */
    expect(result.outcome).toMatchObject({
      kind: "online",
      subject: "pulled pork",
      count: 3,
      close: [{ url: at.proper, like: { slug: "pulled-pork" } }],
      had: [{ url: at.mine, slug: "pork-bowls" }],
    });
    expect(result.text).toContain("held for your OK");
    expect(result.text).toContain("**Close to yours**");
    expect(result.text).toContain("(/recipe/pulled-pork)");

    /* Nothing written: the imports wait for the review. */
    const after = (
      await createLocalBackend({
        contentDirectory,
        inProcess: true,
      }).searchRecipes("pork", { limit: 50 })
    ).total;
    expect(after).toBe(before);
    /* Case e's scorer passes on it. */
    const scoredCalls = callRecords(historyOf(records));
    const urls = scoredCalls.flatMap((call) => {
      const url = (call.input as { url?: unknown }).url;
      return typeof url === "string" ? [url] : [];
    });
    const scored = checkNewImports({
      calls: scoredCalls,
      count: 3,
      sourceKey: (url) => (URL.canParse(url) ? sourceUrlKey(url) : undefined),
      existing: (await existingBySource(ctx, urls)).found,
      bank: (await readAllRecipeRows(ctx)).map(({ slug, name }) => ({
        slug,
        name,
      })),
      commits: 0,
    });
    expect(scored.notes).toEqual([]);
    expect(scored.matched).toBe(true);
    /* The transcript's turns count the plan's model calls. */
    expect(records.filter((record) => record.type === "turn")).toHaveLength(2);
    expect(result.turns).toBe(2);
  });

  it("falls back to the loop when there is no web search", async () => {
    const { model, requests } = standInLoop("Found some.");
    const { result } = await run("3 soups I don't already have", "online", {
      model,
      chat: standInChat({}).chat,
    });
    expect(requests).toHaveLength(1);
    expect(result.text).toBe("Found some.");
    expect(result.intent).toMatchObject({
      id: "online",
      by: "asked",
      fellBack: expect.stringContaining("RECIPE_SEARCH_URL"),
    });
  });
});

describe("mine: which of my recipes fit (D8, D9)", () => {
  it("searches each expansion in steps and notes, then judges", async () => {
    await createRecipe(ctx, {
      name: "London Fog",
      date: 1_000,
      recipeYield: "1 drink",
      ingredients: ["1 cup milk", "1 earl grey tea bag"],
      instructions: [
        "Steep the tea.",
        "Froth the milk with a handheld frother.",
      ],
    });
    await createRecipe(ctx, {
      name: "Hot Chocolate",
      date: 2_000,
      recipeYield: "2 mugs",
      ingredients: ["2 cups milk", "2 tbsp cocoa"],
      instructions: ["Whisk the cocoa into warm milk."],
    });
    await createRecipe(ctx, {
      name: "Slow Cooker Hot Chocolate",
      date: 3_000,
      recipeYield: "10 cups",
      ingredients: ["8 cups milk", "1 cup cocoa"],
      instructions: ["Cook on low for two hours."],
    });
    await createRecipe(ctx, {
      name: "Eggnog Cookies",
      date: 4_000,
      ingredients: ["1 cup eggnog", "2 cups flour"],
      instructions: ["Bake."],
    });

    const { chat, calls } = standInChat(
      {
        intent_mine_ask: {
          criterion: "a small batch made with a handheld milk frother",
          searches: ["hot chocolate", "frother", 'tag:"x" latte'],
        },
      },
      {
        "london-fog": "fit",
        "hot-chocolate": "fit",
        "slow-cooker-hot-chocolate": "no",
      },
    );
    const { result, records } = await run(
      "recipes that work well in small batches with a milk frother",
      "auto",
      { chat },
    );
    expect(result.stopReason).toBe("done");
    expect(result.intent).toMatchObject({ id: "mine", by: "rules" });
    const searches = historyOf(records).flatMap((message) =>
      message.role === "assistant" ? message.toolCalls : [],
    );
    expect(searches.every((call) => call.name === "recipe_search")).toBe(true);
    expect(searches.map((call) => call.input)).toEqual([
      { query: "milk frother", deep: true, limit: 30 },
      { query: "hot chocolate", deep: true, limit: 30 },
      { query: "frother", deep: true, limit: 30 },
      { query: '"x" latte'.replace(/"/g, ""), deep: true, limit: 30 },
    ]);
    expect(calls.map((call) => call.schemaName)).toEqual([
      "intent_mine_ask",
      "recipe_judge",
    ]);
    expect(calls[1].system).toContain("You judge whether recipes fit");
    expect(result.outcome).toMatchObject({
      kind: "mine",
      fit: expect.arrayContaining(["london-fog", "hot-chocolate"]),
      no: ["slow-cooker-hot-chocolate"],
    });
    expect(result.text).toContain("**Fits**");
    expect(result.text).toContain("**Close, but no:**");
    /* Case f's scorer passes on the plan's fits. */
    expect(
      checkAnswerSlugs({
        text: answeredText(result.text, result.outcome),
        include: ["london-fog", "hot-chocolate"],
        exclude: ["slow-cooker-hot-chocolate"],
        commits: 0,
      }).matched,
    ).toBe(true);
    expect(heldCalls(records)).toEqual([]);
  });
});

describe("plan: a meal plan in code, held", () => {
  async function seedHolidays() {
    for (const term of [
      { label: "Holidays", slug: "holidays" },
      { label: "Thanksgiving", parent: "holidays" },
      { label: "Christmas", parent: "holidays" },
      { label: "Course", slug: "course" },
      { label: "Breakfast", parent: "course" },
      { label: "Main", parent: "course" },
      { label: "Side", parent: "course" },
      { label: "Dessert", parent: "course" },
    ]) {
      await createTerm(ctx, term);
    }
    for (const recipe of [
      {
        name: "Cranberry Curd Tart",
        tags: ["dessert"],
        recipeYield: "8 servings",
        date: 1_000,
      },
      { name: "Green Beans", tags: ["thanksgiving", "side"], date: 2_000 },
      { name: "Buttery Rolls", tags: ["thanksgiving", "side"], date: 3_000 },
      { name: "Roast Turkey", tags: ["thanksgiving", "main"], date: 4_000 },
      {
        name: "Pernil (Puerto Rican Roast Pork)",
        tags: ["christmas", "main"],
        recipeYield: "Serves 8-10",
        date: 5_000,
      },
      {
        name: "Christmas Morning Casserole",
        tags: ["christmas", "breakfast"],
        date: 6_000,
      },
      { name: "Bûche de Noël", tags: ["christmas", "dessert"], date: 7_000 },
      {
        name: "Gingerbread",
        tags: ["christmas", "dessert"],
        recipeYield: "4 dozen cookies",
        date: 8_000,
      },
    ]) {
      await createRecipe(ctx, recipe);
    }
  }

  it("resolves the named dish, picks a side and holds the plan (case g)", async () => {
    await seedHolidays();
    const { chat, calls } = standInChat(
      {
        intent_plan_ask: {
          name: "",
          holiday: "thanksgiving",
          servings: 0,
          dishes: [{ name: "the cranberry curd tart", servings: 2 }],
          courses: [{ course: "side", note: "simple" }],
          count: 0,
          subject: "",
        },
      },
      { "buttery-rolls": "maybe", "green-beans": "fit" },
    );
    const ask =
      "Plan Thanksgiving from its menu as a meal plan tagged thanksgiving; we bring 2 servings of the cranberry curd tart plus a simple side";
    const { result, records } = await run(ask, "auto", { chat });
    expect(result.stopReason).toBe("done");
    expect(result.intent).toMatchObject({ id: "plan", by: "rules" });
    expect(toolNames(records)).toEqual(["holiday_get", "group_create"]);
    expect(calls.map((call) => call.schemaName)).toEqual([
      "intent_plan_ask",
      "recipe_judge",
    ]);
    const [held] = heldCalls(records);
    expect(held.tool).toBe("group_create");
    const group = (held.input as { group: Record<string, unknown> }).group;
    expect(group).toMatchObject({
      kind: "meal-plan",
      tags: ["thanksgiving"],
      items: [
        { recipe: "green-beans", label: "Side" },
        {
          recipe: "cranberry-curd-tart",
          label: "Dessert",
          scale: "1/4",
          note: "2 servings",
        },
      ],
    });
    expect(group.name).toMatch(/^Thanksgiving \d{4}$/);
    expect(typeof group.date).toBe("string");
    /* Case g's scorer passes on it. */
    expect(
      checkHeldGroup({
        calls: callRecords(historyOf(records)),
        tag: "thanksgiving",
        require: ["cranberry-curd-tart"],
        minItems: 2,
        commits: 0,
      }).matched,
    ).toBe(true);
    expect(result.text).toContain("held for your OK");
    expect(result.text).toContain("×1/4 (2 servings; it makes 8)");
    /* Nothing written. */
    await expect(
      createLocalBackend({ contentDirectory, inProcess: true }).getGroup(
        String(group.slug),
      ),
    ).rejects.toThrow();
  });

  it("finds the pernil by its words and fills breakfast and dessert (case h)", async () => {
    await seedHolidays();
    const { chat } = standInChat(
      {
        intent_plan_ask: {
          name: "",
          holiday: "",
          servings: 6,
          dishes: [{ name: "the pernil", servings: 6 }],
          courses: [
            { course: "breakfast", note: "" },
            { course: "dessert", note: "" },
          ],
          count: 0,
          subject: "",
        },
      },
      { gingerbread: "fit" },
    );
    const { result, records } = await run(
      "Plan Christmas from its menu as a meal plan tagged christmas; we're making the pernil for 6, plus a breakfast and a dessert",
      "plan",
      { chat },
    );
    expect(result.intent).toEqual({ id: "plan", by: "asked" });
    const [held] = heldCalls(records);
    const group = (
      held.input as { group: { items: unknown[]; tags: string[] } }
    ).group;
    expect(group.tags).toEqual(["christmas"]);
    expect(group.items).toEqual([
      {
        recipe: "christmas-morning-casserole",
        label: "Breakfast",
        note: "6 servings",
      },
      {
        recipe: "pernil-puerto-rican-roast-pork",
        label: "Main",
        scale: "3/4",
        note: "6 servings",
      },
      /* "4 dozen cookies" is not servings: no scale (51b review 1). */
      { recipe: "gingerbread", label: "Dessert", note: "6 servings" },
    ]);
    expect(result.text).toContain(
      "Gingerbread](/recipe/gingerbread) (6 servings; its yield, “4 dozen cookies”, isn't in servings)",
    );
  });
});

describe("the loop's intents", () => {
  it("unset and any run the loop exactly; organize adds its note", async () => {
    for (const intent of [undefined, "any"] as const) {
      const { model, requests } = standInLoop();
      const { result, records } = await run("tag my soups", intent, { model });
      expect(requests).toHaveLength(1);
      expect(requests[0].system).not.toContain(ORGANIZE_NOTE);
      expect(result.text).toBe("Done in the loop.");
      expect(result.outcome).toBeUndefined();
      if (intent === undefined) {
        expect(result.intent).toBeUndefined();
        expect(records[0]).not.toHaveProperty("intent");
      } else {
        expect(result.intent).toEqual({ id: "any", by: "asked" });
      }
    }
    const { model, requests } = standInLoop();
    const { result } = await run("tag my soups as winter", "auto", { model });
    expect(result.intent).toMatchObject({ id: "organize", by: "rules" });
    expect(requests[0].system).toContain(ORGANIZE_NOTE);
  });

  it("a follow-up takes no plan's intent", async () => {
    await expect(
      startAgentRun(ctx, { prompt: "more", runId: "x", intent: "plan" }),
    ).rejects.toThrow(/follow-up continues the conversation/);
    await expect(
      startAgentRun(ctx, { prompt: "more", intent: "soon" as never }),
    ).rejects.toThrow(/intent is/);
  });
});
