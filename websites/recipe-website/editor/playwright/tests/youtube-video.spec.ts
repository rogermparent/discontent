import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

test.describe("YouTube Video Support", () => {
  test.describe("with the importable uploads fixture", () => {
    test.beforeEach(async ({ page, resetData }) => {
      await resetData("importable-uploads");
      await page.goto("/new-recipe");
    });

    test.describe("when authenticated", () => {
      test.beforeEach(async ({ page }) => {
        await fillSignInForm(page);
        // Gate on the recipe-form island hydrating so early interactions
        // aren't dropped/reset mid-hydration (dev-mode flake).
        await markdownEditorReady(page, "description");
      });

      test("imports YouTube URL directly into import field", async ({
        page,
      }) => {
        const youtubeUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
        await page.getByLabel("Import from URL").fill(youtubeUrl);
        await page.getByRole("button", { name: "Import" }).click();

        await expect(page.getByLabel("Enter URL")).toBeChecked();

        await expect(page.locator('input[name="videoUrl"]')).toHaveValue(
          youtubeUrl,
        );

        // The description no longer opens with an "Imported from" line (D7);
        // the citation is the `source` block, filled in by the same import.
        await expect(
          page.locator('#recipe-form [name="source.url"]'),
        ).toHaveValue(youtubeUrl);

        await page.getByLabel("Name").fill("Direct YouTube Import Test");
        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw/,
        );
      });

      test("imports recipe with YouTube video from JSON-LD", async ({
        page,
        baseURL,
      }) => {
        const fullTestURL = new URL("/uploads/youtube-recipe.html", baseURL!);

        await page.getByLabel("Import from URL").fill(fullTestURL.href);
        await page.getByRole("button", { name: "Import" }).click();

        await expect(page.locator('[name="name"]')).toHaveValue(
          "YouTube Recipe Example",
        );

        await expect(page.getByLabel("Enter URL")).toBeChecked();

        await expect(page.locator('input[name="videoUrl"]')).toHaveValue(
          "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        );

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw/,
        );
      });

      test("allows manual YouTube URL entry", async ({ page }) => {
        await page.getByLabel("Name").fill("YouTube Recipe Test");

        await page.getByLabel("Enter URL").check();

        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
        await page.getByLabel("Video URL").blur();

        await expect(page.locator("youtube-video")).toBeAttached();

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw/,
        );
      });

      test("supports various video platform URLs", async ({ page }) => {
        await page.getByLabel("Name").fill("Multi-Platform Test");
        await page.getByLabel("Enter URL").check();

        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
        await page.getByLabel("Video URL").blur();
        await expect(page.locator("youtube-video")).toBeAttached();

        await page.getByLabel("Video URL").clear();
        await page.getByLabel("Video URL").fill("https://vimeo.com/347119375");
        await page.getByLabel("Video URL").blur();
        await expect(page.locator("vimeo-video")).toBeAttached();

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("vimeo-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/player\.vimeo\.com\/video\/347119375/,
        );
      });

      test("shows error for invalid URL", async ({ page }) => {
        await page.getByLabel("Name").fill("Invalid URL Test");
        await page.getByLabel("Enter URL").check();

        await page.getByLabel("Video URL").fill("not-a-url");
        await page.getByLabel("Video URL").blur();

        await expect(page.getByText("Invalid URL format")).toBeVisible();
      });

      test("switches between file and URL modes", async ({ page }) => {
        await page.getByLabel("Name").fill("Mode Switch Test");

        await page.getByLabel("Enter URL").check();
        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
        await page.getByLabel("Video URL").blur();
        await expect(page.locator("youtube-video")).toBeAttached();

        await page.getByLabel("Upload File").check();
        await expect(page.locator("youtube-video")).toHaveCount(0);
        await expect(page.getByLabel("Video URL")).toHaveCount(0);

        await page.getByLabel("Enter URL").check();
        await expect(page.locator('input[name="videoUrl"]')).toHaveValue("");
      });

      test("edits recipe with YouTube video", async ({ page }) => {
        await page.getByLabel("Name").fill("Edit YouTube Test");
        await page.getByLabel("Enter URL").check();
        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
        await page.getByLabel("Video URL").blur();
        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);
        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw/,
        );

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(page.getByLabel("Enter URL")).toBeChecked();
        await expect(page.locator('input[name="videoUrl"]')).toHaveValue(
          "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        );

        await page.getByLabel("Video URL").clear();
        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=wiCEyvooYYI");
        await page.getByLabel("Video URL").blur();

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/wiCEyvooYYI/,
        );
      });

      test("preserves existing file upload when editing", async ({ page }) => {
        await page.getByLabel("Name").fill("File Upload Test");
        await expect(page.getByLabel("Upload File")).toBeChecked();

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await page.getByRole("link", { name: "Edit", exact: true }).click();

        await expect(page.getByLabel("Upload File")).toBeChecked();
      });

      test("clears video when switching from URL to file mode and back", async ({
        page,
      }) => {
        await page.getByLabel("Name").fill("Clear Video Test");

        await page.getByLabel("Enter URL").check();
        await page
          .getByLabel("Video URL")
          .fill("https://www.youtube.com/watch?v=test123");
        await page.getByLabel("Video URL").blur();

        await page.getByLabel("Upload File").check();

        await page.getByLabel("Enter URL").check();

        await expect(page.locator('input[name="videoUrl"]')).toHaveValue("");
      });

      test("handles YouTube short URLs", async ({ page }) => {
        await page.getByLabel("Name").fill("YouTube Short URL Test");
        await page.getByLabel("Enter URL").check();

        await page.getByLabel("Video URL").fill("https://youtu.be/jNQXAC9IVRw");
        await page.getByLabel("Video URL").blur();

        await expect(page.locator("youtube-video")).toBeAttached();

        await page.getByRole("button", { name: "Submit" }).click();

        await expect(page).toHaveURL(/\/recipe\/[^/]+$/);

        await expect(page.locator("youtube-video iframe")).toHaveAttribute(
          "src",
          /https:\/\/www\.youtube\.com\/embed\/jNQXAC9IVRw/,
        );
      });
    });
  });
});
