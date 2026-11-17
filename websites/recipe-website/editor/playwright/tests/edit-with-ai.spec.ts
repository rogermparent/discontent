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
 * 47i: "Edit with AI" on the edit page. A stand-in model on loopback
 * (`fixtures/llm/standInModel.ts`, never a real one) answers a request by
 * rule on its words — "parentheses" takes the "(…)" out of the ingredient
 * lines, "vegetarian" adds the tag, "slug" tries to change the slug (which
 * the check refuses). The change arrives marked in the form; only Save
 * stores it. The suite pins the model off (T18); this spec turns it on
 * through the TEST_MODE-only `/settings/test-llm`, off again after each.
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

const SLUG = "paren-cake";

/* The wait for the recipe page after Save (dev mode compiles it first). */
const SAVE_WAIT = 45_000;

/** A recipe with no source: the box has no fill, only requests. */
async function writeCake(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Paren Cake",
      slug: SLUG,
      description: "One bowl.",
      tags: ["dessert"],
      ingredients: [
        "2 cups flour (sifted)",
        "1 egg (large)",
        "butter, for the pan",
      ],
      instructions: [
        { text: "Mix the flour and the egg.", uses: ["flour", "egg"] },
        "Bake until golden.",
      ],
    },
  });
  expect(response.status()).toBe(201);
}

async function openEdit(page: Page) {
  await page.goto(`/recipe/${SLUG}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
}

async function ask(page: Page, request: string) {
  const box = page.getByTestId("edit-with-ai");
  const field = box.getByLabel("What should change?", { exact: true });
  await expectHydrated(field);
  await field.fill(request);
  await box.getByRole("button", { name: "Send", exact: true }).click();
  await expect(box.getByTestId("edit-summary")).toBeVisible({
    timeout: 30_000,
  });
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

const ingredientInputs = (page: Page) =>
  page.locator('#recipe-form [name$="].ingredient"]');

test.describe("Edit with AI (47i)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("importable-uploads");
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("a request's change is marked; Undo one, Accept the other, Save stores only what is left", async ({
    page,
    request,
    createApiToken,
  }) => {
    test.slow();
    await useModel(request, modelUrl);
    await writeCake(request, await createApiToken());
    await openEdit(page);
    const box = page.getByTestId("edit-with-ai");
    await expect(box).toContainText("local model qwen3:8b reads the form");
    /* No source: no fill in the box, and the example requests are there. */
    await expect(page.getByTestId("fill-from-source")).toHaveCount(0);
    await box
      .getByRole("group", { name: "Example requests" })
      .getByRole("button", { name: "Convert to metric" })
      .click();
    await expect(box.getByLabel("What should change?")).toHaveValue(
      "Convert to metric",
    );

    await ask(page, "Remove the parentheses and add a vegetarian tag");
    await expect(box.getByTestId("edit-summary")).toHaveText(
      "Changed by local model qwen3:8b: tags and ingredients — I took the parentheses out of the ingredients and added the vegetarian tag. Review each below, then Save.",
    );
    /* The panel names the model's step. */
    const panel = page.getByTestId("import-progress");
    await panel.getByText(/^\d+ steps?$/).click();
    await expect(panel.locator('[data-step="llm.edit"]')).toContainText(
      "Model answers the request",
    );

    /* In the form, marked: the values, the headings, the rail. */
    await expect(ingredientInputs(page).first()).toHaveValue("2 cups flour");
    await expect(page.locator("#recipe-section-ingredients")).toContainText(
      "edited",
    );
    await expect(page.locator("#recipe-section-tags")).toContainText("edited");
    const rail = page.getByRole("navigation", { name: "Parts of this recipe" });
    await expect(rail.getByRole("link", { name: /^Ingredients/ })).toHaveText(
      /3 · edited/,
    );
    /* Before → after, line by line. */
    const ingredients = box.getByTestId("edit-field-ingredients");
    await expect(ingredients).toContainText("2 cups flour (sifted)");
    await expect(ingredients).toContainText("Before: 1 egg (large)");
    await expect(ingredients).toContainText("After: 1 egg");
    await axeClean(page);

    /* Undo the tags: back as they were, its row gone. */
    await box
      .getByRole("button", { name: "Undo the change to the tags" })
      .click();
    await expect(box.getByTestId("edit-said")).toHaveText(
      "Undone: the tags are back to what they held before the request.",
    );
    await expect(box.getByTestId("edit-field-tags")).toHaveCount(0);
    await expect(page.locator("#recipe-section-tags")).not.toContainText(
      "edited",
    );
    /* The remount kept the request's other change. */
    await expect(ingredientInputs(page).first()).toHaveValue("2 cups flour");

    /* Accept the ingredients: the mark goes, the value stays. */
    await box
      .getByRole("button", { name: "Accept the change to the ingredients" })
      .click();
    await expect(box.getByTestId("edit-said")).toHaveText(
      "Accepted the change to the ingredients. Not saved yet.",
    );
    await expect(ingredients).toContainText("accepted · not saved yet");
    await expect(page.locator("#recipe-section-ingredients")).not.toContainText(
      "edited",
    );
    await expect(
      rail.getByRole("link", { name: /^Ingredients/ }),
    ).not.toHaveText(/edited/);
    await axeClean(page);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: SAVE_WAIT,
    });
    const stored = await (await request.get(`/api/recipe/${SLUG}`)).json();
    expect(
      stored.ingredients.map((line: { ingredient: string }) =>
        line.ingredient.replace(
          /<Multiplyable baseNumber="([^"]*)" \/>/g,
          "$1",
        ),
      ),
    ).toEqual(["2 cups flour", "1 egg", "butter, for the pan"]);
    expect(stored.tags).toEqual(["dessert"]);
    /* The step's stored uses came through untouched. */
    expect(stored.instructions[0]).toEqual({
      text: "Mix the flour and the egg.",
      uses: ["flour", "egg"],
    });

    /* Reloaded: the saved values, and no marks. */
    await openEdit(page);
    await expect(ingredientInputs(page).first()).toHaveValue("2 cups flour");
    await expect(page.getByTestId("edit-changes")).toHaveCount(0);
  });

  test("an answer that changes the slug is refused and nothing in the form moves", async ({
    page,
    request,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    await writeCake(request, await createApiToken());
    await openEdit(page);
    await ask(page, "Change the slug");
    const box = page.getByTestId("edit-with-ai");
    await expect(box.getByTestId("edit-summary")).toHaveText(
      "Local model qwen3:8b's answer was not applied: it changes “slug”, which a request may not change (only name, description, yield, tags, ingredients, steps, prep time, cook time, total time, drink spec and source).",
    );
    await expect(box.getByTestId("edit-changes")).toHaveCount(0);
    await expect(page.getByTestId("recipe-form-changes")).toHaveText(
      "No changes",
    );
    await expect(page.getByLabel("Slug")).toHaveValue(SLUG);
    /* No Claude here, so nothing to try instead. */
    await expect(
      box.getByRole("button", { name: "Try with Claude" }),
    ).toHaveCount(0);
  });

  test("with no model and no source there is no box at all", async ({
    page,
    request,
    createApiToken,
  }) => {
    await writeCake(request, await createApiToken());
    await openEdit(page);
    await expect(page.getByTestId("edit-with-ai")).toHaveCount(0);
    await expect(page.getByLabel("What should change?")).toHaveCount(0);
    await expect(page.getByTestId("fill-from-source")).toHaveCount(0);
  });
});
