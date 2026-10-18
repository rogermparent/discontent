import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { openPalette, signIn } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";

/*
 * `/make` — "What can I make?" (25c, redesigned in 41h), against
 * `make-drinks`: five drinks (Vodka Sour, Gin and Tonic, Zero-Proof G&T,
 * Lavender Gnista Tonic, Chamomile Collins), the Lavender Syrup the Gnista
 * tonic links to, and Hand Pies, whose `Filling` and `Dough` lines are
 * stored headings that `detectHeading` would not catch.
 *
 * Everything runs in the browser; the inventory lives in `localStorage`, so
 * each test starts from a fresh context with none.
 */

const ticker = (page: Page) => page.getByTestId("make-ticker");
const section = (page: Page, id: string) => page.getByTestId(id);
const query = (page: Page) => page.getByTestId("make-query");
const question = (page: Page) => page.getByTestId("make-question");
const chips = (page: Page) => page.getByTestId("inventory-chips");
const shelf = (page: Page) => page.getByTestId("make-shelf");
const toast = (page: Page) => page.getByTestId("make-toast");

/** The page has its corpus, its ingredients and its storage. */
async function ready(page: Page) {
  await expect(ticker(page)).toHaveText(/can make/i, { timeout: 20_000 });
}

/** "Assume pantry staples" (U5) — on unless this browser turned it off. */
const pantrySwitch = (page: Page) =>
  page.getByRole("switch", { name: "Assume pantry staples" });

