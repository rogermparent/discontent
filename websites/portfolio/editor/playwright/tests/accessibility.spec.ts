import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { PORTFOLIO_PRESETS } from "portfolio-website-common/theme/presets";
import type { Posture } from "portfolio-website-common/config/site";
import {
  WCAG_TAGS,
  seedTheme,
  expectMode,
  expectNoViolations,
  type Mode,
} from "../support/a11y";

/*
 * The accessibility sweep.
 *
 * The claim being tested is specific: portfolio's palette presets are derived on
 * the contrast curve in theming/derive.ts, where the accent's lightness and
 * chroma are fixed and only the hue moves. If that holds, every preset is WCAG AA
 * *by construction* — so a failure here does not mean "adjust a colour", it means
 * someone hand-authored a token instead of deriving it.
 *
 * The posture axis is the part recipe has no equivalent for: three layouts render
 * the same corpus with different markup, and an a11y regression in one of them
 * would otherwise be invisible.
 */

const MODES: Mode[] = ["light", "dark"];
const POSTURES: Posture[] = ["index", "studio", "resume"];

test.describe("Accessibility (axe)", () => {
  test("the index has no WCAG2AA violations", async ({ page, resetData }) => {
    await resetData("projects");
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("an empty index has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    // The empty state is a different tree, and it is the first thing a fork sees.
    await resetData();
    await page.goto("/");
    await expectNoViolations(page);
  });

  test("a case study has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("projects");
    await page.goto("/project/content-engine");
    await expectNoViolations(page);
  });

  test("a rendered page has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData("about-page");
    await page.goto("/about");
    await expectNoViolations(page);
  });

  test("the command palette has no WCAG2AA violations when open", async ({
    page,
    resetData,
  }) => {
    await resetData("projects");
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Sweep the *loaded* palette, not the loading one: the work rows are what
    // the corpus contributes, and they arrive over `/search/all`.
    await expect(dialog.getByText("Loading works…")).toHaveCount(0);
    await expect(
      dialog.getByRole("option", { name: /Recipe Website/ }),
    ).toBeVisible();
    await expectNoViolations(page);
  });

  test("the sign-in form has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/settings");
    await expect(
      page.getByRole("button", { name: "Sign in with Credentials" }),
    ).toBeVisible();
    await expectNoViolations(page);
  });

  test("the project form has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/projects");
    await fillSignInForm(page);
    await page.getByRole("link", { name: "New Project", exact: true }).click();
    // Gate on the form island hydrating rather than on a field merely existing:
    // on a cold dev server this route compiles on first hit, and axe would
    // otherwise analyse a half-rendered page.
    await markdownEditorReady(page, "content");
    await expect(page.getByLabel("Name")).toBeVisible();
    await expectNoViolations(page);
  });

  test("the settings area has no WCAG2AA violations", async ({
    page,
    resetData,
  }) => {
    await resetData();
    await page.goto("/settings");
    await fillSignInForm(page);
    await expect(page.getByLabel("Title")).toBeVisible();
    await expectNoViolations(page);
  });
});

test.describe("Accessibility across postures (axe)", () => {
  for (const posture of POSTURES) {
    for (const mode of MODES) {
      test(`the ${posture} posture stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
        writeSettings,
      }) => {
        await resetData("projects");
        // The posture is read from settings by the editor's homepage, so it can
        // be switched without restarting the server.
        await writeSettings({ posture });
        await seedTheme(page, PORTFOLIO_PRESETS[0].theme, mode);
        await page.goto("/");
        await expect(page.locator("main")).toHaveAttribute(
          "data-posture",
          posture,
        );
        await expectMode(page, mode);
        await expectNoViolations(page);
      });
    }
  }
});

test.describe("Accessibility across preset themes (axe)", () => {
  for (const preset of PORTFOLIO_PRESETS) {
    for (const mode of MODES) {
      test(`${preset.key} preset stays WCAG2AA in ${mode} mode`, async ({
        page,
        resetData,
      }) => {
        await resetData("projects");
        await seedTheme(page, preset.theme, mode);
        await page.goto("/");
        await expectMode(page, mode);
        await expectNoViolations(page);
      });
    }
  }
});
