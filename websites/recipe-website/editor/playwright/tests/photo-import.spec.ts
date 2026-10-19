import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath } from "../support/tasks";
import { photoTranscripts, standInChat } from "../fixtures/llm/standInModel";

/*
 * 38e: the form's Photo mode. A stand-in model on loopback (never a real
 * one) answers both calls: the vision model's transcription — the fixture
 * card's transcript, found by the hash of the photo as sent
 * (`fixtures/photos/`, `sentPhotoKey`) — and
 * the text model's reading of it. The suite pins both models off (T18);
 * this spec turns them on for this server process only, through the
 * TEST_MODE-only `/settings/test-llm?url=…&vision=…`, and off again after
 * each test. The transcription waits for `releaseVision()` when
 * `holdVision` is set, so the running step can be watched.
 */
let model: Server;
let modelUrl: string;
/* Keyed by the bytes the photos are sent as (38-Te4): filled in beforeAll. */
let transcripts: Record<string, string> = {};
let holdVision = false;
let releaseVision: () => void = () => {};

test.beforeAll(async () => {
  transcripts = await photoTranscripts(fixturePath("photos"));
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const answer = () => {
        if (response.destroyed) return;
        response.writeHead(200, { "content-type": "application/json" });
        if (request.url === "/api/chat") {
          response.end(
            JSON.stringify(
              standInChat(JSON.parse(Buffer.concat(chunks).toString()), {
                transcripts,
              }),
            ),
          );
        } else {
          response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
        }
      };
      const vision =
        request.url === "/api/chat" &&
        Buffer.concat(chunks).includes('"images"');
      if (vision && holdVision) {
        releaseVision = answer;
      } else {
        answer();
      }
    });
  });
  await new Promise<void>((resolve) =>
    model.listen(0, "127.0.0.1", () => resolve()),
  );
  modelUrl = `http://127.0.0.1:${(model.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
});

async function useModels(
  request: APIRequestContext,
  models: { url?: string; vision?: string } = {},
) {
  const query = new URLSearchParams();
  if (models.url) query.set("url", models.url);
  if (models.vision) query.set("vision", models.vision);
  const response = await request.get(`/settings/test-llm?${query}`);
  expect(response.ok()).toBe(true);
}

const CARD = fixturePath("photos", "oat-cookie-card.jpg");
/* 43e1: one of Start from's five ways in. */
const PHOTO = "Photo";

test.describe("Photo import (38e)", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
  });

  test.afterEach(async ({ request }) => {
    holdVision = false;
    releaseVision();
    await useModels(request);
  });

  test("Photo mode is off without a vision model", async ({
    page,
    request,
  }) => {
    /* The suite's own state: no model at all. */
    const photo = page.getByRole("radio", { name: PHOTO, exact: true });
    await expect(photo).toBeDisabled();
    await expect(photo).toHaveAccessibleDescription(
      "No vision model configured",
    );
    /* A text model alone is not enough either. */
    await useModels(request, { url: modelUrl });
    await page.reload();
    await markdownEditorReady(page, "description");
    await expect(
      page.getByRole("radio", { name: "Text", exact: true }),
    ).toBeEnabled();
    await expect(photo).toBeDisabled();
  });

  test("reads a photo: the live steps, the form filled, the photo as its image", async ({
    page,
    request,
  }) => {
    await useModels(request, { url: modelUrl, vision: "qwen2.5vl:7b" });
    await page.reload();
    await markdownEditorReady(page, "description");

    const way = page.getByRole("radio", { name: PHOTO, exact: true });
    await expect(way).toHaveAccessibleDescription(
      "a recipe card — qwen2.5vl:7b",
    );
    await way.check();
    const add = page.getByLabel("Add photos of the recipe", { exact: true });
    await expect(add).toBeVisible();
    const importButton = page.getByRole("button", {
      name: "Import",
      exact: true,
    });
    /* Nothing to read yet. */
    await expect(importButton).toBeDisabled();

    await add.setInputFiles(CARD);
    const list = page.getByTestId("import-photo-list");
    await expect(list.locator("li")).toHaveCount(1);
    await expect(
      list.getByRole("img", { name: "Page 1: oat-cookie-card.jpg" }),
    ).toBeVisible();
    await page
      .getByLabel("Use the first photo as the recipe's image", { exact: true })
      .check();

    holdVision = true;
    await importButton.click();

    /* The vision model's step, running, while it "reads". */
    const panel = page.getByTestId("import-progress");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Importing…",
    );
    const transcribing = panel.locator('[data-step="vision.transcribe"]');
    await expect(transcribing).toHaveAttribute("data-status", "running");
    await expect(transcribing).toContainText("Vision model reads the photo");
    await expect(page).toHaveURL(/\/new-recipe\?job=[0-9A-Z]{26}$/);
    releaseVision();

    /* Then the text model reads the transcription and the form fills. */
    const form = page.locator("#recipe-form");
    await expect(form.locator('[name="name"]')).toHaveValue(
      "Grandma's Oat Cookies",
      { timeout: 15_000 },
    );
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Import done",
    );
    await expect(panel).toContainText("photo oat-cookie-card.jpg");
    await panel.getByText(/\d+ steps?/).click();
    await expect(
      panel.locator('[data-step="vision.transcribe"]'),
    ).toHaveAttribute("data-status", "ok");
    await expect(panel.locator('[data-step="llm.extract"]')).toContainText(
      "Model reads the recipe",
    );
    await expect(page.getByTestId("llm-notice")).toContainText(
      "read from the photo's transcription by local model qwen3:8b — 4/4 ingredient lines found verbatim",
    );

    /* What the vision model read, a click away. */
    const transcription = page.getByTestId("import-transcription");
    await transcription
      .getByText("What qwen2.5vl:7b read in the photo")
      .click();
    await expect(transcription.locator("pre")).toContainText(
      "3 cups rolled oats",
    );

    /* The photo is the image to upload; Submit stores it. */
    await expect(page.getByAltText("Image to upload")).toBeVisible();
    /* The box follows its state after the import (38e review): unticked,
     * the field lets go of the photo and its preview; ticked again, it
     * holds both once more. */
    const imageField = form.locator('input[name="image"]');
    const filesHeld = () =>
      imageField.evaluate((input: HTMLInputElement) => input.files?.length);
    await expect.poll(filesHeld).toBe(1);
    const useFirst = page.getByLabel(
      "Use the first photo as the recipe's image",
      { exact: true },
    );
    await useFirst.uncheck();
    await expect(page.getByAltText("Image to upload")).toHaveCount(0);
    await expect.poll(filesHeld).toBe(0);
    await useFirst.check();
    await expect(page.getByAltText("Image to upload")).toBeVisible();
    await expect.poll(filesHeld).toBe(1);
    await page
      .getByRole("button", { name: "Create recipe", exact: true })
      .click();
    await expect(page.getByLabel("Multiply")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("img").first()).toHaveAttribute(
      "src",
      /^\/image\/uploads\/recipe\/grandmas-oat-cookies\/uploads\/oat-cookie-card\.jpg\//,
    );
  });

  test("takes at most four photos, and one can be removed", async ({
    page,
    request,
  }) => {
    await useModels(request, { url: modelUrl, vision: "qwen2.5vl:7b" });
    await page.reload();
    await markdownEditorReady(page, "description");
    await page.getByRole("radio", { name: PHOTO, exact: true }).check();
    const add = page.getByLabel("Add photos of the recipe", { exact: true });
    await add.setInputFiles([CARD, CARD, CARD]);
    await add.setInputFiles([CARD, CARD]);
    const list = page.getByTestId("import-photo-list");
    await expect(list.locator("li")).toHaveCount(4);
    await expect(
      page.getByText("At most 4 photos — the first 4 are kept."),
    ).toBeVisible();
    await expect(add).toBeDisabled();
    await page
      .getByRole("button", { name: "Remove page 2, oat-cookie-card.jpg" })
      .click();
    await expect(list.locator("li")).toHaveCount(3);
    await expect(add).toBeEnabled();
    /* Back to a link: the URL field again. */
    await page.getByRole("radio", { name: "A link", exact: true }).check();
    await expect(page.getByLabel("Import from URL")).toBeVisible();
  });
});
