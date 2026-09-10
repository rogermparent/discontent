import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";

const AREAS = [
  "Site details",
  "Appearance",
  "Navigation",
  "Pages",
  "Content Sync",
  "Export",
  "Tools",
  "Maintenance",
];

test.describe("Settings navigation", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("sidebar lists the settings areas with active state", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");

    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await expect(sidebar).toBeVisible();
    for (const name of AREAS) {
      await expect(sidebar.getByRole("link", { name })).toBeVisible();
    }

    // On /settings, Site details is current and Appearance is not.
    await expect(
      sidebar.getByRole("link", { name: "Site details" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      sidebar.getByRole("link", { name: "Appearance" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("navigates Site details → Appearance → Navigation with active state", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    const sidebar = page.getByRole("complementary", { name: "Settings" });

    await sidebar.getByRole("link", { name: "Appearance" }).click();
    await expect(page).toHaveURL(/\/settings\/theme/);
    await expect(page.getByTestId("theme-preview")).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Appearance" }),
    ).toHaveAttribute("aria-current", "page");

    await sidebar.getByRole("link", { name: "Navigation" }).click();
    await expect(page).toHaveURL(/\/menus/);
    await expect(
      sidebar.getByRole("link", { name: "Navigation" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("Theme editor lives at /settings/theme, not on Site details", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);

    await page.goto("/settings");
    await expect(page.getByTestId("theme-preview")).toHaveCount(0);
    // Site details carries the footer note + contact form (PR 13 plumbing).
    await expect(page.getByLabel("Footer note")).toBeVisible();

    await page.goto("/settings/theme");
    await expect(page.getByTestId("theme-preview")).toBeVisible();
  });

  test("navigates to Tools with active state", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    const sidebar = page.getByRole("complementary", { name: "Settings" });

    await sidebar.getByRole("link", { name: "Tools" }).click();
    await expect(page).toHaveURL(/\/settings\/tools/);
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();
    await expect(page.getByLabel("yt-dlp Binary Path")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Tools" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Site details stays exact-match, so /settings/tools doesn't light it up.
    await expect(
      sidebar.getByRole("link", { name: "Site details" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("navigates to Maintenance with active state", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");
    const sidebar = page.getByRole("complementary", { name: "Settings" });

    await sidebar.getByRole("link", { name: "Maintenance" }).click();
    await expect(page).toHaveURL(/\/settings\/maintenance/);
    await expect(
      page.getByRole("heading", { name: "Maintenance" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reload Recipe Database" }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Maintenance" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("public pages do not get the settings sidebar", async ({
    page,
    resetData,
  }) => {
    await resetData("about-page");
    await page.goto("/");
    await signIn(page);
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Settings" }),
    ).toHaveCount(0);
  });

  test("edit forms do not get the settings sidebar", async ({ page }) => {
    // The edit forms live outside the (settings) route group, so they render as
    // standalone editors (like recipe editing) with no sidebar.
    await page.goto("/");
    await signIn(page);
    await page.goto("/pages/new");
    await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Settings" }),
    ).toHaveCount(0);
  });
});

test.describe("Settings navigation @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("mobile drawer opens the settings nav and navigates", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings");

    // The persistent aside is hidden on mobile; a labeled trigger stands in.
    const trigger = page.getByRole("button", { name: "Settings menu" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("link", { name: "Appearance" }),
    ).toBeVisible();
    await drawer.getByRole("link", { name: "Appearance" }).click();
    await expect(page).toHaveURL(/\/settings\/theme/);
  });
});
