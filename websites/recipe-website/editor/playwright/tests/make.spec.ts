import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { openPalette, signIn } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";

/*
 * `/make` — "What can I make?" (25c), against `make-drinks`: five drinks
 * (Vodka Sour, Gin and Tonic, Zero-Proof G&T, Lavender Gnista Tonic,
 * Chamomile Collins), the Lavender Syrup the Gnista tonic links to, and Hand
 * Pies, whose `Filling` and `Dough` lines are stored headings that
 * `detectHeading` would not catch.
 *
 * Everything runs in the browser; the inventory lives in `localStorage`, so
 * each test starts from a fresh context with none.
 */

const ticker = (page: Page) => page.getByTestId("make-ticker");
const section = (page: Page, id: string) => page.getByTestId(id);

/** The page has its corpus, its ingredients and its storage. */
async function ready(page: Page) {
  await expect(ticker(page)).toHaveText(/can make/i, { timeout: 20_000 });
}

async function addItems(page: Page, text: string) {
  const input = page.getByTestId("inventory-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test.describe("What can I make?", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-drinks");
  });

  test("a first visit scopes to every recipe and asks what you have", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^7 recipes/i);
    await expect(page.getByTestId("make-query")).toHaveValue("");
    await expect(page.getByText("Start with what you have")).toBeVisible();
    /* `drink` is a root like any other now (28g), labelled by its record. */
    await expect(
      page
        .getByRole("group", { name: "Top-level tags" })
        .getByRole("button", { name: "Drinks", exact: true, pressed: false }),
    ).toBeVisible();
  });

  test("drinks: the two G&Ts are two away from nothing", async ({ page }) => {
    await page.goto("/make?q=tag:drink");
    await ready(page);
    /* Gin (or its non-alcoholic twin) and tonic. */
    await expect(ticker(page)).toHaveText(
      /5 recipes · 0 can make · 0 one away · 2 two away · “tag:drink”/i,
    );
  });

  test("adding items moves cards between sections", async ({ page }) => {
    await page.goto("/make");
    await ready(page);

    await addItems(page, "vodka, simple syrup");
    await expect(section(page, "make-one-away")).toContainText("Vodka Sour");
    await expect(
      section(page, "make-one-away").getByTestId("make-missing").first(),
    ).toHaveText("Missing: lime juice");

    await addItems(page, "lime");
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    /* The section itself goes when nothing is one away. */
    await expect(
      section(page, "make-one-away").getByText("Vodka Sour"),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Remove lime" }).click();
    await expect(section(page, "make-one-away")).toContainText("Vodka Sour");
  });

  test("gin never stands in for non-alcoholic gin", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "gin, tonic");

    await expect(section(page, "make-can")).toContainText("Gin and Tonic");
    const oneAway = section(page, "make-one-away");
    await expect(oneAway).toContainText("Zero-Proof G&T");
    await expect(oneAway).toContainText("Missing: non-alcoholic gin");
  });

  test("a line can be met by making its recipe first", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "Gnista, tonic water");
    await expect(section(page, "make-one-away")).toContainText(
      "Lavender Gnista Tonic",
    );

    await addItems(page, "sugar, lavender");
    const can = section(page, "make-can");
    await expect(can).toContainText("Lavender Gnista Tonic");
    await expect(can.getByTestId("make-via")).toHaveText(
      "Make lavender syrup first",
    );
  });

  test("buy next names what one more item unlocks", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, simple syrup");

    const buyNext = page.getByTestId("buy-next");
    await expect(buyNext.getByRole("listitem").first()).toContainText(
      "lime juice",
    );
    await buyNext.getByRole("button", { name: "I have lime juice" }).click();
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(page.getByTestId("inventory-chips")).toContainText(
      "lime juice",
    );
  });

  test("exports and imports the list as text", async ({ page, browser }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");

    await page.getByRole("button", { name: "Import / export" }).click();
    const exported = await page.getByTestId("inventory-export").inputValue();
    expect(exported).toBe("lime\nsimple syrup\nvodka");

    /* A second browser — another site, or another device. A context made by
     * hand doesn't inherit the config's `baseURL`, hence the absolute URL. */
    const other = await browser.newPage();
    await other.goto(new URL("/make", page.url()).toString());
    await ready(other);
    await other.getByRole("button", { name: "Import / export" }).click();
    await other.getByTestId("inventory-import").fill(exported);
    await expect(other.getByTestId("inventory-import-preview")).toHaveText(
      "3 items: lime, simple syrup, vodka",
    );
    await other.getByRole("button", { name: "Replace what I have" }).click();
    await expect(other.getByTestId("inventory-chips")).toContainText("vodka");
    await expect(section(other, "make-can")).toContainText("Vodka Sour");
    await other.close();
  });

  test("the list survives a reload", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");
    await page.reload();
    await ready(page);
    await expect(page.getByTestId("inventory-chips")).toContainText(
      "simple syrup",
    );
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
  });

  test("a ?q= deep link sets the scope", async ({ page }) => {
    await page.goto("/make?q=tag:zero-proof");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^2 recipes/i);
    await expect(page.getByTestId("make-query")).toHaveValue("tag:zero-proof");
  });

  test("the scope is remembered, and chips narrow it", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await page.getByRole("button", { name: "Drinks", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue("tag:drink");
    await page.getByRole("button", { name: "Narrower tags of Drinks" }).click();
    await page.getByRole("button", { name: "Highball", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue(
      "tag:drink tag:highball",
    );
    await expect(page).toHaveURL(/q=tag%3Adrink\+tag%3Ahighball/);
    await expect(ticker(page)).toHaveText(/^3 recipes/i);

    await page.goto("/make");
    await ready(page);
    await expect(page.getByTestId("make-query")).toHaveValue(
      "tag:drink tag:highball",
    );
  });

  test("a root expands to its children, most used first", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    const toggle = page.getByRole("button", {
      name: "Narrower tags of Drinks",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const children = page.getByRole("group", {
      name: "Narrower tags of Drinks",
    });
    await expect(children.getByRole("button")).toHaveText([
      /^Highball/,
      /^Zero-proof/,
      /^Collins/,
      /^Sour/,
    ]);
    /* A child alone narrows the scope, and its root stays open for it. */
    await children.getByRole("button", { name: "Zero-proof" }).click();
    await expect(page.getByTestId("make-query")).toHaveValue("tag:zero-proof");
    await expect(ticker(page)).toHaveText(/^2 recipes/i);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    /* Closing is the person's call, selection or not. */
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(children).toHaveCount(0);
  });

  test("tag search finds a child by name, with its breadcrumb", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    const search = page.getByRole("combobox", { name: "Find a tag" });
    await search.fill("zero");
    const option = page.getByRole("option", { name: /Zero-proof/ });
    await expect(option).toContainText("Drinks › Zero-proof");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page.getByTestId("make-query")).toHaveValue("tag:zero-proof");
    await expect(search).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^2 recipes/i);

    /* Picking a tag already in scope leaves the scope alone. */
    await search.fill("zero-pr");
    await page.getByRole("option", { name: /Zero-proof/ }).click();
    await expect(page.getByTestId("make-query")).toHaveValue("tag:zero-proof");
  });

  test("stored headings are never listed as missing", async ({ page }) => {
    await page.goto("/make?q=tag:dessert");
    await ready(page);
    await addItems(page, "jam, flour");
    const oneAway = section(page, "make-one-away");
    await expect(oneAway).toContainText("Hand Pies");
    await expect(oneAway.getByTestId("make-missing")).toHaveText(
      "Missing: butter",
    );
  });

  test("an empty scope offers to clear it", async ({ page }) => {
    await page.goto("/make?q=tag:nothing-here");
    await ready(page);
    await expect(page.getByText("Nothing in scope")).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^7 recipes/i);
  });

  test("a term page links to /make for its recipes", async ({ page }) => {
    await page.goto("/tags/drink");
    const link = page.getByRole("link", {
      name: "What can I make with these?",
    });
    await expect(link).toHaveAttribute("href", "/make?q=tag%3Adrink");
    await link.click();
    await expect(page).toHaveURL(/\/make\?q=tag%3Adrink$/);
    await ready(page);
  });

  test("the palette goes to /make", async ({ page }) => {
    await page.goto("/");
    await openPalette(page);
    await page.getByRole("option", { name: "What can I make?" }).click();
    await expect(page).toHaveURL(/\/make$/);
  });

  test("has no WCAG2AA violations, empty or filled", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await expectNoViolations(page);

    /* 28g: an open tree and an open tag list. */
    await page.getByRole("button", { name: "Narrower tags of Drinks" }).click();
    await page.getByRole("combobox", { name: "Find a tag" }).fill("h");
    await expect(page.getByRole("listbox", { name: "Tags" })).toBeVisible();
    await expectNoViolations(page);
    await page.getByRole("combobox", { name: "Find a tag" }).press("Escape");

    await addItems(page, "vodka, simple syrup, gin, tonic");
    await expect(section(page, "make-can")).toBeVisible();
    await expectNoViolations(page);
  });
});

