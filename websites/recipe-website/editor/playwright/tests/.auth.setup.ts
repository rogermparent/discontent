import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resetData } from "../support/tasks";
import { withWritesHeld } from "../support/test";
import { fillSignInForm } from "../support/helpers";

const storageStatePath = resolve(__dirname, "..", ".auth", "admin.json");

setup.describe.configure({ retries: 2 });

setup("authenticate as admin", async ({ page, request }) => {
  // Held like every fixture reset (41b): the release is the invalidation.
  await withWritesHeld(request, () => resetData());

  // The app's own sign-in page (47e), coming back to the homepage.
  await page.goto("/login?redirectTo=%2F", { waitUntil: "domcontentloaded" });
  await fillSignInForm(page);

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Sign Out", exact: true }),
  ).toBeVisible({ timeout: 30_000 });

  await mkdir(dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
