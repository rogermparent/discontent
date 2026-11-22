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
 * 50b: "Tidy with the model" — a whole-list pass whose suggestions are kept
 * as a run, each accepted (one change on this list) or skipped. A stand-in
 * model on loopback (`fixtures/llm/standInModel.ts`, never a real one)
 * answers by rule: the salt rows to "check at home first", the first
 * buttermilk row as a quart, and one suggestion naming a row the list does
 * not have (the structural check leaves it out). A suggestion the prompt
 * says was done or skipped is not made again. The suite pins the model off
 * (T18); this spec turns it on through the TEST_MODE-only
 * `/settings/test-llm`, off again after each.
 *
 * The list: the `shopping` fixture's Buttermilk Pancakes and a Crêpes made
 * here, as `shopping-ask.spec.ts` has it.
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

async function makeCrepes(request: APIRequestContext, token: string) {
  const created = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Crêpes",
      slug: "crepes",
      ingredients: [
        "1 cup white flour",
        "2 eggs",
        "1/2 cup low-fat buttermilk",
        "1 pinch sea salt",
      ],
    },
  });
  expect(created.status()).toBe(201);
}

const panel = (page: Page) => page.getByTestId("shopping-tidy");
/* 50c: the cards are the walkthrough's, one at a time. */
const walk = (page: Page) => page.getByTestId("shopping-walkthrough");
const title = (page: Page) => walk(page).getByTestId("shopping-card-title");
const status = (page: Page) =>
  walk(page).getByTestId("shopping-walkthrough-status");

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
  await expect(page.getByTestId("shopping-page")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
}

async function tidy(page: Page, made = /made \d+ suggestions?/) {
  const button = panel(page).getByRole("button", {
    name: "Tidy with the model",
  });
  await expectHydrated(button);
  await button.click();
  await expect(status(page)).toContainText(made, { timeout: 30_000 });
}

/** 50c: the flours' built-in card comes first; skip it (this page only). */
async function skipFlour(page: Page) {
  await walk(page)
    .getByRole("button", { name: "Skip: all-purpose flour" })
    .click();
  await expect(title(page)).toHaveText("Check the cupboard first");
}

test.describe("Shopping list: tidy with the model (50b)", () => {
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

  test("a run is kept; Accept writes one change, Skip is told to the next run on the current list", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    await expect(
      panel(page).getByRole("radio", { name: /qwen3:8b/ }),
    ).toBeChecked();
    await expect(
      panel(page).getByRole("radio", { name: /the current list/ }),
    ).toBeChecked();
    await tidy(page, /made 3 suggestions/);
    /* The invented row is left out by the check, said in a sentence. */
    await expect(walk(page)).toContainText("Left out by the check (1)");
    expect((await getContentGitLog())[0]).toBe(
      "Update shopping list: tidy with qwen3:8b (current): 3 suggestions",
    );
    await skipFlour(page);
    const results = await new AxeBuilder({ page })
      .include('[data-testid="shopping-walkthrough"]')
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);

    await walk(page)
      .getByRole("button", { name: "Accept: Check the cupboard first" })
      .click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe(
        "Update shopping list: accept: Check the cupboard first (qwen3:8b)",
      );
    /* One change on this list, by the model, and the salts at the top. */
    const change = page.getByTestId("shopping-change");
    await expect(change).toHaveCount(1);
    await expect(change).toContainText("Check at home first");
    const check = page.locator(
      '[data-testid="shopping-aisle"][aria-label="Check at home first"]',
    );
    /* Both salt rows: the pancakes' salt and the crêpes' sea salt. */
    await expect(check.getByTestId("shopping-row")).toHaveCount(2);
    await expect(check).toContainText("sea salt");

    await expect(title(page)).toHaveText("Buy a quart of buttermilk");
    await walk(page)
      .getByRole("button", { name: "Skip: Buy a quart of buttermilk" })
      .click();
    await expect
      .poll(async () => (await getContentGitLog())[0], { timeout: 15_000 })
      .toBe("Update shopping list: skip: Buy a quart of buttermilk");
    await walk(page)
      .getByRole("button", { name: "Skip: Say large eggs" })
      .click();
    await expect(
      walk(page).getByTestId("shopping-walkthrough-done"),
    ).toBeVisible();

    /* Again, on the current list: nothing done or skipped is made again. */
    await tidy(page, "made 0 suggestions");
    const runs = await page.request.get("/api/shopping/tidy/runs");
    expect(runs.ok()).toBe(true);
    const body = (await runs.json()) as {
      runs: { counts: Record<string, number>; on: string }[];
    };
    expect(body.runs.map((run) => run.counts)).toEqual([
      { pending: 0, accepted: 0, skipped: 0, stale: 0 },
      { pending: 0, accepted: 1, skipped: 2, stale: 0 },
    ]);
    /* 50c: the earlier run is one click away, with its counts. */
    await panel(page)
      .getByText(/^Earlier runs \(2\)/)
      .click();
    const earlier = panel(page).getByTestId("shopping-tidy-run");
    await expect(earlier).toHaveCount(2);
    await expect(earlier.nth(1)).toContainText(
      "1 accepted · 2 skipped · 0 to go",
    );
  });

  test("the models are listed with why one is not offered; a run on the original ignores the changes", async ({
    page,
  }) => {
    test.slow();
    await openList(page);
    const models = await page.request.get("/api/shopping/tidy/models");
    expect(await models.json()).toMatchObject({
      models: [{ id: "qwen3:8b", default: true }],
      unavailable: [
        {
          id: "claude",
          why: expect.stringContaining("RECIPE_LLM_CLAUDE_API_KEY"),
        },
      ],
    });
    const claude = panel(page).getByTestId(
      "shopping-tidy-model-unavailable-claude",
    );
    await expect(claude).toContainText("Not set up here");
    await expect(claude.getByRole("radio")).toBeDisabled();
    await tidy(page);
    await skipFlour(page);
    await walk(page)
      .getByRole("button", { name: "Accept: Check the cupboard first" })
      .click();
    await expect(page.getByTestId("shopping-change")).toHaveCount(1);
    await panel(page)
      .getByRole("radio", { name: /the original/ })
      .check();
    await tidy(page);
    /* The original list has the salts where they were: suggested again. */
    await expect(title(page)).toHaveText("Check the cupboard first");
  });
});
