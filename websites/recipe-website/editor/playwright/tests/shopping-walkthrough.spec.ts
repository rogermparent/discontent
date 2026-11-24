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
 * 50c: the walkthrough — one card at a time, the list's own "same thing,
 * different names" first (by "Built-in"), then a tidy run's. A stand-in
 * model on loopback (`fixtures/llm/standInModel.ts`, never a real one)
 * suggests the salts "check at home first", a quart of buttermilk and
 * "large eggs"; a note on a card answers with a note saying it. The suite
 * pins the model off (T18); this spec turns it on through the TEST_MODE-only
 * `/settings/test-llm`, off again after each.
 *
 * The list: the `shopping` fixture's Buttermilk Pancakes and a Crêpes made
 * here — the flours are the built-in card.
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

const panel = (page: Page) => page.getByTestId("shopping-walkthrough");
const status = (page: Page) => page.getByTestId("shopping-walkthrough-status");
const title = (page: Page) => panel(page).getByTestId("shopping-card-title");
const rows = (page: Page) => page.getByTestId("shopping-row");

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

/** A tidy run on the current list, through the stand-in. */
async function tidy(page: Page) {
  const button = panel(page)
    .getByTestId("shopping-tidy")
    .getByRole("button", { name: "Tidy with the model" });
  await expectHydrated(button);
  await button.click();
  await expect(status(page)).toContainText("made 3 suggestions", {
    timeout: 30_000,
  });
}

async function latestCommit(
  page: Page,
  getContentGitLog: () => Promise<string[]>,
) {
  void page;
  return (await getContentGitLog())[0];
}

