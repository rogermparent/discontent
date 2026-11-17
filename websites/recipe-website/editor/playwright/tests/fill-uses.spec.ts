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
 * 47g: "Fill gaps from the source" also has the model read what each step
 * uses. A stand-in model on loopback (`fixtures/llm/standInModel.ts`, never a
 * real one) answers by rule: a step that says "everything" brings in every
 * line, one that says "the bowl" nothing, and it has no opinion on the rest.
 * The suggestions arrive under their steps, marked and not applied; only an
 * accepted one is stored by Save. The suite pins the model off (T18); this
 * spec turns it on through the TEST_MODE-only `/settings/test-llm`, off again
 * after each test — with `&uses=1`, because the stand-in is a local model to
 * the editor, and a local model is not asked this unless opted in (Dg2).
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

async function useModel(
  request: APIRequestContext,
  url?: string,
  { uses = true }: { uses?: boolean } = {},
) {
  const response = await request.get(
    url
      ? `/settings/test-llm?url=${encodeURIComponent(url)}${uses ? "&uses=1" : ""}`
      : "/settings/test-llm",
  );
  expect(response.ok()).toBe(true);
}

const SLUG = "bowl-cake";

/*
 * The wait for the recipe page after Save. In dev mode the first save of a
 * run compiles the recipe page and downloads the source's picture: 15 s was
 * not always enough there (the first dev run needed a retry).
 */
const SAVE_WAIT = 45_000;

const STEPS = [
  "Mix everything together.",
  "Beat the egg into the bowl again.",
  "Bake until golden.",
];

/**
 * A recipe with nothing empty but its picture: the fill brings the source's
 * picture, and the model's reading of the three steps.
 */
async function writeCake(
  request: APIRequestContext,
  token: string,
  baseURL: string,
  instructions: unknown[] = STEPS,
) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Bowl Cake",
      slug: SLUG,
      description: "One bowl.",
      recipeYield: "1 cake",
      prepTime: 10,
      cookTime: 30,
      totalTime: 40,
      ingredients: ["2 cups flour", "1 egg", "butter, for the pan"],
      instructions,
      source: { url: new URL("/uploads/fill-bagels.html", baseURL).href },
    },
  });
  expect(response.status()).toBe(201);
}

