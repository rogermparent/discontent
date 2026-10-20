import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { signIn } from "../support/helpers";

/*
 * 43a: the editor's write controls render only with a session, as the
 * masthead's `ownerOnly` links do. The server actions already refused a guest
 * (`authenticateUser`); this is the page no longer offering what it will
 * refuse. Each page: signed out, none of the controls; signed in, all.
 */

const link = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true });

async function expectControls(
  page: Page,
  controls: { links: string[]; deleteButton?: boolean },
  shown: boolean,
) {
  for (const name of controls.links) {
    await expect(link(page, name), name).toHaveCount(shown ? 1 : 0);
  }
  if (controls.deleteButton) {
    await expect(
      page.getByRole("button", { name: "Delete", exact: true }),
    ).toHaveCount(shown ? 1 : 0);
  }
}

test.describe("Guest controls (43a)", () => {
  test("a recipe page offers Delete, Edit, Copy, Feature and Group only when signed in", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    const controls = {
      links: ["Edit", "Copy", "Feature", "Group"],
      deleteButton: true,
    };
    await page.goto("/recipe/first-recipe");
    await expect(
      page.getByRole("heading", { level: 1, name: "First Recipe" }),
    ).toBeVisible();
    await expectControls(page, controls, false);

    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expectControls(page, controls, true);
  });

  test("a group page offers Delete, Feature and Edit only when signed in", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    const controls = { links: ["Feature", "Edit"], deleteButton: true };
    const more = page.getByRole("button", { name: "More", exact: true });
    await page.goto("/group/week-of-may-4");
    await expect(
      page.getByRole("heading", { level: 1, name: "Week of May 4" }),
    ).toBeVisible();
    await expect(more).toHaveCount(0);
    await expectControls(page, controls, false);

    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    /* 43p1: the plan page keeps them in its More menu (Dp1-10). */
    await expectHydrated(more);
    await more.click();
    await expectControls(page, controls, true);
  });

  test("a term page offers Feature, Edit and Add a narrower term only when signed in", async ({
    page,
    resetData,
  }) => {
    await resetData("christmas-cookies");
    const controls = { links: ["Feature", "Edit", "Add a narrower term"] };
    await page.goto("/tags/cookies");
    await expect(
      page.getByRole("heading", { name: "Cookies", exact: true }),
    ).toBeVisible();
    await expectControls(page, controls, false);

    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expectControls(page, controls, true);
  });

  test("the tags index offers New term only when signed in", async ({
    page,
    resetData,
  }) => {
    await resetData("christmas-cookies");
    await page.goto("/tags");
    await expect(
      page.getByRole("heading", { name: "Tags", exact: true }),
    ).toBeVisible();
    await expectControls(page, { links: ["New term"] }, false);

    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Sign Out", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expectControls(page, { links: ["New term"] }, true);
  });
});
