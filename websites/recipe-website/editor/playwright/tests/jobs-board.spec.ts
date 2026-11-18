import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";
import { expectNoViolations } from "../support/a11y";
import { endPlantedJob, plantJob, removePlantedJobs } from "../support/tasks";
import type { JobLine } from "../../controller/jobs/log";

/*
 * 48c: `/jobs` and a job's page, canvas B "Now / needs a look / history",
 * on jobs planted in the server's store as another process leaves them
 * (`plantJob`): the live chip in the masthead, a live card's steps and why
 * it waits, failures grouped by cause with their next step, a round folded
 * into one row, and a job's page as sentences with where its time went.
 * Hosts carry this run's stamp, so earlier runs' planted jobs (the store
 * outlives a run) never stand in for these.
 */
const RUN = Date.now().toString(36);
const planted: string[] = [];

test.afterEach(async () => {
  for (const id of planted) await endPlantedJob(id);
  await removePlantedJobs(planted.splice(0));
});

async function plant(...args: Parameters<typeof plantJob>) {
  const id = await plantJob(...args);
  planted.push(id);
  return id;
}

/** A step log from `[step, from s, to s | undefined, start data, end data]`. */
function stepLog(
  start: number,
  steps: [
    step: string,
    from: number,
    to: number | undefined,
    data?: Record<string, unknown>,
    end?: Record<string, unknown> & { ok?: boolean; parent?: number },
  ][],
): JobLine[] {
  const at = (seconds: number) =>
    new Date(start + seconds * 1000).toISOString();
  const lines: JobLine[] = [
    { t: at(0), step: "job", phase: "start", level: "info", n: 0 },
  ];
  steps.forEach(([step, from, to, data, end], index) => {
    const n = index + 1;
    const { ok = true, parent = 0, ...endData } = end ?? {};
    lines.push({
      t: at(from),
      step,
      phase: "start",
      level: "info",
      n,
      parent,
      ...(data ? { data } : {}),
    });
    if (to !== undefined) {
      lines.push({
        t: at(to),
        step,
        phase: "end",
        level: ok ? "info" : "error",
        n,
        parent,
        ms: Math.round((to - from) * 1000),
        ok,
        ...(Object.keys(endData).length ? { data: endData } : {}),
      });
    }
  });
  return lines.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

async function boardReady(page: Page) {
  await expect(page.getByTestId("jobs-dashboard")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30_000 },
  );
}

