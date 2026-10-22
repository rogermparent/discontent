import { createServer, type Server, type ServerResponse } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, type Page } from "../support/test";
import {
  openPalette,
  paletteIndexReady,
  paletteInput,
  signIn,
} from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { snapshotLocator } from "../support/visual";

/*
 * 44d: the curator page — ask, watch the run as a conversation, see what
 * changed, stop, follow up, reopen a run. The model is a stand-in Ollama on
 * loopback (never a real one) that scripts **tool calls** across turns by
 * the newest ask and how many tool results follow it:
 *
 * - "…braise…": recipe_search, then recipe_create (a fixture recipe), then
 *   its answer with a link to the new recipe;
 * - "…tag it…" (a follow-up): term_assign, then a line;
 * - "…slowly…": the first turn never answers (until the run stops it);
 * - anything else: one line, no tools.
 *
 * The suite pins the model off (T18); each test turns it on for this server
 * process through the TEST_MODE-only `/settings/test-llm`, off after.
 */
let model: Server;
let modelUrl: string;
/** Every ask the stand-in was sent a first turn for. */
const asked: string[] = [];
/** Calls held open by "slowly" (answered when the test ends). */
const held = new Set<ServerResponse>();

const RECIPE = {
  name: "Curator Pork Braise",
  description: "Pork shoulder braised low and slow.",
  ingredients: ["2 lb pork shoulder", "1 onion, sliced", "2 cups stock"],
  instructions: ["Brown the pork.", "Braise it covered for three hours."],
  tags: ["dinner"],
};
const SLUG = "curator-pork-braise";

interface OllamaMessage {
  role: string;
  content?: string;
}

function toolCall(name: string, args: unknown) {
  return {
    role: "assistant",
    content: "",
    tool_calls: [{ function: { name, arguments: args } }],
  };
}

/** The stand-in's next message for this conversation. */
function nextMessage(messages: OllamaMessage[]) {
  let last = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") last = index;
  });
  const ask = messages[last]?.content ?? "";
  const results = messages
    .slice(last + 1)
    .filter((message) => message.role === "tool").length;
  if (results === 0) asked.push(ask);
  if (/tag it/i.test(ask)) {
    return results === 0
      ? toolCall("term_assign", { slug: "braises", add: [SLUG] })
      : { role: "assistant", content: "Tagged it **braises**." };
  }
  if (/braise/i.test(ask)) {
    if (results === 0) {
      return toolCall("recipe_search", { query: "pork shoulder braise" });
    }
    if (results === 1) return toolCall("recipe_create", { recipe: RECIPE });
    return {
      role: "assistant",
      content: `You had none, so I made [${RECIPE.name}](/recipe/${SLUG}) from a classic method.`,
    };
  }
  return { role: "assistant", content: "Nothing to do here." };
}

test.beforeAll(async () => {
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.url !== "/api/chat") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        messages: OllamaMessage[];
      };
      const users = body.messages.filter((m) => m.role === "user");
      if (/slowly/i.test(users.at(-1)?.content ?? "")) {
        /* Held until the run is stopped (its fetch hangs up) or the test ends. */
        asked.push(users.at(-1)?.content ?? "");
        held.add(response);
        response.on("close", () => held.delete(response));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          model: "qwen3:8b",
          message: nextMessage(body.messages),
          done: true,
          done_reason: "stop",
          prompt_eval_count: 1500,
          eval_count: 40,
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

async function useModel(request: APIRequestContext, url?: string) {
  const response = await request.get(
    url
      ? `/settings/test-llm?url=${encodeURIComponent(url)}`
      : "/settings/test-llm",
  );
  expect(response.ok()).toBe(true);
}

/* A page's first visit in `next dev` compiles it first (well past 5 s). */
const FIRST_VISIT = 30_000;
/* A run: three model turns and two tools, in a job. */
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
const followBox = (page: Page) => page.getByLabel("Follow up", { exact: true });
const status = (page: Page) => page.getByTestId("curator-status");
const tools = (page: Page) => page.getByTestId("curator-tool");

function runIdOf(page: Page): string {
  return new URL(page.url()).searchParams.get("run") ?? "";
}

/** Ask, and wait for the run to open. */
async function start(page: Page, prompt: string) {
  await expectHydrated(askBox(page));
  await askBox(page).fill(prompt);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/curator\?run=[0-9A-Z]{26}$/, {
    timeout: FIRST_VISIT,
  });
}

