import { test, expect, type Page } from "../support/test";

/*
 * The reader chrome pass: the masthead and the Ingredients header pin when
 * there's room, release below 600px of viewport height, and take an override
 * from the Appearance panel. See websites/recipe-website/docs/ui-overhaul.md.
 *
 * No screenshots here — every assertion is a computed `position`, so this spec
 * adds no baselines and can't drift with the theme.
 */

/* Hardcoded rather than imported from
 * recipe-website-common/components/AppLayout/stickyChrome.ts: that module is a
 * workspace package under node_modules, which Playwright won't transpile. The
 * duplication is deliberate — the key is a persistence contract with readers'
 * browsers, so a test that pins the literal is doing its job. */
const STORAGE_KEY = "recipe-sticky-chrome";

/** The reported case: a phone held sideways. 393px tall, well under 600. */
const LANDSCAPE_PHONE = { width: 851, height: 393 };
/** Pixel 5 held upright — the `mobile` project's own default. */
const PORTRAIT_PHONE = { width: 393, height: 851 };

/** Seed an override before first paint — the only way to exercise the
 * pre-paint script's path. Must be called before `goto`. */
async function seedStickyChrome(page: Page, value: "always" | "off") {
  await page.addInitScript(
    ([key, val]) => {
      localStorage.setItem(key, val);
    },
    [STORAGE_KEY, value] as const,
  );
}

function bannerPosition(page: Page): Promise<string> {
  return page
    .getByRole("banner")
    .evaluate((el) => getComputedStyle(el).position);
}

/*
 * `recipe.spec.ts` walks up from the Multiply field looking for a `sticky`
 * ancestor, which by construction can't observe the released state. This one
 * walks to the element that carries the policy and reports whatever position it
 * resolved to — `static` included. Keying on the class (rather than on "the
 * first positioned ancestor") is what makes the released case observable at
 * all: a `position: static` box reports `top: auto` no matter what `top` it was
 * given, so there is nothing else to recognise it by.
 */
function ingredientsHeaderPosition(page: Page): Promise<string | null> {
  return page.getByLabel("Multiply").evaluate((el) => {
    const header = el.closest(".sticky-chrome");
    return header && getComputedStyle(header).position;
  });
}

