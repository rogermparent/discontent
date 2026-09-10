import { test, expect } from "../support/test";
import { fillSignInForm, deleteWithConfirm } from "../support/helpers";

/*
 * Portfolio shipped with no page coverage at all, while consuming the same
 * `@discontent/pages-collection` write path as recipe — which is how three
 * unauthenticated actions stayed live on two sites at once. Ported from recipe's
 * pages.spec so both consumers of the collection are actually gated.
 */
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

    test("renders a page publicly but without the editing controls", async ({
      page,
      resetData,
    }) => {
      // The page itself is public — this route is how /about renders for a
      // visitor. The Delete button is not: it used to be shown to anonymous
      // visitors, and now that the action checks auth it would be a button that
      // silently does nothing.
      await resetData("about-page");
      await page.goto("/about");
      await expect(page.getByText("About Us")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Delete", exact: true }),
      ).toHaveCount(0);
    });

    test("cancelling the delete confirmation keeps the page", async ({
      page,
      resetData,
      request,
    }) => {
      // The point of the dialog. Deleting used to be one stray click, and the
      // only way to check that the guard is real is to decline it and find the
      // record still there.
      await resetData("about-page");
      await page.goto("/pages");
      await fillSignInForm(page);
      await page.goto("/about");

      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      await expect(page.getByText("About Us")).toBeVisible();
      const response = await request.get("/about");
      expect(response.status()).toBe(200);
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
        await expect(page.getByText("It has a list!")).toBeVisible();
        await expect(page.getByText("with two items!")).toBeVisible();

        await deleteWithConfirm(page, "page");

        await expect(page.getByText("There are no pages yet.")).toBeVisible();

        response = await request.get("/my-new-page");
        expect(response.status()).toBe(404);
      });
    });
  });
});
