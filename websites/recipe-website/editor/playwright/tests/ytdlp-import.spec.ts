import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath } from "../support/tasks";

test.describe("yt-dlp Import", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    // Gate on the recipe-form island hydrating so early interactions aren't
    // dropped/reset mid-hydration (dev-mode flake).
    await markdownEditorReady(page, "description");
  });

  async function configureMimic(
    writeSettings: (settings: Record<string, unknown>) => Promise<void>,
  ) {
    const mimicPath = fixturePath("yt-dlp", "ytdlp-mimic.mjs");
    await writeSettings({ ytdlpPath: mimicPath });
  }

  test("should be able to import video data with yt-dlp", async ({
    page,
    writeSettings,
  }) => {
    await configureMimic(writeSettings);

    const url = "https://www.youtube.com/watch?v=SUCCESS_TEST";
    await page.getByLabel("Import from URL").fill(url);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.locator('[name="name"]')).toHaveValue(
      "Test Recipe Video",
    );
    await expect(page.locator('#recipe-form [name="description"]')).toHaveValue(
      /Test Kitchen Channel/,
    );
    await expect(page.locator('input[name="videoUrl"]')).toHaveValue(url);
    // Provenance (22a): the channel is the byline, YouTube the publisher.
    await expect(page.locator('#recipe-form [name="source.url"]')).toHaveValue(
      url,
    );
    await expect(page.locator('#recipe-form [name="source.name"]')).toHaveValue(
      "YouTube",
    );
    await expect(
      page.locator('#recipe-form [name="source.author"]'),
    ).toHaveValue("Test Kitchen Channel");
  });

  test("should inform the user if yt-dlp has an error", async ({
    page,
    writeSettings,
  }) => {
    await configureMimic(writeSettings);

    const url = "https://www.youtube.com/watch?v=ERROR_TEST";
    await page.getByLabel("Import from URL").fill(url);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByText("yt-dlp error")).toBeVisible();
  });

  test("should inform the user if the yt-dlp binary is not present", async ({
    page,
    writeSettings,
  }) => {
    await writeSettings({ ytdlpPath: "/nonexistent/path/to/yt-dlp" });

    const url = "https://www.youtube.com/watch?v=SUCCESS_TEST";
    await page.getByLabel("Import from URL").fill(url);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByText("yt-dlp binary was not found")).toBeVisible();
    /* 37c: still a filled form (the bare link), so the job is done. */
    await expect(
      page.getByTestId("import-progress").getByRole("heading", { level: 3 }),
    ).toHaveText("Import done");
  });

  test("should prevent the user from submitting another request while one is currently running", async ({
    page,
    writeSettings,
  }) => {
    await configureMimic(writeSettings);

    const url = "https://www.youtube.com/watch?v=SLOW_TEST";
    await page.getByLabel("Import from URL").fill(url);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
    /* 37c: the job's panel says what runs — yt-dlp, while the mimic sleeps. */
    const panel = page.getByTestId("import-progress");
    await expect(panel.locator('[data-step="ytdlp"]')).toHaveAttribute(
      "data-status",
      "running",
    );

    await expect(page.locator('[name="name"]')).toHaveValue(
      "Slow Recipe Video",
      { timeout: 15_000 },
    );

    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Import done",
    );
    /* 43e1: a finished import folds Start from into a receipt; Start over
     * opens the ways in again, with Import usable. */
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByRole("button", { name: "Import" })).toBeEnabled();
  });
});
