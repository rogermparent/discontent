import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, type Page } from "../support/test";
import {
  openPalette,
  palette,
  paletteIndexReady,
  paletteInput,
  signIn,
} from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";

/*
 * 43q: Ask — a question in ⌘K, or in `/search`'s Ask box, becomes a filled-in
 * page. The model is a stand-in on loopback (never a real one): it reads the
 * QUESTION line of the prompt and answers by rule, as the import specs' does
 * (`multi-recipe.spec.ts`). The suite pins the model off (T18); each test
 * turns it on for this server process through the TEST_MODE-only
 * `/settings/test-llm`, and off after — one worker, so no other spec sees it.
 *
 * The fixture is `drinks-bar`: drinks with lime (the daiquiris, the vodka
 * sour), Christmas and Halloween under `holidays`, vodka in two drinks.
 */
let model: Server;
let modelUrl: string;
const asked: string[] = [];

/** The stand-in's answers, by a word in the question. */
function answerFor(question: string): unknown {
  if (/tiki/i.test(question)) return { page: "search", q: "tag:tiki" };
  if (/christmas/i.test(question)) {
    return { page: "holiday", slug: "christmas", kind: "drinks" };
  }
  if (/vodka/i.test(question)) {
    return { page: "make", kind: "drinks", patterns: ["vodka*"] };
  }
  if (/lime/i.test(question)) {
    return { page: "make", kind: "drinks", features: ["lime"] };
  }
  return { page: "search", q: "tag:sour" };
}

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
        messages: { content: string }[];
      };
      const question =
        /QUESTION: (.*)$/m.exec(body.messages[1]?.content ?? "")?.[1] ?? "";
      asked.push(question);
      response.end(
        JSON.stringify({
          model: "qwen3:8b",
          message: {
            role: "assistant",
            content: JSON.stringify(answerFor(question)),
          },
          done: true,
          prompt_eval_count: 1200,
          eval_count: 20,
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

async function signInAndHome(page: Page) {
  await page.goto("/");
  await signIn(page);
  await page.goto("/");
}

const askGroup = (page: Page) => page.getByTestId("palette-ask-group");
const askRow = (page: Page) => askGroup(page).getByRole("option");
/* A page's first visit in `next dev` compiles it first (well past 5 s). */
const FIRST_VISIT = 30_000;

/* The question sits in a `<q>`, whose quote marks are CSS, not text. */
const banner = (page: Page) => page.getByTestId("ask-banner");

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Ask", () => {
  test.beforeEach(async ({ request, resetData }) => {
    await resetData("drinks-bar");
    await useModel(request, modelUrl);
    asked.length = 0;
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("a question in ⌘K opens What can I make, filled in, and Undo goes back", async ({
    page,
  }) => {
    await signInAndHome(page);
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("what drinks can I make with lime");

    /* The question leads, highlighted, so Enter asks it. */
    await expect(askRow(page)).toHaveText(
      /Ask: “what drinks can I make with lime”/,
    );
    await expect(askRow(page)).toHaveAttribute("aria-selected", "true");
    await axeClean(page);
    await paletteInput(page).press("Enter");

    await expect(page).toHaveURL(
      /\/make\?q=tag%3Adrink\+ingredient%3Alime&ask=what\+drinks\+can\+I\+make\+with\+lime$/,
      { timeout: FIRST_VISIT },
    );
    await expect(page.getByTestId("make-question")).toHaveText(
      "What drinks can I make with lime?",
    );
    await expect(banner(page)).toContainText(
      "Filled in from: what drinks can I make with lime",
    );
    await expect(palette(page)).toBeHidden();
    expect(asked).toEqual(["what drinks can I make with lime"]);
    await axeClean(page);

    await banner(page).getByRole("button", { name: "Undo" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(banner(page)).toBeHidden();
  });

  test("Tab asks what doesn't read as a question; dismiss keeps the page", async ({
    page,
  }) => {
    await signInAndHome(page);
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("christmas cocktails");
    await expect(askGroup(page)).toHaveCount(0);
    await expect(page.getByTestId("palette-ask-hint")).toContainText(
      "Press Tab to ask this as a question",
    );

    await paletteInput(page).press("Tab");
    await expect(askRow(page)).toHaveAttribute("aria-selected", "true");
    await expect(paletteInput(page)).toBeFocused();
    await paletteInput(page).press("Enter");

    await expect(page).toHaveURL(
      /\/holidays\/christmas\?kind=drinks&ask=christmas\+cocktails$/,
    );
    await expect(page.getByTestId("holiday-kind")).toHaveText("drinks");
    await expect(banner(page)).toContainText("christmas cocktails");

    await banner(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(banner(page)).toBeHidden();
    await expect(page).toHaveURL(/\/holidays\/christmas\?kind=drinks$/);
  });

  /* Dq12: a request that may as well be a search keeps Enter on the search. */
  test("Enter on a search-shaped request opens the recipe, not Ask", async ({
    page,
    resetData,
  }) => {
    await resetData("make-beans");
    await signInAndHome(page);
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("any bean salad");

    const recipes = page
      .getByTestId("palette-recipes-group")
      .getByRole("option");
    await expect(recipes.first()).toHaveAttribute("aria-selected", "true");
    /* Ask is offered after the results, without the highlight. */
    await expect(askRow(page)).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("palette-ask-hint")).toBeVisible();
    await axeClean(page);
    await paletteInput(page).press("Enter");

    await expect(page).toHaveURL(/\/recipe\/[^/?]+$|\/search\?/, {
      timeout: FIRST_VISIT,
    });
    await expect(page).not.toHaveURL(/[?&]ask=/);
    await expect(banner(page)).toHaveCount(0);
    expect(asked).toEqual([]);
  });

  test("an invented tag falls back to searching the words", async ({
    page,
  }) => {
    await signInAndHome(page);
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("what tiki drinks are there");
    await expect(askRow(page)).toHaveAttribute("aria-selected", "true");
    await paletteInput(page).press("Enter");

    await expect(page).toHaveURL(
      /\/search\?q=what\+tiki\+drinks\+are\+there&ask=what\+tiki\+drinks\+are\+there$/,
    );
    await expect(page.getByLabel("Search recipes")).toHaveValue(
      "what tiki drinks are there",
    );
    await expect(banner(page)).toContainText(
      "Couldn't work that out — searching for the words instead: what tiki drinks are there",
    );
  });

  test("/search's Ask fills in a temporary scope on Make, never on the list", async ({
    page,
  }) => {
    await signInAndHome(page);
    await page.goto("/search");
    const toggle = page.getByTestId("search-ask-toggle");
    await expectHydrated(toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const field = page.getByLabel("Your question");
    await expect(field).toBeFocused();
    /* Nothing to announce yet: the explainer describes, it isn't news. */
    await expect(page.getByTestId("search-ask-status")).toHaveText("");
    await axeClean(page);
    /* Escape is the search field again; the toggle brings Ask back. */
    await field.press("Escape");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Search recipes")).toBeFocused();
    await toggle.click();
    await expect(field).toBeFocused();
    await field.fill("anything with any kind of vodka");
    await field.press("Enter");

    await expect(page).toHaveURL(
      /\/make\?q=tag%3Adrink&with=vodka\*&ask=anything\+with\+any\+kind\+of\+vodka$/,
    );
    const scope = page.getByTestId("make-ask-scope");
    await expect(scope).toContainText("Only recipes using");
    await expect(scope.getByRole("listitem")).toHaveText(["✱vodka*"]);
    /* The vodka drinks only — fewer than every drink. */
    const ticker = page.getByRole("main").getByTestId("make-ticker");
    await expect(ticker).toHaveText(/^(1 drink|2 drinks) · /);
    const scoped = await ticker.textContent();
    /* Nothing on this browser's list: the scope is the page's. */
    expect(
      (await page.evaluate(() => localStorage.getItem("make-inventory-v1"))) ??
        "",
    ).not.toContain("vodka*");

    await scope.getByRole("button", { name: "Stop using vodka*" }).click();
    await expect(scope).toHaveCount(0);
    await expect(page).toHaveURL(
      /\/make\?q=tag%3Adrink&ask=anything\+with\+any\+kind\+of\+vodka$/,
    );
    await expect(ticker).toHaveText(/^\d+ drinks · /);
    expect(await ticker.textContent()).not.toBe(scoped);
  });

  /* Dq13: Dismiss, then a save that re-renders `/make`, never remounts it. */
  test("Dismiss on Make, then a staples save, keeps the page as it is", async ({
    page,
  }) => {
    await signInAndHome(page);
    await page.goto("/search");
    const toggle = page.getByTestId("search-ask-toggle");
    await expectHydrated(toggle);
    await toggle.click();
    const field = page.getByLabel("Your question");
    await field.fill("anything with any kind of vodka");
    await field.press("Enter");
    await expect(page).toHaveURL(/\/make\?.*with=vodka\*/);
    const scope = page.getByTestId("make-ask-scope");
    await expect(scope).toBeVisible();

    await banner(page).getByRole("button", { name: "Dismiss" }).click();
    await expect(banner(page)).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]ask=/);

    /* An open <details> closes on a remount: this one must stay open. */
    const staples = page.getByTestId("staples");
    await staples.locator("summary").click();
    await expect(staples).toHaveAttribute("open", "");
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/make",
    );
    await staples
      .getByLabel("Add to what I always have", { exact: true })
      .fill("soy sauce");
    await staples.getByRole("button", { name: "Add", exact: true }).click();
    await saved;
    await expect(staples.getByTestId("staples-chips")).toContainText(
      "soy sauce",
    );
    await expect(staples).toHaveAttribute("open", "");
    await expect(scope.getByRole("listitem")).toHaveText(["✱vodka*"]);
  });

  test("a question on /search that answers with a search stays on /search", async ({
    page,
  }) => {
    await signInAndHome(page);
    await page.goto("/search");
    const toggle = page.getByTestId("search-ask-toggle");
    await expectHydrated(toggle);
    await toggle.click();
    await page.getByLabel("Your question").fill("something sour please");
    await page.getByLabel("Your question").press("Enter");

    await expect(page).toHaveURL(
      /\/search\?q=tag%3Asour&ask=something\+sour\+please$/,
    );
    /* The toggle goes back off, the field holding the filled-in query. */
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Search recipes")).toHaveValue("tag:sour");
    await expect(banner(page)).toContainText("something sour please");
  });

  /* Dq14: a link with `?ask=` but no record in this tab — Undo can't know
   * where it came from, so it opens the empty search, never history back. */
  test("Undo with no record of the Ask opens the empty search", async ({
    page,
  }) => {
    await signInAndHome(page);
    await page.goto("/make?q=tag%3Adrink&ask=what+drinks+can+I+make");
    await expect(banner(page)).toContainText(
      "Filled in from: what drinks can I make",
    );
    const undo = banner(page).getByRole("button", { name: "Undo" });
    await expectHydrated(undo);
    await undo.click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByLabel("Search recipes")).toHaveValue("");
  });

  test("fits a phone: no sideways scroll, targets at least 24 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndHome(page);
    await page.goto("/search");
    const toggle = page.getByTestId("search-ask-toggle");
    await expectHydrated(toggle);
    await toggle.click();
    await page.getByLabel("Your question").fill("what drinks with lime");
    await page.getByLabel("Your question").press("Enter");
    await expect(page).toHaveURL(/\/make\?/);
    await expect(banner(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const name of ["Undo", "Dismiss"]) {
      const box = await banner(page)
        .getByRole("button", { name })
        .boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    }
    await axeClean(page);
  });

  test("is not offered to a guest, nor with no model", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await openPalette(page);
    await paletteIndexReady(page);
    await paletteInput(page).fill("what drinks can I make with lime");
    await expect(page.getByTestId("palette-list")).toBeVisible();
    await expect(askGroup(page)).toHaveCount(0);
    await expect(page.getByTestId("palette-ask-hint")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/search");
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    await expect(page.getByTestId("search-ask-toggle")).toHaveCount(0);
    /* The API refuses a guest. */
    const guest = await request.post("/api/ask", {
      data: { question: "what drinks can I make with lime" },
    });
    expect(guest.status()).toBe(401);

    await useModel(request);
    await signIn(page);
    await page.goto("/search");
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    await expect(page.getByTestId("search-ask-toggle")).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