async function addItems(page: Page, text: string) {
  const input = page.getByTestId("inventory-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

/** The question's kind word opens a menu of kinds (41h). */
async function chooseKind(page: Page, word: string) {
  await page.getByTestId("make-kind").click();
  const menu = page.getByRole("menu", { name: "What kind of recipe" });
  await menu
    .getByRole("menuitemradio", { name: new RegExp(`^${word}\\b`) })
    .click();
  await expect(menu).toHaveCount(0);
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
    await expect(query(page)).toHaveValue("");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "What recipes can I make?",
      }),
    ).toBeVisible();
    await expect(page.getByText("Tell it what you have")).toBeVisible();
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
      "5 drinks · 0 can make · 0 one away · 2 two away",
    );
    await expect(question(page)).toHaveText("What drinks can I make?");
  });

  test("adding items moves cards between sections", async ({ page }) => {
    /* Drinks: Hand Pies and Lavender Syrup are one away on the pantry. */
    await page.goto("/make?q=tag:drink");
    await ready(page);

    await addItems(page, "vodka, simple syrup");
    await expect(section(page, "make-one-away")).toContainText("Vodka Sour");
    await expect(
      section(page, "make-one-away").getByTestId("make-missing").first(),
    ).toHaveText("Needs lime juice");

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
    await expect(oneAway).toContainText("Needs non-alcoholic gin");
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
    await page.goto("/make?q=tag:drink");
    await ready(page);
    await addItems(page, "vodka, simple syrup");

    const buyNext = page.getByTestId("buy-next");
    const first = buyNext.getByRole("listitem").first();
    await expect(first).toContainText("lime juice");
    await expect(first).toContainText("makes 1 more");
    /* The recipes it would finish, by name. */
    await expect(first).toContainText("Vodka Sour");
    await buyNext
      .getByRole("button", { name: "I have this: lime juice" })
      .click();
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(chips(page)).toContainText("lime juice");
  });

  /* 41h: tap a label's body to feature it; the query says so. */
  test("featuring a label narrows the page, and the question un-features it", async ({
    page,
  }) => {
    await page.goto("/make?q=tag:drink");
    await ready(page);
    await addItems(page, "vodka, simple syrup, lime, gin, tonic water");
    await expect(ticker(page)).toHaveText(/^5 drinks · 2 can make/);

    const lime = chips(page).getByRole("button", {
      name: "lime",
      exact: true,
    });
    await expect(lime).toHaveAttribute("aria-pressed", "false");
    await lime.click();
    await expect(query(page)).toHaveValue("tag:drink ingredient:lime");
    await expect(page).toHaveURL(/q=tag%3Adrink\+ingredient%3Alime/);
    await expect(lime).toHaveAttribute("aria-pressed", "true");
    await expect(question(page)).toHaveText(
      "What drinks can I make with lime?",
    );
    /* Lime as the matcher reads it (Dh7): the Vodka Sour's lime juice. The
     * G&T's "Lime wedge, for garnish" is optional, so it isn't "with lime". */
    await expect(ticker(page)).toHaveText(/^1 drink · 1 can make/);
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(section(page, "make-can")).not.toContainText("Gin and Tonic");

    /* The question's word is named by itself and described as the undo. */
    const unfeature = question(page).getByRole("button", {
      name: "lime",
      exact: true,
    });
    await expect(unfeature).toHaveAccessibleDescription(
      "Tap to stop featuring it",
    );
    await unfeature.click();
    await expect(query(page)).toHaveValue("tag:drink");
    await expect(lime).toHaveAttribute("aria-pressed", "false");
    await expect(ticker(page)).toHaveText(/^5 drinks/);
  });

  test("typing ingredient: in the field features it, and several must all appear", async ({
    page,
  }) => {
    await page.goto("/make?q=tag:drink");
    await ready(page);
    await addItems(page, "tonic water");
    await query(page).fill('tag:drink ingredient:"tonic water"');
    await expect(question(page)).toHaveText(
      "What drinks can I make with tonic water?",
    );
    await expect(ticker(page)).toHaveText(/^3 drinks/);
    await expect(
      chips(page).getByRole("button", { name: "tonic water", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    /* Gin as the matcher reads it (Dh7): the G&T, never its zero-proof twin
     * (gin doesn't stand in for non-alcoholic gin); the Gnista tonic has no
     * gin at all. */
    await query(page).fill('tag:drink ingredient:"tonic water" ingredient:gin');
    await expect(question(page)).toHaveText(
      "What drinks can I make with tonic water and gin?",
    );
    await expect(ticker(page)).toHaveText(/^1 drink ·/);
    await expect(section(page, "make-one-away")).toContainText("Gin and Tonic");
  });

  test("buy next follows the featured scope, and its tape features", async ({
    page,
  }) => {
    await page.goto("/make?q=tag:drink");
    await ready(page);
    await addItems(page, "vodka, simple syrup");
    const buyNext = page.getByTestId("buy-next");
    await buyNext
      .getByRole("button", { name: "lime juice", exact: true })
      .click();
    await expect(query(page)).toHaveValue('tag:drink ingredient:"lime juice"');
    await expect(
      buyNext.getByRole("heading", { name: "Buy next for lime juice drinks" }),
    ).toBeVisible();
    await expect(
      buyNext.getByRole("button", { name: "lime juice", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(ticker(page)).toHaveText(/^1 drink · 0 can make · 1 one away/);
  });

  test("the add field suggests what each would add, by keyboard", async ({
    page,
  }) => {
    await page.goto("/make?q=tag:drink");
    await ready(page);
    await addItems(page, "vodka, simple syrup");

    const input = page.getByRole("combobox", {
      name: "Add or look up an ingredient",
    });
    await input.fill("lim");
    const list = page.getByRole("listbox", { name: "What each would add" });
    await expect(list).toBeVisible();
    const first = list.getByRole("option").first();
    await expect(first).toContainText("lime juice");
    await expect(first).toContainText("+1 now");
    await expect(input).toHaveAttribute("aria-expanded", "true");

    await input.press("ArrowDown");
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute(
      "aria-activedescendant",
      (await first.getAttribute("id"))!,
    );
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(list).toBeHidden();
    await expect(chips(page)).toContainText("lime juice");
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(toast(page)).toHaveText("Added lime juice.");

    /* Escape closes the list, then clears the field. */
    await input.fill("ton");
    await expect(list).toBeVisible();
    await input.press("Escape");
    await expect(list).toBeHidden();
    await input.press("Escape");
    await expect(input).toHaveValue("");
  });

  test("Clear empties the list at once, and Undo brings it back", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");
    await shelf(page)
      .getByRole("button", { name: "Clear", exact: true })
      .click();
    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Tell it what you have")).toBeVisible();
    await expect(toast(page)).toContainText("Cleared 3 items.");
    /* Clear's button goes away, so focus goes to Undo — and the toast
     * waits while it is there (WCAG 2.2.1). */
    const undo = toast(page).getByRole("button", { name: "Undo" });
    await expect(undo).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chips(page).getByRole("listitem")).toHaveCount(3);
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
    await expect(page.getByTestId("inventory-input")).toBeFocused();

    /* A removed label comes back the same way. */
    await page.getByRole("button", { name: "Remove vodka" }).click();
    await expect(toast(page)).toContainText("Removed vodka.");
    await undo.click();
    await expect(chips(page).getByRole("listitem")).toHaveText([
      /vodka/,
      /lime/,
      /simple syrup/,
    ]);

    /* By keyboard: × moves focus to the label that took its place, and
     * Ctrl+Z undoes while the toast is up. */
    await page.getByRole("button", { name: "Remove vodka" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      chips(page).getByRole("button", { name: "lime", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect(chips(page).getByRole("listitem")).toHaveText([
      /vodka/,
      /lime/,
      /simple syrup/,
    ]);
  });

  test("spec cards: per browser, with the featured lines marked", async ({
    page,
  }) => {
    await page.goto("/make?q=tag:drink ingredient:lime");
    await ready(page);
    await addItems(page, "vodka, lime");
    const view = page.getByRole("group", { name: "Cards" });
    await expect(view.getByRole("radio", { name: "Photos" })).toBeChecked();
    await view.getByRole("radio", { name: "Specs" }).check();

    const cards = page.getByTestId("make-spec-cards");
    const sour = cards.getByRole("listitem").filter({ hasText: "Vodka Sour" });
    await expect(sour.getByRole("heading", { level: 3 })).toHaveText(
      "Vodka Sour",
    );
    await expect(sour).toContainText("vodka · lime juice");
    await expect(sour.locator("mark")).toHaveText("lime juice");
    await expect(sour.getByTestId("make-missing")).toHaveText(
      "Needs simple syrup",
    );

    await page.reload();
    await ready(page);
    await expect(
      page.getByRole("group", { name: "Cards" }).getByRole("radio", {
        name: "Specs",
      }),
    ).toBeChecked();
    await expect(page.getByTestId("make-spec-cards").first()).toBeVisible();
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
    await expect(chips(other)).toContainText("vodka");
    await expect(section(other, "make-can")).toContainText("Vodka Sour");
    await other.close();
  });

  test("the list survives a reload", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await addItems(page, "vodka, lime, simple syrup");
    await page.reload();
    await ready(page);
    await expect(chips(page)).toContainText("simple syrup");
    await expect(section(page, "make-can")).toContainText("Vodka Sour");
  });

  test("a ?q= deep link sets the scope", async ({ page }) => {
    await page.goto("/make?q=tag:zero-proof");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^2 recipes/i);
    await expect(query(page)).toHaveValue("tag:zero-proof");
  });

  test("the scope is remembered, and chips narrow it", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await page.getByRole("button", { name: "Drinks", exact: true }).click();
    await expect(query(page)).toHaveValue("tag:drink");
    await page.getByRole("button", { name: "Narrower tags of Drinks" }).click();
    await page.getByRole("button", { name: "Highball", exact: true }).click();
    await expect(query(page)).toHaveValue("tag:drink tag:highball");
    await expect(page).toHaveURL(/q=tag%3Adrink\+tag%3Ahighball/);
    await expect(ticker(page)).toHaveText(/^3 drinks/i);

    await page.goto("/make");
    await ready(page);
    await expect(query(page)).toHaveValue("tag:drink tag:highball");
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
    await expect(query(page)).toHaveValue("tag:zero-proof");
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
    await expect(query(page)).toHaveValue("tag:zero-proof");
    await expect(search).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^2 recipes/i);

    /* Picking a tag already in scope leaves the scope alone. */
    await search.fill("zero-pr");
    await page.getByRole("option", { name: /Zero-proof/ }).click();
    await expect(query(page)).toHaveValue("tag:zero-proof");
  });

  test("stored headings are never listed as missing", async ({ page }) => {
    await page.goto("/make?q=tag:dessert");
    await ready(page);
    /* Butter would be assumed on hand otherwise (U5). */
    await pantrySwitch(page).uncheck();
    await addItems(page, "jam, flour");
    const oneAway = section(page, "make-one-away");
    await expect(oneAway).toContainText("Hand Pies");
    await expect(oneAway.getByTestId("make-missing")).toHaveText(
      "Needs butter",
    );
  });

  test("an empty scope offers to clear it", async ({ page }) => {
    await page.goto("/make?q=tag:nothing-here");
    await ready(page);
    await expect(page.getByText("Nothing in scope")).toBeVisible();
    await page
      .getByTestId("make-results")
      .getByRole("button", { name: "Clear", exact: true })
      .click();
    await expect(query(page)).toHaveValue("");
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

  test("a group shows 12 cards, then Show all expands in place", async ({
    page,
    request,
    createApiToken,
  }) => {
    const token = await createApiToken();
    for (let i = 1; i <= 13; i += 1) {
      const created = await request.post("/api/recipes", {
        headers: { authorization: `Bearer ${token}` },
        data: {
          name: `Quince Tart ${String(i).padStart(2, "0")}`,
          tags: ["quince-test"],
          ingredients: ["1 quince", "1 cup jam"],
        },
      });
      expect(created.status()).toBe(201);
    }
    await page.goto("/make?q=tag:quince-test");
    await expect(ticker(page)).toHaveText(/^13 recipes/i, { timeout: 20_000 });
    await addItems(page, "jam");
    const oneAway = section(page, "make-one-away");
    /* The heading keeps the whole count. */
    await expect(oneAway.getByRole("heading", { level: 2 })).toHaveText(
      /One ingredient away\s*13/,
    );
    await expect(
      oneAway.getByRole("link", { name: /Quince Tart/ }),
    ).toHaveCount(12);
    const more = oneAway.getByRole("button", { name: "Show all 13" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();
    await expect(
      oneAway.getByRole("link", { name: /Quince Tart/ }),
    ).toHaveCount(13);
    await expect(
      oneAway.getByRole("button", { name: "Show fewer" }),
    ).toHaveAttribute("aria-expanded", "true");
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

    /* 41h: a feature in the question, the kind menu open, the what-if
     * list open, and the spec cards. */
    await chips(page)
      .getByRole("button", { name: "vodka", exact: true })
      .click();
    await expect(question(page)).toContainText("with vodka");
    await page.getByTestId("make-kind").click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByTestId("make-kind")).toBeFocused();

    await page.getByTestId("inventory-input").fill("l");
    await expect(
      page.getByRole("listbox", { name: "What each would add" }),
    ).toBeVisible();
    await expectNoViolations(page);
    await page.getByTestId("inventory-input").press("Escape");

    await page
      .getByRole("group", { name: "Cards" })
      .getByRole("radio", { name: "Specs" })
      .check();
    await expect(page.getByTestId("make-spec-cards").first()).toBeVisible();
    await expectNoViolations(page);
  });
});

/*
 * U6 and 41h: this browser's list first; the saved inventory a second list
 * the shelf can count from. `make-drinks` carries `inventory/on-hand.json` =
 * gin + tonic water — the operator's saved inventory, which only a
 * signed-in session may see.
 */
test.describe("What can I make? — your saved inventory", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("make-drinks");
  });

  const countFrom = (page: Page) =>
    page.getByRole("group", { name: "Count from" });
  const secondLabels = (page: Page) => page.getByTestId("make-second-labels");

  async function signInToMake(page: Page, q = "") {
    await page.goto("/");
    await signIn(page);
    await page.goto(`/make${q ? `?q=${q}` : ""}`);
    await ready(page);
  }

  test("a guest sees none of it, and neither does the API", async ({
    page,
    request,
  }) => {
    await page.goto("/make");
    await ready(page);
    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Tell it what you have")).toBeVisible();
    await expect(countFrom(page)).toHaveCount(0);
    await expect(page.getByTestId("make-second-list")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save to editor" }),
    ).toHaveCount(0);
    await expect(page.getByText(/saved (list|inventory)/i)).toHaveCount(0);

    expect((await request.get("/api/inventory")).status()).toBe(401);
    expect((await request.get("/api/inventory/make")).status()).toBe(401);
  });

  test("signed in, this browser's list leads; Count from switches to the saved list", async ({
    page,
  }) => {
    await signInToMake(page, "tag:drink");
    /* Never a fallback: nothing on this browser is nothing on this browser. */
    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Tell it what you have")).toBeVisible();
    await expect(ticker(page)).toHaveText(/0 can make/i);
    await expect(
      countFrom(page).getByRole("radio", { name: /^This browser/ }),
    ).toBeChecked();
    await expect(page.getByTestId("make-second-list")).toHaveCount(0);

    await countFrom(page)
      .getByRole("radio", { name: /^Saved list\s*2 items/ })
      .check();
    await expect(ticker(page)).toHaveText(/1 can make/i);
    await expect(section(page, "make-can")).toContainText("Gin and Tonic");
    /* Its labels show apart, outlined, and feature like any other. */
    await expect(secondLabels(page).getByRole("listitem")).toHaveText([
      /gin/,
      /tonic water/,
    ]);
    await secondLabels(page)
      .getByRole("button", { name: "gin", exact: true })
      .click();
    await expect(query(page)).toHaveValue("tag:drink ingredient:gin");

    /* Per browser: the choice survives a reload. */
    await page.reload();
    await ready(page);
    await expect(
      countFrom(page).getByRole("radio", { name: /^Saved list/ }),
    ).toBeChecked();
  });

  test("Both counts the union everywhere, Buy next included", async ({
    page,
  }) => {
    await signInToMake(page, "tag:drink");
    await addItems(page, "vodka, simple syrup");
    await expect(ticker(page)).toHaveText(/0 can make · 1 one away/i);

    await countFrom(page)
      .getByRole("radio", { name: /^Both\s*4 items/ })
      .check();
    /* Gin and Tonic from the saved list; still one away for the sour. */
    await expect(ticker(page)).toHaveText(/1 can make · 2 one away/i);
    await expect(section(page, "make-can")).toContainText("Gin and Tonic");
    await expect(
      page.getByTestId("buy-next").getByRole("listitem"),
    ).toContainText(["lime juice", "non-alcoholic gin"]);

    /* On the saved list alone, this browser's labels stay, uncounted. */
    await countFrom(page)
      .getByRole("radio", { name: /^Saved list/ })
      .check();
    await expect(
      page.getByRole("list", { name: "This browser's list, not counted" }),
    ).toBeVisible();
    await expect(page.getByTestId("make-not-counted")).toBeVisible();
    await expect(chips(page).locator("[data-counted=false]")).toHaveCount(2);

    await countFrom(page)
      .getByRole("radio", { name: /^This browser/ })
      .check();
    await expect(ticker(page)).toHaveText(/0 can make · 1 one away/i);
    await expect(page.getByTestId("make-not-counted")).toHaveCount(0);
  });

  test("Save to editor shows the diff, then writes one commit", async ({
    page,
  }) => {
    await signInToMake(page);
    await addItems(page, "vodka, gin");
    await shelf(page).getByRole("button", { name: "Save to editor" }).click();
    const confirm = page.getByTestId("make-save-confirm");
    await expect(confirm).toContainText("Update the editor's saved list (2)?");
    await expect(page.getByTestId("make-save-diff")).toHaveText(
      "+1 vodka−1 tonic water",
    );
    await expect(
      confirm.getByRole("button", { name: "Save list" }),
    ).toBeFocused();

    /* Cancel writes nothing. */
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);

    await shelf(page).getByRole("button", { name: "Save to editor" }).click();
    await confirm.getByRole("button", { name: "Save list" }).click();
    await expect(toast(page)).toHaveText("Saved list updated.");
    await expect(confirm).toHaveCount(0);
    await expect(
      countFrom(page).getByRole("radio", { name: /^Saved list\s*2 items/ }),
    ).toBeVisible();

    /* Persisted: a fresh browser signed in as the same person sees it. */
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await countFrom(page)
      .getByRole("radio", { name: /^Saved list/ })
      .check();
    await expect(secondLabels(page).getByRole("listitem")).toHaveText([
      /gin/,
      /vodka/,
    ]);
    /* And this browser's list stayed its own. */
    await expect(chips(page)).toHaveCount(0);
  });

  test("the saved list copies into this browser, with Undo", async ({
    page,
  }) => {
    await signInToMake(page);
    await addItems(page, "vodka");
    await countFrom(page)
      .getByRole("radio", { name: /^Saved list/ })
      .check();
    await page
      .getByTestId("make-second-list")
      .getByRole("button", { name: "Copy it to this browser" })
      .click();
    await expect(chips(page).getByRole("listitem")).toHaveText([
      /gin/,
      /tonic water/,
    ]);
    await expect(
      countFrom(page).getByRole("radio", { name: /^This browser/ }),
    ).toBeChecked();
    await expect(toast(page)).toContainText(
      "Copied 2 saved items to this browser.",
    );

    await toast(page).getByRole("button", { name: "Undo" }).click();
    await expect(chips(page).getByRole("listitem")).toHaveText([/vodka/]);
    await expect(
      countFrom(page).getByRole("radio", { name: /^Saved list/ }),
    ).toBeChecked();
  });

  /* A pre-U6 browser stored an overlay on the saved list: hide gin, add lime. */
  const LEGACY = JSON.stringify({ added: ["lime"], removed: ["gin"] });

  test("an old overlay becomes the whole list on the owner's first visit", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.evaluate(
      (value) => localStorage.setItem("make-inventory-v1", value),
      LEGACY,
    );
    await page.goto("/make");
    await ready(page);
    /* (gin + tonic water − gin) ∪ lime, kept as this browser's own. */
    await expect(chips(page).getByRole("listitem")).toHaveText([
      /tonic water/,
      /lime/,
    ]);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("make-inventory-v1") ?? "null"),
    );
    expect(stored).toEqual({
      added: ["tonic water", "lime"],
      removed: [],
      version: 2,
    });
  });

  test("a guest leaves an old overlay for the owner, reading its additions", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(
      (value) => localStorage.setItem("make-inventory-v1", value),
      LEGACY,
    );
    await page.goto("/make");
    await ready(page);
    await expect(chips(page).getByRole("listitem")).toHaveText([/lime/]);
    expect(
      await page.evaluate(() => localStorage.getItem("make-inventory-v1")),
    ).toBe(LEGACY);
  });

  test("the always-have list follows the owner to a new browser (38a)", async ({
    page,
    browser,
  }) => {
    const staples = (on: Page) => on.getByTestId("staples");
    await signInToMake(page);
    await staples(page).locator("summary").click();
    await staples(page)
      .getByLabel("Add to what I always have", { exact: true })
      .fill("soy sauce");
    await staples(page)
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(staples(page).locator("summary")).toHaveText(
      "Assume I always have (5)",
    );

    /* Another browser, signed in: still on the default list, so it starts
     * from the saved one. A context made by hand has no `baseURL`. */
    const other = await browser.newPage();
    await other.goto(new URL("/", page.url()).toString());
    await signIn(other);
    await other.goto(new URL("/make", page.url()).toString());
    await ready(other);
    await expect(staples(other).locator("summary")).toHaveText(
      "Assume I always have (5)",
    );
    await staples(other).locator("summary").click();
    await expect(staples(other).getByTestId("staples-chips")).toContainText(
      "soy sauce",
    );

    /* A guest's staples are its browser's alone. */
    const guest = await browser.newPage();
    await guest.goto(new URL("/make", page.url()).toString());
    await ready(guest);
    await expect(staples(guest).locator("summary")).toHaveText(
      "Assume I always have (4)",
    );
    await other.close();
    await guest.close();
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

  test("the question's kind word scopes to dishes, drinks or every recipe", async ({
    page,
  }) => {
    await page.goto("/make");
    await ready(page);
    await expect(ticker(page)).toHaveText(/^8 recipes/i);
    const kind = page.getByTestId("make-kind");
    await expect(kind).toHaveText("recipes");
    await expect(kind).toHaveAttribute("aria-haspopup", "menu");

    await chooseKind(page, "dishes");
    await expect(query(page)).toHaveValue("-tag:drink");
    await expect(ticker(page)).toHaveText(/^6 dishes/i);
    await expect(question(page)).toHaveText("What dishes can I make?");
    await expect(kind).toBeFocused();

    /* By keyboard: open, move, choose; the menu says what each holds. */
    await kind.press("Enter");
    const menu = page.getByRole("menu", { name: "What kind of recipe" });
    const dishes = menu.getByRole("menuitemradio", { name: /^dishes/ });
    await expect(dishes).toBeFocused();
    await expect(dishes).toHaveAttribute("aria-checked", "true");
    await expect(
      menu.getByRole("menuitemradio", { name: /^drinks/ }),
    ).toContainText("tag:drink · 2");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(query(page)).toHaveValue("tag:drink");
    await expect(ticker(page)).toHaveText(/^2 drinks/i);

    /* A remembered drinks scope reads as "drinks". */
    await page.goto("/make");
    await ready(page);
    await expect(page.getByTestId("make-kind")).toHaveText("drinks");

    await chooseKind(page, "recipes");
    await expect(query(page)).toHaveValue("");
    await expect(ticker(page)).toHaveText(/^8 recipes/i);
  });

  test("refine chips drill down a tag with no children", async ({ page }) => {
    await page.goto("/make");
    await ready(page);
    await chooseKind(page, "dishes");
    const roots = page.getByRole("group", { name: "Top-level tags" });
    await expect(roots.getByRole("button")).toHaveText([
      /^dinner/,
      /^quick/,
      /^side/,
      /^vegetarian/,
    ]);
    await expect(page.getByRole("group", { name: "Refine" })).toHaveCount(0);

    await roots.getByRole("button", { name: "side", exact: true }).click();
    await expect(query(page)).toHaveValue("-tag:drink tag:side");
    await expect(ticker(page)).toHaveText(/^2 dishes/i);
    /* Both sides are vegetarian, so that would change nothing. */
    const refine = page.getByRole("group", { name: "Refine" });
    await expect(refine.getByRole("button")).toHaveText([/^quick/]);
    /* The top row holds still while the picks drill down. */
    await expect(roots.getByRole("button")).toHaveCount(4);

    await refine.getByRole("button", { name: "quick", exact: true }).click();
    await expect(query(page)).toHaveValue("-tag:drink tag:side tag:quick");
    await expect(ticker(page)).toHaveText(/^1 dish /i);
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
    await expect(can.getByText("Shallot Rice Pilaf")).toHaveCount(0);
    await expect(section(page, "make-one-away")).toContainText(
      "Needs shallot (close: onion)",
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
    await expect(section(page, "make-one-away")).toContainText("Needs salt");

    await page
      .getByRole("button", { name: "Reset to salt, pepper, water, ice" })
      .click();
    await expect(section(page, "make-can")).toContainText("Simple Omelette");
  });

  test("pantry staples are assumed until the switch says otherwise (U5)", async ({
    page,
  }) => {
    await page.goto("/make?q=-tag:drink");
    await ready(page);
    const pantry = pantrySwitch(page);
    await expect(pantry).toBeChecked();
    await expect(page.getByTestId("pantry-staples")).toContainText(
      "flour, sugar, butter, eggs",
    );
    /* Pancakes are all pantry: one thing on the list shows them. */
    await addItems(page, "zucchini");
    await expect(section(page, "make-can")).toContainText("Pancakes");

    await pantry.uncheck();
    await expect(section(page, "make-can")).toContainText(
      "Nothing to make yet.",
    );
    await expect(ticker(page)).toHaveText(/0 can make/i);

    /* Per browser: the choice survives a reload. */
    await page.reload();
    await ready(page);
    await expect(pantrySwitch(page)).not.toBeChecked();
    await pantrySwitch(page).check();
    await expect(section(page, "make-can")).toContainText("Pancakes");
  });

  test("lines read loosely: prep phrases and British names", async ({
    page,
  }) => {
    await page.goto("/make?q=-tag:drink");
    await ready(page);
    await addItems(page, "courgette, red onion, olive oil");
    const can = section(page, "make-can");
    await expect(can).toContainText("Roasted Vegetables");
    await expect(
      can
        .getByRole("link", { name: /Roasted Vegetables/ })
        .getByTestId("make-close"),
    ).toHaveCount(0);
  });
});
