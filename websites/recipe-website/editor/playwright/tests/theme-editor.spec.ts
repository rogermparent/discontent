import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import type { Page } from "@playwright/test";

/** Read an inline CSS custom property set on <html> by the theming layer. */
function inlineVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) => document.documentElement.style.getPropertyValue(n),
    name,
  );
}

/** Read the computed value of a CSS custom property on <html>. */
function computedVar(page: Page, name: string): Promise<string> {
  return page.evaluate(
    (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
}

test.describe("Theme editor", () => {
  test("live preview updates tokens for accent, font, radius, and per mode", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    await expect(page.getByTestId("theme-preview")).toBeVisible();

    // Accent swatch → light-mode --primary on the fixed contrast curve (hue 150).
    await page.getByRole("button", { name: "Pine", exact: true }).click();
    expect(await inlineVar(page, "--primary")).toBe("oklch(0.53 0.16 150)");

    // Per-mode: flipping the system color scheme re-applies the dark map live.
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.7 0.16 150)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 150)");

    // Font pairing → the display role points at the pairing's registered var,
    // with a system-font fallback. The fallback is what lets each site own its
    // own font menu: a pairing key this app never registered degrades to system
    // fonts instead of making the whole --font-display chain invalid — see
    // theming/fonts.ts.
    await page.getByLabel("Typeface pairing").click();
    await page.getByRole("option", { name: "Modern Grotesk" }).click();
    expect(await inlineVar(page, "--ff-display")).toBe(
      "var(--ff-display-grotesk, var(--ff-display-fallback))",
    );

    // Radius slider → --radius changes off its 0.5rem default via the keyboard.
    const radius = page.getByRole("slider", { name: "Corner radius" });
    await radius.focus();
    await radius.press("ArrowRight");
    await radius.press("ArrowRight");
    expect(await inlineVar(page, "--radius")).not.toBe("0.5rem");
  });

  test("a built-in preset switch updates the tokens", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    await page.getByLabel("Preset", { exact: true }).click();
    await page.getByRole("option", { name: "High Contrast" }).click();

    // High Contrast = indigo accent (hue 265) + tight 0.25rem radius.
    expect(await inlineVar(page, "--primary")).toBe("oklch(0.53 0.16 265)");
    expect(await inlineVar(page, "--radius")).toBe("0.25rem");
  });

  test("save persists as site default and injects flash-free SSR style", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    await page.getByRole("button", { name: "Pine", exact: true }).click();
    await page
      .getByRole("button", { name: "Save as site default", exact: true })
      .click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    // Drop the visitor override so the reload can only get its color from the
    // SSR <style> — proves the default is delivered before any JS (no flash).
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const styleTag = page.locator("style[data-theme-default]");
    await expect(styleTag).toHaveCount(1);
    expect(await styleTag.textContent()).toContain("oklch(0.53 0.16 150)");
    // Computed value comes purely from the injected stylesheet, no inline var.
    expect(await inlineVar(page, "--primary")).toBe("");
    expect(await computedVar(page, "--primary")).toBe("oklch(0.53 0.16 150)");
  });

  test("visitor preset selection persists across reload via localStorage", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");

    // Signed-out visitor picks a preset from the header's Appearance popover.
    await page.getByRole("button", { name: "Appearance" }).click();
    await page.getByLabel("Theme preset").click();
    await page.getByRole("option", { name: "Cool Steel" }).click();

    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 250)");
    expect(
      await page.evaluate(() => localStorage.getItem("ce-theme-vars")),
    ).not.toBeNull();

    // Reload: the pre-paint script re-applies the stored override, no flash.
    await page.reload();
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 250)");
  });

  test("export JSON textarea equals the current serialized theme", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    // Move a knob so the current theme differs from the built-in default.
    await page.getByRole("button", { name: "Pine", exact: true }).click();
    const hidden = await page.locator('input[name="theme"]').inputValue();
    expect(hidden).toContain('"accentHue":150');

    await page.getByRole("button", { name: "Import / Export" }).click();
    // Export is the default tab — its textarea mirrors the serialized theme.
    const exported = await page.getByLabel("Exported theme JSON").inputValue();
    expect(exported).toBe(hidden);
  });

  test("import JSON applies a valid theme live and rejects invalid input", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    // Paste a valid non-default theme (pine, hue 150) → live preview updates.
    await page.getByRole("button", { name: "Import / Export" }).click();
    await page.getByRole("tab", { name: "Import" }).click();
    await page
      .getByLabel("Theme JSON to import")
      .fill(
        '{"accentHue":150,"neutral":"warm","radius":0.5,"fontPairing":"bench","defaultMode":"system"}',
      );
    await page.getByRole("button", { name: "Apply" }).click();

    // Dialog closes and the token is applied on the fixed contrast curve.
    await expect(page.getByLabel("Theme JSON to import")).toBeHidden();
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 150)");

    // Paste garbage → inline error, and the tokens are left unchanged.
    await page.getByRole("button", { name: "Import / Export" }).click();
    await page.getByRole("tab", { name: "Import" }).click();
    await page.getByLabel("Theme JSON to import").fill("not a theme {{{");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    expect(await inlineVar(page, "--primary")).toBe("oklch(0.53 0.16 150)");
  });

  test("named presets: save, persist across reload, apply, and delete", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes");
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/theme");

    // Save the current (pine) theme as a named preset.
    await page.getByRole("button", { name: "Pine", exact: true }).click();
    await page.getByLabel("New preset name").fill("My Preset");
    await page.getByRole("button", { name: "Save preset" }).click();

    // Scope to the saved-list row; the Select also renders a hidden native
    // <option> with the same text, which would break an unscoped text match.
    const savedRow = page
      .getByRole("listitem")
      .filter({ hasText: "My Preset" });

    // It shows up in the saved list and in the preset Select's "Saved" group.
    await expect(savedRow).toBeVisible();
    await page.getByLabel("Preset", { exact: true }).click();
    await expect(
      page.getByRole("listbox").getByRole("option", { name: "My Preset" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Persists across a reload (it lives in the editor's settings.json).
    await page.reload();
    await expect(savedRow).toBeVisible();

    // Apply: move to another accent, then Apply the saved preset to restore it.
    await page.getByRole("button", { name: "Steel", exact: true }).click();
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 250)");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect
      .poll(() => inlineVar(page, "--primary"))
      .toBe("oklch(0.53 0.16 150)");

    // Delete removes it from the list.
    await page.getByRole("button", { name: "Delete My Preset" }).click();
    // The trigger keeps the preset's own accessible name; the confirm is
    // "Delete preset", so the two never collide.
    await page
      .getByRole("button", { name: "Delete preset", exact: true })
      .click();
    await expect(savedRow).toHaveCount(0);
  });
});
