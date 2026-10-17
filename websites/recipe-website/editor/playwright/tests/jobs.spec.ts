import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath, recordOutsideJob } from "../support/tasks";
import { standInChat } from "../fixtures/llm/standInModel";

/*
 * 37c: the form's import as a job — the live step panel, `?job=` reopening
 * it, the 36e picker fed from a job — and `/jobs`: the list, a job's
 * timeline, Cancel and Retry. A stand-in model on loopback (never a real
 * one), slowed down by `delayMs` so a running job can be watched; the suite
 * pins the model off (T18), and this spec turns it on for this server
 * process only through `/settings/test-llm`, off again after each test.
 */
let model: Server;
let modelUrl: string;
/** How long the stand-in takes over each chat answer. */
let delayMs = 0;

test.beforeAll(async () => {
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
              standInChat(JSON.parse(Buffer.concat(chunks).toString())),
            ),
          );
        } else {
          response.end(JSON.stringify({ models: [{ name: "qwen3:8b" }] }));
        }
      };
      if (request.url === "/api/chat" && delayMs > 0) {
        /* A cancelled call hangs up: no answer is owed. */
        const timer = setTimeout(answer, delayMs);
        response.on("close", () => clearTimeout(timer));
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

async function useModel(request: APIRequestContext, url?: string) {
  const response = await request.get(
    url
      ? `/settings/test-llm?url=${encodeURIComponent(url)}`
      : "/settings/test-llm",
  );
  expect(response.ok()).toBe(true);
}

const SCONES = [
  "Slow Scones",
  "2 cups flour",
  "3/4 cup cream",
  "1 tbsp sugar",
  "",
  "Stir everything together. Bake at 425°F for 15 minutes.",
].join("\n");

const VIDEO = "https://www.youtube.com/watch?v=SIDES_TEST";

/** Paste a recipe and press Import. */
async function importText(page: Page, text: string) {
  await page
    .getByRole("button", { name: "No link? Paste the recipe text instead" })
    .click();
  await page.getByLabel("Recipe text", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Import", exact: true }).click();
}

/** The job the form is following: `?job=` in the address bar. */
async function jobInUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/new-recipe\?job=[0-9A-Z]{26}$/);
  return new URL(page.url()).searchParams.get("job")!;
}

/**
 * `/jobs`' dashboard has hydrated. Under `next dev` (CI) the server-rendered
 * page shows well before React owns it (later still since Next 16.4, 40h): a
 * filter picked before then is lost, and a visibility change dispatched
 * before then is read only once hydration catches up.
 */
