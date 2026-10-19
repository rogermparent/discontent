import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { expectNoViolations } from "../support/a11y";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";

/*
 * `/drinks` — canvas B, "Pour from your shelf" (42d) — against `drinks-bar`:
 * `make-drinks`' five drinks (Vodka Sour, Gin and Tonic, Zero-Proof G&T,
 * Lavender Gnista Tonic, Chamomile Collins), its Lavender Syrup and Hand
 * Pies, plus term records for a `spirit` root (Vodka, Gin), `shaken`, a
 * `gin-and-tonic` family and a `holidays` root — Halloween on the Vodka Sour
 * (and on Hand Pies, which is no drink), Christmas on the Chamomile Collins
 * — and (38a) a `daiquiri` family with two sources: the Daiquiri, and a
 * Classic Daiquiri tagged only with the family's alias `daiquiris`. The
 * saved inventory is gin and tonic water.
 *
 * The shelf counts this browser's list (U6) unless Count from — `/make`'s
 * per-browser setting (41h) — chooses the second list; each test starts from
 * a fresh context with neither, and `withBrowserList` seeds one. The clock
 * is frozen on 28 October 2026 — Halloween in 3 days, Christmas in 58, both
 * in season — so the holidays hold still, and the fixture's drinks (dated
 * 21 September 2026, minutes apart) are past the 30-day NEW mark; the NEW
 * test sets the clock between them.
 */

const FROZEN = new Date(2026, 9, 28, 12);
/** The fixture's dates: `1790000000000` plus a minute or so per drink. */
const FIXTURE_EPOCH = 1_790_000_000_000;

const shelf = (page: Page) => page.getByTestId("drinks-shelf");
const source = (page: Page) => page.getByTestId("drinks-shelf-source");
const labels = (page: Page) =>
  page.getByRole("list", { name: "On the shelf" }).getByRole("listitem");
const pour = (page: Page) => page.getByTestId("drinks-pour");
const countFrom = (page: Page) =>
  page.getByRole("group", { name: "Count from" });

async function withBrowserList(page: Page, items: string[]) {
  await page.addInitScript((added) => {
    localStorage.setItem(
      "make-inventory-v1",
      JSON.stringify({ added, removed: [] }),
    );
  }, items);
}

/** The shelf has read storage, and Pour now has judged (or invites). */
async function shelfReady(page: Page) {
  await expect(source(page)).not.toHaveText(/Reading your shelf/, {
    timeout: 20_000,
  });
  await expect(pour(page).locator("[aria-busy=true]")).toHaveCount(0, {
    timeout: 20_000,
  });
}

