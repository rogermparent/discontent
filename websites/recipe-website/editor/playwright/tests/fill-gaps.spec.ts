import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 45b: "Fill gaps from the source" on the edit page. A recipe whose source
 * (`uploads/fill-bagels.html`, served by this editor) has recipe data but
 * states no times and no yield: the fill takes its ingredients, steps and
 * picture, keeps the recipe's own description, and a stand-in model on
 * loopback (`fixtures/llm/standInModel.ts`, never a real one) estimates the
 * times and yield. The suite pins the model off (T18); this spec turns it on
 * for this server process through the TEST_MODE-only `/settings/test-llm`,
 * off again after each test.
 */
let model: Server;
let modelUrl: string;

test.beforeAll(async () => {
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/api/chat") {
        response.end(
          JSON.stringify(
            standInChat(JSON.parse(Buffer.concat(chunks).toString())),
          ),
        );
      } else {
        response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
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

async function useModel(request: APIRequestContext, url?: string) {
  const response = await request.get(
    url
      ? `/settings/test-llm?url=${encodeURIComponent(url)}`
      : "/settings/test-llm",
  );
  expect(response.ok()).toBe(true);
}

const SLUG = "hour-bagels";

/** The stored recipe: a name, its own description, a tag and its source. */
async function writeBagels(
  request: APIRequestContext,
  token: string,
  baseURL: string,
  extra: Record<string, unknown> = {},
) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Hour Bagels",
      slug: SLUG,
      description: "Our Sunday bagels.",
      tags: ["bread"],
      source: { url: new URL("/uploads/fill-bagels.html", baseURL).href },
      ...extra,
    },
  });
  expect(response.status()).toBe(201);
}

