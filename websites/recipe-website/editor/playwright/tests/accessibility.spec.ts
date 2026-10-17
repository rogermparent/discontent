import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/test";
import type { Page } from "@playwright/test";
import { markdownEditorReady, signIn } from "../support/helpers";
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

  /* U5/U6: the staples switch and the saved-inventory group, signed in. */
  test("make page with the saved inventory has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("make-drinks");
    await page.goto("/");
    await signIn(page);
    await page.goto("/make?q=tag:drink");
    await expect(page.getByTestId("make-ticker")).toHaveText(/can make/i, {
      timeout: 20_000,
    });
    await page.getByTestId("saved-inventory").locator("summary").click();
    await page.getByTestId("make-secondary").locator("summary").click();
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
   * hand" switched on and the Sub-recipes fold open. Both modes: the store
   * buttons, the counts and the muted notes carry colour.
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
      await expect(mirror.getByTestId("mirror-outcome")).toHaveText(
        "Not synced yet.",
      );
      await expectNoViolations(page);
      await mirror.getByRole("button", { name: "Sync now" }).click();
      await expect(mirror.getByTestId("mirror-outcome")).toContainText(
        "synced",
        { timeout: 30_000 },
      );
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
  /* U3: spirit tiles, chips and the accent-filled make panel's frame. */
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
        await expectNoViolations(page);
      });
    }
  }
});
