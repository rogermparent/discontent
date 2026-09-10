/**
 * Fixture Generation Spec
 *
 * Generates the test fixtures used by other tests.
 * Run explicitly with `pnpm generate-fixtures`; not part of the normal suite.
 */

import { test, expect } from "../support/test";

test.describe("Fixture Generation", () => {
  test.describe("one-resume fixture", () => {
    test("generates one-resume fixture", async ({
      page,
      resetData,
      copyFixtures,
    }) => {
      await resetData();
      await page.goto("/");

      await page.goto("/new-resume");
      await page.getByLabel("Name").fill("Jane Doe");
      await page.getByLabel("Email").fill("jane@example.com");
      await page.getByLabel("Phone").fill("555-1234");
      await page.getByLabel("Address").fill("123 Main St");
      await page.getByLabel("Github").fill("janedoe");
      await page.getByLabel("LinkedIn").fill("janedoe");
      await page.getByLabel("Website").fill("janedoe.dev");
      await page.getByLabel("Company").fill("Acme Corp");
      await page.getByLabel("Job").fill("Software Engineer");
      await page.getByLabel("Slug").fill("acme-corp-engineer");
      await page.getByLabel("Date (UTC)").fill("2023-11-14T00:00");

      await page.getByRole("button", { name: "Submit" }).click();

      await expect(page).toHaveURL(/\/resume\/acme-corp-engineer/);
      await expect(page.getByText("Software Engineer")).toBeVisible();

      await page.goto("/");
      await expect(page.getByText("Acme Corp")).toBeVisible();

      await copyFixtures("one-resume");
    });
  });
});
