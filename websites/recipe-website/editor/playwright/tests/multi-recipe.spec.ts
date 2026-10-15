import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath } from "../support/tasks";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 36e: one video, several recipes. The yt-dlp mimic answers `SIDES_TEST`
 * (`responses/holiday-sides.json`: a potato puree, a stuffing, a green bean
 * casserole whose last line is "Crispy fried shallots (or onions) - see
 * recipe below", and the fried shallots), and a stand-in model on loopback
 * (`fixtures/llm/standInModel.ts`, never a real one) reads it. The suite pins
 * the model off (T18); this spec turns it on for this server process only,
 * through the TEST_MODE-only `/settings/test-llm`, and off again after each
 * test — one worker, so no other spec sees it.
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

const VIDEO = "https://www.youtube.com/watch?v=SIDES_TEST";

test.describe("Several recipes in one video", () => {
  test.beforeEach(async ({ page, request, resetData, writeSettings }) => {
    await resetData("importable-uploads");
    await writeSettings({
      ytdlpPath: fixturePath("yt-dlp", "ytdlp-mimic.mjs"),
    });
    await useModel(request, modelUrl);
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
  });

  test.afterEach(async ({ request }) => {
    await useModel(request);
  });

  test("lists the recipes, imports the ticked ones, and links the shallots", async ({
    page,
  }) => {
    await page.getByLabel("Import from URL", { exact: true }).fill(VIDEO);
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const picker = page.getByTestId("batch-picker");
    await expect(picker.getByRole("heading")).toHaveText(
      "This video holds 4 recipes",
    );
    const rows = picker.getByTestId("batch-recipes").locator("li");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("1. Potato Puree");
    await expect(rows.nth(0)).toContainText("4 ingredients");
    await expect(rows.nth(0)).toContainText("4/4 found in the text");
    await expect(rows.nth(0)).toContainText("at 0:32");
    await expect(rows.nth(2)).toContainText("at 10:52");
    /* The shallots have no chapter of their own: the casserole's. */
    await expect(rows.nth(3)).toContainText("4. Fried Shallots");
    await expect(rows.nth(3)).toContainText("at 10:52");
    /* Everything trusted starts ticked; the form waits for a choice. */
    for (const name of [
      "1. Potato Puree",
      "2. Stuffing",
      "3. Green Bean Casserole",
      "4. Fried Shallots",
    ]) {
      await expect(page.getByLabel(name, { exact: true })).toBeChecked();
    }
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue("");

    await page.getByLabel("2. Stuffing", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Import 3 selected", exact: true })
      .click();

    const results = page.getByTestId("batch-results");
    await expect(results.locator("li")).toHaveCount(3);
    await expect(
      results.getByRole("link", { name: "green-bean-casserole" }),
    ).toHaveAttribute("href", "/recipe/green-bean-casserole");
    await expect(
      results.getByRole("link", { name: "fried-shallots" }),
    ).toBeVisible();
    /* What landed is unticked: a second click would add nothing. */
    await expect(
      page.getByLabel("3. Green Bean Casserole", { exact: true }),
    ).not.toBeChecked();

    await page.goto("/recipe/green-bean-casserole");
    await expect(
      page.getByRole("link", {
        name: "Crispy fried shallots (or onions) - see recipe below",
      }),
    ).toHaveAttribute("href", "/recipe/fried-shallots");
    /* The unticked one was not made. */
    const stuffing = await page.goto("/recipe/stuffing");
    expect(stuffing?.status()).toBe(404);
  });

  test("sends one recipe to the form, or all of them as one", async ({
    page,
  }) => {
    await page.getByLabel("Import from URL", { exact: true }).fill(VIDEO);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const picker = page.getByTestId("batch-picker");
    await expect(picker.getByTestId("batch-recipes").locator("li")).toHaveCount(
      4,
    );

    await picker
      .getByTestId("batch-recipes")
      .locator("li")
      .nth(2)
      .getByRole("button", { name: "Edit this one first" })
      .click();
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Green Bean Casserole",
    );
    await expect(page.locator('#recipe-form [name="source.url"]')).toHaveValue(
      `${VIDEO}&t=652s`,
    );
    /* It is the form's now: not imported with the rest. */
    await expect(
      page.getByLabel("3. Green Bean Casserole", { exact: true }),
    ).not.toBeChecked();
    await expect(picker).toContainText("in the form below");

    await picker
      .getByRole("button", { name: "Import as one recipe instead" })
      .click();
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Holiday Sides 3 Ways",
    );
    await expect(page.locator('#recipe-form [name="source.url"]')).toHaveValue(
      VIDEO,
    );
  });
});
