import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, deleteWithConfirm } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

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

/*
 * Ported from recipe's menus.spec, but *not* copied: portfolio's structure
 * differs in two ways that make recipe's assertions meaningless here.
 *
 * 1. The `(editor)` route group renders no masthead — only the settings footer —
 *    so a saved header item is not observable on /menus. The round trip has to
 *    be checked against a reader-facing page, which is where AppLayout renders.
 * 2. AppLayout ships default header items including "About" → /about, so
 *    recipe's choice of "About" as the test item would assert something that is
 *    already true. This uses a name no default claims.
 *
 * There is no footer-menu test because portfolio's SiteFooter does not consume
 * one; it renders the site title and editor extras only. A test for it would
 * assert nothing.
 *
 * Checking the reader-facing page also covers the revalidation fix: menus render
 * in the *layout*, and the update action used to call
 * `revalidatePath("/" + slug)` — i.e. "/header", a path that does not exist — so
 * a saved menu kept serving the stale nav everywhere it actually appeared.
 */
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
        const masthead = page.getByRole("banner");

        await openMenu(page, "Header");
        await page.getByRole("button", { name: "Append", exact: true }).click();
        await page.getByLabel("Name").fill("Colophon");
        await page.getByLabel("Href").fill("/colophon");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();

        await page.goto("/");
        await expect(
          masthead.getByRole("link", { name: "Colophon", exact: true }),
        ).toHaveAttribute("href", "/colophon");

        await page.goto("/menus");
        await openMenu(page, "Header");
        await page.getByLabel("Name").clear();
        await page.getByLabel("Name").fill("Colophon & Notes");
        await page.getByLabel("Href").clear();
        await page.getByLabel("Href").fill("/colophon-and-notes");
        await page.getByRole("button", { name: "Submit", exact: true }).click();

        await expect(page.getByText("Menu Editor")).toBeVisible();

        await page.goto("/");
        await expect(
          masthead.getByRole("link", { name: "Colophon & Notes", exact: true }),
        ).toHaveAttribute("href", "/colophon-and-notes");

        await page.goto("/menus");
        await openMenu(page, "Header");
        await deleteWithConfirm(page, "menu");

        await expect(page.getByText("Menu Editor")).toBeVisible();

        await page.goto("/");
        await expect(
          masthead.getByRole("link", { name: /Colophon/ }),
        ).toHaveCount(0);
        // The built-in items are unaffected by deleting the custom menu.
        await expect(
          masthead.getByRole("link", { name: "Work", exact: true }),
        ).toBeVisible();
      });
    });
  });
});
