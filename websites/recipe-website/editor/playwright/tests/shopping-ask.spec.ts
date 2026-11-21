import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 49b: the shopping list's "same thing, different names", asked of a model.
 * A stand-in model on loopback (`fixtures/llm/standInModel.ts`, never a real
 * one) answers by rule: a note with "grams" says 360 g, "call it X" names
 * it, "apart" keeps them apart, "invent" names a line that was not asked
 * about (which the check refuses); "Look for more" groups "salt" with "sea
 * salt". Every answer arrives marked; only Accept or Merge writes. The
 * suite pins the model off (T18); this spec turns it on through the
 * TEST_MODE-only `/settings/test-llm`, off again after each.
 *
 * The list: the `shopping` fixture's Buttermilk Pancakes ("2 cups
 * all-purpose flour", "1 teaspoon salt") and a Crêpes made here ("1 cup
 * white flour", "1 pinch sea salt") — the table proposes the flours, and
 * the salts are the model's to find.
 */
let model: Server;
let modelUrl: string;

test.beforeAll(async () => {
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/api/chat") {
        response.end(
          JSON.stringify(
            standInChat(JSON.parse(Buffer.concat(chunks).toString())),
          ),
        );
      } else {
        response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
      }
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

const page$ = (page: Page) => page.getByTestId("shopping-page");
const panel = (page: Page) => page.getByTestId("shopping-proposals");
const tableProposal = (page: Page) =>
  page.locator('[data-testid="shopping-proposal"][data-source="table"]');
const modelProposal = (page: Page) =>
  page.locator('[data-testid="shopping-proposal"][data-source="model"]');
const rows = (page: Page) => page.getByTestId("shopping-row");
const flourRows = (page: Page) => rows(page).filter({ hasText: /flour/ });
const saltRows = (page: Page) => rows(page).filter({ hasText: /salt/ });

async function makeCrepes(request: APIRequestContext, token: string) {
  const created = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Crêpes",
      slug: "crepes",
      ingredients: ["1 cup white flour", "2 eggs", "1 pinch sea salt"],
    },
  });
  expect(created.status()).toBe(201);
}

