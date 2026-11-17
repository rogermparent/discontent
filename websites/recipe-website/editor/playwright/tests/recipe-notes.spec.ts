import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import {
  fillMarkdownField,
  fillSignInForm,
  markdownEditorReady,
} from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { expectNoViolations } from "../support/a11y";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 47j: a recipe's own notes. The recipe page shows them numbered after the
 * steps, a step's "(Note 2)" a link to the second; the cook view keeps them
 * in a closed "Notes" block; the edit form has a row a note with + ↑ ↓ ×.
 * An import reads a card plugin's notes block by itself, and on a site with
 * none learns a selector once — a stand-in model on loopback
 * (`fixtures/llm/standInModel.ts`, never a real one), turned on for this
 * server through the TEST_MODE-only `/settings/test-llm` and off after —
 * which the next page of the site reuses and Settings → Tools lists.
 *
 * Recipes are written through the API, so no shared fixture's counts move.
 */

type Request = APIRequestContext;

const SLUG = "noted-lemon-bars";
const NOTES = [
  "**Base:** chill the pan first so the butter stays cold.",
  "The bars keep 4 days in the fridge.\n\nThey freeze for a month.",
];

async function write(request: Request, token: string, data: object) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data,
  });
  expect(response.status()).toBe(201);
}

async function stored(request: Request, slug: string) {
  return (await request.get(`/api/recipe/${slug}`)).json();
}

async function openEdit(page: Page, slug: string) {
  await page.goto(`/recipe/${slug}/edit`);
  await fillSignInForm(page);
  await markdownEditorReady(page, "description");
}

