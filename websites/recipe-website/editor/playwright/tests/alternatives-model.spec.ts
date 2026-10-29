import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { expectNoViolations } from "../support/a11y";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 46f: "Look for alternatives with the model" on the edit page (Roger on
 * 45-De2-1: "at least let this be an option to try out, maybe even in the
 * edit page to update an old recipe"). A stand-in model on loopback
 * (`fixtures/llm/standInModel.ts`, never a real one) proposes the run of
 * groups after the dough — and one number that names nothing, which the
 * grounding drops. What it finds is a card marked "suggested by the
 * model": accepted or put away in the form, stored only by Save (G5).
 * The suite pins the model off (T18); this spec turns it on for this
 * server process through the TEST_MODE-only `/settings/test-llm`, and off
 * again after each test.
 */
let model: Server;
let modelUrl: string;
/** An answer in place of the stand-in's own, for one test. */
let choicesAnswer: Record<string, unknown> | undefined;

test.beforeAll(async () => {
  model = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(200, { "content-type": "application/json" });
      if (request.url === "/api/chat") {
        response.end(
          JSON.stringify(
            standInChat(
              JSON.parse(Buffer.concat(chunks).toString()),
              choicesAnswer ? { choices: choicesAnswer } : {},
            ),
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

const SLUG = "old-dough";

/** An old recipe: a dough, then three bakes stacked one after another. */
async function writeOldDough(request: APIRequestContext, token: string) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: "Old Dough",
      slug: SLUG,
      ingredients: ["500 g bread flour", "350 g water"],
      instructions: [
        {
          name: "The dough",
          instructions: [{ text: "Mix the flour and water; rise 1 hour." }],
        },
        {
          name: "A sandwich loaf",
          instructions: [{ text: "Shape a loaf and bake 35 minutes." }],
        },
        {
          name: "Flatbreads",
          instructions: [{ text: "Roll thin and cook in a dry pan." }],
        },
        { text: "Cool before slicing." },
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

const lookButton = (page: Page) =>
  page.getByRole("button", {
    name: /^(Look for alternatives with the model|Asking the model…)$/,
  });

test.describe("Look for alternatives with the model (46f)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    choicesAnswer = undefined;
    await writeOldDough(request, await createApiToken());
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("with no model, the action is off and says why", async ({ page }) => {
    await openEdit(page);
    const button = page.getByRole("button", {
      name: "Look for alternatives with the model",
      exact: true,
    });
    await expect(button).toBeDisabled();
    await expect(page.getByTestId("model-choices-status")).toContainText(
      "No model is set up in this editor",
    );
    /* The rules' own panel is still there beside it. */
    await expect(
      page.getByRole("button", { name: "Make a choice of groups…" }),
    ).toBeVisible();
  });

  test("the model's suggestion is marked, accepted in the form, stored by Save", async ({
    page,
    request,
    createApiToken,
  }) => {
    await useModel(request, modelUrl);
    await openEdit(page);
    const button = lookButton(page);
    await expectHydrated(button);
    await expect(button).toBeEnabled();
    await button.click();

    const card = page.getByTestId("choice-suggestion");
    await expect(card).toContainText(
      "These 2 groups look like alternatives: A sandwich loaf and Flatbreads. Make them a choice, “Then make”?",
      { timeout: 30_000 },
    );
    await expect(card.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the model",
    );
    /* Focus on its accept button; the status says who and what was dropped. */
    await expect(
      card.getByRole("button", { name: "Make it a choice" }),
    ).toBeFocused();
    await expect(page.getByTestId("model-choices-status")).toHaveText(
      "Local model qwen3:8b suggested a choice: see the marked card above the steps. Dropped from the model's answer: 1 group number that did not fit the recipe.",
    );
    /* Nothing applied by itself. */
    await expect(page.getByTestId("choice-set")).toHaveCount(0);
    await expectNoViolations(page);

    await card.getByRole("button", { name: "Make it a choice" }).click();
    const set = page.getByTestId("choice-set");
    await expect(set.getByTestId("choice-option")).toHaveCount(2);
    await expect(set.getByTestId("choice-suggested-mark")).toHaveText(
      "suggested by the model",
    );
    await expect(set).toContainText("Not saved yet.");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/recipe/${SLUG}$`), {
      timeout: 15_000,
    });
    const stored = await (await request.get(`/api/recipe/${SLUG}`)).json();
    expect(
      stored.instructions.map((entry: { choice?: string }) => entry.choice),
    ).toEqual([undefined, "Then make", "Then make", undefined]);

    /* The look was a job, listed with its own words. */
    const jobs = await (
      await request.get("/api/jobs?kind=choices", {
        headers: { authorization: `Bearer ${await createApiToken()}` },
      })
    ).json();
    expect(JSON.stringify(jobs)).toContain(`look for alternatives in ${SLUG}`);
  });

  test("“Not now” puts it away, and nothing found says so", async ({
    page,
    request,
  }) => {
    await useModel(request, modelUrl);
    await openEdit(page);
    const button = lookButton(page);
    await expectHydrated(button);
    await button.click();
    const card = page.getByTestId("choice-suggestion");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(card).toHaveCount(0);

    /* An answer that names nothing real is nothing found. */
    choicesAnswer = { sets: [{ label: "Stages", groups: [1, 4, 42] }] };
    await button.click();
    await expect(page.getByTestId("model-choices-status")).toHaveText(
      "Nothing found: local model qwen3:8b saw no alternatives here. Dropped from the model's answer: 1 set and 2 group numbers that did not fit the recipe.",
      { timeout: 30_000 },
    );
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId("choice-set")).toHaveCount(0);
  });
});
