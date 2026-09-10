import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { snapshotLocator } from "../support/visual";

test.describe("Site footer", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("renders the reader menu as a titled Browse column", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();

    // The flat default footer menu collects under a "Browse" heading.
    await expect(footer.getByRole("heading", { name: "Browse" })).toBeVisible();
    for (const name of ["Home", "Search", "Bookmarks"]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }
  });

  test("Search footer link keeps its icon inline (no broken wrap)", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    const search = footer.getByRole("link", { name: "Search" });
    // The icon sits inside the same flex link as the label (a flex row), so it
    // can't wrap to its own broken line the way the old wrapping row let it.
    // (As a direct flex child the link's `inline-flex` blockifies to `flex`.)
    await expect(search.locator("svg")).toBeVisible();
    const { display, flexDirection } = await search.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, flexDirection: s.flexDirection };
    });
    expect(["flex", "inline-flex"]).toContain(display);
    expect(flexDirection).toBe("row");
  });

  test("owner Manage column shows a link-styled Sign In (not a boxed button)", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("heading", { name: "Manage" })).toBeVisible();
    for (const name of ["New Recipe", "Settings", "Content Sync"]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }

    const signIn = footer.getByRole("button", { name: "Sign In", exact: true });
    await expect(signIn).toBeVisible();
    // Link-styled: transparent background, so it reads as a text link aligned
    // with the column rather than a boxed <Button>.
    const bg = await signIn.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(bg).toBe("rgba(0, 0, 0, 0)");
  });

  test("Sign Out replaces Sign In once authenticated", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("colophon shows the copyright and the Content Engine credit", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    const year = new Date().getFullYear().toString();
    await expect(footer.getByText(new RegExp(`©\\s*${year}`))).toBeVisible();
    await expect(footer.getByText("Built on Content Engine")).toBeVisible();
  });

  test("owner footer note + contact links render when configured", async ({
    page,
    writeSettings,
  }) => {
    await writeSettings({
      footerNote: "Handwritten in a warm kitchen.",
      contact: {
        email: "cook@example.com",
        instagram: "https://instagram.com/example",
      },
    });
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByText("Handwritten in a warm kitchen."),
    ).toBeVisible();
    await expect(footer.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:cook@example.com",
    );
    await expect(footer.getByRole("link", { name: "Instagram" })).toBeVisible();
  });
});

test.describe("Site footer @mobile", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("columns stack on small screens", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("heading", { name: "Browse" })).toBeVisible();
    await expect(footer.getByRole("heading", { name: "Manage" })).toBeVisible();
    await snapshotLocator(footer, "footer-mobile.png");
  });
});
