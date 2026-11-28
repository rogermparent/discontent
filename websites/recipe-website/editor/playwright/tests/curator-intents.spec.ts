import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Route } from "@playwright/test";
import { test, expect, type Page } from "../support/test";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { snapshotLocator } from "../support/visual";

/*
 * 51d: `/curator` by intent — the intent row and its guess, the picker's
 * two local models, the plan's steps live, and the result cards per outcome
 * kind (online's held imports, mine's judged groups, plan's held plan).
 *
 * The first test runs real asks on a stand-in Ollama on loopback (never a
 * real model; the open loop, which answers in a line). The cards' tests
 * drive the page with **stubbed job results**: `GET /api/agent/<id>` and its
 * review are answered by the spec (`page.route`), exactly in the shapes 51b
 * ships, so each outcome kind is shown without a model, SearXNG or a web
 * page. A card's Import / Approve / Skip is checked as the review POST it
 * sends; "Add to shopping list" goes to the real server.
 */
let model: Server;
let modelUrl: string;
/** Every ask the stand-in was sent. */
const asked: string[] = [];

test.beforeAll(async () => {
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url !== "/api/chat") {
        response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        model: string;
        messages: { role: string; content?: string }[];
      };
      asked.push(
        `${body.model}: ${body.messages.filter((m) => m.role === "user").at(-1)?.content ?? ""}`,
      );
      response.end(
        JSON.stringify({
          model: body.model,
          message: { role: "assistant", content: "Nothing to do here." },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 900,
          eval_count: 12,
        }),
      );
    });
  });
  await new Promise<void>((resolve) =>
    model.listen(0, "127.0.0.1", () => resolve()),
  );
  modelUrl = `http://127.0.0.1:${(model.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
});

/** The stand-in on, with (51d) a curator model of its own, or off. */
async function useModel(
  request: APIRequestContext,
  url?: string,
  agent?: string,
) {
  const query = url
    ? `?url=${encodeURIComponent(url)}${agent ? `&agent=${encodeURIComponent(agent)}` : ""}`
    : "";
  const response = await request.get(`/settings/test-llm${query}`);
  expect(response.ok()).toBe(true);
}

const FIRST_VISIT = 30_000;
const RUN = 30_000;

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function signInAndOpen(page: Page, path = "/curator") {
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeAttached();
  await page.goto(path, { timeout: FIRST_VISIT });
}

const askBox = (page: Page) =>
  page.getByLabel("What should the curator do?", { exact: true });
const intents = (page: Page) => page.getByTestId("curator-intents");
const runIntents = (page: Page) => page.getByTestId("curator-run-intents");
const intentButton = (scope: ReturnType<Page["getByTestId"]>, name: string) =>
  scope.getByRole("button", { name, exact: true });
const status = (page: Page) => page.getByTestId("curator-status");

/* ------------------------------------------------------------------ */
/* Stubbed runs: 51b's shapes                                           */
/* ------------------------------------------------------------------ */

const T0 = Date.parse("2026-11-28T10:00:00.000Z");
const iso = (offset: number) => new Date(T0 + offset * 1000).toISOString();

interface HeldStub {
  id: string;
  tool: string;
  phrase: string;
  input: Record<string, unknown>;
  held: Record<string, unknown>;
}

interface RunStub {
  id: string;
  prompt: string;
  intent: { id: string; by: string; why?: string };
  outcome?: unknown;
  held: HeldStub[];
  answer: string;
  /** 51e2: review notes the run's view carries (oldest first). */
  reviewNotes?: Record<string, unknown>[];
  /** The job's top-level step lines, in order. */
  lines: { step: string; data?: Record<string, unknown>; ok?: boolean }[];
}

const USAGE = {
  inputTokens: 4200,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

function jobLines(run: RunStub, upTo = run.lines.length, openLast = false) {
  const out: Record<string, unknown>[] = [];
  run.lines.slice(0, upTo).forEach((line, index) => {
    const n = index + 1;
    out.push({
      t: iso(n),
      step: line.step,
      phase: "start",
      level: "info",
      n,
      ...(line.data ? { data: line.data } : {}),
    });
    if (openLast && index === upTo - 1) return;
    out.push({
      t: iso(n),
      step: line.step,
      phase: "end",
      level: "info",
      n,
      ms: 400,
      ok: line.ok !== false,
    });
  });
  return out;
}

function transcript(run: RunStub, ended: boolean) {
  const records: Record<string, unknown>[] = [
    {
      t: iso(0),
      type: "start",
      job: run.id,
      model: "qwen3.5:9b",
      api: "ollama",
      tools: ["recipe_search", "web_search", "page_inspect", "recipe_import"],
      hold: true,
      intent: run.intent,
    },
    {
      t: iso(0),
      type: "message",
      job: run.id,
      message: { role: "user", text: run.prompt },
    },
  ];
  run.held.forEach((call, index) => {
    records.push(
      {
        t: iso(index + 1),
        type: "message",
        job: run.id,
        message: {
          role: "assistant",
          text: `Holding ${call.phrase}.`,
          toolCalls: [{ id: call.id, name: call.tool, input: call.input }],
        },
      },
      {
        t: iso(index + 1),
        type: "message",
        job: run.id,
        message: {
          role: "tool",
          toolCallId: call.id,
          name: call.tool,
          content: JSON.stringify({ held: true }),
          held: call.held,
        },
      },
    );
  });
  if (!ended) return records;
  records.push(
    {
      t: iso(30),
      type: "message",
      job: run.id,
      message: { role: "assistant", text: run.answer, toolCalls: [] },
    },
    {
      t: iso(30),
      type: "end",
      job: run.id,
      stop: "done",
      usage: USAGE,
      model: "qwen3.5:9b",
      api: "ollama",
      turns: 3,
      toolCalls: run.lines.length,
      trimmed: 0,
      durationMs: 30_000,
    },
  );
  return records;
}

function meta(run: RunStub, ended: boolean) {
  return {
    id: run.id,
    kind: "agent",
    label: `ask: ${run.prompt}`,
    status: ended ? "done" : "running",
    tier: "interactive",
    resources: [],
    pid: 1,
    host: "test",
    pidns: null,
    nonce: "n",
    queuedAt: T0,
    startedAt: T0,
    ...(ended ? { endedAt: T0 + 30_000 } : {}),
    spec: { kind: "agent", prompt: run.prompt, hold: true, intent: "auto" },
    ...(ended
      ? {
          result: {
            text: run.answer,
            stopReason: "done",
            usage: USAGE,
            turns: 3,
            toolCalls: run.lines.length,
            trimmed: 0,
            durationMs: 30_000,
            model: "qwen3.5:9b",
            api: "ollama",
            intent: run.intent,
            ...(run.outcome ? { outcome: run.outcome } : {}),
          },
        }
      : {}),
  };
}

/**
 * Answer the page's reads of a stubbed run: the run view (its offsets
 * honoured, so nothing repeats), its review — each held call as `states`
 * has it — and its changes (none). `progress` (live runs) says how far the
 * run has got on each read: `{lines, ended}`.
 */
async function stubRun(
  page: Page,
  run: RunStub,
  {
    progress,
    refuseOnce = [],
  }: {
    progress?: (read: number) => {
      lines: number;
      open: boolean;
      ended: boolean;
    };
    /** Calls whose first decision the editor refuses (400), as it would a
     * call another tab decided first. */
    refuseOnce?: string[];
  } = {},
) {
  const refusing = new Set(refuseOnce);
  const states = new Map<string, string>(
    run.held.map((call) => [call.id, "pending"]),
  );
  const posted: unknown[] = [];
  /** 51g: the notes the page posted. */
  const written: Record<string, unknown>[] = [];
  let reads = 0;
  let reviewReads = 0;
  const review = (live: boolean) => ({
    calls: run.held.map((call) => ({
      id: call.id,
      job: run.id,
      tool: call.tool,
      phrase: call.phrase,
      input: call.input,
      held: call.held,
      state: states.get(call.id),
    })),
    pending: [...states.values()].filter((state) => state === "pending").length,
    live,
  });
  await page.route(
    new RegExp(`/api/agent/${run.id}(/[a-z]+)?(\\?.*)?$`),
    async (route: Route) => {
      const url = new URL(route.request().url());
      const tail = url.pathname.split(`/api/agent/${run.id}`)[1] ?? "";
      if (tail === "/note" && route.request().method() === "POST") {
        /* 51g: the note the page writes, kept as the server would. */
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const note = {
          id: `01JD51G0NOTE00000000000${String(written.length + 1).padStart(3, "0")}`,
          by: body.by,
          at: iso(9_000 + written.length),
          verdict: body.verdict,
          text: body.text,
        };
        written.push(body);
        await route.fulfill({
          status: 201,
          json: { job: run.id, note, notes: [note] },
        });
        return;
      }
      if (tail === "/changes") {
        await route.fulfill({
          status: 404,
          json: { error: { message: "none" } },
        });
        return;
      }
      if (tail === "/review") {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON() as {
            decisions: { call: string; apply: boolean }[];
          };
          posted.push(body);
          /* As `applyReview` does: every decision checked before any runs;
           * a call not held, or already decided, is 400 and nothing runs. */
          const refused = body.decisions.find(
            (decision) =>
              refusing.has(decision.call) ||
              states.get(decision.call) !== "pending",
          );
          if (refused) {
            refusing.delete(refused.call);
            await route.fulfill({
              status: 400,
              json: {
                error: {
                  code: "validation",
                  message: states.has(refused.call)
                    ? `${refused.call} was already reviewed.`
                    : `${refused.call} is not a held change of this run.`,
                },
              },
            });
            return;
          }
          for (const decision of body.decisions) {
            states.set(decision.call, decision.apply ? "applied" : "discarded");
          }
        } else {
          reviewReads += 1;
        }
        await route.fulfill({ json: review(false) });
        return;
      }
      reads += 1;
      const now = progress?.(reads) ?? {
        lines: run.lines.length,
        open: false,
        ended: true,
      };
      const from = Number(url.searchParams.get("from") ?? 0);
      const transcriptFrom = Number(
        url.searchParams.get("transcriptFrom") ?? 0,
      );
      /* Offsets as counts: what was answered already is not answered again. */
      const lines = jobLines(run, now.lines, now.open && !now.ended);
      const records = transcript(run, now.ended);
      await route.fulfill({
        json: {
          job: run.id,
          meta: meta(run, now.ended),
          lines: lines.slice(from),
          next: lines.length,
          live: !now.ended,
          transcript: records.slice(transcriptFrom),
          transcriptNext: records.length,
          ...(run.reviewNotes?.length ? { reviewNotes: run.reviewNotes } : {}),
        },
      });
    },
  );
  return { posted, written, states, reviewReads: () => reviewReads };
}

/* Three held imports' worth of online run (two picks held, one close). */
const ONLINE: RunStub = {
  id: "01JD51D0NL1NE0000000000001",
  prompt: "3 pulled pork recipes I don't already have",
  intent: {
    id: "online",
    by: "rules",
    why: "you asked for recipes you don't have",
  },
  held: [
    {
      id: "call_plan_6",
      tool: "recipe_import",
      phrase: "Import a recipe from recipetineats.com",
      input: { url: "https://www.recipetineats.com/pulled-pork/" },
      held: {
        url: "https://www.recipetineats.com/pulled-pork/",
        slug: "easy-slow-cooker-bbq-pulled-pork",
        name: "Easy slow cooker BBQ pulled pork",
      },
    },
    {
      id: "call_plan_7",
      tool: "recipe_import",
      phrase: "Import a recipe from seriouseats.com",
      input: {
        url: "https://www.seriouseats.com/easy-oven-pulled-pork-recipe",
      },
      held: {
        url: "https://www.seriouseats.com/easy-oven-pulled-pork-recipe",
        slug: "easy-oven-pulled-pork",
        name: "Easy Oven Pulled Pork",
        notesOnApproval: true,
      },
    },
  ],
  outcome: {
    kind: "online",
    subject: "pulled pork",
    count: 3,
    proposed: [
      {
        url: "https://www.recipetineats.com/pulled-pork/",
        name: "Easy slow cooker BBQ pulled pork",
        slug: "easy-slow-cooker-bbq-pulled-pork",
        why: "Slow cooker, homemade BBQ sauce: not like any of yours.",
      },
      {
        url: "https://www.seriouseats.com/easy-oven-pulled-pork-recipe",
        name: "Easy Oven Pulled Pork",
        slug: "easy-oven-pulled-pork",
        why: "An overnight oven method with a mustard-vinegar sauce.",
      },
    ],
    close: [
      {
        url: "https://themodernproper.com/pulled-pork",
        name: "Pulled Pork",
        like: { slug: "existing-recipe", name: "Existing Recipe" },
      },
    ],
    had: [],
    yours: [{ slug: "existing-recipe", name: "Existing Recipe" }],
  },
  answer: [
    "2 of 3 new “pulled pork” recipes, held for your OK:",
    "",
    "1. [Easy slow cooker BBQ pulled pork](https://www.recipetineats.com/pulled-pork/) — recipetineats.com",
    "2. [Easy Oven Pulled Pork](https://www.seriouseats.com/easy-oven-pulled-pork-recipe) — seriouseats.com",
    "",
    "**Heads up:** I found 2 of the 3 you asked for that you don't already have.",
  ].join("\n"),
  lines: [
    { step: "agent.start" },
    { step: "llm.intent", data: { task: "read the ask", model: "qwen3.5:9b" } },
    { step: "recipe_search", data: { id: "call_plan_1", plan: true } },
    { step: "web_search", data: { id: "call_plan_2", plan: true } },
    { step: "web_search", data: { id: "call_plan_3", plan: true } },
    { step: "page_inspect", data: { id: "call_plan_4", plan: true } },
    { step: "page_inspect", data: { id: "call_plan_5", plan: true } },
    { step: "recipe_import", data: { id: "call_plan_6", plan: true } },
    { step: "recipe_import", data: { id: "call_plan_7", plan: true } },
  ],
};

test.describe("Curator by intent", () => {
  test.beforeEach(async ({ request, resetData }) => {
    await resetData("one-recipe");
    await useModel(request, modelUrl, "qwen3.5:9b");
    asked.length = 0;
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("guesses the intent as you type, takes a pick, and asks again with another as a new run", async ({
    page,
  }) => {
    await signInAndOpen(page);
    /* Who answers: the curator's own model first, the import model, then
     * Claude shown but not offered (no key). */
    const models = page.getByTestId("curator-models");
    const radios = models.getByRole("radio");
    await expect(radios).toHaveCount(3);
    await expect(
      models.getByRole("radio", { name: /qwen3\.5:9b on this machine/ }),
    ).toBeChecked();
    await expect(models).toContainText(
      "Free · the curator's own model · no web search",
    );
    await expect(models).toContainText(
      "Free · the import model: best for reads and single imports · no web search",
    );
    await expect(
      models.getByRole("radio", { name: /Claude Sonnet 5 through the API/ }),
    ).toBeDisabled();

    /* Nothing typed: nothing pressed, and the plan preview is the loop's. */
    const row = intents(page);
    await expect(
      row.getByRole("group", { name: "What kind of ask" }),
    ).toBeVisible();
    await expect(row.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByTestId("curator-intents-why")).toHaveText(
      "Pick what kind of ask it is, or just ask: it guesses from your words.",
    );

    /* The guess follows the words (`guess.ts`, the server's own rules). */
    await expectHydrated(askBox(page));
    await askBox(page).fill("3 pulled pork recipes I don't already have");
    await expect(intentButton(row, "Find new recipes online")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("curator-intents-why")).toHaveText(
      "Looks like Find new recipes online, guessed from your words: you asked for recipes you don't have. Pick another to change it.",
    );
    const preview = page.getByTestId("curator-plan");
    await expect(preview.getByRole("heading", { level: 2 })).toHaveText(
      "What it will do",
    );
    await expect(preview.getByTestId("curator-plan-step")).toHaveCount(7);
    await expect(preview).toContainText("Search the web");
    await askBox(page).fill("Plan Christmas dinner from its menu");
    await expect(intentButton(row, "Plan meals")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(preview).toContainText("Hold the plan for your OK");

    /* A pick wins over the guess, and the guess is a click away. */
    await intentButton(row, "Search my recipes").click();
    await expect(intentButton(row, "Search my recipes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(intentButton(row, "Plan meals")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("curator-intents-why")).toContainText(
      "You picked Search my recipes. The guess was Plan meals: it sounds like a plan.",
    );
    /* Use the guess is beside the line, not read as the group's description. */
    await expect(
      row.getByRole("group", { name: "What kind of ask" }),
    ).toHaveAccessibleDescription(
      "You picked Search my recipes. The guess was Plan meals: it sounds like a plan.",
    );
    await axeClean(page);
    await row
      .getByRole("button", { name: "Use the guess", exact: true })
      .click();
    await expect(intentButton(row, "Plan meals")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    /* Ask with "Anything" on the import model: the request says both. */
    await askBox(page).fill("Say hello");
    await intentButton(row, "Anything").click();
    await models
      .getByRole("radio", { name: /qwen3:8b on this machine/ })
      .check();
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/agent",
    );
    await page.getByRole("button", { name: "Start", exact: true }).click();
    expect((await sent).postDataJSON()).toMatchObject({
      prompt: "Say hello",
      intent: "any",
      model: "import",
      hold: true,
    });
    await expect(page).toHaveURL(/\/curator\?run=[0-9A-Z]{26}$/, {
      timeout: FIRST_VISIT,
    });
    const first = new URL(page.url()).searchParams.get("run");
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    expect(asked).toEqual(["qwen3:8b: Say hello"]);

    /* The run says what it took, pressed in the same row. */
    const ran = runIntents(page);
    /* Its own name: two intent groups on one page don't share one. */
    await expect(
      ran.getByRole("group", { name: "This run's kind of ask" }),
    ).toBeVisible();
    await expect(intentButton(ran, "Anything")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("curator-run-intents-why")).toContainText(
      "You picked Anything. Pick another to ask again with it: a new run, not a follow-up.",
    );
    /* The open loop has no plan of steps: today's run view. */
    await expect(page.getByTestId("curator-plan")).toHaveCount(0);
    await axeClean(page);

    /* Another intent: the same ask, a new run (not a follow-up), its model kept. */
    const again = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/agent",
    );
    const organize = intentButton(ran, "Organize and tag");
    await expectHydrated(organize);
    await organize.click();
    const body = (await again).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      prompt: "Say hello",
      intent: "organize",
      model: "import",
    });
    expect(body).not.toHaveProperty("runId");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("run"), {
        timeout: FIRST_VISIT,
      })
      .not.toBe(first);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expect(
      intentButton(runIntents(page), "Organize and tag"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("curator-ask")).toHaveCount(1);
  });

  test("online: the held imports as cards, Import and Skip through the review", async ({
    page,
  }) => {
    const { posted } = await stubRun(page, ONLINE);
    await signInAndOpen(page, `/curator?run=${ONLINE.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });

    /* The intent, as the rules guessed it. */
    await expect(page.getByTestId("curator-run-intents-why")).toContainText(
      "Find new recipes online, guessed from your words: you asked for recipes you don't have.",
    );
    /* The plan's steps, every one accounted for. */
    const steps = page.getByTestId("curator-plan-step");
    await expect(steps).toHaveCount(7);
    await expect(page.locator('[data-step="web"]')).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.locator('[data-step="web"]')).toContainText("2 searches");
    await expect(page.locator('[data-step="pick"]')).toHaveAttribute(
      "data-state",
      "skipped",
    );
    await expect(page.locator('[data-step="hold"]')).toContainText("2 held");

    /* The cards: two new, marked as the model's, with the heads-up. */
    const results = page.getByTestId("curator-results");
    await expect(results).toHaveAttribute("data-kind", "online");
    await expect(results).toContainText(
      "2 of 3 new, held for your OK · 0 decided",
    );
    await expect(results.getByTestId("curator-suggested")).toHaveText(
      "suggested by qwen3.5:9b",
    );
    await expect(results.getByTestId("curator-heads-up")).toContainText(
      "I found 2 of the 3 you asked for",
    );
    const cards = results.getByTestId("curator-online-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(
      "Easy slow cooker BBQ pulled pork",
    );
    await expect(cards.nth(0)).toContainText("recipetineats.com/pulled-pork");
    await expect(cards.nth(0)).toContainText("Slow cooker, homemade BBQ sauce");
    await expect(cards.nth(1)).toContainText(
      "its notes are read when you approve it",
    );
    /* Close to yours: marked, not held, the import form if wanted. */
    const close = results.getByTestId("curator-close-card");
    await expect(close).toContainText("Close to yours");
    await expect(close).toContainText("Like your Existing Recipe.");
    await expect(close.getByRole("button")).toHaveCount(0);
    await expect(
      close.getByRole("link", { name: /^Import it anyway\W+Pulled Pork$/ }),
    ).toHaveAttribute(
      "href",
      `/new-recipe?import=${encodeURIComponent("https://themodernproper.com/pulled-pork")}`,
    );
    await expect(
      results.getByTestId("curator-you-have").getByRole("link", {
        name: "Existing Recipe",
      }),
    ).toHaveAttribute("href", "/recipe/existing-recipe");
    /* The cards apply the held imports: no second panel for them. */
    await expect(page.getByTestId("curator-review")).toHaveCount(0);
    /* The answer in words is a click away. */
    await expect(page.getByTestId("curator-answer-words")).toBeAttached();
    await axeClean(page);
    await snapshotMain(page, "curator-online-cards.png");

    /* Import the first: one decision, applied; focus on what it says. */
    const importFirst = cards
      .nth(0)
      .getByRole("button", { name: "Import Easy slow cooker BBQ pulled pork" });
    await expectHydrated(importFirst);
    await importFirst.click();
    const firstState = cards.nth(0).getByTestId("curator-card-state");
    await expect(firstState).toHaveText("Imported. Open it");
    await expect(firstState).toBeFocused();
    await expect(
      firstState.getByRole("link", { name: "Open it" }),
    ).toHaveAttribute("href", "/recipe/easy-slow-cooker-bbq-pulled-pork");
    /* Skip the second. */
    await cards
      .nth(1)
      .getByRole("button", { name: "Skip Easy Oven Pulled Pork" })
      .click();
    await expect(cards.nth(1).getByTestId("curator-card-state")).toHaveText(
      "Skipped by you — nothing written.",
    );
    expect(posted).toEqual([
      { decisions: [{ call: "call_plan_6", apply: true }] },
      { decisions: [{ call: "call_plan_7", apply: false }] },
    ]);
    await expect(results).toContainText("2 decided");
    await expect(cards.getByRole("button")).toHaveCount(0);
    await axeClean(page);
  });

  test("a run with review notes: Reviewed by Claude Code, newest first, as plain text", async ({
    page,
  }) => {
    await stubRun(page, {
      ...ONLINE,
      reviewNotes: [
        {
          id: "01JD51E2NOTE0000000000000A",
          by: "claude-code",
          at: iso(3_600),
          verdict: "approved",
          text: "Approved both imports.\nThe oven one is the better pick.",
        },
        {
          id: "01JD51E2NOTE0000000000000B",
          by: "claude-code",
          at: iso(7_200),
          verdict: "miss",
          text: "Close-to-yours missed a <b>near duplicate</b>: see https://example.com/x",
          cases: ["pulled-pork-near-dupes"],
        },
      ],
    });
    await signInAndOpen(page, `/curator?run=${ONLINE.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });

    const notes = page.getByTestId("curator-notes");
    await expect(
      notes.getByRole("heading", { name: "Reviewed by Claude Code" }),
    ).toBeVisible();
    const items = notes.getByTestId("curator-note");
    await expect(items).toHaveCount(2);
    /* Newest first, each with its verdict chip and a machine-readable time. */
    await expect(items.nth(0).getByTestId("curator-note-verdict")).toHaveText(
      "A miss",
    );
    await expect(items.nth(1).getByTestId("curator-note-verdict")).toHaveText(
      "Approved",
    );
    await expect(items.nth(0).locator("time")).toHaveAttribute(
      "datetime",
      iso(7_200),
    );
    await expect(items.nth(0)).toContainText(
      "Became a case: pulled-pork-near-dupes",
    );
    /* Text only: the tag shows as characters, the URL is no link, and the
     * line break is kept. */
    const text = items.nth(0).getByTestId("curator-note-text");
    await expect(text).toHaveText(
      "Close-to-yours missed a <b>near duplicate</b>: see https://example.com/x",
    );
    await expect(text.locator("b, a")).toHaveCount(0);
    const first = items.nth(1).getByTestId("curator-note-text");
    expect(await first.innerText()).toBe(
      "Approved both imports.\nThe oven one is the better pick.",
    );
    /* Below the result cards, above the folded transcript. */
    const order = await page.evaluate(() => {
      const position = (id: string) =>
        document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect()
          .top ?? -1;
      return {
        results: position("curator-results"),
        notes: position("curator-notes"),
        asks: document.querySelector('[aria-label="Asks"]')
          ? (
              document.querySelector('[aria-label="Asks"]') as HTMLElement
            ).getBoundingClientRect().top
          : -1,
      };
    });
    expect(order.notes).toBeGreaterThan(order.results);
    expect(order.asks).toBeGreaterThan(order.notes);
    await axeClean(page);
  });

  test("a finished run: Add a note writes your own, shown at once, markup refused", async ({
    page,
  }) => {
    const stub = await stubRun(page, ONLINE);
    await signInAndOpen(page, `/curator?run=${ONLINE.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expectHydrated(
      page
        .getByTestId("curator-notes")
        .getByRole("button", { name: "Add a note" }),
    );

    const notes = page.getByTestId("curator-notes");
    await expect(notes.getByRole("heading", { name: "Notes" })).toBeVisible();
    await notes.getByRole("button", { name: "Add a note" }).click();
    const form = page.getByTestId("curator-note-form");
    await expect(form).toBeVisible();

    /* Markup is refused with the server's words, and nothing is sent. */
    await form.getByLabel("Your note", { exact: true }).fill("<b>bold</b>");
    await form.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByTestId("curator-note-error")).toHaveText(
      "A note is plain text: no HTML tags.",
    );
    expect(stub.written).toEqual([]);

    /* A verdict and plain text post as you, and the note shows at once. */
    await form.getByLabel("A miss", { exact: true }).check();
    await form
      .getByLabel("Your note", { exact: true })
      .fill("It missed the near duplicate.");
    await form.getByRole("button", { name: "Save note" }).click();
    const note = notes.getByTestId("curator-note");
    await expect(note).toHaveCount(1);
    await expect(note).toBeFocused();
    await expect(note.getByTestId("curator-note-verdict")).toHaveText("A miss");
    await expect(note.getByTestId("curator-note-text")).toHaveText(
      "It missed the near duplicate.",
    );
    await expect(
      notes.getByRole("heading", { name: "Your note" }),
    ).toBeVisible();
    expect(stub.written).toEqual([
      { verdict: "miss", text: "It missed the near duplicate.", by: "you" },
    ]);
    await expect(
      notes.getByRole("button", { name: "Add a note" }),
    ).toBeVisible();
    await axeClean(page);

    /* The form open, with its error showing, is clean too. */
    await notes.getByRole("button", { name: "Add a note" }).click();
    await page
      .getByTestId("curator-note-form")
      .getByRole("button", { name: "Save note" })
      .click();
    await expect(page.getByTestId("curator-note-error")).toBeVisible();
    await axeClean(page);
  });

  test("online: a refused decision says why on its card and applies nothing", async ({
    page,
  }) => {
    const { posted, states, reviewReads } = await stubRun(page, ONLINE, {
      refuseOnce: ["call_plan_6"],
    });
    await signInAndOpen(page, `/curator?run=${ONLINE.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    const card = page.getByTestId("curator-online-card").nth(0);
    const importFirst = card.getByRole("button", {
      name: "Import Easy slow cooker BBQ pulled pork",
    });
    await expectHydrated(importFirst);
    await expect.poll(reviewReads).toBeGreaterThan(0);
    const readsBefore = reviewReads();
    await importFirst.click();
    await expect(card.getByRole("alert")).toHaveText(
      "call_plan_6 was already reviewed.",
    );
    /* Nothing applied: the card still waits, and the review is read again. */
    await expect(card).toHaveAttribute("data-state", "pending");
    expect(states.get("call_plan_6")).toBe("pending");
    await expect.poll(reviewReads).toBeGreaterThan(readsBefore);
    await expect(importFirst).toBeEnabled();
    await axeClean(page);
    /* A second try goes through. */
    await importFirst.click();
    await expect(card.getByTestId("curator-card-state")).toHaveText(
      "Imported. Open it",
    );
    await expect(card.getByRole("alert")).toHaveCount(0);
    expect(posted).toEqual([
      { decisions: [{ call: "call_plan_6", apply: true }] },
      { decisions: [{ call: "call_plan_6", apply: true }] },
    ]);
  });

  test("mine: Fits, Maybe and Close-but-no, each with Open and Add to shopping list", async ({
    page,
    request,
    createApiToken,
  }) => {
    const headers = { authorization: `Bearer ${await createApiToken()}` };
    const created = await request.post("/api/recipes", {
      headers,
      data: {
        name: "Curator London Fog",
        ingredients: ["1 cup milk", "1 bag Earl Grey tea"],
        instructions: ["Steep the tea.", "Froth the milk and pour it over."],
      },
    });
    expect(created.status()).toBe(201);
    const run: RunStub = {
      id: "01JD51D0M1NE00000000000001",
      prompt: "Recipes that work well in small batches with a milk frother",
      intent: {
        id: "mine",
        by: "rules",
        why: "it asks which of your recipes fit",
      },
      held: [],
      outcome: {
        kind: "mine",
        criterion: "A drink of hot or frothed milk, one or two servings.",
        searches: ["milk frother", "latte"],
        fit: ["curator-london-fog"],
        maybe: ["existing-recipe"],
        no: ["slow-cooker-cocoa"],
        unjudged: [],
        checked: 3,
        reasons: {
          "curator-london-fog": {
            name: "Curator London Fog",
            why: "1 drink. Its steps froth the milk.",
          },
          "existing-recipe": {
            name: "Existing Recipe",
            why: "It doesn't say how much it makes.",
          },
          "slow-cooker-cocoa": {
            name: "Slow Cooker Cocoa",
            why: "About 10 cups, so not a small batch.",
          },
        },
      },
      answer:
        "**Fits** (1 of the 3 I checked):\n\n- [Curator London Fog](/recipe/curator-london-fog) — 1 drink.",
      lines: [
        { step: "llm.intent", data: { task: "widen the search" } },
        { step: "recipe_search", data: { plan: true } },
        { step: "recipe_search", data: { plan: true } },
        { step: "llm.judge", data: { recipes: 3 } },
      ],
    };
    await stubRun(page, run);
    await signInAndOpen(page, `/curator?run=${run.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    const results = page.getByTestId("curator-results");
    await expect(results).toHaveAttribute("data-kind", "mine");
    await expect(results).toContainText("1 that fit · read 3");
    const cards = results.getByTestId("curator-mine-card");
    await expect(cards).toHaveCount(3);
    const fit = results.getByRole("list", { name: "Fits" });
    await expect(fit).toContainText("Curator London Fog");
    await expect(fit).toContainText("Fits");
    await expect(fit).toContainText("Its steps froth the milk.");
    await expect(results.getByRole("list", { name: "Maybe" })).toContainText(
      "Existing Recipe",
    );
    await expect(
      results.getByRole("list", { name: "Close, but no" }),
    ).toContainText("About 10 cups, so not a small batch.");
    await expect(
      fit.getByRole("link", { name: "Open Curator London Fog" }),
    ).toHaveAttribute("href", "/recipe/curator-london-fog");
    /* Nothing is held in a read: no review. */
    await expect(page.getByTestId("curator-review")).toHaveCount(0);
    await expect(page.locator('[data-step="judge"]')).toHaveAttribute(
      "data-state",
      "done",
    );
    await axeClean(page);

    /* Add to shopping list: onto the (only, main) list, said with a link. */
    const add = fit.getByRole("button", {
      name: "Add to shopping list: Curator London Fog",
    });
    await expectHydrated(add);
    await add.click();
    const said = fit.getByTestId("shopping-add-result");
    await expect(said).toContainText("2 items added to the shopping list.");
    await expect(
      said.getByRole("link", { name: "Open the list" }),
    ).toHaveAttribute("href", "/shopping");
  });

  test("plan: the held plan as one card, with its scales and heads-up, Approve through the review", async ({
    page,
  }) => {
    const create = {
      id: "call_plan_3",
      tool: "group_create",
      phrase: "Make the meal plan “Thanksgiving 2027”",
      input: {
        group: {
          name: "Thanksgiving 2027",
          slug: "thanksgiving-2027",
          kind: "meal-plan",
          tags: ["thanksgiving"],
          date: "2027-11-25",
          items: [
            { recipe: "green-beans", label: "Side" },
            {
              recipe: "cranberry-curd-tart",
              label: "Dessert",
              scale: "1/4",
              note: "2 servings",
            },
          ],
        },
      },
      held: {},
    };
    const run: RunStub = {
      id: "01JD51D0PLAN0000000000001",
      prompt:
        "Plan Thanksgiving from its menu; we bring 2 servings of the cranberry curd tart plus a simple side",
      intent: { id: "plan", by: "rules", why: "it sounds like a plan" },
      held: [create],
      outcome: {
        kind: "plan",
        holiday: "thanksgiving",
        name: "Thanksgiving 2027",
        slug: "thanksgiving-2027",
        tags: ["thanksgiving"],
        date: "2027-11-25",
        items: [
          {
            slug: "green-beans",
            label: "Side",
            name: "Green Beans",
            how: "picked",
            why: "A simple side for the meal.",
            servings: 2,
            yieldText: "1 9x13-inch pan",
          },
          {
            slug: "cranberry-curd-tart",
            label: "Dessert",
            scale: "1/4",
            name: "Cranberry Curd Tart",
            how: "named",
            servings: 2,
            yields: 8,
          },
        ],
        unresolved: [],
        ambiguous: [],
        empty: [],
        proposed: true,
      },
      answer: [
        "A meal plan, held for your OK: **Thanksgiving 2027** (tagged thanksgiving).",
        "",
        "- Side: [Green Beans](/recipe/green-beans)",
        "- Dessert: [Cranberry Curd Tart](/recipe/cranberry-curd-tart) ×1/4 (2 servings; it makes 8)",
        "",
        "**Heads up:** I couldn't find “the stuffing” in your recipes.",
      ].join("\n"),
      lines: [
        { step: "llm.intent", data: { task: "read the ask" } },
        { step: "holiday_get", data: { plan: true } },
        { step: "llm.judge", data: { recipes: 4 } },
        { step: "group_create", data: { plan: true } },
      ],
    };
    const { posted } = await stubRun(page, run);
    await signInAndOpen(page, `/curator?run=${run.id}`);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    const card = page.getByTestId("curator-plan-card");
    await expect(card).toContainText("Thanksgiving 2027");
    await expect(card).toContainText(
      "Tagged thanksgiving · for Thursday, November 25, 2027",
    );
    const items = card.getByTestId("curator-plan-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Side");
    await expect(items.nth(0)).toContainText(
      "2 servings · its yield, “1 9x13-inch pan”, isn't in servings: not scaled",
    );
    await expect(items.nth(1).getByTestId("curator-plan-scale")).toHaveText(
      "×1/4",
    );
    await expect(items.nth(1)).toContainText(
      "named in your ask · 2 servings · it makes 8",
    );
    await expect(
      items.nth(1).getByRole("link", { name: "Cranberry Curd Tart" }),
    ).toHaveAttribute("href", "/recipe/cranberry-curd-tart");
    await expect(card.getByTestId("curator-heads-up")).toContainText(
      "I couldn't find “the stuffing” in your recipes.",
    );
    await expect(
      page.getByTestId("curator-plan-result").getByTestId("curator-suggested"),
    ).toBeVisible();
    await expect(page.getByTestId("curator-review")).toHaveCount(0);
    await expect(page.locator('[data-step="find"]')).toHaveAttribute(
      "data-state",
      "skipped",
    );
    await axeClean(page);

    const approve = card.getByRole("button", {
      name: "Approve Thanksgiving 2027",
    });
    await expectHydrated(approve);
    await approve.click();
    const state = card.getByTestId("curator-card-state");
    await expect(state).toHaveText("Saved. Open the plan");
    await expect(state).toBeFocused();
    await expect(
      state.getByRole("link", { name: "Open the plan" }),
    ).toHaveAttribute("href", "/group/thanksgiving-2027");
    expect(posted).toEqual([
      { decisions: [{ call: "call_plan_3", apply: true }] },
    ]);
    await expect(card.getByRole("button")).toHaveCount(0);
  });

  test("a live plan: its steps move as the job logs them, said in the one status line", async ({
    page,
  }) => {
    /* Reads 1–5 (a second apart): reading pages, the last open; then ended. */
    await stubRun(page, ONLINE, {
      progress: (read) =>
        read <= 5
          ? { lines: 6, open: true, ended: false }
          : { lines: ONLINE.lines.length, open: false, ended: true },
    });
    await signInAndOpen(page, `/curator?run=${ONLINE.id}`);
    await expect(status(page)).toHaveText("Working: read the best pages…", {
      timeout: RUN,
    });
    const pages = page.locator('[data-step="pages"]');
    await expect(pages).toHaveAttribute("aria-current", "step");
    await expect(pages).toHaveAttribute("data-state", "current");
    await expect(page.locator('[data-step="web"]')).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.locator('[data-step="hold"]')).toHaveAttribute(
      "data-state",
      "todo",
    );
    await expect(page.getByTestId("curator-results-waiting")).toBeVisible();
    /* 51g: no Add a note while the run is live (the server says 409). */
    await expect(page.getByRole("button", { name: "Add a note" })).toHaveCount(
      0,
    );
    /* The steps say where it is without a live region of their own. */
    const plan = page.getByTestId("curator-plan");
    await expect(
      plan.locator("[aria-live], [role=status], [role=alert]"),
    ).toHaveCount(0);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expect(page.locator('[data-step="hold"]')).toHaveAttribute(
      "data-state",
      "done",
    );
    await expect(page.getByTestId("curator-online-card")).toHaveCount(2);
    /* Ended: the control is there. */
    await expect(
      page.getByRole("button", { name: "Add a note" }),
    ).toBeVisible();
  });
});

/** The main column, its times masked (as `curator.spec`'s). */
async function snapshotMain(page: Page, name: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    document.documentElement.dataset.stickyChrome = "off";
  });
  await snapshotLocator(page.getByTestId("curator-main"), name, {
    mask: [
      page.getByTestId("curator-numbers"),
      page.getByTestId("curator-time"),
      page.getByTestId("curator-stages"),
    ],
  });
  await page.evaluate(() => {
    delete document.documentElement.dataset.stickyChrome;
  });
}
