import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/test";
import type { Page } from "@playwright/test";
import {
  fillSignInForm,
  markdownEditorReady,
  signIn,
} from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { fixturePath } from "../support/tasks";
import { PRESETS, type Theme } from "@discontent/component-library/theming";
// Promoted to support/ so portfolio's sweep uses the same seeding rather than a
// third copy of it.
import {
  WCAG_TAGS as TAGS,
  seedTheme,
  expectMode,
  expectNoViolations,
  type Mode,
} from "../support/a11y";

test.describe("Accessibility (axe)", () => {
  test("homepage with recipes has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("recipe detail page has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("two-pages");
    await page.goto("/recipe/recipe-6");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("search page has no WCAG2AA violations", async ({ page, resetData }) => {
    await resetData("three-recipes");
    await page.goto("/search");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  /*
   * 42e: the almanac (ruler, countdown cards) and a holiday's menu (the
   * dot-leader groups, the kind word). Both modes and the kind menu open
   * are in holidays.spec; this is the plain sweep beside the others.
   */
  test("holiday pages have no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("drinks-bar");
    await page.goto("/holidays");
    await expect(page.getByTestId("almanac-next")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations,
    ).toEqual([]);
    await page.goto("/holidays/halloween");
    await expect(page.getByTestId("holiday-hero")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations,
    ).toEqual([]);
  });

  /* U4: the count-bar board — blocks, rows, More tags and the chips. */
  test("tag index board has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("christmas-cookies");
    await page.goto("/tags");
    await expect(page.getByTestId("tag-board")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  /*
   * U5/U6/41h: the staples switch, Count from on Both with the saved
   * labels, a featured ingredient, Save to editor's confirm, the kind menu
   * open, and both card views — signed in.
   */
  test("make page with the saved inventory has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("make-drinks");
    await page.goto("/");
    await signIn(page);
    await page.goto("/make?q=tag:drink ingredient:lime");
    /* Under `next dev`, right after sign-in, a hidden second copy of the
     * page can linger on "Loading recipes…": look inside the page's main. */
    const main = page.getByRole("main");
    await expect(main.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = main.getByTestId("inventory-input");
    await input.fill("vodka, simple syrup");
    await input.press("Enter");
    await main
      .getByRole("group", { name: "Count from" })
      .getByRole("radio", { name: /^Both/ })
      .check();
    await expect(main.getByTestId("make-second-labels")).toBeVisible();
    /* 42a: the saved labels' × and "Add to saved list" are in the scan. */
    await expect(
      main.getByRole("button", { name: "Remove gin from the saved list" }),
    ).toBeVisible();
    await expect(
      main.getByLabel("Add to saved list", { exact: true }),
    ).toBeVisible();
    await main.getByRole("button", { name: "Save to editor" }).click();
    await expect(main.getByTestId("make-save-confirm")).toBeVisible();
    await expect(main.getByTestId("make-can")).toBeVisible();
    const photos = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(photos.violations).toEqual([]);

    await main
      .getByRole("group", { name: "Cards" })
      .getByRole("radio", { name: "Specs" })
      .check();
    await expect(main.getByTestId("make-spec-cards").first()).toBeVisible();
    await main.getByTestId("make-kind").click();
    await expect(main.getByRole("menu")).toBeVisible();
    const specs = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(specs.violations).toEqual([]);
  });

  /* 42m: the bean-swap group, its tapes, and the switch beside close matches. */
  test("make page with a bean swap has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("make-beans");
    await page.goto("/make");
    const main = page.getByRole("main");
    await expect(main.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = main.getByTestId("inventory-input");
    await input.fill("pinto beans, cucumber, lemon");
    await input.press("Enter");
    await expect(main.getByTestId("make-bean-swap")).toContainText(
      "Use pinto beans for chickpea",
    );
    const photos = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(photos.violations).toEqual([]);

    await main
      .getByRole("group", { name: "Cards" })
      .getByRole("radio", { name: "Specs" })
      .check();
    await expect(
      main.getByTestId("make-bean-swap").getByTestId("make-spec-cards"),
    ).toBeVisible();
    const specs = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(specs.violations).toEqual([]);
  });

  /* 42m2: a matcher on the shelf, its refine popover open, and the cards'
   * missing tapes as buttons beside their links. */
  test("make page with a matcher and its refine popover has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("make-beans");
    await page.goto("/make");
    const main = page.getByRole("main");
    await expect(main.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    const input = main.getByTestId("inventory-input");
    await input.fill("any bean, cucumber");
    await input.press("Enter");
    await main.getByTestId("make-further").locator("summary").click();
    await main.getByTestId("make-matcher").click();
    await expect(
      page.getByRole("dialog", { name: "Which beans do you have?" }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("bookmarks empty state has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/bookmarks");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("featured-recipes listing has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("many-featured-recipes");
    await page.goto("/featured-recipes");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  /*
   * Groups (22b) are two new reader surfaces — a card grid whose cards are text
   * rather than images, and a detail page built on an ordered list with muted
   * rows for dangling items. Both are swept once here, in the default theme;
   * neither joins `THEME_PAGES`, which multiplies by preset × mode and is
   * reserved for the pages whose colour work is load-bearing.
   */
  test("groups listing has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/groups");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("group detail page has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    await page.goto("/group/week-of-may-4");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("sign-in form has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Sign in with Credentials",
        exact: true,
      }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test("new-recipe form has no WCAG2AA violations when signed in", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/new-recipe");
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // The redesigned Site details page (PR 17) is a new card surface — sweep it
  // signed-in to cover the SettingsCard family + stacked form fields.
  test("settings Site details page has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Site details" }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  // The content-sync (git) page is the densest use of the PR 15 semantic status
  // tokens (--success "in sync", --warning "no remote"/ahead-behind, --info),
  // and it isn't covered by the reader-page sweep — assert both modes here.
  for (const mode of ["light", "dark"] as const) {
    test(`content sync page has no WCAG2AA violations in ${mode} mode`, async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData("three-recipes");
      await initializeContentGit();
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await signIn(page);
      await page.goto("/git");
      await expectMode(page, mode);
      await expect(
        page.getByRole("heading", { name: "Content Sync" }),
      ).toBeVisible();
      await expectNoViolations(page);
    });
  }

  /*
   * 37c: the import jobs — `/jobs` (the queue, the table, the filters), a
   * job's page (the timeline, the raw log open) and the form's progress
   * panel while an import runs (the slow yt-dlp stand-in holds it live) —
   * in both modes: the status badges and the timeline's bars carry colour.
   */
  for (const mode of ["light", "dark"] as const) {
    test(`jobs pages and the import panel have no WCAG2AA violations in ${mode} mode`, async ({
      page,
      resetData,
      writeSettings,
      baseURL,
    }) => {
      await resetData("importable-uploads");
      await writeSettings({
        ytdlpPath: fixturePath("yt-dlp", "ytdlp-mimic.mjs"),
      });
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await signIn(page);

      /* A job to list and to open: an inspect through the API. */
      const inspected = await page.request.post("/api/inspect", {
        data: { url: new URL("/uploads/naan.html", baseURL!).href },
      });
      expect(inspected.ok()).toBe(true);
      const { job } = (await inspected.json()) as { job: string };

      await page.goto("/jobs");
      await expectMode(page, mode);
      await expect(page.locator(`[data-job="${job}"]`)).toBeVisible();
      await expectNoViolations(page);

      await page.goto(`/jobs/${job}`);
      await expect(page.getByTestId("job-timeline")).toBeVisible();
      await page.getByText(/^Raw log/).click();
      await expectNoViolations(page);

      await page.goto("/new-recipe");
      await page
        .getByLabel("Import from URL", { exact: true })
        .fill("https://www.youtube.com/watch?v=SLOW_TEST");
      await page.getByRole("button", { name: "Import", exact: true }).click();
      const panel = page.getByTestId("import-progress");
      await expect(panel.locator('[data-step="ytdlp"]')).toHaveAttribute(
        "data-status",
        "running",
      );
      await expectNoViolations(page);
      /* Then it ends, folded. */
      await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
        "Import done",
        { timeout: 15_000 },
      );
      await expectNoViolations(page);
    });
  }
});

/*
 * 40g: the pages added since the sweep above was written. Each is swept once,
 * signed in, in the default theme; the surfaces whose status colours carry
 * meaning (the shopping list, a remote's cards on /git) are swept in both
 * modes below. `ready` waits for what the page is about to be on screen, so
 * axe never reads a half-rendered page.
 */
const EDITOR_PAGES: Array<{
  path: string;
  fixture?: string;
  ready: (page: Page) => Promise<void>;
}> = [
  /* The listing and a reader page of the site's own pages and menus. */
  {
    path: "/recipes",
    fixture: "three-recipes",
    ready: mainVisible,
  },
  {
    path: "/about",
    fixture: "about-page",
    ready: mainVisible,
  },
  /* The settings area. */
  {
    path: "/settings/theme",
    fixture: "three-recipes",
    ready: (page) => expect(page.getByTestId("theme-preview")).toBeVisible(),
  },
  {
    path: "/settings/tools",
    fixture: "three-recipes",
    ready: (page) => headingVisible(page, "Tools"),
  },
  {
    path: "/settings/maintenance",
    fixture: "three-recipes",
    ready: (page) => headingVisible(page, "Maintenance"),
  },
  {
    path: "/export",
    fixture: "three-recipes",
    ready: (page) =>
      expect(page.getByRole("button", { name: "Build" })).toBeVisible(),
  },
  {
    path: "/pages",
    fixture: "about-page",
    ready: mainVisible,
  },
  {
    path: "/menus",
    fixture: "three-recipes",
    ready: mainVisible,
  },
  /* The edit forms the new-recipe sweep doesn't reach. */
  {
    path: "/recipe/first-recipe/edit",
    fixture: "three-recipes",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
  {
    path: "/recipe/first-recipe/copy",
    fixture: "three-recipes",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
  {
    path: "/group/new",
    fixture: "three-recipes-groups",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
  {
    path: "/group/week-of-may-4/edit",
    fixture: "three-recipes-groups",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
  {
    path: "/featured-recipe/featured-weeknight",
    fixture: "three-recipes-groups",
    ready: (page) => expect(page.locator("main")).toBeVisible(),
  },
  {
    path: "/featured-recipe/featured-weeknight/edit",
    fixture: "three-recipes-groups",
    ready: (page) =>
      expect(page.locator("#featured-recipe-form")).toBeVisible(),
  },
  {
    path: "/featured-recipe/new?recipe=first-recipe",
    fixture: "three-recipes-groups",
    ready: (page) =>
      expect(page.locator("#featured-recipe-form")).toBeVisible(),
  },
  {
    path: "/pages/new",
    fixture: "about-page",
    ready: (page) => expect(page.locator("#page-form")).toBeVisible(),
  },
  {
    path: "/pages/edit/about",
    fixture: "about-page",
    ready: (page) => expect(page.locator("#page-form")).toBeVisible(),
  },
  {
    path: "/menus/edit/header",
    fixture: "three-recipes",
    ready: (page) => expect(page.locator("#menu-form")).toBeVisible(),
  },
  /*
   * The term pages (31b/31e) on `christmas-cookies`: Cookies has a
   * breadcrumb and pinned recipes, Dessert lists its narrower terms, and
   * the term form opens new and on a record.
   */
  {
    path: "/tags/cookies",
    fixture: "christmas-cookies",
    ready: (page) => expect(page.getByTestId("term-breadcrumb")).toBeVisible(),
  },
  {
    path: "/tags/dessert",
    fixture: "christmas-cookies",
    ready: (page) => expect(page.getByTestId("term-children")).toBeVisible(),
  },
  {
    path: "/tags/new",
    fixture: "christmas-cookies",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
  {
    path: "/tags/cookies/edit",
    fixture: "christmas-cookies",
    ready: (page) => markdownEditorReady(page, "description").then(() => {}),
  },
];

async function headingVisible(page: Page, name: string): Promise<void> {
  await expect(
    page.getByRole("heading", { name, exact: true }).first(),
  ).toBeVisible();
}

async function mainVisible(page: Page): Promise<void> {
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/*
 * One top-level `<main>`. These are axe best-practice rules, outside the
 * WCAG tags, so they're named here: the settings area once wrapped every
 * page's own `<main>` in a second one (40g).
 */
const LANDMARK_RULES = [
  "landmark-main-is-top-level",
  "landmark-no-duplicate-main",
  "landmark-one-main",
  "landmark-unique",
];

async function expectOneMain(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withRules(LANDMARK_RULES)
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Accessibility of the editor's other pages (axe, 40g)", () => {
  for (const { path, fixture, ready } of EDITOR_PAGES) {
    test(`${path} has no WCAG2AA violations signed in`, async ({
      page,
      resetData,
    }) => {
      await resetData(fixture);
      await page.goto("/");
      await signIn(page);
      await page.goto(path);
      await ready(page);
      await expectNoViolations(page);
      await expectOneMain(page);
    });
  }

  /*
   * `/shopping` with a plan and a recipe whose sub-recipe expanded on it:
   * the settings sheet open, then the list with stores and "Probably on
   * hand" switched on and the Sub-recipes fold open; then (42g) the
   * in-store view. Both modes: the store buttons, the counts and the muted
   * notes carry colour.
   */
  for (const mode of ["light", "dark"] as const) {
    test(`shopping list with items has no WCAG2AA violations in ${mode} mode`, async ({
      page,
      resetData,
      initializeContentGit,
    }) => {
      await resetData("shopping");
      await initializeContentGit();
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await signIn(page);
      for (const data of [
        { group: "week-of-oct-19" },
        { recipe: "lemonade" },
      ]) {
        const added = await page.request.post("/api/shopping", { data });
        expect(added.ok()).toBe(true);
      }
      await page.goto("/shopping");
      await expectMode(page, mode);
      await expect(page.getByTestId("shopping-page")).toHaveAttribute(
        "data-ready",
        "true",
        { timeout: 30_000 },
      );
      await expect(page.getByTestId("shopping-list")).toContainText("eggs");
      await expectNoViolations(page);

      await page.getByRole("button", { name: "Settings" }).click();
      const sheet = page.getByTestId("shopping-settings");
      await expect(sheet).toBeVisible();
      await expectNoViolations(page);
      await sheet.getByLabel(/^Stores/).check();
      await sheet.getByLabel(/^On hand/).check();
      await sheet.getByRole("button", { name: "Save settings" }).click();
      await expect(sheet).toHaveCount(0);

      await expect(page.getByTestId("shopping-probably-have")).toBeVisible();
      const subRecipes = page.getByTestId("shopping-subrecipes");
      await subRecipes.getByText(/^Sub-recipes/).click();
      await expect(subRecipes.getByTestId("shopping-subrecipe")).toBeVisible();
      const eggs = page.getByTestId("shopping-row").filter({ hasText: "eggs" });
      await eggs.getByText(/^from \d+ recipes?/).click();
      await expect(eggs.getByTestId("shopping-sources")).toBeVisible();
      await expectNoViolations(page);

      /*
       * 42g's in-store view: the store select, the progress bar, the aisle
       * rail, a ticked row struck in place, an aisle folded away as done,
       * an on-hand line opened, and the add box in the bottom bar.
       */
      await page
        .getByRole("group", { name: "Mode" })
        .getByRole("button", { name: "Shop" })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Aisles" }),
      ).toBeVisible();
      await page.getByLabel("Store", { exact: true }).selectOption("hannaford");
      await page.getByLabel("10 eggs", { exact: true }).check();
      await page
        .getByRole("button", { name: "Aisle done: Dairy & eggs" })
        .click();
      await expect(page.getByTestId("shopping-aisle-done")).toBeVisible();
      await page
        .getByRole("button", { name: /^Show what is probably on hand/ })
        .first()
        .click();
      await page.getByRole("button", { name: "Add an item" }).click();
      await expect(page.getByTestId("shopping-add")).toBeVisible();
      /*
       * Tall enough that nothing scrolls. The store bar and the bottom bar
       * are pinned; scrolled, they cover whatever passes under them, and
       * axe's target-size rule calls a control there "partially obscured"
       * — a matter of where the page stopped, not of the page.
       */
      await page.setViewportSize({ width: 1280, height: 2400 });
      await expectNoViolations(page);
    });
  }

  /*
   * `/git` with a remote: the remote's ahead/behind status and the Mirrors
   * card holding one mirror after a sync — both modes, as the plain /git
   * sweep above.
   */
  for (const mode of ["light", "dark"] as const) {
    test(`content sync page with a remote and a mirror has no WCAG2AA violations in ${mode} mode`, async ({
      page,
      resetData,
      initializeContentGit,
      createBareRemote,
      addRemoteAndPush,
    }) => {
      await resetData("three-recipes");
      await initializeContentGit();
      const remote = await createBareRemote();
      await addRemoteAndPush(remote);
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await signIn(page);
      await page.goto("/git");
      await expectMode(page, mode);
      const card = page.getByTestId("mirrors-card");
      await card.getByRole("button", { name: "Add mirror" }).click();
      const mirror = card.getByTestId("mirror-origin");
      const outcome = mirror.getByTestId("mirror-outcome");
      /*
       * Any first state, not "Not synced yet.": the workstation's sync
       * runner outlives `resetData`, so a run the test before queued (with
       * that test's `origin` mirror) can land in this test's fresh
       * repository and record an error under `origin` — CI, dark after
       * light: "The branch changed from main to HEAD during the sync". The
       * card is checked in whichever state it shows; Sync now must then
       * succeed — `nothing` (the push left the mirror in step) or `synced`.
       * (Not `toContainText("synced")`: "Not synced yet." matches it.) (40g)
       */
      await expect(outcome).toBeVisible();
      await expectNoViolations(page);
      const syncNow = mirror.getByRole("button", { name: "Sync now" });
      await expectHydrated(syncNow);
      await syncNow.click();
      await expect(outcome).toHaveText(/^Last sync .*: (nothing|synced)/, {
        timeout: 30_000,
      });
      await expectNoViolations(page);
    });
  }
});

/* A mirror's /git: the "Synced by" card in place of Mirrors (28c). */
test.describe("Accessibility of a mirror's content sync page (axe, 40g)", () => {
  test.afterEach(async ({ request }) => {
    await request.get("/settings/test-editor-role?role=workstation");
  });

  test("a mirror's /git has no WCAG2AA violations", async ({
    page,
    request,
    resetData,
    initializeContentGit,
  }) => {
    await request.get("/settings/test-editor-role?role=mirror");
    await resetData("three-recipes");
    await initializeContentGit();
    await page.goto("/");
    await signIn(page);
    await page.goto("/git");
    await expect(
      page
        .getByTestId("workstation-card")
        .getByRole("heading", { name: "Synced by the workstation" }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
});

// The derivation curve fixes accent lightness/chroma (and neutral lightnesses),
// so any accent/neutral choice must keep the palette WCAG2AA — in *both* modes.
// Sweep every built-in preset (the default working-bench included) applied as a
// visitor override × light/dark across a representative page set. This is the
// load-bearing coverage for "contrast across palette + custom themes in both
// modes": it adds the previously-missing dark axe, the omitted default preset,
// and pages beyond `/`.
const THEME_PAGES: Array<{ path: string; fixture: string }> = [
  { path: "/", fixture: "three-recipes" },
  { path: "/recipe/recipe-6", fixture: "two-pages" },
  { path: "/search", fixture: "three-recipes" },
  /* U3, 42d: the shelf's tapes, Pour now, the holiday badges, the index. */
  { path: "/drinks", fixture: "drinks-bar" },
];

const MODES: Mode[] = ["light", "dark"];

test.describe("Accessibility across preset themes (axe)", () => {
  for (const preset of PRESETS) {
    for (const mode of MODES) {
      test(`${preset.key} preset stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
      }) => {
        await seedTheme(page, preset.theme, mode);
        for (const { path, fixture } of THEME_PAGES) {
          await resetData(fixture);
          await page.goto(path);
          await expectMode(page, mode);
          await expectNoViolations(page);
        }
      });
    }
  }
});

// Off-preset custom themes built via the knob→deriveTheme path exercise AA at
// accent hues + neutral pairings no built-in preset uses (berry 320, amber 25 —
// on opposite sides of the wheel), plus teal 190 in the cyan/teal band. This
// sweep is what surfaced that band dipping just under AA (worst ~4.31:1 at 190);
// epic 30b darkened the light accent there only, and `test/theming.test.ts` now
// checks every hue. The teal theme keeps axe rendering the band itself.
const CUSTOM_THEMES: Array<{ label: string; theme: Theme }> = [
  {
    label: "berry-gray",
    theme: {
      accentHue: 320,
      neutral: "gray",
      radius: 0.5,
      fontPairing: "bench",
      defaultMode: "system",
    },
  },
  {
    label: "amber-warm",
    theme: {
      accentHue: 25,
      neutral: "warm",
      radius: 0.5,
      fontPairing: "grotesk",
      defaultMode: "system",
    },
  },
  /*
   * The cyan/teal band (epic 30b): the one place the light accent used to fall
   * under AA (~4.31:1 at 190). Kept here so axe renders the band, not just the
   * unit sweep in `test/theming.test.ts`.
   */
  {
    label: "teal-cool",
    theme: {
      accentHue: 190,
      neutral: "cool",
      radius: 0.5,
      fontPairing: "bench",
      defaultMode: "system",
    },
  },
];

test.describe("Accessibility across custom themes (axe)", () => {
  for (const { label, theme } of CUSTOM_THEMES) {
    for (const mode of MODES) {
      test(`custom ${label} theme stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
      }) => {
        await resetData("three-recipes");
        await seedTheme(page, theme, mode);
        await page.goto("/");
        await expectMode(page, mode);
        await expectNoViolations(page);
      });
    }
  }
});

/*
 * The phone chrome (usability pass, U2): the tab bar and the masthead's search
 * icon render only below `sm`, so only the `mobile` project's sweep sees them.
 */
test.describe("Accessibility on a phone @mobile", () => {
  for (const mode of MODES) {
    for (const { path, fixture } of [
      { path: "/", fixture: "three-recipes" },
      { path: "/drinks", fixture: "drinks-bar" },
      /* 42e: the almanac and a holiday's menu. */
      { path: "/holidays", fixture: "drinks-bar" },
      { path: "/holidays/halloween", fixture: "drinks-bar" },
    ]) {
      test(`${path} with the tab bar stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
      }) => {
        await resetData(fixture);
        await page.emulateMedia({ colorScheme: mode });
        await page.goto(path);
        await expectMode(page, mode);
        await expect(page.getByTestId("phone-tab-bar")).toBeVisible();
        /*
         * Target size (WCAG 2.2, 2.5.8) is measured apart (41f, Tf2). axe
         * judges it at the current scroll position, and the pinned tab bar
         * covers whatever straddles the fold — /drinks' family chips once (before 42d), 9 px of
         * them showing — which scrolling uncovers. So the full sweep runs with
         * the bar pinned and without `target-size`, then `target-size` alone
         * runs with the chrome released (the reader's own "off" setting). The
         * bar's links are still checked: released, the bar sits in the
         * document flow after the content instead of over it, so no scroll
         * step is needed.
         */
        const pinned = await new AxeBuilder({ page })
          .withTags(TAGS)
          .disableRules(["target-size"])
          .analyze();
        expect(pinned.violations).toEqual([]);
        await page.evaluate(() => {
          document.documentElement.dataset.stickyChrome = "off";
        });
        const released = await new AxeBuilder({ page })
          .withRules(["target-size"])
          .analyze();
        expect(released.violations).toEqual([]);
      });
    }
  }
});

/*
 * 43e1: edit form B on a phone — the jump row of sections and the save bar
 * pinned above the tab bar, signed in. As above: the full sweep with the
 * chrome pinned and without `target-size`, then `target-size` alone with
 * it released.
 */
test.describe("Accessibility of the edit form on a phone @mobile", () => {
  for (const mode of MODES) {
    for (const path of ["/recipe/classic-daiquiri/edit", "/new-recipe"]) {
      test(`${path} with the save bar stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
      }) => {
        await resetData("drinks-bar");
        await page.emulateMedia({ colorScheme: mode });
        await page.goto(path);
        await fillSignInForm(page);
        await markdownEditorReady(page, "description");
        await expectMode(page, mode);
        await expect(page.getByTestId("recipe-form-savebar")).toBeVisible();
        const pinned = await new AxeBuilder({ page })
          .withTags(TAGS)
          .disableRules(["target-size"])
          .analyze();
        expect(pinned.violations).toEqual([]);
        await page.evaluate(() => {
          document.documentElement.dataset.stickyChrome = "off";
        });
        const released = await new AxeBuilder({ page })
          .withRules(["target-size"])
          .analyze();
        expect(released.violations).toEqual([]);
      });
    }
  }
});
