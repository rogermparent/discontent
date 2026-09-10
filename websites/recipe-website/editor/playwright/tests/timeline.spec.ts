import { test, expect, type Page } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

async function fillName(page: Page, name: string): Promise<void> {
  await page.getByLabel("Name").first().clear();
  await page.getByLabel("Name").first().fill(name);
}

/**
 * The detail-page schedule shows a read-only compact strip at a glance; the
 * interactive editor (resizable durations, zoom, offsets) lives behind the
 * "Adjust schedule" disclosure. Interactive assertions expand it first.
 */
async function expandSchedule(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Adjust schedule" }).click();
}

test.describe("Timeline Feature", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    // Gate on the recipe-form island hydrating so the first field interaction
    // isn't dropped/reset mid-hydration (dev-mode flake).
    await markdownEditorReady(page, "description");
  });

  test("shows the schedule at a glance and prints it", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "New Recipe" }),
    ).toBeVisible();
    const newRecipeTitle = "Timeline Test Recipe";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Dough Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page
      .locator('[name="timelines[0].events[0].name"]')
      .fill("Rise Dough");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("60");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    // Collapsed by default: a read-only strip, named for its timeline, with the
    // event and its duration in the compact format.
    const strip = page.getByRole("figure", {
      name: "Timeline: Dough Timeline",
    });
    await expect(strip).toBeVisible();
    await expect(strip.getByText("Rise Dough")).toBeVisible();
    await expect(strip.getByText("1h").first()).toBeVisible();

    // The schedule prints; the screen-only scale control does not.
    await page.emulateMedia({ media: "print" });
    await expect(strip).toBeVisible();
    await expect(page.getByLabel("Multiply")).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("should be able to add a timeline event with min and max constraints", async ({
    page,
  }) => {
    const newRecipeTitle = "Timeline Constraints Recipe";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Baking Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Bake");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("45");

    await page
      .locator('[name="timelines[0].events[0].minLength.minutes"]')
      .fill("30");
    await page
      .locator('[name="timelines[0].events[0].maxLength.minutes"]')
      .fill("60");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    const timeline = page.getByRole("region", {
      name: "Timeline: Baking Timeline",
    });
    await expect(timeline.getByText("Bake")).toBeVisible();
    await expect(timeline.locator('[value="45"]').first()).toBeAttached();
  });

  test("should display multiple timeline events in order", async ({ page }) => {
    const newRecipeTitle = "Multi-Step Timeline";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Main Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Mix");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("10");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[1].name"]').fill("Rest");
    await page
      .locator('[name="timelines[0].events[1].defaultLength.minutes"]')
      .fill("20");
    await page.locator('[name="timelines[0].events[1].activeTime"]').click();

    await page.locator('[name="timelines[0].events[0].activeTime"]').check();

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    const timeline = page.getByRole("region", {
      name: "Timeline: Main Timeline",
    });
    await expect(timeline.getByText("Mix")).toBeVisible();
    await expect(timeline.getByText("10m")).toBeVisible();
    await expect(timeline.getByText("Rest")).toBeVisible();
    await expect(timeline.getByText("20m")).toBeVisible();
  });

  test("should show duration inputs only for resizable events", async ({
    page,
  }) => {
    const newRecipeTitle = "Resizable vs Fixed Timeline";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page
      .locator('[name="timelines[0].events[0].name"]')
      .fill("Resizable Step");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");
    await page
      .locator('[name="timelines[0].events[0].minLength.minutes"]')
      .fill("20");
    await page
      .locator('[name="timelines[0].events[0].maxLength.minutes"]')
      .fill("40");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page
      .locator('[name="timelines[0].events[1].name"]')
      .fill("Fixed Step");
    await page
      .locator('[name="timelines[0].events[1].defaultLength.minutes"]')
      .fill("15");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    const timeline = page.getByRole("region", {
      name: "Timeline: Test Timeline",
    });
    await expect(
      timeline.getByLabel("Resizable Step duration in minutes"),
    ).toBeAttached();
    await expect(timeline.locator('[value="30"]').first()).toBeAttached();

    await expect(
      timeline.getByRole("article", { name: /Fixed Step: 15m$/ }),
    ).toBeAttached();
    await expect(
      timeline.getByLabel("Fixed Step duration in minutes"),
    ).toHaveCount(0);
  });

  test("should be able to resize a timeline event in the view", async ({
    page,
  }) => {
    const newRecipeTitle = "Resize Test Recipe";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Step 1");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");
    await page
      .locator('[name="timelines[0].events[0].minLength.minutes"]')
      .fill("10");
    await page
      .locator('[name="timelines[0].events[0].maxLength.minutes"]')
      .fill("60");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[1].name"]').fill("Step 2");
    await page
      .locator('[name="timelines[0].events[1].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    const timeline = page.getByRole("region", {
      name: "Timeline: Test Timeline",
    });
    await expect(timeline.getByLabel("Step 1 duration in minutes")).toHaveValue(
      "30",
    );

    await timeline.getByLabel("Step 1 duration in minutes").clear();
    await timeline.getByLabel("Step 1 duration in minutes").fill("45");
    await timeline.getByLabel("Step 1 duration in minutes").blur();

    await expect(timeline.locator('[value="45"]').first()).toBeAttached();
    await expect(timeline.getByText("30m")).toBeVisible();
    await expect(
      timeline.getByLabel("Test Timeline duration: 1h 15m"),
    ).toBeAttached();
  });

  test("should respect min and max length constraints when resizing", async ({
    page,
  }) => {
    const newRecipeTitle = "Constraint Test Recipe";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page
      .locator('[name="timelines[0].events[0].name"]')
      .fill("Constrained Step");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");
    await page
      .locator('[name="timelines[0].events[0].minLength.minutes"]')
      .fill("20");
    await page
      .locator('[name="timelines[0].events[0].maxLength.minutes"]')
      .fill("40");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page
      .locator('[name="timelines[0].events[1].name"]')
      .fill("Other Step");
    await page
      .locator('[name="timelines[0].events[1].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    const timeline = page.getByRole("region", {
      name: "Timeline: Test Timeline",
    });
    await expect(timeline.locator('[value="30"]').first()).toBeAttached();

    await timeline.getByLabel("Constrained Step duration in minutes").clear();
    await timeline
      .getByLabel("Constrained Step duration in minutes")
      .fill("10");
    await timeline.getByLabel("Constrained Step duration in minutes").blur();

    await expect(timeline.locator('[value="20"]').first()).toBeAttached();

    await timeline.getByLabel("Constrained Step duration in minutes").clear();
    await timeline
      .getByLabel("Constrained Step duration in minutes")
      .fill("50");
    await timeline.getByLabel("Constrained Step duration in minutes").blur();

    await expect(timeline.locator('[value="40"]').first()).toBeAttached();

    await timeline.getByLabel("Constrained Step duration in minutes").clear();
    await timeline
      .getByLabel("Constrained Step duration in minutes")
      .fill("35");
    await timeline.getByLabel("Constrained Step duration in minutes").blur();

    await expect(timeline.locator('[value="35"]').first()).toBeAttached();
  });

  test("should activate the offset input from the keyboard", async ({
    page,
  }) => {
    // The offset handle only renders with 2+ timelines (they need relative
    // offsets to align). Build two so the zero-offset "Set timeline offset"
    // grip is present.
    const newRecipeTitle = "Keyboard Offset Test";
    await fillName(page, newRecipeTitle);

    for (const [index, name] of [
      [0, "First Timeline"],
      [1, "Second Timeline"],
    ] as const) {
      await page
        .getByRole("button", { name: "Add Timeline", exact: true })
        .click();
      await page.locator(`[name="timelines[${index}].name"]`).fill(name);
      await page
        .getByRole("button", { name: "Add Timeline Event", exact: true })
        .nth(index)
        .click();
      await page
        .locator(`[name="timelines[${index}].events[0].name"]`)
        .fill("Step");
      await page
        .locator(`[name="timelines[${index}].events[0].defaultLength.minutes"]`)
        .fill("30");
    }

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    // Keyboard: focus the offset grip, press Enter, and the paired hidden
    // DurationInput takes focus (its `role="button"` div is now key-operable).
    const grip = page.getByRole("button", { name: "Set timeline offset" });
    const offsetInput = page.getByLabel("Timeline offset in minutes").first();
    await grip.first().focus();
    await expect(grip.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(offsetInput).toBeFocused();
  });

  test("should display zoom input with default value of 1", async ({
    page,
  }) => {
    const newRecipeTitle = "Zoom Default Test";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Task");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    await expect(page.getByLabel("Timeline zoom multiplier")).toBeAttached();
    await expect(page.getByLabel("Timeline zoom multiplier")).toHaveValue("1");
    await expect(page.getByText("Zoom", { exact: true })).toBeVisible();
  });

  test("should increase timeline width when zoom is increased", async ({
    page,
  }) => {
    const newRecipeTitle = "Zoom Increase Test";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Task");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    await expect(
      page
        .getByRole("group", { name: "Timeline container" })
        .locator("> *")
        .first(),
    ).toHaveAttribute("style", "width: 100%;");

    await page.getByLabel("Timeline zoom multiplier").clear();
    await page.getByLabel("Timeline zoom multiplier").fill("2");
    await page.getByLabel("Timeline zoom multiplier").blur();

    await expect(
      page
        .getByRole("group", { name: "Timeline container" })
        .locator("> *")
        .first(),
    ).toHaveAttribute("style", "width: 200%;");
  });

  test("should enforce minimum zoom value of 1", async ({ page }) => {
    const newRecipeTitle = "Zoom Minimum Test";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Task");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    await page.getByLabel("Timeline zoom multiplier").clear();
    await page.getByLabel("Timeline zoom multiplier").fill("0.5");
    await page.getByLabel("Timeline zoom multiplier").blur();

    await expect(page.getByLabel("Timeline zoom multiplier")).toHaveValue("1");

    await expect(
      page
        .getByRole("group", { name: "Timeline container" })
        .locator("> *")
        .first(),
    ).toHaveAttribute("style", "width: 100%;");
  });

  test("should allow decimal zoom values", async ({ page }) => {
    const newRecipeTitle = "Zoom Decimal Test";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Task");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    await page.getByLabel("Timeline zoom multiplier").clear();
    await page.getByLabel("Timeline zoom multiplier").fill("1.5");
    await page.getByLabel("Timeline zoom multiplier").blur();

    await expect(page.getByLabel("Timeline zoom multiplier")).toHaveValue(
      "1.5",
    );
    await expect(
      page
        .getByRole("group", { name: "Timeline container" })
        .locator("> *")
        .first(),
    ).toHaveAttribute("style", "width: 150%;");
  });

  test("should make timeline container scrollable when zoomed in", async ({
    page,
  }) => {
    const newRecipeTitle = "Zoom Scroll Test";
    await fillName(page, newRecipeTitle);

    await page
      .getByRole("button", { name: "Add Timeline", exact: true })
      .click();
    await page.locator('[name="timelines[0].name"]').fill("Test Timeline");

    await page
      .getByRole("button", { name: "Add Timeline Event", exact: true })
      .click();
    await page.locator('[name="timelines[0].events[0].name"]').fill("Task");
    await page
      .locator('[name="timelines[0].events[0].defaultLength.minutes"]')
      .fill("30");

    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: newRecipeTitle }),
    ).toBeVisible();

    await expandSchedule(page);

    await expect(
      page.getByRole("group", { name: "Timeline container" }),
    ).toHaveClass(/overflow-x-auto/);

    await page.getByLabel("Timeline zoom multiplier").clear();
    await page.getByLabel("Timeline zoom multiplier").fill("3");
    await page.getByLabel("Timeline zoom multiplier").blur();

    await expect(
      page
        .getByRole("group", { name: "Timeline container" })
        .locator("> *")
        .first(),
    ).toHaveAttribute("style", "width: 300%;");
  });
});
