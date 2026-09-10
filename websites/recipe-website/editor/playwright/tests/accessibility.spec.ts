import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
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
// on opposite sides of the wheel). NB: this expanded sweep also surfaced that the
// light-mode accent curve dips just under AA in the cyan/teal band (~hue 165–215,
// worst ~4.31:1 at 190) — a pre-existing curve limitation left as a documented
// follow-up (fixing it is a curve redesign, out of PR 7 scope; see
// docs/ui-overhaul.md). These two hues sit comfortably outside that band.
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