async function openEdit(page: Page, slug = SLUG) {
  await page.goto(`/recipe/${slug}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
}

/**
 * Press "Fill gaps from the source" and wait for the fill to land: the job
 * in the address, its summary (cleared by the press, so never the last
 * fill's), the panel folded.
 */
async function fill(page: Page) {
  const button = page.getByRole("button", {
    name: "Fill gaps from the source",
    exact: true,
  });
  await expectHydrated(button);
  await button.click();
  await expect(page).toHaveURL(
    new RegExp(`/recipe/${SLUG}/edit\\?fill=[0-9A-Z]{26}$`),
  );
  await expect(page.getByTestId("fill-summary")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId("import-progress").getByRole("heading", { level: 3 }),
  ).toHaveText("Fill done");
}

test.describe("Fill gaps from the source (45b)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("importable-uploads");
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("fills the empty fields, marks them and the estimate, and Save stores them", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    const token = await createApiToken();
    await writeBagels(request, token, baseURL!);
    /* The picker offers a suggestion only for a tag with a term record. */
    const term = await request.post("/api/taxonomies/tag", {
      headers: { authorization: `Bearer ${token}` },
      data: { label: "Breakfast" },
    });
    expect(term.status()).toBe(201);
    await openEdit(page);
    const strip = page.getByTestId("fill-from-source");
    await expect(strip).toContainText("fills only what is empty");
    await expect(strip.getByTestId("fill-empty")).toHaveText(
      "yield, prep time, cook time, total time, ingredients, steps and picture",
    );
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );

    /* The job is in the address (`fill`): a reload, or /jobs, reopens it. */
    await fill(page);
    /* The estimate is its own named step in the panel. */
    const panel = page.getByTestId("import-progress");
    await panel.getByText(/^\d+ steps?$/).click();
    await expect(panel.locator('[data-step="llm.estimate"]')).toContainText(
      "Model estimates the times and yield",
    );

    const summary = page.getByTestId("fill-summary");
    await expect(summary).toContainText(
      "Filled from the source: picture, ingredients and steps.",
    );
    await expect(summary).toContainText(
      "Estimated by local model qwen3:8b: prep time, cook time, total time and yield — 25 min rise",
    );

    const form = page.locator("#recipe-form");
    /* F1: the recipe's own description stands. */
    await expect(page.getByTestId("fill-summary")).not.toContainText(
      "description",
    );
    await expect(form.getByTitle("Prep Time Minutes")).toHaveValue("20");
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("17");
    await expect(form.getByTitle("Total Time Hours")).toHaveValue("1");
    await expect(form.getByTitle("Total Time Minutes")).toHaveValue("15");
    await expect(
      form.locator('[name="ingredients[0].ingredient"]'),
    ).toHaveCount(1);

    /* Marks: each filled section, each estimated field, the basis in text. */
    await expect(page.locator("#recipe-section-ingredients")).toContainText(
      "from the source",
    );
    await expect(page.locator("#recipe-section-steps")).toContainText(
      "from the source",
    );
    await expect(page.locator("#recipe-section-picture")).toContainText(
      "from the source",
    );
    await expect(page.locator("#recipe-section-times")).toContainText(
      "estimated",
    );
    const times = page.getByTestId("fill-estimated-times");
    await expect(times.getByTestId("fill-estimated-mark")).toHaveText([
      "estimated · prep time",
      "estimated · cook time",
      "estimated · total time",
    ]);
    await expect(times).toContainText(
      "Estimated by local model qwen3:8b: 25 min rise + 20 min proof",
    );
    await expect(page.getByTestId("fill-estimated-recipe")).toContainText(
      "estimated · yield",
    );
    /* The source's tags are suggestions, never added (43e2). */
    await expect(
      page.getByRole("button", { name: "Accept suggested tag Breakfast" }),
    ).toBeVisible();

    /* The rail counts the fills against the stored recipe, and marks them. */
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link", { name: /^Ingredients/ })).toHaveText(
      "4Ingredients: 4 · filled",
    );
    await expect(rail.getByRole("link", { name: /^Times/ })).toHaveText(
      "6Times: 1h 15m · est.",
    );
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "7 changes · not saved",
    );
    /* An edited estimate is the person's: its mark goes. */
    await form.getByTitle("Prep Time Minutes").fill("25");
    await expect(times.getByTestId("fill-estimated-mark")).toHaveText([
      "estimated · cook time",
      "estimated · total time",
    ]);

    await axeClean(page);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    /* The edit page's own h1 says "Hour Bagels" too: wait for the address. */
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Hour Bagels", exact: true }),
    ).toBeVisible();
    const stored = await (await request.get(`/api/recipe/${SLUG}`)).json();
    expect(stored).toMatchObject({
      name: "Hour Bagels",
      description: "Our Sunday bagels.",
      prepTime: 25,
      cookTime: 17,
      totalTime: 75,
      recipeYield: "8 bagels",
      tags: ["bread"],
      image: "recipe-imported-image-566x566.png",
    });
    expect(stored.ingredients).toHaveLength(4);
    expect(stored.instructions).toHaveLength(4);
  });

  test("Undo puts the stored recipe back, and a reload of ?fill= fills again", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    await writeBagels(request, await createApiToken(), baseURL!);
    await openEdit(page);
    await fill(page);
    const form = page.locator("#recipe-form");
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("17");

    await page
      .getByTestId("fill-summary")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(page.getByTestId("fill-undone")).toHaveText(
      "Undone: the form is back to the stored recipe.",
    );
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("");
    await expect(
      form.locator('[name="ingredients[0].ingredient"]'),
    ).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
    await expect(page.locator("#recipe-section-ingredients")).not.toContainText(
      "from the source",
    );
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}/edit$`));

    /* Fill again, then reload: the job's result fills the form once more. */
    await fill(page);
    await page.reload();
    await markdownEditorReady(page, "description");
    await expect(page.getByTestId("fill-summary")).toContainText(
      "Filled from the source: picture, ingredients and steps.",
    );
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("17");
  });

  test("a fill or Undo after a failed Save wins: Undo restores, Fill again remounts", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    const token = await createApiToken();
    await writeBagels(request, token, baseURL!);
    const other = await request.post("/api/recipes", {
      headers: { authorization: `Bearer ${token}` },
      data: { name: "Other Bagels", slug: "other-bagels" },
    });
    expect(other.status()).toBe(201);
    await openEdit(page);
    await fill(page);
    const form = page.locator("#recipe-form");
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("17");

    /* A Save refused (the slug is taken): the form holds what was sent. */
    await page.getByLabel("Slug").fill("other-bagels");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();

    await page
      .getByTestId("fill-summary")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(page.getByTestId("fill-undone")).toBeVisible();
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("");
    await expect(page.getByLabel("Slug")).toHaveValue(SLUG);
    await expect(
      form.locator('[name="ingredients[0].ingredient"]'),
    ).toHaveCount(0);
    await expect(page.getByText(/already exists/i)).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );

    await fill(page);
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("17");
    await expect(
      form.locator('[name="ingredients[0].ingredient"]'),
    ).toHaveCount(1);
  });

  test("a cook time and a video URL typed before Fill both survive it", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    await writeBagels(request, await createApiToken(), baseURL!);
    await openEdit(page);
    const form = page.locator("#recipe-form");
    await form.getByTitle("Cook Time Minutes").fill("30");
    const video = new URL("/uploads/fill-bagels.mp4", baseURL).href;
    await page.getByLabel("Enter URL").check();
    await page.getByLabel("Video URL").fill(video);
    await page.getByLabel("Video URL").blur();

    await fill(page);
    const summary = page.getByTestId("fill-summary");
    await expect(summary).toContainText(
      "Filled from the source: picture, ingredients and steps.",
    );
    /* The typed cook time stands; only the empty times are estimated. */
    await expect(summary).toContainText(
      "Estimated by local model qwen3:8b: prep time, total time and yield",
    );
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("30");
    await expect(page.getByLabel("Video URL")).toHaveValue(video);
    await expect(form.locator('input[name="videoUrl"]')).toHaveValue(video);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: 15_000,
    });
    const stored = await (await request.get(`/api/recipe/${SLUG}`)).json();
    expect(stored).toMatchObject({ cookTime: 30, video, totalTime: 75 });
  });

  test("with no model, fills from the source alone and says the estimate was skipped", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await writeBagels(request, await createApiToken(), baseURL!);
    await openEdit(page);
    await expect(page.getByTestId("fill-from-source")).toContainText(
      "No model is configured, so nothing is estimated.",
    );
    await fill(page);
    await expect(page.getByTestId("fill-summary")).toContainText(
      "Filled from the source: picture, ingredients and steps.",
    );
    await expect(page.getByTestId("fill-summary")).not.toContainText(
      "Estimated",
    );
    await expect(page.getByTestId("fill-notes")).toContainText(
      "No model is configured, so the times and yield the source doesn't state were not estimated.",
    );
    const form = page.locator("#recipe-form");
    await expect(form.getByTitle("Cook Time Minutes")).toHaveValue("");
    await expect(page.getByTestId("fill-estimated-times")).toHaveCount(0);
  });

  test("a source with nothing new says so; a recipe with no source has no fill", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    const token = await createApiToken();
    await writeBagels(request, token, baseURL!, {
      recipeYield: "8 bagels",
      prepTime: 20,
      cookTime: 17,
      totalTime: 75,
      ingredients: ["500g bread flour"],
      instructions: ["Mix."],
      imageImportUrl: new URL(
        "/uploads/recipe-imported-image-566x566.png",
        baseURL,
      ).href,
    });
    await openEdit(page);
    /* Nothing the hint names is empty: one quiet line, the button in it. */
    await expect(page.getByTestId("fill-from-source")).toHaveText(
      /^Fill gaps from the source\s*Nothing looks empty\.$/,
    );
    await fill(page);
    await expect(page.getByTestId("fill-summary")).toHaveText(
      "Nothing new from the source: every field it has is already filled.",
    );
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );

    const created = await request.post("/api/recipes", {
      headers: { authorization: `Bearer ${token}` },
      data: { name: "No Source Here", slug: "no-source-here" },
    });
    expect(created.status()).toBe(201);
    await page.goto("/recipe/no-source-here/edit");
    await markdownEditorReady(page, "description");
    await expect(page.getByTestId("fill-from-source")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Fill gaps from the source" }),
    ).toHaveCount(0);
  });
});

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}
