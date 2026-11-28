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
  ONLINE_NO_SEARCH,
  guessIntent,
  intentAtStart,
  type AgentIntentChoice,
} from "../websites/recipe-website/editor/controller/agent/intents/guess";
import { settleIntent } from "../websites/recipe-website/editor/controller/agent/intents/classify";
import {
  MINE_READ_SYSTEM,
  askSearch,
  interleave,
} from "../websites/recipe-website/editor/controller/agent/intents/mine";
import { JUDGE_SYSTEM_PROMPT } from "../websites/recipe-website/editor/controller/llm/judge";
import {
  checkPicks,
  asksForVideo,
  fallbackSubject,
  onlineAnswer,
  readingOrder,
} from "../websites/recipe-website/editor/controller/agent/intents/online";
import { NO_INDEX_ANSWER } from "../websites/recipe-website/editor/controller/agent/intents";
import {
  askedTag,
  checkCourses,
  checkDishes,
  courseRequest,
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
import {
  HELD_NOTE,
  heldCalls,
  heldPreview,
} from "../websites/recipe-website/editor/controller/agent/held";
import {
  markNotesHeldBack,
  notesHeldBack,
  withoutNotesLearning,
} from "../websites/recipe-website/editor/controller/llm/agentContext";
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

describe("the intent the start answer names (51b review 5)", () => {
  const ask = "3 soups I don't already have";
  it("says online falls back where there is no web search, as the job will", () => {
    expect(
      intentAtStart("auto", ask, { followUp: false, search: false }),
    ).toEqual({
      intent: {
        id: "online",
        by: "rules",
        why: "you asked for recipes you don't have",
        fellBack: ONLINE_NO_SEARCH,
      },
    });
    expect(
      intentAtStart("online", "soups", { followUp: false, search: false }),
    ).toEqual({
      intent: { id: "online", by: "asked", fellBack: ONLINE_NO_SEARCH },
    });
  });

  it("names the plan as it is where it can run", () => {
    expect(
      intentAtStart("auto", ask, { followUp: false, search: true }).intent,
    ).not.toHaveProperty("fellBack");
    /* Only online needs the web search. */
    expect(
      intentAtStart("mine", "soups", { followUp: false, search: false }),
    ).toEqual({ intent: { id: "mine", by: "asked" } });
    expect(
      intentAtStart("auto", "soups for a cold night", {
        followUp: false,
        search: false,
      }),
    ).toEqual({ intentPending: true });
    expect(
      intentAtStart(undefined, ask, { followUp: false, search: false }),
    ).toEqual({});
    expect(
      intentAtStart("auto", ask, { followUp: true, search: false }).intent,
    ).toMatchObject({ id: "any", by: "default" });
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
      resolveDish("roast pork", two, { menu: new Set(["roast-pork-b"]) }),
    ).toEqual({ slug: "roast-pork-b", name: "Roast Pork", how: "name" });
  });

  it("says when a named dish could be more than one (51b review 2)", () => {
    /* The real two: both answer "christmas sugar cookies", both on the menu. */
    const cookies = [
      {
        slug: "christmas-sugar-cookies-recipe-with-easy-icing",
        name: "Christmas Sugar Cookies Recipe with Easy Icing",
        tags: ["christmas", "dessert"],
      },
      {
        slug: "drop-style-christmas-sugar-cookies",
        name: "Drop-Style Christmas Sugar Cookies",
        tags: ["christmas", "dessert"],
      },
    ];
    const menu = new Set(cookies.map((recipe) => recipe.slug));
    const both = resolveDish("the christmas sugar cookies", cookies, {
      menu,
      course: "dessert",
      courseOf: () => "dessert",
    });
    expect(both).toMatchObject({
      slug: "drop-style-christmas-sugar-cookies",
      how: "words",
      others: [{ slug: "christmas-sugar-cookies-recipe-with-easy-icing" }],
    });
    /* The menu settles it: no others. */
    expect(
      resolveDish("christmas sugar cookies", cookies, {
        menu: new Set(["christmas-sugar-cookies-recipe-with-easy-icing"]),
      }),
    ).toEqual({
      slug: "christmas-sugar-cookies-recipe-with-easy-icing",
      name: "Christmas Sugar Cookies Recipe with Easy Icing",
      how: "words",
    });
    /* "the turkey" is the roast, not the gravy, and the gravy is said. */
    const turkey = [
      { slug: "turkey-gravy", name: "Turkey Gravy", tags: ["sauce"] },
      { slug: "roast-turkey", name: "Roast Turkey", tags: ["main"] },
    ];
    const courseOf = (recipe: { tags?: string[] }) => recipe.tags?.[0];
    expect(resolveDish("the turkey", turkey, { courseOf })).toMatchObject({
      slug: "roast-turkey",
      others: [{ slug: "turkey-gravy" }],
    });
    /* The dish's course settles it. */
    expect(
      resolveDish("the turkey", turkey, { course: "sauce", courseOf }),
    ).toEqual({ slug: "turkey-gravy", name: "Turkey Gravy", how: "words" });
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

  it("reads recipe pages before videos (51b real run miss 10)", () => {
    const page = (site: string) => ({
      url: `https://${site}/p`,
      title: site,
      site,
    });
    const video = {
      url: "https://www.youtube.com/watch?v=x",
      title: "v",
      site: "youtube.com",
      video: true as const,
    };
    const list = [video, page("a.com"), page("b.com")];
    expect(readingOrder(list, false).map((item) => item.site)).toEqual([
      "a.com",
      "b.com",
      "youtube.com",
    ]);
    expect(readingOrder(list, true)).toEqual(list);
    expect(asksForVideo("a pulled pork video")).toBe(true);
    expect(asksForVideo("pulled pork from YouTube")).toBe(true);
    expect(asksForVideo("3 pulled pork recipes I don't already have")).toBe(
      false,
    );
  });

  it("reads a generic course as a course, not a dish (51b real run miss 9)", () => {
    expect(courseRequest("a simple side")).toEqual({
      course: "side",
      note: "simple",
    });
    expect(courseRequest("simple side")).toEqual({
      course: "side",
      note: "simple",
    });
    expect(courseRequest("a dessert")).toEqual({ course: "dessert" });
    expect(courseRequest("a breakfast")).toEqual({ course: "breakfast" });
    expect(courseRequest("a drink")).toEqual({ course: "drink" });
    expect(courseRequest("quick vegetarian side dishes")).toEqual({
      course: "side",
      note: "quick vegetarian",
    });
    /* A dish named as itself stays a dish. */
    expect(courseRequest("the cranberry sauce")).toBeUndefined();
    expect(courseRequest("Korean spinach side dish")).toBeUndefined();
    expect(courseRequest("the cranberry curd tart")).toBeUndefined();
    expect(courseRequest("the pernil")).toBeUndefined();
    /* Loose: a dish that named no recipe, round a course's name. */
    expect(courseRequest("a showstopper side", { loose: true })).toEqual({
      course: "side",
      note: "showstopper",
    });
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

describe("the agent's context across bundles (51b review 6)", () => {
  it("is one store however many copies of the module are loaded", async () => {
    const first =
      await import("../websites/recipe-website/editor/controller/llm/agentContext");
    vi.resetModules();
    const second =
      await import("../websites/recipe-website/editor/controller/llm/agentContext");
    expect(second).not.toBe(first);
    const config = { model: "qwen3.5:9b", api: "ollama" };
    expect(
      first.withAgentModel({ model: "qwen3.5:9b", numCtx: 12_288 }, () =>
        second.agentNumCtxFor(config),
      ),
    ).toBe(12_288);
    expect(first.withoutNotesLearning(() => second.notesLearningHeld())).toBe(
      true,
    );
    expect(second.notesLearningHeld()).toBe(false);
    expect(second.agentNumCtxFor(config)).toBeUndefined();
  });
});

describe("a held import's notes (51b review 7)", () => {
  it("says the approved import reads the notes the preview didn't", () => {
    expect(
      withoutNotesLearning(() => {
        const before = notesHeldBack();
        markNotesHeldBack();
        return [before, notesHeldBack()];
      }),
    ).toEqual([false, true]);
    /* Outside a held dry run, nothing is marked. */
    markNotesHeldBack();
    expect(notesHeldBack()).toBe(false);
    const url = "https://example.com/tacos";
    expect(
      heldPreview(
        "recipe_import",
        { url },
        {
          held: true,
          note: HELD_NOTE,
          notesOnApproval: true,
          dryRun: { slug: "tacos" },
        },
      ),
    ).toEqual({ url, slug: "tacos", notesOnApproval: true });
    expect(
      heldPreview(
        "recipe_import",
        { url },
        { held: true, note: HELD_NOTE, dryRun: { slug: "tacos" } },
      ),
    ).toEqual({ url, slug: "tacos" });
  });
});

describe("a tool in the ask is judged as what suits it (51b real run miss 8)", () => {
  it("asks for a criterion that works well with the tool, not one that mentions it", () => {
    expect(MINE_READ_SYSTEM).toContain(
      "say what works well with it or suits it",
    );
    expect(MINE_READ_SYSTEM).toContain(
      "never that a recipe must use or mention it",
    );
    expect(JUDGE_SYSTEM_PROMPT).toContain(
      "judge whether the recipe would work well with it or suits it, not whether its text mentions it",
    );
    expect(JUDGE_SYSTEM_PROMPT).toContain(
      "a pot for ten does not suit a small batch",
    );
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

  it("hands the job's cancel to the classify call (51b review 4)", async () => {
    const controller = new AbortController();
    const chat = vi.fn(
      (request: ChatJsonRequest) =>
        new Promise<ChatJsonResult>((_, reject) => {
          const stop = () => reject(new Error("aborted"));
          if (request.signal?.aborted) stop();
          request.signal?.addEventListener("abort", stop);
        }),
    );
    const settled = settleIntent("auto", "soups for a cold night", {
      config,
      job: { ...NO_JOB, signal: controller.signal },
      chat,
    });
    await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
    expect(chat.mock.calls[0][0].signal).toBe(controller.signal);
    controller.abort();
    /* A cancel is a cancel, not "the open loop runs". */
    await expect(settled).rejects.toThrow("aborted");
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
function recipePage(
  name: string,
  yieldText = "6 servings",
  notes?: string,
): string {
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
  return `<!doctype html><html><head><title>${name}</title><script type="application/ld+json">${JSON.stringify(node)}</script></head><body><h1>${name}</h1>${notes ? `<h2>Notes</h2><p>${notes}</p>` : ""}</body></html>`;
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
                "6 servings",
                /* A Notes heading no selector has learned (51b review 7). */
                name === "tacos"
                  ? "Warm the tortillas in a dry pan first."
                  : undefined,
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
              /* 51b real run miss 10: a video, first in the results. */
              {
                title: "Perfect Pulled Pork Starts with Scoring",
                url: "https://www.youtube.com/watch?v=IHag-hvuKqo",
              },
              {
                title: "Pulled Pork Recipe - The Modern Proper",
                url: at.proper,
              },
              { title: "25 Best Pulled Pork Recipes", url: `${at.oven}x` },
              /* (SearXNG answers at most 8: the pin made room for the
               * video; `notRecipeHost` has its own test.) */
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
        /* The pages were enough: the video is never read (Db12). */
        "https://www.youtube.com/watch?v=IHag-hvuKqo",
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
    /* The tacos page's notes wait for the approval, and the review says so. */
    expect(held[0].held.notesOnApproval).toBe(true);
    expect(held[1].held).not.toHaveProperty("notesOnApproval");
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

  it("stops when there is no recipe index to say what you have (51b review 3)", async () => {
    const searchQueries: string[] = [];
    const search = await serve({
      "/search": (url) => {
        searchQueries.push(url.searchParams.get("q") ?? "");
        return {
          type: "application/json",
          body: JSON.stringify({ results: [] }),
        };
      },
    });
    vi.stubEnv("RECIPE_SEARCH_URL", search);
    const { chat, calls } = standInChat({});
    for (const [prompt, intent] of [
      ["3 pulled pork recipes I don't already have", "online"],
      ["recipes that work well with a milk frother", "mine"],
      ["Plan Thanksgiving with the cranberry curd tart", "plan"],
    ] as const) {
      const { result, records } = await run(prompt, intent, { chat });
      expect(result.stopReason).toBe("done");
      expect(result.text).toBe(NO_INDEX_ANSWER);
      expect(toolNames(records)).toEqual([]);
      expect(heldCalls(records)).toEqual([]);
    }
    expect(searchQueries).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("says a note once", () => {
    const warning = "the recipes index is missing";
    const text = onlineAnswer(
      {
        kind: "online",
        subject: "soup",
        count: 1,
        proposed: [],
        close: [],
        had: [],
      },
      [],
      [warning, warning],
      true,
    );
    expect(text.split("he recipes index is missing").length).toBe(2);
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
          criterion:
            "A drink of hot or frothed milk, one or two servings, that works well with a handheld milk frother",
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
    /* 51b real run miss 8: the judge reads "works well with", and the
     * person's own words, never "must use a frother". */
    expect(calls[1].user).toContain(
      "Ask: A drink of hot or frothed milk, one or two servings, that works well with a handheld milk frother. The person asked: recipes that work well in small batches with a milk frother",
    );
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

  it("picks g's simple side from the menu when the model reads it as a dish (51b real run miss 9)", async () => {
    await seedHolidays();
    await createRecipe(ctx, {
      name: "Sigeumchi Namul (Korean Spinach Side Dish)",
      tags: ["side", "korean"],
      recipeYield: "4 servings",
      date: 9_000,
    });
    /* As qwen3.5:9b read it: "simple side" among the dishes, no courses. */
    const { chat, calls } = standInChat(
      {
        intent_plan_ask: {
          name: "",
          holiday: "thanksgiving",
          servings: 0,
          dishes: [
            { name: "cranberry curd tart", servings: 2, course: "dessert" },
            { name: "simple side", servings: 2, course: "side" },
          ],
          courses: [],
          count: 0,
          subject: "",
        },
      },
      { "buttery-rolls": "maybe", "green-beans": "fit" },
    );
    const { result, records } = await run(
      "Plan Thanksgiving from its menu as a meal plan tagged thanksgiving; we bring 2 servings of the cranberry curd tart plus a simple side",
      "auto",
      { chat },
    );
    expect(toolNames(records)).toEqual(["holiday_get", "group_create"]);
    const judge = calls.find((call) => call.schemaName === "recipe_judge")!;
    expect(judge.user).toContain("Ask: A simple side for a Thanksgiving meal.");
    /* The menu's sides were judged, not the spinach that says "side". */
    expect(judge.user).toContain("## green-beans");
    expect(judge.user).toContain("## buttery-rolls");
    expect(judge.user).not.toContain("## sigeumchi-namul");
    const [held] = heldCalls(records);
    expect((held.input as { group: { items: unknown[] } }).group.items).toEqual(
      [
        { recipe: "green-beans", label: "Side" },
        {
          recipe: "cranberry-curd-tart",
          label: "Dessert",
          scale: "1/4",
          note: "2 servings",
        },
      ],
    );
    expect(result.text).toContain(
      "- Side: [Green Beans](/recipe/green-beans) — green-beans judged",
    );
    expect(result.text).not.toContain("Sigeumchi");
    expect(result.outcome).toMatchObject({ unresolved: [], empty: [] });
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

describe("plan: a named dish that could be several (51b review 2)", () => {
  it("takes one and says which others it could be", async () => {
    for (const term of [
      { label: "Holidays", slug: "holidays" },
      { label: "Christmas", parent: "holidays" },
      { label: "Course", slug: "course" },
      { label: "Dessert", parent: "course" },
    ]) {
      await createTerm(ctx, term);
    }
    for (const [name, date] of [
      ["Christmas Sugar Cookies Recipe with Easy Icing", 1_000],
      ["Drop-Style Christmas Sugar Cookies", 2_000],
    ] as const) {
      await createRecipe(ctx, { name, tags: ["christmas", "dessert"], date });
    }
    const { chat } = standInChat({
      intent_plan_ask: {
        name: "",
        holiday: "christmas",
        servings: 0,
        dishes: [
          {
            name: "the christmas sugar cookies",
            servings: 0,
            course: "dessert",
          },
        ],
        courses: [],
        count: 0,
        subject: "",
      },
    });
    const { result, records } = await run(
      "Plan Christmas as a meal plan; we're making the christmas sugar cookies",
      "plan",
      { chat },
    );
    const [held] = heldCalls(records);
    expect((held.input as { group: { items: unknown[] } }).group.items).toEqual(
      [{ recipe: "drop-style-christmas-sugar-cookies", label: "Dessert" }],
    );
    expect(result.outcome).toMatchObject({
      ambiguous: [
        {
          dish: "the christmas sugar cookies",
          slug: "drop-style-christmas-sugar-cookies",
          others: ["christmas-sugar-cookies-recipe-with-easy-icing"],
        },
      ],
    });
    expect(result.text).toContain(
      "**Heads up:** “the christmas sugar cookies” could be more than one of your recipes: I took [Drop-Style Christmas Sugar Cookies](/recipe/drop-style-christmas-sugar-cookies); the other is [Christmas Sugar Cookies Recipe with Easy Icing](/recipe/christmas-sugar-cookies-recipe-with-easy-icing).",
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
