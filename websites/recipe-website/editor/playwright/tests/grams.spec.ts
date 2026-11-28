import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import {
  fillSignInForm,
  markdownEditorReady,
  signIn,
} from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { WCAG_TAGS } from "../support/a11y";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 51f: grams. The edit page's "Add grams" in its three steps — Roger's
 * paste matched to Pouding Chômeur (Vivaldi)'s lines from before he added
 * grams by hand, the bank for what it leaves, and a stand-in model on
 * loopback (never a real one) for the eggs — each line marked until Keep or
 * Undo, Save held until then; the recipe page's "Show grams"; and Settings
 * › Conversions (search, edit, reset, add, remove).
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

const SLUG = "pouding-chomeur-vivaldi";

/* The mock-up's lines: the recipe as it was before e2396919. */
const VIVALDI = [
  "2 cups brown sugar",
  "1 1/2 cups water",
  "1/2 cup maple syrup",
  "1 tbsp flour",
  "1 1/2 cups all-purpose flour",
  "2 1/2 tsp baking powder",
  "a pinch salt",
  "1/2 cup butter",
  "1 cup granulated sugar",
  "2 eggs",
  "3/4 cup milk",
  "1 tsp vanilla extract",
  "1 tbsp butter",
];

/* Roger's paste from the source, exactly. */
const PASTE = [
  "400 gbrown sugar",
  "355 gwater",
  "160 gmaple syrup",
  "1 tbspflour",
  "190 gall-purpose flour",
  "2½ tspbaking powder",
  "a pinchsalt",
  "115 gbutter",
  "200 ggranulated sugar",
  "2egg",
  "180 gmilk",
  "1 tspvanilla extract",
  "1 tbspbutter",
].join("\n");

async function writeRecipe(
  request: APIRequestContext,
  token: string,
  ingredients: string[] = VIVALDI,
  slug = SLUG,
): Promise<void> {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Pouding Chomeur Vivaldi",
      slug,
      ingredients,
      instructions: ["Bake until golden."],
    },
  });
  expect(response.status()).toBe(201);
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const ingredientInputs = (page: Page) =>
  page.locator('#recipe-form [name$="].ingredient"]');

/* The wait for the recipe page after Save (dev mode compiles it first). */
const SAVE_WAIT = 45_000;

