import { test, expect, type Page } from "../support/test";
import { fillSignInForm, deleteWithConfirm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { snapshotLocator } from "../support/visual";

/**
 * Open a menu's edit page from /menus and wait for its form to hydrate (40f).
 * The heading's link can be followed natively before /menus hydrates, and the
 * edit page then arrives server-rendered: an Append click that lands before it
 * hydrates does nothing, and the next `getByLabel("Name")` timed out — this
 * spec's retry-then-pass in CI, 38 times in 60 runs. The top-level Append is
 * the last one (each item carries its own, for children).
 */
async function openMenu(page: Page, name: string): Promise<void> {
  await page.getByRole("heading", { name, exact: true }).click();
  await expectHydrated(
    page.getByRole("button", { name: "Append", exact: true }).last(),
  );
}

test.describe("Menu Editor", () => {
  test.describe("with a clean slate", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData();
      await page.goto("/menus");
    });

    test("should need authorization", async ({ page }) => {
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should need authorization when directly going to edit the header", async ({
      page,
    }) => {
      await page.goto("/menus/edit/header");
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
      });

      test("should be able to add to, edit, and clear the header nav", async ({
        page,
      }) => {
        await openMenu(page, "Header");
        await page.getByRole("button", { name: "Append", exact: true }).click();
        await page.getByLabel("Name").fill("About");
        await page.getByLabel("Href").fill("/about");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveAttribute("href", "/about");

        await snapshotLocator(
          page.getByRole("banner"),
          "header-with-about-link.png",
        );

        await openMenu(page, "Header");

        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("About Us");
        await page.getByLabel("Href").clear();
        await page.getByLabel("Href").fill("/about-us");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About Us", exact: true }),
        ).toHaveAttribute("href", "/about-us");

        await openMenu(page, "Header");
        await deleteWithConfirm(page, "menu");

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveCount(0);
      });

      test("should be able to add to, edit, and clear the footer nav", async ({
        page,
      }) => {
        await openMenu(page, "Footer");
        await page.getByRole("button", { name: "Append", exact: true }).click();
        await page.getByLabel("Name").fill("About");
        await page.getByLabel("Href").fill("/about");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveAttribute("href", "/about");

        await openMenu(page, "Footer");

        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("About Us");
        await page.getByLabel("Href").clear();
        await page.getByLabel("Href").fill("/about-us");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About Us", exact: true }),
        ).toHaveAttribute("href", "/about-us");

        await openMenu(page, "Footer");
        await deleteWithConfirm(page, "menu");

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveCount(0);
      });
    });
  });
});