test.describe("Jobs, variant B (48c)", () => {
  test.beforeEach(async ({ page, resetData }) => {
    /* The content and its users (sign-in needs them); the job store stays. */
    await resetData();
    await page.goto("/");
    await signIn(page);
  });

  test("a live job: the masthead's chip, its card's steps and why it waits", async ({
    page,
  }) => {
    const site = `pause-${RUN}.test`;
    const start = Date.now() - 5_000;
    const running = await plant(
      {
        kind: "import-url",
        label: `${site}/r/slow-pie`,
        spec: { kind: "import-url", url: `https://${site}/r/slow-pie` },
        status: "running",
        startedAt: start,
      },
      {
        at: start,
        lines: stepLog(start, [
          ["fetch", 0, 0.4, { host: site }, { status: 200, bytes: 4096 }],
          [
            "parse",
            0.4,
            0.5,
            undefined,
            { schema: true, ingredients: 3, steps: 2 },
          ],
          [
            "pace.wait",
            0.5,
            undefined,
            { site, gapMs: 15_000, waitMs: 60_000 },
          ],
        ]),
      },
    );
    const queued = await plant({
      kind: "import-text",
      label: `pasted text (${RUN})`,
      spec: { kind: "import-text", text: "x" },
      status: "queued",
      waiting: {
        resource: "gpu",
        tier: "interactive",
        since: Date.now(),
        position: 2,
      },
    });

    /* The chip, on any page: counts, and opens /jobs. A fresh page reads at
     * once (an idle chip's next read is 20 s away). */
    await page.goto("/");
    const chip = page.getByTestId("jobs-live-chip").first();
    await expect(chip).toContainText(/\d+ running · \d+ queued/, {
      timeout: 15_000,
    });
    await expectHydrated(chip);
    await chip.click();
    await expect(page).toHaveURL(/\/jobs$/);
    await boardReady(page);
    await expect(page.getByTestId("jobs-live-chip").first()).toHaveAttribute(
      "aria-current",
      "page",
    );

    const card = page.locator(`[data-live-job="${running}"]`);
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(
      `${site}/r/slow-pie`,
    );
    await expect(card.locator('[data-step="fetch"]')).toHaveAttribute(
      "data-status",
      "ok",
    );
    await expect(card.getByTestId("job-why")).toContainText(
      new RegExp(`^Waiting \\d+\\.\\d s for ${site.replace(/\./g, "\\.")}\\.`),
    );
    await expect(card.getByTestId("job-why")).toContainText(
      "A site gets one request every 15 s: the polite pause. Next request at",
    );
    await expect(
      page.locator(`[data-live-job="${queued}"]`).getByTestId("job-why"),
    ).toHaveText(
      "2nd in line for the GPU. One model call at a time on this machine; your own imports go before batch work.",
    );
    await expectNoViolations(page);

    /* Its page: the wait is the last line, still running. */
    await card.getByRole("link", { name: `${site}/r/slow-pie` }).click();
    const timeline = page.getByTestId("job-timeline");
    /* Its log's first read (in `next dev`, the route's first compile). */
    await expect(timeline.locator("li").last()).toHaveAttribute(
      "data-step",
      "pace.wait",
      { timeout: 30_000 },
    );
    await expect(timeline.locator("li").last()).toContainText(
      `Waiting for ${site} — now`,
    );
    await expect(page.getByTestId("job-why")).toContainText(`for ${site}.`);

    /* Ended: the chip goes. */
    await endPlantedJob(running, "done");
    await endPlantedJob(queued, "cancelled");
    await page.goto("/");
    await expect(page.getByTestId("jobs-live-chip")).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test("Needs a look: failures by cause, the paste that worked, the next step, dismiss", async ({
    page,
  }) => {
    const walled = `walled-${RUN}.test`;
    const gone = `gone-${RUN}.test`;
    const at = Date.now() - 60 * 60 * 1000;
    const fails: string[] = [];
    for (const [n, slug] of ["jam", "relish", "chutney"].entries()) {
      const url = `https://${walled}/${slug}`;
      fails.push(
        await plant(
          {
            kind: "import-url",
            label: url,
            spec: { kind: "import-url", url },
            status: "failed",
            startedAt: at + n * 30_000,
            endedAt: at + n * 30_000 + 900,
            error: {
              code: "import_failed",
              message: `Could not fetch ${url}: HTTP 402`,
            },
          },
          { at: at + n * 30_000 },
        ),
      );
    }
    await plant(
      {
        kind: "form-text",
        label: `pasted text (${RUN})`,
        spec: {
          kind: "form-text",
          text: "Tomato chutney…",
          source: `https://www.${walled}/chutney/`,
        },
        status: "done",
        startedAt: at + 200_000,
        endedAt: at + 230_000,
        result: { name: `Chutney ${RUN}` },
      },
      { at: at + 200_000 },
    );
    for (const [n, path] of ["/a", "/b"].entries()) {
      const url = `https://${gone}${path}`;
      await plant(
        {
          kind: "inspect",
          label: url,
          spec: { kind: "inspect", url },
          status: "done",
          startedAt: at + 300_000 + n * 20_000,
          endedAt: at + 300_000 + n * 20_000 + 400,
          result: { url, finalUrl: url, status: 404, partial: false },
        },
        { at: at + 300_000 + n * 20_000 },
      );
    }

    await page.goto("/jobs");
    await boardReady(page);
    const look = page.getByTestId("jobs-look");
    const wall = look.locator(`[data-group="wall:402:${walled}"]`);
    await expect(wall.getByRole("heading", { level: 3 })).toHaveText(
      `${walled} answered HTTP 402 (payment required) to 3 URL imports`,
    );
    await expect(wall).toContainText("trying again won't help");
    /* The chutney's paste worked: it says so, and links it. */
    await expect(wall).toContainText("pasted");
    await expect(
      wall.getByRole("link", { name: `Chutney ${RUN}` }),
    ).toBeVisible();
    await expect(
      wall.getByRole("link", { name: "Paste the text" }),
    ).toHaveAttribute("href", "/new-recipe");

    /* Every 404 in one group: the list behind its button. */
    const missing = look.locator('[data-group="gone"]');
    await expect(missing).toContainText(`${gone} ×2`);
    const show = missing.getByRole("button", { name: /^Show the \d+$/ });
    await expectHydrated(show);
    await show.click();
    await expect(
      missing.getByRole("link", { name: `https://${gone}/a` }),
    ).toBeVisible();
    await expectNoViolations(page);

    /* Dismissed, it stays dismissed (this browser), and comes back. */
    await wall.getByRole("button", { name: "Dismiss" }).click();
    await expect(wall).toHaveCount(0);
    await page.reload();
    await boardReady(page);
    await expect(missing).toBeVisible();
    await expect(wall).toHaveCount(0);
    await look
      .getByRole("button", { name: /^Show the \d+ dismissed$/ })
      .click();
    await expect(wall).toBeVisible();
  });

  test("History folds a round into one row; one row per job unfolds it", async ({
    page,
  }) => {
    const host = `fold-${RUN}.test`;
    /*
     * A day ahead: no other test's job is anywhere near it, so nothing joins
     * the round, and it is among the newest the board reads (the store keeps
     * 300, and the suite's own jobs outlive a run).
     */
    const at = Date.now() + 24 * 60 * 60 * 1000;
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      const url = `https://${host}/r/${n}`;
      const startedAt = at + n * 60_000;
      ids.push(
        await plant(
          {
            kind: "inspect",
            label: url,
            spec: { kind: "inspect", url },
            status: "done",
            startedAt,
            endedAt: startedAt + 1_500,
            result: {
              url,
              finalUrl: url,
              status: 200,
              partial: false,
              recipe: { name: `Fold ${n} ${RUN}` },
            },
          },
          { at: startedAt },
        ),
      );
    }

    await page.goto("/jobs");
    await boardReady(page);
    const round = page.locator(`[data-round="${ids[0]}"]`);
    const summary = round.locator("summary");
    await expect(summary).toContainText(`4 inspects · ${host}`);
    await expect(summary).toContainText(
      `Fold 1 ${RUN} · Fold 2 ${RUN} · Fold 3 ${RUN} · Fold 4 ${RUN}`,
    );
    await expect(summary).toContainText("all read");
    await expect(round.locator("[data-job]").first()).toBeHidden();
    await expectHydrated(summary);
    await summary.click();
    await expect(round.locator("[data-job]")).toHaveCount(4);
    await expect(
      round.getByRole("link", { name: `Fold 4 ${RUN}` }),
    ).toBeVisible();

    const each = page.getByRole("checkbox", { name: "One row per job" });
    await expectHydrated(each);
    await each.check();
    await expect(round).toHaveCount(0);
    for (const id of ids) {
      await expect(page.locator(`[data-job="${id}"]`)).toBeVisible();
    }
  });

  test("a job's page: what it did as sentences, and where the minute went", async ({
    page,
  }) => {
    const host = `www.story-${RUN}.test`;
    const start = Date.now() - 2 * 60 * 60 * 1000;
    const lines = stepLog(start, [
      ["fetch", 0, 0.4, { host }, { status: 200, bytes: 86_016 }],
      [
        "parse",
        0.4,
        0.45,
        undefined,
        { schema: true, ingredients: 10, steps: 7 },
      ],
      [
        "llm.extract",
        0.45,
        20.05,
        undefined,
        {
          model: "qwen3:8b",
          total: 12,
          grounded: 12,
          outputTokens: 410,
          loadMs: 9_000,
        },
      ],
      [
        "pace.wait",
        20.05,
        34.65,
        { site: `story-${RUN}.test`, gapMs: 15_000, waitMs: 14_600 },
      ],
      ["image", 34.65, 35.05, { host, mode: "get" }, { bytes: 120_000 }],
      ["write", 35.05, 35.25, { slug: `story-pie-${RUN}` }],
    ]);
    const id = await plant(
      {
        kind: "import-url",
        label: `${host}/r/pie`,
        spec: { kind: "import-url", url: `https://${host}/r/pie` },
        status: "done",
        startedAt: start,
        endedAt: start + 35_300,
        result: { slug: `story-pie-${RUN}`, name: `Story Pie ${RUN}` },
      },
      { at: start, lines },
    );

    await page.goto(`/jobs/${id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: `${host}/r/pie` }),
    ).toBeVisible();
    const timeline = page.getByTestId("job-timeline");
    await expect(timeline.locator("li b")).toHaveText([
      `Read ${host}`,
      "Found the recipe card",
      "Model reads the recipe",
      `Waited 14.6 s for story-${RUN}.test`,
      `Downloaded the picture from ${host}`,
      `Saved story-pie-${RUN}`,
      "Done",
    ]);
    await expect(timeline.locator('[data-step="llm.extract"]')).toContainText(
      "9.0 s of that was loading qwen3:8b onto the GPU.",
    );
    const split = page.getByTestId("job-split");
    await expect(split.getByRole("heading", { level: 2 })).toHaveText(
      "Where the minute went",
    );
    await expect(split.locator('[data-part="model"]')).toContainText("19.6 s");
    const wait = split.locator('[data-part="wait"]');
    await expect(wait).toContainText("14.6 s");
    await expect(wait).toContainText(
      `waiting for story-${RUN}.test, 1 polite gap`,
    );
    await expect(split).toContainText(
      `41% of it was waiting: story-${RUN}.test gets one request every 15 s, the polite gap.`,
    );
    /* For the curious: every step to scale, the raw log. */
    await page.getByText("Every step, to scale").click();
    await expect(
      page.getByTestId("job-step-bars").locator('[data-step="pace.wait"]'),
    ).toBeVisible();
    await expect(page.getByTestId("job-result")).toContainText(
      `Wrote story-pie-${RUN}`,
    );
    await expectNoViolations(page);
  });

  test("on a phone: one column, nothing wider than the screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/jobs");
    await boardReady(page);
    await expect(
      page.getByRole("heading", { level: 2, name: /^Now/ }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expectNoViolations(page);
  });
});
