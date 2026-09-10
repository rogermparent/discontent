import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resetData } from "../support/tasks";
import { fillSignInForm } from "../support/helpers";

const storageStatePath = resolve(__dirname, "..", ".auth", "admin.json");

setup.describe.configure({ retries: 2 });

setup("authenticate as admin", async ({ page, request }) => {
  await resetData();
  await request.get("/settings/test-invalidate-cache");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Sign In", exact: true })
    .click({ timeout: 30_000 });
  await fillSignInForm(page);

  await expect(
    page.getByRole("button", { name: "Sign Out", exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  await mkdir(dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