async function dashboardReady(page: Page) {
  await expect(page.getByTestId("jobs-dashboard")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
}

test.describe("Import jobs", () => {
  test.beforeEach(async ({ page, request, resetData, writeSettings }) => {
    delayMs = 0;
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
    delayMs = 0;
    await useModel(request);
  });

  test("the panel shows the live steps of a slow import, then the form fills", async ({
    page,
  }) => {
    delayMs = 2_500;
    await importText(page, SCONES);

    const panel = page.getByTestId("import-progress");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Importing…",
    );
    /* The model's step, running, while the model thinks. */
    const reading = panel.locator('[data-step="llm.extract"]');
    await expect(reading).toHaveAttribute("data-status", "running");
    await expect(reading).toContainText("Model reads the recipe");
    await expect(page.getByTestId("import-announce")).toHaveText("Importing…");
    /* One import at a time. */
    await expect(
      page.getByRole("button", { name: "Import", exact: true }),
    ).toBeDisabled();
    await jobInUrl(page);

    /* Then it ends: the form is filled as before, the panel folds. */
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Slow Scones",
      { timeout: 15_000 },
    );
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Import done",
    );
    await expect(page.getByTestId("import-announce")).toHaveText(
      "Import done: the form is filled.",
    );
    await expect(panel.locator('[data-step="llm.extract"]')).toHaveCount(0);
    await panel.getByText(/\d+ steps?/).click();
    await expect(panel.locator('[data-step="llm.extract"]')).toHaveAttribute(
      "data-status",
      "ok",
    );
    await expect(
      page.getByRole("button", { name: "Import", exact: true }),
    ).toBeEnabled();
  });

  test("?job= reopens a finished import, so leaving the page loses nothing", async ({
    page,
  }) => {
    await importText(page, SCONES);
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Slow Scones",
    );
    const job = await jobInUrl(page);

    await page.goto("/new-recipe");
    await markdownEditorReady(page, "description");
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue("");

    await page.goto(`/new-recipe?job=${job}`);
    await markdownEditorReady(page, "description");
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Slow Scones",
    );
    await expect(
      page.getByTestId("import-progress").getByRole("heading", { level: 3 }),
    ).toHaveText("Import done");
  });

  test("the 36e picker comes from a job, and comes back with ?job=", async ({
    page,
  }) => {
    await page.getByLabel("Import from URL", { exact: true }).fill(VIDEO);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    const picker = page.getByTestId("batch-picker");
    await expect(picker.getByRole("heading")).toHaveText(
      "This video holds 4 recipes",
    );
    await expect(page.getByTestId("import-announce")).toHaveText(
      "Import done: 4 recipes found — pick the ones to import.",
    );
    const job = await jobInUrl(page);

    await page.goto(`/new-recipe?job=${job}`);
    await markdownEditorReady(page, "description");
    await expect(picker.getByTestId("batch-recipes").locator("li")).toHaveCount(
      4,
    );
    for (const name of [
      "1. Potato Puree",
      "2. Stuffing",
      "3. Green Bean Casserole",
    ]) {
      await page.getByLabel(name, { exact: true }).uncheck();
    }
    /* "Import N selected" is a job too (`form-batch`). */
    await page
      .getByRole("button", { name: "Import 1 selected", exact: true })
      .click();
    await expect(
      page.getByTestId("batch-results").getByRole("link", {
        name: "fried-shallots",
      }),
    ).toBeVisible();

    await page.goto("/jobs");
    /* Newest first: this test's batch is the first such row. */
    await expect(
      page
        .getByTestId("job-list")
        .getByRole("link", {
          name: "1 of 4 recipes from youtube.com/watch?v=SIDES_TEST",
        })
        .first(),
    ).toBeVisible();

    /* The video's own job page names its dishes (`recipe.name`, 37c review). */
    await page.goto(`/jobs/${job}`);
    const result = page.getByTestId("job-result");
    for (const dish of [
      "Potato Puree",
      "Stuffing",
      "Green Bean Casserole",
      "Fried Shallots",
    ]) {
      await expect(result.getByText(dish, { exact: true })).toBeVisible();
    }
    await expect(result.getByText(/^Recipe \d/)).toHaveCount(0);
  });

  test("/jobs lists the import, and its page shows the step timeline", async ({
    page,
  }) => {
    await importText(page, SCONES);
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue(
      "Slow Scones",
    );
    const job = await jobInUrl(page);

    await page.goto("/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs", exact: true }),
    ).toBeVisible();
    /* The queue: the GPU and yt-dlp, both free now. */
    const queue = page.getByTestId("job-queue");
    await expect(queue.locator('[data-resource="gpu"]')).toContainText("Free");
    await expect(queue.locator('[data-resource="ytdlp"]')).toContainText(
      "Free",
    );
    const row = page.locator(`[data-job="${job}"]`);
    await expect(row).toContainText("form-text");
    await expect(row.getByTestId("job-status")).toHaveText("done");
    await dashboardReady(page);

    /* Filters: by kind, by status. */
    await page.getByLabel("Kind", { exact: true }).selectOption("inspect");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Kind", { exact: true }).selectOption("form-text");
    await expect(row).toBeVisible();
    await page.getByLabel("Status", { exact: true }).selectOption("failed");
    await expect(row).toHaveCount(0);
    await page.getByLabel("Status", { exact: true }).selectOption("");

    await row.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/jobs/${job}$`));
    const timeline = page.getByTestId("job-timeline");
    await expect(timeline.locator('[data-step="llm.extract"]')).toHaveAttribute(
      "data-status",
      "ok",
    );
    await expect(page.getByTestId("job-status").first()).toHaveText("done");
    await expect(
      page.getByRole("link", { name: "Open in the form" }),
    ).toHaveAttribute("href", `/new-recipe?job=${job}`);
    await page.getByText(/^Raw log \(\d+ lines\)$/).click();
    await expect(page.getByTestId("job-raw-log")).toContainText('"step":"job"');
  });

  test("/jobs names the model imports read with, on a mirror too, and nothing when there is none (38g)", async ({
    page,
    request,
  }) => {
    await page.goto("/jobs");
    const status = page.getByTestId("local-model-status");
    await expect(
      page.getByRole("heading", { name: "The model imports read with" }),
    ).toBeVisible();
    await expect(status).toContainText("qwen3:8b");
    await expect(status).toContainText("reachable");
    /* The Pi's role: Settings → Tools is not in its nav, /jobs is. */
    expect(
      (await request.get("/settings/test-editor-role?role=mirror")).ok(),
    ).toBe(true);
    try {
      await page.reload();
      await expect(status).toContainText("qwen3:8b");
    } finally {
      await request.get("/settings/test-editor-role?role=workstation");
    }
    await useModel(request);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Jobs", exact: true }),
    ).toBeVisible();
    await expect(status).toHaveCount(0);
  });

  test("an idle /jobs shows another process's job by itself, and rests while the tab is hidden (38b)", async ({
    page,
  }) => {
    await page.goto("/jobs");
    await expect(
      page.getByRole("heading", { name: "Jobs", exact: true }),
    ).toBeVisible();
    await dashboardReady(page);
    let reads = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/jobs") reads += 1;
    });
    const setHidden = (hidden: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => value,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);

    /* Hidden: a job recorded meanwhile is not read for, past the idle 10 s. */
    await setHidden(true);
    const first = `outside job ${Date.now()}`;
    await recordOutsideJob(first);
    const before = reads;
    await page.waitForTimeout(11_000);
    expect(reads).toBe(before);
    await expect(
      page.getByRole("link", { name: first, exact: true }),
    ).toHaveCount(0);

    /* Shown again: read at once. */
    await setHidden(false);
    await expect(
      page.getByRole("link", { name: first, exact: true }),
    ).toBeVisible({
      timeout: 3_000,
    });

    /* Idle and shown: the next one within the idle interval, no Refresh. */
    const second = `outside job ${Date.now()} again`;
    await recordOutsideJob(second);
    await expect(
      page.getByRole("link", { name: second, exact: true }),
    ).toBeVisible({
      timeout: 12_000,
    });
  });

  test("Cancel stops a long import: from the panel, and from its page", async ({
    page,
  }) => {
    delayMs = 30_000;
    await importText(page, SCONES);
    const panel = page.getByTestId("import-progress");
    await expect(panel.locator('[data-step="llm.extract"]')).toHaveAttribute(
      "data-status",
      "running",
    );
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Import cancelled",
    );
    await expect(page.getByTestId("import-announce")).toHaveText(
      "Import cancelled.",
    );
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue("");
    const first = await jobInUrl(page);

    /* A second one, cancelled from /jobs/<id>. */
    await page.goto("/new-recipe");
    await markdownEditorReady(page, "description");
    await importText(page, SCONES);
    await expect(
      page.getByTestId("import-progress").locator('[data-step="llm.extract"]'),
    ).toHaveAttribute("data-status", "running");
    const second = await jobInUrl(page);
    await page.goto(`/jobs/${second}`);
    await expect(page.getByTestId("job-status").first()).toHaveText("running");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("job-status").first()).toHaveText(
      "cancelled",
      { timeout: 10_000 },
    );

    await page.goto("/jobs");
    for (const id of [first, second]) {
      await expect(
        page.locator(`[data-job="${id}"]`).getByTestId("job-status"),
      ).toHaveText("cancelled");
    }
  });

  test("a retried write reaches the cached pages, after the 202", async ({
    page,
  }) => {
    /*
     * 37c review: the retry route answers 202 and the job writes later, so
     * its revalidations happen after the route returned. A `form-batch`
     * job writes a recipe; delete it, read `/recipes` without it (warming
     * the cached reads), retry the job, and `/recipes` must list it again.
     */
    await page.getByLabel("Import from URL", { exact: true }).fill(VIDEO);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(
      page.getByTestId("batch-picker").getByRole("heading"),
    ).toHaveText("This video holds 4 recipes");
    for (const name of [
      "1. Potato Puree",
      "2. Stuffing",
      "3. Green Bean Casserole",
    ]) {
      await page.getByLabel(name, { exact: true }).uncheck();
    }
    await page
      .getByRole("button", { name: "Import 1 selected", exact: true })
      .click();
    await expect(
      page.getByTestId("batch-results").getByRole("link", {
        name: "fried-shallots",
      }),
    ).toBeVisible();

    await page.goto("/jobs");
    await page
      .getByTestId("job-list")
      .getByRole("link", {
        name: "1 of 4 recipes from youtube.com/watch?v=SIDES_TEST",
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/jobs\/[0-9A-Z]{26}$/);
    const batch = new URL(page.url()).pathname.split("/").pop()!;

    const listed = page.getByRole("main").getByText("Fried Shallots");
    await page.goto("/recipes");
    await expect(listed.first()).toBeVisible();
    const deleted = await page.request.delete("/api/recipe/fried-shallots");
    expect(deleted.ok()).toBe(true);
    await page.goto("/recipes");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(listed).toHaveCount(0);

    await page.goto(`/jobs/${batch}`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`/jobs/${batch}$`));
    await expect(page.getByTestId("job-status").first()).toHaveText("done", {
      timeout: 15_000,
    });

    await page.goto("/recipes");
    await expect(listed.first()).toBeVisible();
  });

  test("a second Retry while the first still runs links to it", async ({
    page,
  }) => {
    await importText(page, "Just a story about scones, no recipe at all.");
    await expect(
      page.getByTestId("import-progress").getByRole("heading", { level: 3 }),
    ).toHaveText("Import failed");
    const job = await jobInUrl(page);

    /* The retry's model call hangs: it stays running. */
    delayMs = 30_000;
    await page.goto(`/jobs/${job}`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`/jobs/${job}$`));
    await expect(page).toHaveURL(/\/jobs\/[0-9A-Z]{26}$/);
    const retry = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByTestId("job-status").first()).toHaveText("running");

    /* Retry again from the old job: refused (409), linking to the live one. */
    await page.goto(`/jobs/${job}`);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByTestId("job-live-retry").getByRole("link", { name: retry }),
    ).toHaveAttribute("href", `/jobs/${retry}`);
    await expect(page).toHaveURL(new RegExp(`/jobs/${job}$`));

    await page.goto(`/jobs/${retry}`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByTestId("job-status").first()).toHaveText(
      "cancelled",
      { timeout: 10_000 },
    );
  });

  test("Retry runs a job again as a new one", async ({ page }) => {
    /* No ingredient lines: the model finds no recipe, and the job fails. */
    await importText(page, "Just a story about scones, no recipe at all.");
    const panel = page.getByTestId("import-progress");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      "Import failed",
    );
    const job = await jobInUrl(page);

    await page.goto(`/jobs/${job}`);
    await expect(page.getByTestId("job-status").first()).toHaveText("failed");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`/jobs/${job}$`));
    await expect(page).toHaveURL(/\/jobs\/[0-9A-Z]{26}$/);
    await expect(page.getByRole("link", { name: job })).toHaveAttribute(
      "href",
      `/jobs/${job}`,
    );
    await expect(page.getByTestId("job-status").first()).toHaveText("failed");
    await expect(page.getByTestId("job-timeline")).toBeVisible();
  });
});
