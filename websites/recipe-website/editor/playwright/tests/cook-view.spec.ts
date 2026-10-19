import { test, expect, type Page } from "../support/test";
import { expectHydrated } from "../support/hydration";
import { snapshotPage } from "../support/visual";
import { expectMode, expectNoViolations } from "../support/a11y";

/*
 * The cook view one step at a time, and timer buttons in step text (42c2,
 * canvas B's cook view and C's timers).
 *
 * The recipe is written through the API so no shared fixture's counts move.
 * The timer tests run on Playwright's fake clock (`page.clock`): the timers
 * keep end times and read `Date.now()`, so fast-forwarding the clock is
 * exactly a kitchen's worth of waiting.
 */

const SLUG = "cook-view-pie";
const NAME = "Cook-View Pie";

async function writePie(
  request: import("@playwright/test").APIRequestContext,
  token: string,
) {
  const response = await request.post("/api/recipes", {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: NAME,
      slug: SLUG,
      ingredients: [
        { ingredient: "For the crust:", type: "heading" },
        "1 1/4 cups all-purpose flour",
        "1/2 teaspoon salt",
        "1/2 cup cold unsalted butter, cubed",
        { ingredient: "For the filling:", type: "heading" },
        "3 large eggs",
        "1 cup packed brown sugar",
        "1/4 teaspoon salt",
      ],
      instructions: [
        {
          name: "Crust",
          instructions: [
            {
              text: "Whisk the flour and salt. Cut in the butter. Chill for 30 minutes.",
            },
            { text: "Roll it out on a floured counter." },
          ],
        },
        {
          name: "Filling",
          instructions: [{ text: "Whisk the eggs, brown sugar and salt." }],
        },
        {
          text: "Bake for 50 minutes. After 25 minutes, cover the edges with foil.",
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
}

async function openCookView(page: Page) {
  const button = page.getByRole("button", { name: "Cook view" });
  await expectHydrated(button);
  await button.click();
  const view = page.getByRole("dialog", { name: `Cook view: ${NAME}` });
  await expect(view).toBeVisible();
  return view;
}

test.describe("Cook view, one step at a time (42c2)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
  });

  test("Back and Done walk the steps, each with the lines it uses", async ({
    page,
  }) => {
    await page.goto(`/recipe/${SLUG}`);
    const view = await openCookView(page);
    const progress = view.getByTestId("cook-progress");
    const layout = view.getByRole("group", { name: "Layout" });

    await expect(
      layout.getByRole("button", { name: "One step" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(progress).toHaveText("Step 1 of 4");
    const step = view.getByTestId("cook-step");
    await expect(step).toContainText("Whisk the flour and salt.");
    await expect(step).toContainText("Crust");
    /* 42c1's matches for this step, as checkboxes. */
    await expect(
      view.getByRole("region", { name: "For this step" }).getByRole("checkbox"),
    ).toHaveCount(3);
    await expect(view.getByRole("button", { name: "Back" })).toBeDisabled();

    /* Done ticks the step and moves on, naming the next one. */
    const done = view.getByTestId("cook-done");
    await expect(done).toContainText("Done · step 2");
    await expect(done).toContainText("Roll it out on a floured counter.");
    await done.click();
    await expect(progress).toHaveText("Step 2 of 4");
    /* Focus follows to the new step, so it is read out. */
    await expect(step).toBeFocused();
    /* "floured" is not flour: a step that names nothing lists nothing. */
    await expect(
      view.getByRole("region", { name: "For this step" }),
    ).toHaveCount(0);

    await view.getByRole("button", { name: "Back" }).click();
    await expect(progress).toHaveText("Step 1 of 4");
    /* Back is now aria-disabled, and keeps focus rather than dropping it. */
    await expect(view.getByRole("button", { name: "Back" })).toBeFocused();
    await expect(step.getByRole("checkbox").first()).toBeChecked();

    await done.click();
    await done.click();
    await expect(progress).toHaveText("Step 3 of 4");
    const eggs = view
      .getByRole("region", { name: "For this step" })
      .getByRole("checkbox", { name: "3 large eggs" });
    await eggs.click();
    await expect(eggs).toBeChecked();

    /* The last step: Done ticks it and then has nowhere to go. */
    await done.click();
    await expect(progress).toHaveText("Step 4 of 4");
    await expect(done).toContainText("Done · last step");
    await done.click();
    await expect(done).toContainText("Last step done");
    await expect(done).toBeDisabled();
    await expect(done).toBeFocused();

    /* "All steps" is the whole checklist, with the same ticks. */
    await layout.getByRole("button", { name: "All steps" }).click();
    await expect(progress).toHaveText("4 of 4 steps done");
    const steps = view.getByRole("region", { name: "Steps" });
    await expect(steps.getByRole("checkbox")).toHaveCount(4);
    for (const box of await steps.getByRole("checkbox").all()) {
      await expect(box).toBeChecked();
    }
    await expect(
      view
        .getByRole("region", { name: "Ingredients" })
        .getByRole("checkbox", { name: "3 large eggs" }),
    ).toBeChecked();
  });

  test("ticks, the step and the layout survive a reload in the same tab", async ({
    page,
  }) => {
    await page.goto(`/recipe/${SLUG}`);
    let view = await openCookView(page);
    await view.getByTestId("cook-done").click();
    await view.getByTestId("cook-done").click();
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 3 of 4");
    await view
      .getByRole("checkbox", { name: "1 cup packed brown sugar" })
      .click();
    await page.keyboard.press("Escape");
    await expect(view).toHaveCount(0);

    await page.reload();
    view = await openCookView(page);
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 3 of 4");
    await expect(
      view.getByRole("checkbox", { name: "1 cup packed brown sugar" }),
    ).toBeChecked();
    await view
      .getByRole("group", { name: "Layout" })
      .getByRole("button", { name: "All steps" })
      .click();
    await expect(view.getByTestId("cook-progress")).toHaveText(
      "2 of 4 steps done",
    );

    /* sessionStorage, per recipe: the key is the recipe's. */
    const saved = await page.evaluate(
      (slug) => sessionStorage.getItem(`cook-view:${slug}`),
      SLUG,
    );
    expect(JSON.parse(saved!)).toMatchObject({
      done: [0, 1],
      step: 2,
      layout: "list",
    });
  });
});

test.describe("Timer buttons in step text (42c2)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken, page }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
    await page.clock.install({ time: new Date("2026-10-19T17:00:00Z") });
  });

  test("a timer counts down, several run at once, and they outlive the cook view", async ({
    page,
  }) => {
    await page.goto(`/recipe/${SLUG}`);
    const bake = page.getByRole("button", { name: "Start timer: 50 minutes" });
    await expectHydrated(bake);
    await expect(
      page.getByRole("button", { name: "Start timer: 30 minutes" }),
    ).toBeVisible();

    await bake.click();
    const tray = page.getByRole("region", { name: "Timers" });
    const timer = (label: string) =>
      tray.getByRole("timer", { name: new RegExp(`^${label}:`) });
    await expect(timer("Step 4 · 50 minutes")).toHaveText("50:00");
    await expect(page.getByTestId("timer-announcer")).toHaveText(
      "Timer started: Step 4 · 50 minutes",
    );

    await page.clock.fastForward("10:00");
    await expect(timer("Step 4 · 50 minutes")).toHaveText("40:00");
    /* The running button shows its countdown too, and now pauses. */
    await expect(
      page.getByRole("button", { name: /^Pause timer: 50 minutes/ }),
    ).toContainText("40:00");

    await page.getByRole("button", { name: "Start timer: 25 minutes" }).click();
    await expect(tray.getByTestId("timer-row")).toHaveCount(2);

    /* The cook view shares the timers: the same two, at step 4 the same buttons. */
    const view = await openCookView(page);
    const viewTray = view.getByRole("region", { name: "Timers" });
    await expect(viewTray.getByTestId("timer-row")).toHaveCount(2);
    for (let i = 0; i < 3; i++) await view.getByTestId("cook-done").click();
    await expect(view.getByTestId("cook-progress")).toHaveText("Step 4 of 4");
    const stepButtons = view
      .getByTestId("cook-step")
      .getByTestId("timer-button");
    await expect(stepButtons).toHaveCount(2);
    for (const button of await stepButtons.all()) {
      await expect(button).toHaveAttribute("data-timer-status", "running");
    }

    await page.clock.fastForward("25:00");
    const cover = viewTray.getByRole("timer", {
      name: /^Step 4 · 25 minutes:/,
    });
    await expect(cover).toHaveText("Done");
    await expect(
      viewTray.getByTestId("timer-row").filter({ has: cover }),
    ).toHaveAttribute("data-timer-status", "done");
    /* Said inside the dialog; the page's region stays quiet meanwhile. */
    await expect(view.getByTestId("timer-announcer")).toHaveText(
      "Timer done: Step 4 · 25 minutes",
    );
    await expect(
      viewTray.getByRole("timer", { name: /^Step 4 · 50 minutes:/ }),
    ).toHaveText("15:00");

    /* Closed, the page's tray still has both. */
    await page.keyboard.press("Escape");
    await expect(view).toHaveCount(0);
    await expect(timer("Step 4 · 25 minutes")).toHaveText("Done");
    await expect(timer("Step 4 · 50 minutes")).toHaveText("15:00");

    /* Paused, the clock moves and the timer does not. */
    await tray
      .getByRole("button", { name: "Pause Step 4 · 50 minutes" })
      .click();
    await page.clock.fastForward("05:00");
    await expect(timer("Step 4 · 50 minutes")).toHaveText("15:00");
    await tray
      .getByRole("button", { name: "Clear Step 4 · 25 minutes" })
      .click();
    await expect(tray.getByTestId("timer-row")).toHaveCount(1);
  });
});

test.describe("Cook view accessibility (42c2)", () => {
  test.beforeEach(async ({ resetData, request, createApiToken }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
  });

  for (const mode of ["light", "dark"] as const) {
    test(`the cook view with a running timer stays WCAG 2.2 AA in ${mode} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto(`/recipe/${SLUG}`);
      await expectMode(page, mode);
      const bake = page.getByRole("button", {
        name: "Start timer: 50 minutes",
      });
      await expectHydrated(bake);
      await bake.click();
      /* The page with its tray first, then the view in both layouts. */
      await expectNoViolations(page);
      const view = await openCookView(page);
      await expect(view.getByTestId("timer-row")).toHaveCount(1);
      await expectNoViolations(page);
      await view
        .getByRole("group", { name: "Layout" })
        .getByRole("button", { name: "All steps" })
        .click();
      await expectNoViolations(page);
    });
  }
});

test.describe("Cook view on a phone @mobile", () => {
  test("one step fits the phone, with no sideways scroll @mobile", async ({
    page,
    resetData,
    request,
    createApiToken,
  }) => {
    await resetData("two-pages");
    await writePie(request, await createApiToken());
    await page.clock.install({ time: new Date("2026-10-19T17:00:00Z") });
    await page.goto(`/recipe/${SLUG}`);
    const view = await openCookView(page);
    for (let i = 0; i < 3; i++) await view.getByTestId("cook-done").click();
    await view.getByRole("button", { name: "Start timer: 50 minutes" }).click();
    await page.clock.fastForward("12:00");
    await expect(
      view.getByRole("timer", { name: /^Step 4 · 50 minutes:/ }),
    ).toHaveText("38:00");

    const overflow = await view.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    /* The Back/Done bar is on screen at the bottom. */
    await expect(
      view.getByRole("navigation", { name: "Steps" }),
    ).toBeInViewport();
    await snapshotPage(page, "cook-view-mobile.png", { fullPage: false });
  });
});