test.describe("Add grams on the edit page (51f)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("paste, then the bank, then the model; each line marked, Save held until kept or undone", async ({
    page,
    request,
    createApiToken,
  }) => {
    test.slow();
    await useModel(request, modelUrl);
    await writeRecipe(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}/edit`);
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");

    const open = page.getByRole("button", { name: "Add grams", exact: true });
    await expectHydrated(open);
    await open.click();
    const panel = page.getByTestId("grams-panel");
    await expect(panel).toBeVisible();

    /* 1 · Paste: seven lines get grams, six pasted lines had none. */
    await panel.getByLabel(/Paste the source's metric ingredients/).fill(PASTE);
    await panel.getByRole("button", { name: "Match to lines" }).click();
    await expect(panel).toContainText(
      "7 lines got grams; 6 pasted lines had none.",
    );
    await expect(ingredientInputs(page).first()).toHaveValue(
      '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="400" />g) brown sugar',
    );
    const marks = page.getByTestId("grams-line-mark");
    await expect(marks).toHaveCount(7);
    await expect(marks.first()).toContainText("Pasted");
    await expect(page.getByTestId("grams-tally")).toHaveText(
      "0 kept · 7 marked to review",
    );

    /* Save waits for the marks. */
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();
    await expect(page.getByTestId("recipe-form-held")).toHaveText(
      "Keep or undo the 7 marked gram lines before saving.",
    );

    /* 2 · The bank: the flour, baking powder, vanilla and tablespoon of butter. */
    await panel.getByRole("button", { name: "Fill from the bank" }).click();
    await expect(panel).toContainText("4 filled; 1 not in the bank");
    await expect(ingredientInputs(page).nth(5)).toHaveValue(
      '<Multiplyable baseNumber="2 1/2" /> tsp (<Multiplyable baseNumber="10" />g) baking powder',
    );
    await expect(
      page.locator('[data-testid="grams-line-mark"][data-source="bank"]'),
    ).toHaveCount(4);

    /* 3 · The model, for the eggs only; the pinch is left as written. */
    await panel
      .getByRole("button", { name: "Ask the model for the rest" })
      .click();
    await expect(panel).toContainText("1 estimated by", { timeout: 30_000 });
    await expect(panel).toContainText(
      "Left as written: a pinch salt (nothing to weigh).",
    );
    const eggs = page.locator(
      '[data-testid="grams-line-mark"][data-source="model"]',
    );
    await expect(eggs).toContainText("≈ Model");
    await expect(eggs).toContainText("100g");
    await expect(ingredientInputs(page).nth(9)).toHaveValue(
      '<Multiplyable baseNumber="2" /> eggs (<Multiplyable baseNumber="100" />g)',
    );
    await axeClean(page);

    /* Undo one: the line is as it was, and the paste won't propose it again. */
    await page
      .getByRole("button", { name: "Undo the grams on ingredient 2" })
      .click();
    await expect(ingredientInputs(page).nth(1)).toHaveValue(
      '<Multiplyable baseNumber="1 1/2" /> cups water',
    );
    await panel.getByRole("button", { name: "Match to lines" }).click();
    await expect(ingredientInputs(page).nth(1)).toHaveValue(
      '<Multiplyable baseNumber="1 1/2" /> cups water',
    );

    /* Keep one, then all: Save is free. */
    await page
      .getByRole("button", { name: "Keep the grams on ingredient 1" })
      .click();
    await expect(marks.first()).toContainText("Kept · Pasted");
    await panel.getByRole("button", { name: "Keep all marked" }).click();
    await expect(page.getByTestId("grams-tally")).toHaveText(
      "11 kept · 0 marked to review",
    );
    await expect(page.getByTestId("recipe-form-held")).toHaveCount(0);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: SAVE_WAIT,
    });
    const list = page.getByRole("list", { name: "Ingredients" });
    await expect(list).toContainText("2 cups (400g) brown sugar");
    await expect(list).not.toContainText("(355g)");
    await expect(list).toContainText("2 eggs (100g)");
  });

  /* Review finding 2: Edit with AI remounts the form; the marks and Save's
   * hold come back with it. And Enter in a field doesn't save around it. */
  test("the marks and Save's hold outlive Edit with AI, and Enter doesn't save", async ({
    page,
    request,
    createApiToken,
  }) => {
    test.slow();
    await useModel(request, modelUrl);
    await writeRecipe(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}/edit`);
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const open = page.getByRole("button", { name: "Add grams", exact: true });
    await expectHydrated(open);
    await open.click();
    const panel = page.getByTestId("grams-panel");
    await panel.getByLabel(/Paste the source's metric ingredients/).fill(PASTE);
    await panel.getByRole("button", { name: "Match to lines" }).click();
    const marks = page.getByTestId("grams-line-mark");
    await expect(marks).toHaveCount(7);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeDisabled();

    /* Edit with AI: a request that adds a tag, the form remounted. */
    const box = page.getByTestId("edit-with-ai");
    const field = box.getByLabel("What should change?", { exact: true });
    await field.fill("Add a vegetarian tag");
    await box.getByRole("button", { name: "Send", exact: true }).click();
    await expect(box.getByTestId("edit-summary")).toBeVisible({
      timeout: 30_000,
    });
    await expect(ingredientInputs(page).first()).toHaveValue(
      '<Multiplyable baseNumber="2" /> cups (<Multiplyable baseNumber="400" />g) brown sugar',
    );
    await expect(marks).toHaveCount(7);
    await expect(save).toBeDisabled();
    await expect(page.getByTestId("recipe-form-held")).toHaveText(
      "Keep or undo the 7 marked gram lines before saving.",
    );

    /* Enter in a field: the form refuses the submit while Save is held. */
    const name = page.getByLabel("Name").first();
    await name.focus();
    await name.press("Enter");
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}/edit$`));
    const stored = await (await request.get(`/api/recipe/${SLUG}`)).json();
    expect(stored.ingredients[0].ingredient).toBe(
      '<Multiplyable baseNumber="2" /> cups brown sugar',
    );
  });

  /* Review finding 3: identical lines keep a mark each. */
  test("two identical lines are marked, kept and undone one at a time", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writeRecipe(request, await createApiToken(), [
      "1/2 cup butter",
      "2 eggs",
      "1/2 cup butter",
    ]);
    await page.goto(`/recipe/${SLUG}/edit`);
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const open = page.getByRole("button", { name: "Add grams", exact: true });
    await expectHydrated(open);
    await open.click();
    const panel = page.getByTestId("grams-panel");
    await panel.getByRole("button", { name: "Fill from the bank" }).click();
    const marks = page.getByTestId("grams-line-mark");
    await expect(marks).toHaveCount(2);
    const butter =
      '<Multiplyable baseNumber="1/2" /> cup (<Multiplyable baseNumber="114" />g) butter';
    await expect(ingredientInputs(page).nth(0)).toHaveValue(butter);
    await expect(ingredientInputs(page).nth(2)).toHaveValue(butter);

    await page
      .getByRole("button", { name: "Undo the grams on ingredient 3" })
      .click();
    await expect(ingredientInputs(page).nth(2)).toHaveValue(
      '<Multiplyable baseNumber="1/2" /> cup butter',
    );
    await expect(ingredientInputs(page).nth(0)).toHaveValue(butter);
    await expect(marks).toHaveCount(1);
    await expect(page.getByTestId("recipe-form-held")).toHaveText(
      "Keep or undo the 1 marked gram line before saving.",
    );

    /* Keep: focus moves on to Undo, and Save is free. */
    await page
      .getByRole("button", { name: "Keep the grams on ingredient 1" })
      .click();
    await expect(
      page.getByRole("button", { name: "Undo the grams on ingredient 1" }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
  });

  test("Save to the bank keeps a pasted value for next time", async ({
    page,
    request,
    createApiToken,
  }) => {
    test.slow();
    await writeRecipe(request, await createApiToken());
    await page.goto(`/recipe/${SLUG}/edit`);
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const open = page.getByRole("button", { name: "Add grams", exact: true });
    await expectHydrated(open);
    await open.click();
    const panel = page.getByTestId("grams-panel");
    await panel
      .getByLabel(/Paste the source's metric ingredients/)
      .fill("160 gmaple syrup");
    await panel.getByRole("button", { name: "Match to lines" }).click();
    await page
      .getByRole("button", {
        name: "Save to the bank: ingredient 3's grams",
      })
      .click();
    await expect(page.getByTestId("grams-line-mark").first()).toContainText(
      "Saved: maple syrup, 320 g a cup.",
    );
    /* No model was asked and the line is still marked: Save still waits. */
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();

    await page.goto("/settings/conversions");
    const search = page.getByLabel("Search the bank", { exact: true });
    await expectHydrated(search);
    await search.fill("maple syrup");
    const row = page
      .getByTestId("conversions-row")
      .filter({ hasText: "maple syrup" })
      .first();
    await expect(row).toContainText("Changed (was 312)");
  });
});

test.describe("Show grams on the recipe page (51f)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("works grams out from the bank, marked ≈ and scaled; stored grams as they are", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writeRecipe(request, await createApiToken(), [
      "2 cups brown sugar",
      "1 1/2 cups (190g) all-purpose flour",
      "2 eggs",
      "a pinch salt",
    ]);
    await page.goto(`/recipe/${SLUG}`);
    const toggle = page.getByRole("group", { name: "Grams" });
    const show = toggle.getByRole("button", { name: "Show grams" });
    await expectHydrated(show);
    await expect(page.getByTestId("grams-estimate")).toHaveCount(0);
    await show.click();
    await expect(show).toHaveAttribute("aria-pressed", "true");
    const estimates = page.getByTestId("grams-estimate");
    await expect(estimates).toHaveCount(1);
    await expect(estimates.first()).toHaveText("≈ about 426g");
    const list = page.getByRole("list", { name: "Ingredients" });
    await expect(list).toContainText("(190g) all-purpose flour");
    await page.getByRole("button", { name: /2× \(Double batch\)/ }).click();
    await expect(estimates.first()).toHaveText("≈ about 852g");
    await axeClean(page);
    await toggle.getByRole("button", { name: "As written" }).click();
    await expect(page.getByTestId("grams-estimate")).toHaveCount(0);
  });
});

test.describe("Settings › Conversions (51f)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("search, change, reset, add and remove", async ({ page }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/settings/conversions");
    const search = page.getByLabel("Search the bank", { exact: true });
    await expectHydrated(search);
    await axeClean(page);

    await search.fill("maple syrup");
    const row = page
      .getByTestId("conversions-row")
      .filter({ hasText: "maple syrup" })
      .first();
    await expect(row).toContainText("Built in");
    const field = row.getByLabel("Grams a cup of maple syrup", { exact: true });
    await expect(field).toHaveValue("312");
    await field.fill("300");
    await row.getByRole("button", { name: "Save maple syrup" }).click();
    await expect(
      page.getByTestId("conversions").getByRole("status"),
    ).toContainText("Saved maple syrup: 300 g a cup.");
    await expect(row).toContainText("Changed (was 312)");
    await row
      .getByRole("button", { name: "Reset maple syrup to the built-in value" })
      .click();
    await expect(row).toContainText("Built in");
    await expect(row.getByLabel("Grams a cup of maple syrup")).toHaveValue(
      "312",
    );

    const add = page.getByRole("form", { name: "Add a conversion" });
    await add.getByLabel("Ingredient", { exact: true }).fill("ground cardamom");
    await add.getByLabel("Grams a cup", { exact: true }).fill("96");
    await add.getByRole("button", { name: "Add" }).click();
    await search.fill("cardamom");
    const mine = page
      .getByTestId("conversions-row")
      .filter({ hasText: "ground cardamom" });
    await expect(mine).toContainText("Yours");
    await mine.getByRole("button", { name: "Remove ground cardamom" }).click();
    await expect(mine).toHaveCount(0);
  });
});
