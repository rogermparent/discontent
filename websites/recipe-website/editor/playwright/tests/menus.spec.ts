import { test, expect } from "../support/test";
import { fillSignInForm, deleteWithConfirm } from "../support/helpers";
import { snapshotLocator } from "../support/visual";

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
        await page
          .getByRole("heading", { name: "Header", exact: true })
          .click();
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

        await page
          .getByRole("heading", { name: "Header", exact: true })
          .click();

        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("About Us");
        await page.getByLabel("Href").clear();
        await page.getByLabel("Href").fill("/about-us");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About Us", exact: true }),
        ).toHaveAttribute("href", "/about-us");

        await page
          .getByRole("heading", { name: "Header", exact: true })
          .click();
        await deleteWithConfirm(page, "menu");

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveCount(0);
      });

      test("should be able to add to, edit, and clear the footer nav", async ({
        page,
      }) => {
        await page
          .getByRole("heading", { name: "Footer", exact: true })
          .click();
        await page.getByRole("button", { name: "Append", exact: true }).click();
        await page.getByLabel("Name").fill("About");
        await page.getByLabel("Href").fill("/about");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveAttribute("href", "/about");

        await page
          .getByRole("heading", { name: "Footer", exact: true })
          .click();

        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("About Us");
        await page.getByLabel("Href").clear();
        await page.getByLabel("Href").fill("/about-us");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About Us", exact: true }),
        ).toHaveAttribute("href", "/about-us");

        await page
          .getByRole("heading", { name: "Footer", exact: true })
          .click();
        await deleteWithConfirm(page, "menu");

        await expect(page.getByText("Menu Editor")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "About", exact: true }),
        ).toHaveCount(0);
      });
    });
  });
});