test.describe("Drinks", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(FROZEN);
  });

  test("opens on the question over this browser's shelf, Pour now and Buy next", async ({
    page,
  }) => {
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await shelfReady(page);

    /* The question is an h1 (`make-question`, as on /make; the masthead's
     * brand is the other), its kind fixed: the word goes to Make. */
    const question = page.getByRole("heading", {
      level: 1,
      name: "What drinks can I make?",
    });
    await expect(question).toHaveText("What drinks can I make?");
    await expect(question).toHaveAttribute("data-testid", "make-question");
    await expect(
      question.getByRole("link", { name: "drinks" }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink");
    await expect(page.getByTestId("drinks-count")).toHaveText(
      "Drinks · 7 in the book",
    );

    await expect(source(page)).toHaveText(
      "From this browser's list — 2 things on the shelf. Tap a label to ask about it.",
    );
    await expect(labels(page)).toHaveText(["gin", "tonic water"]);
    for (const label of await labels(page).all()) {
      await expect(label).toHaveAttribute("data-kind", "have");
    }
    /* A label asks Make "What drinks can I make with gin?". */
    await expect(
      labels(page).getByRole("link", { name: "gin", exact: true }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink%20ingredient%3Agin");
    await expect(page.getByTestId("make-ticker")).toHaveText(
      /^7 drinks · 1 can make · 1 one away/,
    );

    await expect(
      pour(page).getByRole("heading", { name: "Pour now 1" }),
    ).toBeVisible();
    const ready = page.getByTestId("drinks-ready").getByRole("link");
    await expect(ready).toHaveCount(1);
    await expect(ready).toContainText("Gin and Tonic");
    await expect(ready).toContainText("Gin · Highball");
    await expect(ready).toHaveAttribute("href", "/recipe/gin-and-tonic");

    /* Gin never stands in for non-alcoholic gin (make.spec), so the
     * Zero-Proof G&T is one away and that is the first thing to buy. */
    const buyNext = page.getByTestId("buy-next");
    await expect(buyNext.getByRole("listitem").first()).toContainText(
      "non-alcoholic gin",
    );
    await expect(buyNext.getByRole("listitem").first()).toContainText(
      "makes 1 more",
    );
    await expect(
      page.getByRole("link", { name: "Open in Make" }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink");

    await labels(page).getByRole("link", { name: "gin", exact: true }).click();
    await expect(page.getByTestId("make-question")).toHaveText(
      "What drinks can I make with gin?",
    );
  });

  test("an empty shelf invites, never the saved inventory, never an error", async ({
    page,
  }) => {
    /* With nothing to judge the shelf needs no ingredient lines, so their
     * failure (search's own index fill still asks for them) never turns the
     * invitation into an error. */
    await page.route("**/search/ingredients", (route) => route.abort());
    const aborted = page.waitForEvent("requestfailed", (request) =>
      request.url().includes("/search/ingredients"),
    );
    await page.goto("/drinks");
    await aborted;
    await shelfReady(page);
    await expect(source(page)).toHaveText(
      "Nothing on the shelf yet — this browser's list is empty.",
    );
    await expect(page.getByTestId("drinks-pour-empty")).toBeVisible();
    await expect(pour(page)).not.toContainText("Drinks are unavailable");
    await expect(labels(page)).toHaveCount(0);
    /* A guest has no second list, so no Count from. */
    await expect(countFrom(page)).toHaveCount(0);
  });

  test("adding to the shelf pours, by family, and Undo takes it back", async ({
    page,
  }) => {
    await page.goto("/drinks");
    await shelfReady(page);
    const field = page.getByLabel("Add to the shelf", { exact: true });
    await expectHydrated(field);
    await field.fill("white rum, lime, simple syrup");
    await field.press("Enter");
    await expect(field).toHaveValue("");
    await expect(labels(page)).toHaveText([
      "white rum",
      "lime",
      "simple syrup",
    ]);
    await shelfReady(page);

    /* Both daiquiris pour — one of them only by the family's alias — as
     * one entry (38a). */
    const ready = page.getByTestId("drinks-ready").getByRole("link");
    await expect(ready).toHaveCount(1);
    await expect(ready).toContainText("Daiquiri · 2 drinks");
    await expect(ready).toHaveAttribute("href", "/tags/daiquiri");

    const toast = page.getByTestId("make-toast");
    await expect(toast).toContainText("Added 3 items.");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(labels(page)).toHaveCount(0);
    await expect(source(page)).toHaveText(
      "Nothing on the shelf yet — this browser's list is empty.",
    );
  });

  test("signed in, Count from offers the saved list, and the shelf is what counts", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/drinks");
    await shelfReady(page);

    /* This browser's list leads (U6): empty, and the saved list waits. */
    await expect(source(page)).toHaveText(
      "Nothing on the shelf yet — this browser's list is empty.",
    );
    await expect(
      countFrom(page).getByRole("radio", { name: /^This browser\s*0 items/ }),
    ).toBeChecked();
    const saved = countFrom(page).getByRole("radio", {
      name: /^Saved list\s*2 items/,
    });
    await expectHydrated(saved);
    await saved.check();

    await expect(source(page)).toHaveText(
      "From your saved list — 2 things on the shelf. Tap a label to ask about it.",
    );
    await expect(labels(page)).toHaveText(["gin", "tonic water"]);
    for (const label of await labels(page).all()) {
      await expect(label).toHaveAttribute("data-kind", "saved");
    }
    await shelfReady(page);
    await expect(page.getByTestId("drinks-ready")).toContainText(
      "Gin and Tonic",
    );
    /* The saved list is edited on Make (42a), never from here. */
    const note = page.getByTestId("drinks-not-counted");
    await expect(note).toContainText("Counting from the saved list");
    await expect(
      note.getByRole("link", { name: "edit it on Make" }),
    ).toHaveAttribute("href", "/make?q=tag%3Adrink");
    await expect(
      shelf(page).getByRole("button", { name: /^Remove/ }),
    ).toHaveCount(0);

    /* An add still goes on this browser's list — on the shelf, muted and
     * uncounted, as /make shows it. */
    const field = page.getByLabel("Add to the shelf", { exact: true });
    await field.fill("vodka");
    await field.press("Enter");
    await expect(labels(page)).toHaveText(["gin", "tonic water", "vodka"]);
    await expect(labels(page).last()).toHaveAttribute("data-kind", "have");
    await expect(labels(page).last()).toHaveAttribute("data-counted", "false");
    await expect(source(page)).toHaveText(
      "From your saved list — 2 things on the shelf. Tap a label to ask about it.",
    );

    /* One setting with /make: it counts from the saved list there too. */
    await page.goto("/make?q=tag:drink");
    await expect(
      countFrom(page).getByRole("radio", { name: /^Saved list/ }),
    ).toBeChecked();
  });

  test("the seasonal pair follows the browser's date, each to its menu", async ({
    page,
  }) => {
    await page.goto("/drinks");
    const season = page.getByTestId("drinks-season");
    await expect(
      season.getByRole("heading", { name: "In season" }),
    ).toBeVisible();
    const now = season.locator("[data-slot=now]");
    const next = season.locator("[data-slot=next]");
    await expect(now).toContainText("Now");
    await expect(now.getByRole("heading", { level: 3 })).toHaveText(
      "Halloween",
    );
    await expect(now).toContainText("in 3 days");
    await expect(
      now.getByRole("link", { name: "Halloween", exact: true }),
    ).toHaveAttribute("href", "/holidays/halloween");
    await expect(
      now.getByRole("link", { name: "All 1 Halloween drink" }),
    ).toHaveAttribute("href", "/holidays/halloween?kind=drinks");
    /* Drinks only: the Halloween hand pies are not one. */
    await expect(now.getByRole("listitem")).toHaveCount(1);
    await expect(now.getByRole("listitem")).toContainText("Vodka Sour");

    /* There is no Thanksgiving term, so Christmas is next, 58 days off. */
    await expect(next.getByRole("heading", { level: 3 })).toHaveText(
      "Christmas",
    );
    await expect(next).toContainText("in 58 days");
    await expect(
      next.getByRole("link", { name: "All 1 Christmas drink" }),
    ).toHaveAttribute("href", "/holidays/christmas?kind=drinks");
    await expect(next.getByRole("listitem")).toContainText("Chamomile Collins");
    await expect(page.getByTestId("drinks-season-then")).toHaveCount(0);

    /* 15 October: Christmas is 71 days off, past 38a's 60-day window, so
     * Halloween stands alone and Christmas is a quiet line to its menu. */
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await page.reload();
    await expect(season.getByRole("heading", { level: 3 })).toHaveText([
      "Halloween",
    ]);
    await expect(now).toContainText("in 16 days");
    const then = page.getByTestId("drinks-season-then");
    await expect(then).toHaveText("Then Christmas, in 71 days — 1 drink.");
    await expect(then.getByRole("link", { name: "Christmas" })).toHaveAttribute(
      "href",
      "/holidays/christmas?kind=drinks",
    );

    /* After Halloween, Christmas alone; next Halloween (364 days) is past
     * even the 180-day window, so no line. */
    await page.clock.setFixedTime(new Date(2026, 10, 1, 12));
    await page.reload();
    await expect(season.getByRole("heading", { level: 3 })).toHaveText([
      "Christmas",
    ]);
    await expect(now).toContainText("in 54 days");
    await expect(then).toHaveCount(0);

    /* The day after Christmas nothing is within 60 days: no section. */
    await page.clock.setFixedTime(new Date(2026, 11, 26, 12));
    await page.reload();
    await shelfReady(page);
    await expect(season).toHaveCount(0);
  });

  test("browse the bar: spirit & base, style and the classics", async ({
    page,
  }) => {
    await page.goto("/drinks");
    const index = page.getByTestId("drinks-index");
    await expect(
      index.getByRole("heading", { name: "Browse the bar" }),
    ).toBeVisible();
    const groups = index.getByTestId("drinks-index-group");
    await expect(groups.nth(0).getByRole("listitem")).toHaveText([
      "Vodka 2",
      "Gin 1",
    ]);
    /* Most drinks first; a tie keeps the documented style order. */
    await expect(groups.nth(1).getByRole("listitem")).toHaveText([
      "Highball 3",
      "Zero-proof 2",
      "Sour 1",
      "Collins 1",
      "Shaken 1",
    ]);
    /* A child of `drink` that is no style is a classic. */
    await expect(groups.nth(2)).toContainText("Classics · 2 families");
    await expect(groups.nth(2).getByRole("listitem")).toHaveText([
      "Daiquiri 2",
      "Gin and Tonic 2",
    ]);
    await expect(
      index.getByRole("link", { name: "All 7 drinks" }),
    ).toHaveAttribute("href", "/tags/drink");
    await groups
      .nth(0)
      .getByRole("link", { name: /^Vodka/ })
      .click();
    await expect(page).toHaveURL(/\/tags\/vodka$/);
  });

  test("NEW marks a drink dated within 30 days, and only those", async ({
    page,
  }) => {
    /* 30 days and 150 s after the fixture's epoch: the Vodka Sour (+60 s)
     * is just past 30 days, the Chamomile Collins (+360 s) just inside. */
    await page.clock.setFixedTime(
      FIXTURE_EPOCH + 30 * 24 * 60 * 60 * 1000 + 150_000,
    );
    await withBrowserList(page, [
      "vodka",
      "lime juice",
      "simple syrup",
      "chamomile-infused vodka",
      "lemon juice",
      "club soda",
    ]);
    await page.goto("/drinks");
    await shelfReady(page);
    const ready = page.getByTestId("drinks-ready").getByRole("link");
    const collins = ready.filter({ hasText: "Chamomile Collins" });
    const sour = ready.filter({ hasText: "Vodka Sour" });
    await expect(collins).toContainText("NEW");
    await expect(sour).toBeVisible();
    await expect(sour).not.toContainText("NEW");
    /* The seasonal card is judged the same way. */
    const halloween = page
      .getByTestId("drinks-season")
      .locator("[data-slot=now]");
    await expect(halloween.getByRole("listitem")).toContainText("Vodka Sour");
    await expect(halloween.getByRole("listitem")).not.toContainText("NEW");
  });

  test("the masthead marks Drinks as the current page", async ({ page }) => {
    await page.goto("/drinks");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Drinks" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveTitle("Drinks");
  });

  test("has no WCAG2AA violations, empty or pouring, light or dark", async ({
    page,
  }) => {
    await page.goto("/drinks");
    await shelfReady(page);
    await expectNoViolations(page);

    await withBrowserList(page, ["gin", "tonic water"]);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      await shelfReady(page);
      await expect(page.getByTestId("drinks-ready")).toBeVisible();
      await expect(page.getByTestId("drinks-season")).toBeVisible();
      await expectNoViolations(page);
    }
  });

  test("the drinks page @visual", async ({ page }) => {
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await shelfReady(page);
    await expect(page.getByTestId("drinks-ready")).toBeVisible();
    await expect(page.getByTestId("drinks-season")).toBeVisible();
    await snapshotPage(page, "drinks-page.png");
  });
});

/*
 * The house list (42a's shape, Ta1): an export with "Share my saved
 * inventory on the export" on — the editor guest's page reads the same
 * `SITE_HOUSE_INVENTORY` the export's build bakes, which the test-only
 * `/settings/test-house-inventory?bake=1` sets in the server process.
 */
test.describe("Drinks — the house list (export / guest)", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(FROZEN);
  });
  test.afterEach(async ({ request }) => {
    await request.get("/settings/test-house-inventory");
  });

  const bake = async (request: APIRequestContext) => {
    const response = await request.get("/settings/test-house-inventory?bake=1");
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { items: string[] }).items;
  };

  test("shared, a guest can count from it: outlined, read-only", async ({
    page,
    request,
    writeSettings,
  }) => {
    /* Off, the default: nothing baked, no Count from. */
    expect(await bake(request)).toEqual([]);
    await page.goto("/drinks");
    await shelfReady(page);
    await expect(countFrom(page)).toHaveCount(0);

    await writeSettings({ shareInventoryOnExport: true });
    expect(await bake(request)).toEqual(["gin", "tonic water"]);
    await page.reload();
    await shelfReady(page);
    const house = countFrom(page).getByRole("radio", {
      name: /^House list\s*2 items/,
    });
    await expectHydrated(house);
    await house.check();

    await expect(source(page)).toHaveText(
      "From the house list — 2 things on the shelf. Tap a label to ask about it.",
    );
    await expect(labels(page)).toHaveText(["gin", "tonic water"]);
    for (const label of await labels(page).all()) {
      await expect(label).toHaveAttribute("data-kind", "saved");
    }
    await shelfReady(page);
    await expect(page.getByTestId("drinks-ready")).toContainText(
      "Gin and Tonic",
    );
    await expect(page.getByTestId("drinks-not-counted")).toContainText(
      "Counting from the house list, which is read-only.",
    );
    await expect(
      shelf(page).getByRole("button", { name: /^Remove/ }),
    ).toHaveCount(0);
  });
});

