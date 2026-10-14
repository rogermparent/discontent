import { test, expect } from "../support/test";
import { fillSignInForm, deleteWithConfirm } from "../support/helpers";

test.describe("Page Editor", () => {
  test.describe("with a clean slate", () => {
    test("should need authorization", async ({ page, resetData }) => {
      await resetData();
      await page.goto("/pages");
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test("should need authorization when directly going to an edit page", async ({
      page,
      resetData,
    }) => {
      await resetData("about-page");
      await page.goto("/pages/edit/about");
      await expect(
        page.getByRole("button", {
          name: "Sign in with Credentials",
          exact: true,
        }),
      ).toBeVisible();
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page, resetData }) => {
        await resetData();
        await page.goto("/pages");
        await fillSignInForm(page);
      });

      test("should be able to add, edit, and remove a page", async ({
        page,
        request,
      }) => {
        await expect(page.getByText("There are no pages yet.")).toBeVisible();

        let response = await request.get("/my-new-page");
        expect(response.status()).toBe(404);

        await page.getByRole("link", { name: "New Page", exact: true }).click();

        await expect(
          page.getByRole("link", { name: "Back to Pages", exact: true }),
        ).toBeVisible();

        await page.getByLabel("Name").fill("My New Page");
        await page
          .getByLabel("Content")
          .fill(
            "## Page Subtitle\n\nThis is a new page, *formatted* in **markdown**!",
          );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText(/^This is a new page/)).toBeVisible();
        await expect(page.getByText("formatted")).toBeVisible();
        await expect(page.getByText("markdown")).toBeVisible();

        response = await request.get("/my-new-page");
        expect(response.status()).toBe(200);

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("My New Edited Page");
        await page.getByLabel("Content").clear();
        await page
          .getByLabel("Content")
          .fill(
            "## Page Subtitle\n\nThis is an edited page, *formatted* in **markdown**!\n\n- It has a list!\n\n- with two items!",
          );

        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText(/^This is an edited page/)).toBeVisible();
        await expect(page.getByText("formatted")).toBeVisible();
        await expect(page.getByText("markdown")).toBeVisible();
        await expect(page.getByText("It has a list!")).toBeVisible();
        await expect(page.getByText("with two items!")).toBeVisible();

        await deleteWithConfirm(page, "page");

        await expect(page.getByText("There are no pages yet.")).toBeVisible();

        response = await request.get("/my-new-page");
        expect(response.status()).toBe(404);
      });
    });
  });

  test.describe("paging the list (F6c)", () => {
    test("pages 21 pages 20 at a time, newest first", async ({
      page,
      resetData,
    }) => {
      await resetData("many-pages");
      await page.goto("/pages");
      await fillSignInForm(page);

      const listed = page.locator('a[href^="/pages/edit/"]');
      await expect(listed).toHaveCount(20);
      await expect(listed.first()).toContainText("Page 21");
      await expect(listed.last()).toContainText("Page 02");
      await expect(page.getByTestId("pagination-page-number")).toHaveText("1");
      await expect(
        page.getByRole("link", { name: "Newer", exact: true }),
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Older", exact: true }).click();
      await expect(page).toHaveURL(/\/pages\?page=2$/);
      await expect(listed).toHaveCount(1);
      await expect(listed.first()).toContainText("Page 01");
      await expect(page.getByTestId("pagination-page-number")).toHaveText("2");
      await expect(
        page.getByRole("link", { name: "Older", exact: true }),
      ).toHaveCount(0);

      await page.getByRole("link", { name: "Newer", exact: true }).click();
      await expect(page).toHaveURL(/\/pages$/);
      await expect(listed).toHaveCount(20);
    });

    test("one page of pages shows no paging, and past the end is a 404", async ({
      page,
      resetData,
    }) => {
      await resetData("about-page");
      await page.goto("/pages");
      await fillSignInForm(page);
      await expect(page.locator('a[href="/pages/edit/about"]')).toBeVisible();
      await expect(page.getByTestId("pagination-page-number")).toHaveCount(0);

      for (const query of ["?page=2", "?page=0", "?page=abc", "?page=01"]) {
        const response = await page.goto(`/pages${query}`);
        expect(response?.status(), query).toBe(404);
      }
    });
  });
});