async function save(page: Page, slug: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${slug}$`), {
    timeout: 15_000,
  });
}

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

async function useModel(request: Request, url?: string) {
  const response = await request.get(
    url
      ? `/settings/test-llm?url=${encodeURIComponent(url)}`
      : "/settings/test-llm",
  );
  expect(response.ok()).toBe(true);
}

test.describe("A recipe's own notes (47j)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("importable-uploads");
    const token = await createApiToken();
    await write(request, token, {
      name: "Noted Lemon Bars",
      slug: SLUG,
      ingredients: ["1 cup flour", "1/2 cup butter", "3 eggs"],
      instructions: [
        "Press the base into the pan and bake 20 minutes (Note 1).",
        "Pour the filling over and bake 18 minutes; see notes 1 and 2.",
      ],
      notes: NOTES,
    });
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("the page numbers them after the steps, links a step's note, and the cook view folds them", async ({
    page,
  }) => {
    await page.goto(`/recipe/${SLUG}`);
    const section = page.getByRole("region", { name: "Notes", exact: true });
    await expect(section).toBeVisible();
    const notes = section.getByRole("listitem");
    await expect(notes).toHaveCount(2);
    await expect(notes.nth(0)).toContainText(
      "chill the pan first so the butter stays cold.",
    );
    await expect(notes.nth(1)).toContainText("They freeze for a month.");
    /* After the steps, and not one of them. */
    await expect(page.locator("#step-3")).toHaveCount(0);

    const steps = page.locator("#step-1, #step-2");
    const link = steps.getByRole("link", { name: "Note 1", exact: true });
    await expect(link).toHaveAttribute("href", "#recipe-note-1");
    await expect(
      page.locator("#step-2").getByRole("link", { name: "2", exact: true }),
    ).toHaveAttribute("href", "#recipe-note-2");
    await expectHydrated(page.getByRole("button", { name: "Cook view" }));
    await link.click();
    await expect(page).toHaveURL(/#recipe-note-1$/);
    await expectNoViolations(page);

    await page.getByRole("button", { name: "Cook view" }).click();
    const view = page.getByRole("dialog", {
      name: "Cook view: Noted Lemon Bars",
    });
    const folded = view.getByTestId("cook-notes");
    await expect(folded).toBeVisible();
    await expect(folded.getByText("Notes (2)")).toBeVisible();
    await expect(folded.getByText("They freeze for a month.")).toBeHidden();
    await folded.getByText("Notes (2)").click();
    await expect(folded.getByText("They freeze for a month.")).toBeVisible();
    await expectNoViolations(page);
  });

  test("the edit form's rows add, reorder and remove notes, and Save keeps them in order", async ({
    page,
    request,
  }) => {
    await openEdit(page, SLUG);
    const section = page.locator("#recipe-section-notes");
    await expect(
      section.getByRole("heading", { name: "Notes", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('input[type="hidden"][name="notes[1]"]'),
    ).toHaveValue(NOTES[1]);
    const add = section.getByRole("button", {
      name: "Add a note",
      exact: true,
    });
    await expectHydrated(add);
    await add.click();
    await fillMarkdownField(page, "notes[2]", "Use a metal pan.");
    await section
      .getByRole("button", { name: "Move note 3 up", exact: true })
      .click();
    await expect(
      page.locator('input[type="hidden"][name="notes[1]"]'),
    ).toHaveValue("Use a metal pan.");
    /* What each row shows follows its note (review: rows keyed by index
     * kept a moved note's old text in its editor). The new row is in
     * Source mode, a textarea; the others show their text. */
    const rows = section.getByTestId("notes-rows").locator(":scope > li");
    const shown = (n: number) =>
      rows.nth(n).locator("[data-lexical-editor='true']");
    await expect(rows.nth(1).locator("textarea")).toHaveValue(
      "Use a metal pan.",
    );
    await expect(shown(0)).toContainText("chill the pan first");
    await expect(shown(2)).toContainText("They freeze for a month.");
    await section
      .getByRole("button", { name: "Remove note 1", exact: true })
      .click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator("textarea")).toHaveValue(
      "Use a metal pan.",
    );
    await expect(shown(1)).toContainText("They freeze for a month.");
    await expect(section).not.toContainText("chill the pan first");
    await expectNoViolations(page);
    await save(page, SLUG);
    expect((await stored(request, SLUG)).notes).toEqual([
      "Use a metal pan.",
      NOTES[1],
    ]);

    /* Every row removed: no `notes` at all (signed in already). */
    await page.goto(`/recipe/${SLUG}/edit`);
    await markdownEditorReady(page, "description");
    const again = page.locator("#recipe-section-notes");
    const remove = again.getByRole("button", {
      name: "Remove note 1",
      exact: true,
    });
    await expectHydrated(remove);
    await remove.click();
    await remove.click();
    await expect(again.getByTestId("notes-empty")).toBeVisible();
    await save(page, SLUG);
    expect((await stored(request, SLUG)).notes).toBeUndefined();
  });

  test("an import reads a card's notes block, and learns a plugin-less site's selector once", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const importFrom = async (file: string) => {
      await page
        .getByLabel("Import from URL")
        .fill(new URL(`/uploads/${file}`, baseURL!).href);
      await page.getByRole("button", { name: "Import", exact: true }).click();
    };

    /* A card plugin's block: no model asked. */
    await importFrom("notes-card.html");
    const form = page.locator("#recipe-form");
    await expect(form.locator('[name="name"]')).toHaveValue("Card Lemon Bars");
    await expect(
      form.locator('input[type="hidden"][name="notes[0]"]'),
    ).toHaveValue("**Base:** chill the pan first so the butter stays cold.");
    await expect(
      form.locator('input[type="hidden"][name="notes[1]"]'),
    ).toHaveValue("The bars keep 4 days in the fridge.");

    /* A site with none: the stand-in picks a selector, refused once and
     * told why, then kept. */
    await useModel(request, modelUrl);
    await page.goto("/new-recipe");
    await markdownEditorReady(page, "description");
    await importFrom("notes-site-1.html");
    await expect(form.locator('[name="name"]')).toHaveValue("Site Crackers");
    await expect(
      form.locator('input[type="hidden"][name="notes[0]"]'),
    ).toHaveValue(
      "Roll the dough as thin as you can; thick crackers stay chewy.",
    );

    /* The site's next page: the kept selector, no model (it is off). */
    await useModel(request);
    await page.goto("/new-recipe");
    await markdownEditorReady(page, "description");
    await importFrom("notes-site-2.html");
    await expect(form.locator('[name="name"]')).toHaveValue(
      "Site Rye Crackers",
    );
    await expect(
      form.locator('input[type="hidden"][name="notes[1]"]'),
    ).toHaveValue("Bake until the edges brown.");

    /* Settings → Tools lists it, with Forget. */
    await page.goto("/settings/tools");
    const row = page.getByTestId("note-selector");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(
      "section.recipe-extra.recipe-notes > div.recipe-extra__body",
    );
    await expect(row).toContainText("found notes 1 time");
    await expectNoViolations(page);
    const forget = row.getByRole("button", {
      name: /^Forget the selector for /,
    });
    await expectHydrated(forget);
    await forget.click();
    await expect(page.getByTestId("note-selectors-empty")).toBeVisible();
  });
});