test.describe("Shopping list: the walkthrough (50c)", () => {
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

  test("A, S and E walk the cards; a note revises one; the done state reopens a skipped card", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    await tidy(page);
    /* The built-in card first, then the run's three. */
    await expect(panel(page).getByTestId("shopping-proposal")).toContainText(
      "Built-in",
    );
    await expect(status(page)).toContainText(
      "0 accepted · 0 skipped · 4 to go",
    );
    expect(
      (
        await new AxeBuilder({ page })
          .include('[data-testid="shopping-walkthrough"]')
          .withTags(WCAG_TAGS)
          .analyze()
      ).violations,
    ).toEqual([]);

    /* A: the flours merge (a rule, as 49a's Merge); focus to the next card. */
    await title(page).focus();
    await page.keyboard.press("a");
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe("Update shopping list: merge all purpose flour + white flour");
    await expect(title(page)).toHaveText("Check the cupboard first");
    await expect(title(page)).toBeFocused();
    await expect(status(page)).toContainText(
      "1 accepted · 0 skipped · 3 to go",
    );
    /* Now → After: the salts move to the top. */
    await expect(panel(page).getByTestId("shopping-card-after")).toContainText(
      "moved to Check at home first",
    );

    /* S: skipped, kept on the run. */
    await page.keyboard.press("s");
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe("Update shopping list: skip: Check the cupboard first");
    await expect(title(page)).toHaveText("Buy a quart of buttermilk");
    await expect(title(page)).toBeFocused();

    /* E: the amount edited; After follows; typing never presses a key. */
    await page.keyboard.press("e");
    const amount = panel(page).getByLabel("Amount for buttermilk", {
      exact: true,
    });
    await expect(amount).toHaveValue("1 quart");
    await amount.fill("");
    await amount.pressSequentially("1 pint as said");
    await expect(panel(page).getByTestId("shopping-card-after")).toContainText(
      "1 pint as said buttermilk",
    );
    await expect(title(page)).toHaveText("Buy a quart of buttermilk");
    await panel(page)
      .getByRole("button", {
        name: "Accept as edited: Buy a quart of buttermilk",
      })
      .click();
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe(
        "Update shopping list: accept (edited): Buy a quart of buttermilk (qwen3:8b)",
      );
    await expect(
      page.getByLabel("1 pint as said buttermilk", { exact: true }),
    ).toBeVisible();
    await expect(title(page)).toHaveText("Say large eggs");

    /* Tell the model…: the card comes back revised, the same card. */
    await panel(page).getByRole("button", { name: "Tell the model…" }).click();
    const note = panel(page).getByLabel("Note for the model", { exact: true });
    await expect(note).toBeFocused();
    await note.fill("any size is fine");
    await panel(page)
      .getByRole("button", { name: "Ask qwen3:8b again with this note" })
      .click();
    await expect(title(page)).toHaveText("As asked: any size is fine", {
      timeout: 30_000,
    });
    await expect(
      panel(page).getByTestId("shopping-tidy-suggestion"),
    ).toContainText("Revised");
    expect(await latestCommit(page, getContentGitLog)).toBe(
      "Update shopping list: revise: Say large eggs → As asked: any size is fine",
    );
    await title(page).focus();
    await page.keyboard.press("a");
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe(
        "Update shopping list: accept: As asked: any size is fine (qwen3:8b)",
      );

    /* Done: the skipped card, to reopen. */
    const done = panel(page).getByTestId("shopping-walkthrough-done");
    await expect(done.getByRole("heading")).toHaveText(
      "That’s every suggestion",
    );
    await expect(done.getByRole("heading")).toBeFocused();
    await expect(status(page)).toContainText(
      "3 accepted · 1 skipped · 0 to go",
    );
    await done
      .getByRole("button", { name: "Reopen: Check the cupboard first" })
      .click();
    await expect(title(page)).toHaveText("Check the cupboard first");
    await panel(page)
      .getByRole("button", { name: "Accept: Check the cupboard first" })
      .click();
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe(
        "Update shopping list: accept: Check the cupboard first (qwen3:8b)",
      );
    await expect(
      page.locator(
        '[data-testid="shopping-aisle"][aria-label="Check at home first"]',
      ),
    ).toContainText("sea salt");
    /* Each accepted card is one change of this list, by the model. */
    await expect(page.getByTestId("shopping-change")).toHaveCount(3);
    await expect(
      page.getByTestId("shopping-change").filter({ hasText: "buttermilk" }),
    ).toContainText("suggested by qwen3:8b, edited by you");
  });

  test("Keep apart, Accept the rest, then Always do this — refused for an amount", async ({
    page,
    getContentGitLog,
  }) => {
    test.slow();
    await openList(page);
    await tidy(page);
    const keep = panel(page).getByRole("button", {
      name: "Keep apart from all-purpose flour",
    });
    await expectHydrated(keep);
    await keep.click();
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe("Update shopping list: keep apart all purpose flour + white flour");
    await expect(rows(page).filter({ hasText: /flour/ })).toHaveCount(2);
    await expect(title(page)).toHaveText("Check the cupboard first");
    await panel(page).getByRole("button", { name: "Accept the rest" }).click();
    await expect(
      panel(page).getByTestId("shopping-walkthrough-done"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(status(page)).toContainText("Accepted 3 suggestions.");
    await expect(status(page)).toContainText(
      "3 accepted · 1 skipped · 0 to go",
    );
    await expect(
      page.getByLabel("4 large eggs", { exact: true }),
    ).toBeVisible();

    /* "Always do this" on the rename: a rule for every list, the change gone. */
    const changes = page.getByTestId("shopping-changes");
    const eggs = changes
      .getByTestId("shopping-change")
      .filter({ hasText: "large eggs" });
    await eggs.getByRole("button", { name: /^Always do this/ }).click();
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toMatch(/^Update shopping list: always: Rename egg to large eggs/);
    await expect(changes.getByTestId("shopping-change")).toHaveCount(2);
    await expect(
      page.getByLabel("4 large eggs", { exact: true }),
    ).toBeVisible();
    /* An amount stays this list's: the button says why it can't. */
    const milk = changes
      .getByTestId("shopping-change")
      .filter({ hasText: "buttermilk" });
    await expect(
      milk.getByRole("button", { name: /^Always do this/ }),
    ).toBeDisabled();
    await expect(milk).toContainText("Amounts and notes stay on this list");

    /* The rules tier: the rename, the kept-apart flours, water built in. */
    await changes.getByText(/^Rules · every list/).click();
    const rules = changes.getByTestId("shopping-rule");
    await expect(
      rules.filter({ hasText: "Call egg “large eggs”" }),
    ).toHaveCount(1);
    await expect(
      rules.filter({ hasText: "Keep all purpose flour and white flour apart" }),
    ).toHaveCount(1);
    await expect(rules.filter({ hasText: "Leave off water" })).toHaveCount(1);
    /* Switched off: the rule stays, the eggs read as written again. */
    await rules
      .filter({ hasText: "Call egg “large eggs”" })
      .getByRole("switch")
      .click();
    await expect
      .poll(() => latestCommit(page, getContentGitLog), { timeout: 15_000 })
      .toBe("Update shopping list: rule off: call egg large eggs");
    await expect(page.getByLabel("4 eggs", { exact: true })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include('[data-testid="shopping-changes"]')
          .withTags(WCAG_TAGS)
          .analyze()
      ).violations,
    ).toEqual([]);
  });

  test("switching lists starts the walkthrough over: a run is its list's own (50d)", async ({
    page,
  }) => {
    test.slow();
    await openList(page);
    /* A second list, "Party", with lemonade only: no card of its own. */
    const made = await page.request.post("/api/shopping/lists", {
      data: { name: "Party" },
    });
    expect(made.ok()).toBe(true);
    const party = ((await made.json()) as { list: { id: string } }).list.id;
    const added = await page.request.post(
      `/api/shopping?list=${encodeURIComponent(party)}`,
      { data: { recipe: "lemonade" } },
    );
    expect(added.ok()).toBe(true);
    await page.goto("/shopping?list=main");
    await expect(page.getByTestId("shopping-page")).toHaveAttribute(
      "data-ready",
      "true",
      { timeout: 30_000 },
    );

    /* A run on the main list; the built-in card skipped (this page only). */
    await tidy(page);
    await title(page).focus();
    await page.keyboard.press("s");
    await expect(status(page)).toContainText(
      "0 accepted · 1 skipped · 3 to go",
    );
    await expect(title(page)).toHaveText("Check the cupboard first");

    /* Switch to Party through the switcher: no stale card, no run. */
    const switcher = page.getByTestId("shopping-list-switcher");
    await expectHydrated(switcher);
    await switcher.click();
    await page
      .getByTestId("shopping-list-menu")
      .getByTestId("shopping-list-choice")
      .filter({ hasText: "Party" })
      .click();
    await expect(page).toHaveURL(`/shopping?list=${party}`);
    await expect(switcher).toHaveText(/Party/);
    await expect(page.getByTestId("shopping-list")).toContainText("lemon");
    await expect(panel(page)).toContainText("No suggestions to walk through.");
    await expect(title(page)).toHaveCount(0);
    await expect(panel(page).getByTestId("shopping-proposal")).toHaveCount(0);
    await expect(panel(page).getByTestId("shopping-tidy-runs")).toHaveCount(0);
    await expect(status(page)).not.toContainText("to go");

    /* Back on the main list: its run is still there, the page's skip gone. */
    await expectHydrated(switcher);
    await switcher.click();
    await page
      .getByTestId("shopping-list-menu")
      .getByTestId("shopping-list-choice")
      .filter({ hasText: "Main list" })
      .click();
    await expect(page).toHaveURL("/shopping?list=main");
    await expect(panel(page).getByTestId("shopping-proposal")).toContainText(
      "Built-in",
    );
    await expect(status(page)).toContainText(
      "0 accepted · 0 skipped · 4 to go",
    );
    await expect(panel(page).getByTestId("shopping-tidy-runs")).toContainText(
      "Earlier runs (1)",
    );
  });
});

test.describe("Shopping list: the walkthrough on a phone (50c) @mobile", () => {
  test.beforeEach(
    async ({ resetData, initializeContentGit, request, createApiToken }) => {
      await resetData("shopping");
      await initializeContentGit();
      await makeCrepes(request, await createApiToken());
    },
  );

  test("the card comes first in Plan, above the panels, with no sideways scroll", async ({
    page,
  }) => {
    await openList(page);
    await page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Plan" })
      .click();
    await expect(page.getByTestId("shopping-page")).toHaveAttribute(
      "data-mode",
      "plan",
    );
    const card = panel(page).getByTestId("shopping-proposal");
    await expect(card).toBeVisible();
    const add = page.getByRole("region", { name: "Add" });
    const cardBox = (await card.boundingBox())!;
    const addBox = (await add.boundingBox())!;
    expect(cardBox.y).toBeLessThan(addBox.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(
      (
        await new AxeBuilder({ page })
          .include('[data-testid="shopping-walkthrough"]')
          .withTags(WCAG_TAGS)
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});