/** Signed in, both recipes on the list, on `/shopping` and hydrated. */
async function openList(page: Page) {
  await page.goto("/shopping");
  await fillSignInForm(page);
  await expect(
    page.getByRole("heading", { name: "Shopping list" }),
  ).toBeAttached();
  for (const recipe of ["buttermilk-pancakes", "crepes"]) {
    const added = await page.request.post("/api/shopping", {
      data: { recipe },
    });
    expect(added.ok()).toBe(true);
  }
  await page.reload();
  await expect(page$(page)).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

/** The flour proposal's Edit, a note, and Ask: the marked answer. */
async function askAboutFlour(page: Page, note: string) {
  const card = tableProposal(page);
  const edit = card.getByRole("button", { name: /^Edit/ });
  await expectHydrated(edit);
  await edit.click();
  await card.getByLabel("Note for the model", { exact: true }).fill(note);
  await card
    .getByRole("button", { name: "Ask the model about all-purpose flour" })
    .click();
  const result = card.getByTestId("shopping-ask-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  return result;
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[data-testid="shopping-proposals"]')
    .withTags(WCAG_TAGS)
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Shopping list: ask the model (49b)", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await makeCrepes(request, await createApiToken());
      await useModel(request, modelUrl);
    },
  );

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("a note gets a marked suggestion; Accept writes the decision with the note", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    const result = await askAboutFlour(page, "use grams");
    await expect(result).toContainText("Suggested by local model qwen3:8b");
    await expect(result).toContainText("Before3 cups all-purpose flour");
    await expect(result).toContainText("After≈ 360 g all-purpose flour");
    await expect(result).toContainText(
      "Your note, saved with it if you accept: “use grams”",
    );
    /* Nothing is written until Accept. */
    const before = await getContentGitLog();
    expect(before[0]).not.toMatch(/^Update shopping list: merge/);
    await axeClean(page);

    await result.getByRole("button", { name: /^Accept/ }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: merge all purpose flour + white flour");
    await expect(
      panel(page).getByTestId("shopping-proposals-status"),
    ).toHaveText(
      "Accepted local model qwen3:8b's suggestion: ≈ 360 g all-purpose flour.",
    );
    await expect(panel(page).getByRole("heading").first()).toBeFocused();
    await expect(flourRows(page)).toHaveCount(1);
    await expect(
      page.getByLabel("≈ 360 g all-purpose flour", { exact: true }),
    ).toBeVisible();

    const stored = await page.request.get("/api/shopping");
    const { merges } = (await stored.json()) as {
      merges: { note?: string; amount?: { text: string } }[];
    };
    expect(merges).toHaveLength(1);
    expect(merges[0]).toMatchObject({
      note: "use grams",
      amount: { text: "≈ 360 g" },
    });
  });

  test("Discard changes nothing, and a refused answer says why", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    const log = await getContentGitLog();
    const result = await askAboutFlour(page, "call it plain flour");
    await expect(result).toContainText("After3 cups plain flour");
    await result.getByRole("button", { name: "Discard" }).click();
    await expect(
      panel(page).getByTestId("shopping-proposals-status"),
    ).toHaveText(
      "Discarded local model qwen3:8b's suggestion; nothing changed.",
    );
    await expect(tableProposal(page)).toHaveCount(1);
    await expect(flourRows(page)).toHaveCount(2);

    const card = tableProposal(page);
    await card
      .getByLabel("Note for the model", { exact: true })
      .fill("invent a line");
    await card
      .getByRole("button", { name: "Ask the model about all-purpose flour" })
      .click();
    const refused = card.getByTestId("shopping-ask-result");
    await expect(refused).toContainText(
      "Local model qwen3:8b's answer was not used: it names item 99, which is not one of the 2 lines asked about.",
      { timeout: 30_000 },
    );
    await expect(refused.getByRole("button", { name: /^Accept/ })).toHaveCount(
      0,
    );
    expect(await getContentGitLog()).toEqual(log);
    await axeClean(page);
  });

  test("Look for more finds a pair the table leaves alone, marked; Merge makes one row", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    await expect(saltRows(page)).toHaveCount(2);
    const look = panel(page).getByRole("button", {
      name: "Look for more with the model",
    });
    await expectHydrated(look);
    await look.click();
    const found = modelProposal(page);
    await expect(found).toHaveCount(1, { timeout: 30_000 });
    await expect(found).toContainText("Suggested by local model qwen3:8b");
    await expect(found).toContainText("1 teaspoon salt · Buttermilk Pancakes");
    await expect(found).toContainText("1 pinch sea salt · Crêpes");
    await expect(found).toContainText("Both are salt.");
    /* The table's flour is still its own proposal, not the model's. */
    await expect(tableProposal(page)).toHaveCount(1);
    await axeClean(page);

    await found.getByRole("button", { name: /^Merge into/ }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: merge salt + sea salt");
    await expect(modelProposal(page)).toHaveCount(0);
    await expect(saltRows(page)).toHaveCount(1);
    await expect(
      saltRows(page).getByTestId("shopping-merged-from"),
    ).toContainText("1 teaspoon salt (Buttermilk Pancakes)");
  });

  test("a merged row's menu asks about it; keep apart, accepted, splits it", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    const merge = tableProposal(page).getByRole("button", {
      name: "Merge into 3 cups all-purpose flour",
    });
    await expectHydrated(merge);
    await merge.click();
    await expect(flourRows(page)).toHaveCount(1);

    await page
      .getByRole("button", { name: "Options for 3 cups all-purpose flour" })
      .click();
    await page
      .getByRole("button", { name: "Ask the model about this" })
      .click();
    const about = page.getByTestId("shopping-ask-about");
    const note = about.getByLabel("Note for the model", { exact: true });
    await expect(note).toBeFocused();
    await note.fill("these are different, keep them apart");
    await about.getByRole("button", { name: /^Ask the model/ }).click();
    const result = about.getByTestId("shopping-ask-result");
    await expect(result).toContainText(
      "Split this row and keep its names apart",
      { timeout: 30_000 },
    );
    await axeClean(page);
    await result.getByRole("button", { name: /^Accept/ }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: keep apart all purpose flour + white flour");
    await expect(flourRows(page)).toHaveCount(2);
    await expect(tableProposal(page)).toHaveCount(0);
  });
});

test.describe("Shopping list: ask the model (49b) @mobile", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await makeCrepes(request, await createApiToken());
      await useModel(request, modelUrl);
    },
  );

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("on a phone, Plan looks for more and merges; nothing scrolls sideways", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    await expect(page$(page)).toHaveAttribute("data-mode", "shop");
    const plan = page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Plan" });
    await expectHydrated(plan);
    await plan.click();
    await expect(page$(page)).toHaveAttribute("data-mode", "plan");
    await panel(page)
      .getByRole("button", { name: "Look for more with the model" })
      .click();
    const found = modelProposal(page);
    await expect(found).toHaveCount(1, { timeout: 30_000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await found.getByRole("button", { name: /^Merge into/ }).click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: merge salt + sea salt");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});
