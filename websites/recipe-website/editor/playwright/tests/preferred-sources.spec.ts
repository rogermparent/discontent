import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { expectNoViolations } from "../support/a11y";

/*
 * 51g (b03): Settings → Tools → Preferred sources — the sites the curator's
 * online plan asks first. It starts at Sally's, takes a site, reorders,
 * removes, refuses what is not a site, and keeps an empty list; the list is
 * kept across a reload. The test puts the default back at the end.
 */

const sites = (page: import("@playwright/test").Page) =>
  page.getByTestId("preferred-source").locator("span.font-medium");

test.describe("Preferred sources", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("add, reorder, remove and save; an empty list is allowed", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/tools");
    const card = page.getByTestId("preferred-sources");
    await expectHydrated(
      card.getByRole("button", { name: "Add", exact: true }),
    );
    await expect(sites(page)).toHaveText(["sallysbakingaddiction.com"]);
    await expect(card.getByRole("button", { name: "Save" })).toBeDisabled();

    /* Not a site: said so, nothing added. */
    await card.getByLabel("Add a site", { exact: true }).fill("not a site");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("preferred-sources-status")).toContainText(
      "is not a site",
    );
    await expect(sites(page)).toHaveCount(1);

    /* A page's URL is cut to its site; a repeat is refused. */
    await card
      .getByLabel("Add a site", { exact: true })
      .fill("https://www.kingarthurbaking.com/recipes/x");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await expect(sites(page)).toHaveText([
      "sallysbakingaddiction.com",
      "kingarthurbaking.com",
    ]);
    await card
      .getByLabel("Add a site", { exact: true })
      .fill("kingarthurbaking.com");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("preferred-sources-status")).toContainText(
      "already listed",
    );

    await card
      .getByRole("button", { name: "Move kingarthurbaking.com up" })
      .click();
    await expect(sites(page)).toHaveText([
      "kingarthurbaking.com",
      "sallysbakingaddiction.com",
    ]);
    await expectNoViolations(page);
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("preferred-sources-status")).toContainText(
      "Saved: 2 preferred sites",
    );

    /* Kept across a reload, and the API says the same. */
    await page.reload();
    await expect(sites(page)).toHaveText([
      "kingarthurbaking.com",
      "sallysbakingaddiction.com",
    ]);
    const api = await page.request.get("/api/settings/preferred-sources");
    expect((await api.json()).sources).toEqual([
      "kingarthurbaking.com",
      "sallysbakingaddiction.com",
    ]);

    /* An empty list is allowed. */
    await expectHydrated(
      card.getByRole("button", { name: "Add", exact: true }),
    );
    for (const site of ["kingarthurbaking.com", "sallysbakingaddiction.com"]) {
      await card.getByRole("button", { name: `Remove ${site}` }).click();
    }
    await expect(page.getByTestId("preferred-sources-empty")).toBeVisible();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("preferred-sources-status")).toContainText(
      "no preferred sites",
    );
    await page.reload();
    await expect(page.getByTestId("preferred-sources-empty")).toBeVisible();

    /* The default back. */
    await expectHydrated(
      card.getByRole("button", { name: "Add", exact: true }),
    );
    await card
      .getByLabel("Add a site", { exact: true })
      .fill("sallysbakingaddiction.com");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("preferred-sources-status")).toContainText(
      "Saved: 1 preferred site.",
    );
  });
});