test.describe("Sticky chrome", () => {
  /* Nothing here mutates content — the reset only has to guarantee recipe-6
   * exists with its ingredients. */
  test.beforeEach(async ({ resetData }) => {
    await resetData("two-pages");
  });

  test("pins both on a tall viewport", async ({ page }) => {
    await page.goto("/recipe/recipe-6");

    // 720 tall — the default, and what every other spec in the suite runs at.
    expect(await bannerPosition(page)).toBe("sticky");
    expect(await ingredientsHeaderPosition(page)).toBe("sticky");
  });

  test("releases both on a landscape-phone viewport", async ({ page }) => {
    await page.setViewportSize(LANDSCAPE_PHONE);
    await page.goto("/recipe/recipe-6");

    // 140px of chrome was 36% of this viewport. Both release, together — the
    // position and the offset move from one condition so the Ingredients header
    // can't be left offsetting under a masthead that is no longer there.
    expect(await bannerPosition(page)).toBe("static");
    expect(await ingredientsHeaderPosition(page)).toBe("static");
  });

  test("the Always override keeps them pinned on a short viewport", async ({
    page,
  }) => {
    await seedStickyChrome(page, "always");
    await page.setViewportSize(LANDSCAPE_PHONE);
    await page.goto("/recipe/recipe-6");

    await expect(page.locator("html")).toHaveAttribute(
      "data-sticky-chrome",
      "always",
    );
    expect(await bannerPosition(page)).toBe("sticky");
    expect(await ingredientsHeaderPosition(page)).toBe("sticky");
  });

  test("the Off override releases them on a tall viewport", async ({
    page,
  }) => {
    await seedStickyChrome(page, "off");
    await page.goto("/recipe/recipe-6");

    expect(await bannerPosition(page)).toBe("static");
    expect(await ingredientsHeaderPosition(page)).toBe("static");
  });

  test("the override is on <html> before hydration finishes", async ({
    page,
  }) => {
    await seedStickyChrome(page, "off");
    await page.goto("/recipe/recipe-6", { waitUntil: "domcontentloaded" });

    /* Honest caveat: this is a strong signal, not a hard guarantee. Nothing
     * here proves hydration hadn't already run — only that the attribute is
     * present at a point where it usually hasn't. What it does catch for
     * certain is the pre-paint script being dropped, since the sync effect
     * alone would rarely have landed this early. */
    await expect(page.locator("html")).toHaveAttribute(
      "data-sticky-chrome",
      "off",
    );
  });

  test("choosing Off from the Appearance menu takes effect and survives the menu closing", async ({
    page,
  }) => {
    await page.goto("/recipe/recipe-6");
    expect(await bannerPosition(page)).toBe("sticky");

    await page.getByRole("button", { name: "Appearance" }).click();
    await page
      .getByRole("group", { name: "Sticky headers" })
      .getByRole("radio", { name: "Off" })
      .click();
    expect(await bannerPosition(page)).toBe("static");

    /* The load-bearing step. Radix unmounts PopoverContent on close, so if the
     * effect that writes `data-sticky-chrome` lived beside the toggle instead
     * of in AppProviders, the preference would revert the moment the reader
     * dismissed the panel — and this test would pass without it. */
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("group", { name: "Sticky headers" }),
    ).toBeHidden();
    expect(await bannerPosition(page)).toBe("static");

    await page.reload();
    expect(await bannerPosition(page)).toBe("static");
    expect(await ingredientsHeaderPosition(page)).toBe("static");
  });

  test("Auto is not persisted", async ({ page }) => {
    await page.goto("/recipe/recipe-6");
    const group = page.getByRole("group", { name: "Sticky headers" });

    await page.getByRole("button", { name: "Appearance" }).click();
    await group.getByRole("radio", { name: "Off" }).click();
    expect(await bannerPosition(page)).toBe("static");

    await group.getByRole("radio", { name: "Auto" }).click();

    // Back to the default → the key is cleared, not written as "auto", so a
    // future change to the 600px threshold still reaches this reader.
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
      )
      .toBeNull();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-sticky-chrome",
    );
    expect(await bannerPosition(page)).toBe("sticky");
  });

  test("print releases the Ingredients header even under Always", async ({
    page,
  }) => {
    await seedStickyChrome(page, "always");
    await page.goto("/recipe/recipe-6");
    await page.emulateMedia({ media: "print" });

    /* This guards the whole layer-order argument: `.sticky-chrome` lives in
     * `@layer components`, which every utility out-ranks, so the call site's
     * `print:static` still wins over an "always" preference. Move the class
     * into `@layer utilities` (e.g. via `@utility`) and this fails loudly. */
    expect(await ingredientsHeaderPosition(page)).toBe("static");
    await expect(page.getByRole("banner")).toBeHidden();

    await page.emulateMedia({ media: "screen" });
  });
});

test.describe("Sticky chrome @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("two-pages");
  });

  test("Sticky headers @mobile — the hamburger sheet carries the control", async ({
    page,
  }) => {
    await page.goto("/recipe/recipe-6");

    // The sheet is a second call site that `AppearanceMenu`'s prop does not
    // reach — the easy miss when wiring a new appearance control.
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    const group = dialog.getByRole("group", { name: "Sticky headers" });
    await expect(group).toBeVisible();

    await group.getByRole("radio", { name: "Off" }).click();
    await page.keyboard.press("Escape");
    await expect(group).toBeHidden();

    expect(await bannerPosition(page)).toBe("static");
  });

  test("Sticky headers @mobile — portrait stays pinned, landscape releases", async ({
    page,
  }) => {
    await page.setViewportSize(PORTRAIT_PHONE);
    await page.goto("/recipe/recipe-6");
    expect(await bannerPosition(page)).toBe("sticky");
    expect(await ingredientsHeaderPosition(page)).toBe("sticky");

    // The exact reported viewport, on the real device profile.
    await page.setViewportSize(LANDSCAPE_PHONE);
    expect(await bannerPosition(page)).toBe("static");
    expect(await ingredientsHeaderPosition(page)).toBe("static");
  });
});