/**
 * The page's main column (not the recent runs, whose rows depend on what
 * ran before), its times and durations masked. Sticky chrome is released
 * first ("off", the reader's own setting): a column taller than the
 * viewport is captured in one pass, and a pinned masthead, tab bar or run
 * footer would be drawn over it.
 */
async function snapshotMain(page: Page, name: string) {
  await page.evaluate(() => {
    document.documentElement.dataset.stickyChrome = "off";
  });
  await snapshotLocator(page.getByTestId("curator-main"), name, {
    mask: [
      page.getByTestId("curator-numbers"),
      page.getByTestId("tool-duration"),
    ],
  });
  await page.evaluate(() => {
    delete document.documentElement.dataset.stickyChrome;
  });
}

test.describe("Curator", () => {
  test.beforeEach(async ({ request, resetData }) => {
    await resetData("one-recipe");
    await useModel(request, modelUrl);
    asked.length = 0;
  });

  test.afterEach(async ({ request }) => {
    for (const response of held) response.destroy();
    held.clear();
    await useModel(request);
  });

  test("a run shows its tools and answer, what changed, and follows up on the same run", async ({
    page,
  }) => {
    await signInAndOpen(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Curator" }),
    ).toBeVisible();
    await expect(page.getByTestId("curator-setup")).toHaveText(
      "Running on qwen3:8b on this machine. Web search is off here: give it the URLs to read.",
    );
    await axeClean(page);
    await snapshotMain(page, "curator-idle.png");

    await start(page, "Find a pork shoulder braise I don't have yet");
    const first = runIdOf(page);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expect(tools(page)).toHaveCount(2);
    await expect(tools(page).nth(0)).toContainText(
      "Searched your recipes for “pork shoulder braise”",
    );
    await expect(tools(page).nth(0)).toHaveAttribute("data-status", "done");
    await expect(tools(page).nth(1)).toContainText(
      "Created “Curator Pork Braise”",
    );

    /* The answer's link stays in the app. */
    const answer = page
      .getByTestId("curator-turn")
      .last()
      .getByRole("link", { name: "Curator Pork Braise" });
    await expect(answer).toHaveAttribute("href", `/recipe/${SLUG}`);
    await expect(answer).not.toHaveAttribute("target", "_blank");

    /* A row opens to its input and result. */
    await tools(page).nth(1).locator("summary").click();
    await expect(
      tools(page).nth(1).getByLabel("Input", { exact: true }),
    ).toContainText('"name": "Curator Pork Braise"');
    await expect(
      tools(page).nth(1).getByLabel("Result", { exact: true }),
    ).toContainText(`"slug": "${SLUG}"`);
    await tools(page).nth(1).locator("summary").click();

    /* What changed: the new recipe's card, and its commit. */
    const changes = page.getByTestId("curator-changes");
    await expect(changes).toBeVisible();
    await expect(
      changes.getByRole("link", { name: /Curator Pork Braise/ }).first(),
    ).toHaveAttribute("href", `/recipe/${SLUG}`);
    await expect(changes.getByTestId("curator-commits")).toHaveText(
      "1 commit — see Git",
    );
    await expect(page.getByTestId("curator-numbers")).toContainText(
      "3 of 40 turns · 2 tool calls",
    );
    await axeClean(page);
    await snapshotMain(page, "curator-finished.png");

    /* A follow-up continues the same conversation. */
    await expectHydrated(followBox(page));
    await followBox(page).fill("and tag it braises");
    await followBox(page).press("Control+Enter");
    await expect
      .poll(() => runIdOf(page), { timeout: FIRST_VISIT })
      .not.toBe(first);
    const second = runIdOf(page);
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expect(page.getByTestId("curator-ask")).toHaveCount(2);
    await expect(page.getByTestId("curator-segment-end")).toHaveCount(1);
    await expect(tools(page).last()).toContainText("Tagged 1 recipe braises");
    await expect(
      changes.getByRole("link", { name: "Tag: braises" }),
    ).toHaveAttribute("href", "/tags/braises");
    await expect(changes.getByTestId("curator-commits")).toHaveText(
      "2 commits — see Git",
    );
    expect(asked).toEqual([
      "Find a pork shoulder braise I don't have yet",
      "and tag it braises",
    ]);

    /* Recent runs: the conversation once, by its first ask, as its newest run. */
    const recent = page.getByTestId("curator-recent");
    const row = recent.locator(`[data-run="${second}"]`);
    await expect(row).toContainText("Find a pork shoulder braise");
    await expect(row).toContainText("2 asks");
    await expect(row.getByRole("link")).toHaveAttribute("aria-current", "page");
    await expect(recent.locator(`[data-run="${first}"]`)).toHaveCount(0);

    /* `?run=` opens a run from a link, and Back comes back to it. */
    await page.goto(`/curator?run=${first}`);
    await expect(status(page)).toHaveText("Finished");
    await expect(page.getByTestId("curator-ask")).toHaveCount(1);
    const newAsk = page.getByRole("link", { name: "New ask" });
    await expectHydrated(newAsk);
    await newAsk.click();
    await expect(page).toHaveURL(/\/curator$/);
    await expect(askBox(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`run=${first}$`));
    await expect(page.getByTestId("curator-ask")).toHaveCount(1);
  });

  test("Stop ends a run held open by a slow model", async ({ page }) => {
    await signInAndOpen(page);
    await start(page, "Find something slowly");
    await expect(status(page)).toHaveText("Working: the first turn…", {
      timeout: RUN,
    });
    await expect.poll(() => asked.length, { timeout: RUN }).toBe(1);
    await axeClean(page);
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await expectHydrated(stop);
    await stop.click();
    await expect(status(page)).toHaveText("Stopped by you", { timeout: RUN });
    await expect(stop).toHaveCount(0);
    /* Ended: the follow-up box takes Stop's place. */
    await expect(followBox(page)).toBeVisible();
    const row = page
      .getByTestId("curator-recent")
      .locator(`[data-run="${runIdOf(page)}"]`);
    await expect(row).toContainText("stopped by you");
  });

  test("⌘K hands a fetch request to the curator, filled in and not started", async ({
    page,
  }) => {
    await signInAndOpen(page, "/");
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("import https://example.com/pie and tag it");
    const group = page.getByTestId("palette-curator-group");
    const row = group.getByRole("option");
    await expect(row).toContainText(
      "Ask the curator: “import https://example.com/pie and tag it”",
    );
    await axeClean(page);
    await row.click();
    await expect(page).toHaveURL(/\/curator\?prompt=/, {
      timeout: FIRST_VISIT,
    });
    await expect(askBox(page)).toHaveValue(
      "import https://example.com/pie and tag it",
    );
    await expect(page.getByTestId("curator-run")).toHaveCount(0);
    expect(asked).toEqual([]);

    /* "Curator" is a Go to destination too. */
    await openPalette(page);
    await paletteInput(page).fill("curator");
    await expect(
      page.getByRole("option", { name: "Curator", exact: true }),
    ).toBeVisible();
  });

  test("fits a phone: no sideways scroll, the box above the tab bar, targets at least 24 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpen(page);
    await expectHydrated(askBox(page));
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const button of await page
      .getByTestId("curator-ask-form")
      .getByRole("button")
      .all()) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
    }
    await axeClean(page);

    await start(page, "Find a pork shoulder braise I don't have yet");
    await expect(status(page)).toHaveText("Finished", { timeout: RUN });
    await expect(page.getByTestId("curator-changes")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    /* The follow-up box rides above the tab bar. */
    const footer = await page.getByTestId("curator-footer").boundingBox();
    const tabBar = await page.getByTestId("phone-tab-bar").boundingBox();
    expect(footer && tabBar).toBeTruthy();
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeLessThanOrEqual(
      (tabBar?.y ?? 0) + 1,
    );
    expect((footer?.y ?? 0) + (footer?.height ?? 0)).toBeGreaterThan(844 - 200);
    const send = page.getByRole("button", { name: "Send", exact: true });
    expect((await send.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
    await axeClean(page);
    await snapshotMain(page, "curator-phone.png");
  });

  test("is not there for a guest, nor with no model", async ({
    page,
    request,
  }) => {
    /* A guest is sent to sign in, and no link points at it. */
    await page.goto("/curator", { timeout: FIRST_VISIT });
    await expect(
      page.getByRole("button", {
        name: "Sign in with Credentials",
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });
    await page.goto("/");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Curator" }),
    ).toHaveCount(0);
    expect((await request.get("/api/agent")).status()).toBe(401);

    /* Signed in: the footer links it beside New Recipe. */
    await signIn(page);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Curator" }),
    ).toHaveAttribute("href", "/curator");

    /* No model: no page, no link. */
    await useModel(request);
    const response = await page.goto("/curator");
    expect(response?.status()).toBe(404);
    await page.goto("/");
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Curator" }),
    ).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