/*
 * 25d: the editor's shared list. `make-drinks` carries
 * `inventory/on-hand.json` = gin + tonic water — which only a signed-in
 * session may see.
 */
test.describe("What can I make? — the shared list", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-drinks");
  });

  const chips = (page: Page) => page.getByTestId("inventory-chips");

  async function signInToMake(page: Page) {
    await page.goto("/");
    await signIn(page);
    await page.goto("/make");
    await ready(page);
  }

  test("a guest sees none of it, and neither does the API", async ({
    page,
    request,
  }) => {
    await page.goto("/make");
    await ready(page);
    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Start with what you have")).toBeVisible();

    expect((await request.get("/api/inventory")).status()).toBe(401);
    expect((await request.get("/api/inventory/make")).status()).toBe(401);
  });

  test("signed in, the shared list shows and counts", async ({ page }) => {
    await signInToMake(page);
    await expect(chips(page).locator("[data-source='shared']")).toHaveCount(2);
    await expect(chips(page)).toContainText("tonic water");
    await expect(section(page, "make-can")).toContainText("Gin and Tonic");
    await expect(page.getByTestId("inventory-pending")).toHaveCount(0);
  });

  test("hiding a shared item here can be undone", async ({ page }) => {
    await signInToMake(page);
    await page.getByRole("button", { name: "Remove gin" }).click();
    const hidden = page.getByTestId("inventory-hidden");
    await expect(hidden).toContainText("gin");
    await expect(page.getByTestId("inventory-pending")).toContainText(
      "1 change on this browser",
    );
    await page.getByRole("button", { name: "Undo hiding gin" }).click();
    await expect(hidden).toHaveCount(0);
    await expect(page.getByTestId("inventory-pending")).toHaveCount(0);
  });

  test("saving this browser's changes persists them", async ({ page }) => {
    await signInToMake(page);
    await addItems(page, "lime");
    await expect(chips(page).locator("[data-source='browser']")).toHaveText(
      /lime/,
    );
    const pending = page.getByTestId("inventory-pending");
    await expect(pending).toContainText("1 change on this browser");
    await pending.getByRole("button", { name: "Save to shared list" }).click();
    await expect(pending).toHaveCount(0);

    /* A fresh browser signed in as the same person sees it as shared. */
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await expect(chips(page).locator("[data-source='shared']")).toHaveCount(3);
    await expect(chips(page)).toContainText("lime");
  });
});