async function openEdit(page: Page) {
  await page.goto(`/recipe/${SLUG}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
}

async function fill(page: Page) {
  const button = page.getByRole("button", {
    name: "Fill gaps from the source",
    exact: true,
  });
  await expectHydrated(button);
  await button.click();
  await expect(page.getByTestId("fill-summary")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByTestId("import-progress").getByRole("heading", { level: 3 }),
  ).toHaveText("Fill done");
}

const usesOf = (page: Page, step: number) =>
  page.getByRole("group", { name: `What step ${step} uses`, exact: true });
const chips = (page: Page, step: number) =>
  usesOf(page, step).getByTestId("step-uses-chip");
const suggestion = (page: Page, step: number) =>
  page.getByRole("group", {
    name: new RegExp(`^Suggested by local model qwen3:8b for step ${step}: `),
  });

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function storedSteps(request: APIRequestContext) {
  return (await (await request.get(`/api/recipe/${SLUG}`)).json()).instructions;
}

test.describe("Fill gaps suggests what each step uses (47g)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("importable-uploads");
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("offers each suggestion marked and unapplied; Accept, Undo and Dismiss by keyboard; Save stores only what was accepted", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    /* A fill, two axe passes and a save (or two): long in dev mode. */
    test.slow();
    await useModel(request, modelUrl);
    await writeCake(request, await createApiToken(), baseURL!);
    await openEdit(page);
    await expect(page.getByTestId("fill-from-source")).toContainText(
      "which also suggests what each step uses",
    );

    await fill(page);
    /* The reading is its own named step in the panel. */
    const panel = page.getByTestId("import-progress");
    await panel.getByText(/^\d+ steps?$/).click();
    await expect(panel.locator('[data-step="llm.uses"]')).toContainText(
      "Model reads what each step uses",
    );
    await expect(page.getByTestId("fill-uses")).toHaveText(
      "Suggested by local model qwen3:8b: what steps 1 and 2 use — not applied: accept or dismiss each in Steps.",
    );

    /* Offered, not applied: the chips are still the guess, and the only
     * change so far is the picture the source gave. */
    const steps = page.locator("#recipe-section-steps");
    await expect(steps.getByTestId("step-uses-suggestions")).toContainText(
      "Local model qwen3:8b suggests what steps 1 and 2 use.",
    );
    await expect(chips(page, 1)).toHaveCount(0);
    await expect(chips(page, 2)).toHaveText(["egg"]);
    await expect(suggestion(page, 1).getByTestId("step-uses-offer")).toHaveText(
      ["flour", "egg", "butter"],
    );
    await expect(suggestion(page, 2)).toHaveAccessibleName(
      "Suggested by local model qwen3:8b for step 2: uses nothing",
    );
    await expect(
      suggestion(page, 1).getByTestId("step-uses-suggested-mark"),
    ).toHaveText("suggested by local model qwen3:8b");
    /* The model had no opinion on step 3. */
    await expect(steps.getByTestId("step-uses-suggestion")).toHaveCount(2);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "1 change · not saved",
    );
    await axeClean(page);

    /* Accept by keyboard: the chips become the suggestion, the mark stays
     * with Undo, and focus lands on Undo. */
    const accept = page.getByRole("button", {
      name: "Accept the suggested ingredients for step 1",
    });
    await accept.focus();
    await page.keyboard.press("Enter");
    const undo = page.getByRole("button", {
      name: "Undo the suggested ingredients for step 1",
    });
    await expect(undo).toBeFocused();
    const status = page.getByTestId("step-uses-status");
    await expect(status).toHaveText(
      "Accepted the suggested ingredients for step 1. Not saved yet.",
    );
    await expect(status).toHaveAttribute("role", "status");
    await expect(chips(page, 1)).toHaveText(["flour", "egg", "butter"]);
    await expect(usesOf(page, 1)).toHaveAttribute("data-stored", "true");
    await expect(
      steps.locator(
        '[data-testid="step-uses-suggestion"][data-state="accepted"]',
      ),
    ).toContainText("Accepted. Not saved yet.");
    /* Step 1 now stands for the egg, so step 2 shows nothing by itself —
     * what the model said: its offer has nothing left to change. */
    await expect(chips(page, 2)).toHaveCount(0);
    await expect(suggestion(page, 2)).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "2 changes · not saved",
    );
    await axeClean(page);

    /* Undo by keyboard: back to the guess, the offers back, focus on Accept. */
    await page.keyboard.press("Enter");
    await expect(accept).toBeFocused();
    await expect(status).toHaveText(
      "Undone: step 1 is back to what it had before the suggestion.",
    );
    await expect(chips(page, 1)).toHaveCount(0);
    await expect(usesOf(page, 1)).toHaveAttribute("data-stored", "false");
    await expect(suggestion(page, 2)).toBeVisible();
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "1 change · not saved",
    );

    /* Dismiss step 2's: it goes, nothing changes, focus stays in the step. */
    await page
      .getByRole("button", {
        name: "Dismiss the suggested ingredients for step 2",
      })
      .click();
    await expect(suggestion(page, 2)).toHaveCount(0);
    await expect(status).toHaveText(
      "Dismissed the suggested ingredients for step 2.",
    );
    await expect(chips(page, 2)).toHaveText(["egg"]);
    await expect(
      page.getByRole("button", { name: "Add an ingredient to step 2" }),
    ).toBeFocused();
    await expect(steps.getByTestId("step-uses-suggestions")).toContainText(
      "suggests what step 1 uses.",
    );

    /* Accept step 1 again and save: only that list is stored. */
    await accept.click();
    await expect(chips(page, 1)).toHaveText(["flour", "egg", "butter"]);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: SAVE_WAIT,
    });
    expect(await storedSteps(request)).toEqual([
      { text: STEPS[0], uses: ["flour", "egg", "butter"] },
      { text: STEPS[1] },
      { text: STEPS[2] },
    ]);

    /* Fill again: the saved list is the person's now. It is not shown as a
     * suggestion "Accepted. Not saved yet.", and has no Undo to clear it. */
    await page.goto(`/recipe/${SLUG}/edit`);
    await markdownEditorReady(page, "description");
    await fill(page);
    await expect(page.getByTestId("fill-summary")).toContainText(
      "What each step uses was read by local model qwen3:8b: no change to suggest.",
    );
    await expect(chips(page, 1)).toHaveText(["flour", "egg", "butter"]);
    await expect(usesOf(page, 1)).toHaveAttribute("data-stored", "true");
    await expect(page.getByTestId("step-uses-suggestion")).toHaveCount(0);
    await expect(page.getByTestId("step-uses-suggested-mark")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Undo the suggested ingredients for step 1",
      }),
    ).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
  });

  test("a suggestion nobody accepted is not saved, and Accept all stores the fewest lists", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    /* A fill, two axe passes and a save (or two): long in dev mode. */
    test.slow();
    await useModel(request, modelUrl);
    await writeCake(request, await createApiToken(), baseURL!);
    await openEdit(page);
    await fill(page);
    await expect(suggestion(page, 1)).toBeVisible();

    /* Save with both offers still open: no step gains a list. */
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: SAVE_WAIT,
    });
    expect(await storedSteps(request)).toEqual(STEPS.map((text) => ({ text })));

    /* Again, this time taking both at once. */
    await page.goto(`/recipe/${SLUG}/edit`);
    await markdownEditorReady(page, "description");
    await fill(page);
    const all = page.getByRole("button", { name: "Accept all 2" });
    await expectHydrated(all);
    await all.click();
    await expect(chips(page, 1)).toHaveText(["flour", "egg", "butter"]);
    /* Step 1's list settles step 2's offer (nothing): one list is stored,
     * the same as `recipes fill`'s patch (Dg5). */
    await expect(chips(page, 2)).toHaveCount(0);
    await expect(usesOf(page, 2)).toHaveAttribute("data-stored", "false");
    await expect(page.getByTestId("step-uses-suggestions")).toHaveCount(0);
    await expect(page.getByTestId("step-uses-status")).toHaveText(
      "Accepted the suggested ingredients for step 1. Not saved yet.",
    );
    await expect(
      page.locator(
        '[data-testid="step-uses-suggestion"][data-state="accepted"]',
      ),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: SAVE_WAIT,
    });
    expect(await storedSteps(request)).toEqual([
      { text: STEPS[0], uses: ["flour", "egg", "butter"] },
      { text: STEPS[1] },
      { text: STEPS[2] },
    ]);
  });

  test("a step that already stores a list is left alone, and the fill's Undo takes the offers away", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    await writeCake(request, await createApiToken(), baseURL!, [
      { text: STEPS[0], uses: ["flour"] },
      STEPS[1],
      STEPS[2],
    ]);
    await openEdit(page);
    await fill(page);
    /* Step 1 is the person's: only step 2 is offered. */
    await expect(page.getByTestId("fill-uses")).toContainText(
      "what step 2 uses",
    );
    await expect(suggestion(page, 1)).toHaveCount(0);
    await expect(chips(page, 1)).toHaveText(["flour"]);
    await expect(suggestion(page, 2)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Accept all/ })).toHaveCount(
      0,
    );

    await page
      .getByTestId("fill-summary")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(page.getByTestId("fill-undone")).toBeVisible();
    await expect(page.getByTestId("step-uses-suggestion")).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
  });

  test("a local model that was not opted in is not asked, and the strip does not promise it", async ({
    page,
    request,
    baseURL,
    createApiToken,
  }) => {
    await useModel(request, modelUrl, { uses: false });
    await writeCake(request, await createApiToken(), baseURL!);
    await openEdit(page);
    const strip = page.getByTestId("fill-from-source");
    await expect(strip).toContainText("are estimated by qwen3:8b.");
    await expect(strip).not.toContainText("what each step uses");
    await fill(page);
    await expect(page.getByTestId("fill-uses")).toHaveCount(0);
    await expect(page.getByTestId("step-uses-suggestion")).toHaveCount(0);
    const panel = page.getByTestId("import-progress");
    await panel.getByText(/^\d+ steps?$/).click();
    await expect(panel.locator('[data-step="llm.uses"]')).toHaveCount(0);
  });
});