test.describe("Drinks @mobile", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("drinks-bar");
    await page.clock.setFixedTime(FROZEN);
  });

  test("fits a phone, with Drinks current in the tab bar and the index folded", async ({
    page,
  }) => {
    await withBrowserList(page, ["gin", "tonic water"]);
    await page.goto("/drinks");
    await shelfReady(page);
    await expect(
      page.getByTestId("phone-tab-bar").getByRole("link", { name: "Drinks" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);

    /* The index folds: Spirit & base open, the others a tap away. */
    const index = page.getByTestId("drinks-index");
    const spirits = index.getByRole("button", { name: /^Spirit & base/ });
    const styles = index.getByRole("button", { name: /^Style/ });
    await expect(spirits).toHaveAttribute("aria-expanded", "true");
    await expect(styles).toHaveAttribute("aria-expanded", "false");
    await expect(index.getByRole("link", { name: /^Highball/ })).toBeHidden();

    await expect(page.getByTestId("drinks-ready")).toBeVisible();
    await expect(page.getByTestId("drinks-season")).toBeVisible();
    await snapshotPage(page, "drinks-page.png");
    /* With the chrome released (41f's Tf2): the pinned tab bar covers
     * whatever straddles the fold, which axe's target-size counts. */
    await page.evaluate(() => {
      document.documentElement.dataset.stickyChrome = "off";
    });
    await expectNoViolations(page);

    await expectHydrated(styles);
    await styles.click();
    await expect(styles).toHaveAttribute("aria-expanded", "true");
    await expect(index.getByRole("link", { name: /^Highball/ })).toBeVisible();
  });
});