/*
 * 32j: any kind of recipe, dinner or drink, against `make-food` — six food
 * recipes (Shallot Rice Pilaf and Roasted Vegetables tagged side and
 * vegetarian, Lemon Garlic Chicken Thighs and Chicken Fried Rice tagged
 * dinner, an untagged Simple Omelette and Pancakes) and two drinks (Gin and
 * Tonic, Whisky Highball). The tags have no term records: a flat vocabulary,
 * as the real corpus's food has.
 */
test.describe("What can I make? — dinner as well as drinks", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-food");
  });

  const kinds = (page: Page) =>
    page.getByRole("group", { name: "Kind of recipe" });

  test("the kind switch scopes to food, drinks or anything", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^8 recipes/i);
    await expect(
      kinds(page).getByRole("radio", { name: "Anything" }),
    ).toBeChecked();

    await kinds(page).getByRole("radio", { name: "Food" }).check();
    await expect(page.getByTestId("make-query")).toHaveValue("-tag:drink");
    await expect(ticker(page)).toHaveText(/^6 recipes/i);

    await kinds(page).getByRole("radio", { name: "Drinks" }).check();
    await expect(page.getByTestId("make-query")).toHaveValue("tag:drink");
    await expect(ticker(page)).toHaveText(/^2 recipes/i);

    /* A remembered drinks scope reads as the Drinks segment chosen. */
    await page.goto("/make");
    await ready(page);
    await expect(
      kinds(page).getByRole("radio", { name: "Drinks" }),
    ).toBeChecked();

    await kinds(page).getByRole("radio", { name: "Anything" }).check();
    await expect(page.getByTestId("make-query")).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^8 recipes/i);
  });

  test("refine chips drill down a tag with no children", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await kinds(page).getByRole("radio", { name: "Food" }).check();
    const roots = page.getByRole("group", { name: "Top-level tags" });
    await expect(roots.getByRole("button")).toHaveText([
      /^dinner/,
      /^quick/,
      /^side/,
      /^vegetarian/,
    ]);
    await expect(page.getByRole("group", { name: "Refine" })).toHaveCount(0);

    await roots.getByRole("button", { name: "side", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue(
      "-tag:drink tag:side",
    );
    await expect(ticker(page)).toHaveText(/^2 recipes/i);
    /* Both sides are vegetarian, so that would change nothing. */
    const refine = page.getByRole("group", { name: "Refine" });
    await expect(refine.getByRole("button")).toHaveText([/^quick/]);
    /* The top row holds still while the picks drill down. */
    await expect(roots.getByRole("button")).toHaveCount(4);

    await refine.getByRole("button", { name: "quick", exact: true }).click();
    await expect(page.getByTestId("make-query")).toHaveValue(
      "-tag:drink tag:side tag:quick",
    );
    await expect(ticker(page)).toHaveText(/^1 recipe /i);
    await expect(refine).toHaveCount(0);
  });

  test("a close match counts, says so, and can be turned off", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "onion, rice, vegetable broth, butter");

    const can = section(page, "make-can");
    await expect(can).toContainText("Shallot Rice Pilaf");
    await expect(can.getByTestId("make-close")).toContainText(
      "onion for shallot",
    );

    await page.getByLabel(/Count close matches/).uncheck();
    await expect(can).toHaveCount(0);
    await expect(section(page, "make-one-away")).toContainText(
      "Missing: shallot (close: onion)",
    );

    await page.getByLabel(/Count close matches/).check();
    await expect(section(page, "make-can")).toContainText("Shallot Rice Pilaf");
    await expectNoViolations(page);
  });

  test("salt and pepper are assumed until you say otherwise", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "eggs, butter");
    await expect(section(page, "make-can")).toContainText("Simple Omelette");

    await page.getByText("Assume I always have (4)").click();
    await page.getByRole("button", { name: "Stop assuming salt" }).click();
    await expect(page.getByText("Assume I always have (3)")).toBeVisible();
    await expect(section(page, "make-one-away")).toContainText("Missing: salt");

    await page
      .getByRole("button", { name: "Reset to salt, pepper, water, ice" })
      .click();
    await expect(section(page, "make-can")).toContainText("Simple Omelette");
  });

  test("lines read loosely: prep phrases and British names", async ({
    page,
  }) => {
    await page.goto("/make?q=-tag:drink");
    await ready(page);
    await addItems(page, "courgette, red onion, olive oil");
    const can = section(page, "make-can");
    await expect(can).toContainText("Roasted Vegetables");
    await expect(can.getByTestId("make-close")).toHaveCount(0);
  });
});
