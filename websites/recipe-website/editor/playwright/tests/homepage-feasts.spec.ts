import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { expectMode, expectNoViolations } from "../support/a11y";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/*
 * 48e: the homepage's canvas B — Tonight, the next holiday as its menu by
 * course, Then (a holiday's plan) and New in the collection by batch and
 * cuisine — as a reader and as an editor.
 *
 * `drinks-bar` plus, through the API (`withFeast`): a `course` root (Mains,
 * Sides, Breads, Desserts — Hand Pies is already a dessert), Thanksgiving
 * under `holidays` with a description naming its classics, its menu (a
 * roast turkey, cornbread stuffing, a pumpkin pie and the newer pie bars,
 * honey rolls, mulled cider), a quick Korean stir fry for tonight, warm
 * drinks under `drink`, and a "Christmas Baking" plan tagged `christmas`.
 *
 * The browser's clock is Monday 9 November 2026, noon (the canvas's day):
 * Halloween is past, Thanksgiving in 17 days, Christmas in 46.
 */

const NOV_9 = new Date(2026, 10, 9, 12);
const MINUTE = 60_000;

async function withFeast(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const headers = { authorization: `Bearer ${token}` };
  for (const data of [
    { label: "Course" },
    { label: "Mains", slug: "main", parent: "course" },
    { label: "Sides", slug: "side", parent: "course" },
    { label: "Breads", slug: "bread", parent: "course" },
    { label: "Desserts", slug: "dessert", parent: "course" },
    { label: "Cuisine" },
    { label: "Korean", parent: "cuisine" },
    { label: "Warm drinks", slug: "warm-drinks", parent: "drink" },
    {
      label: "Thanksgiving",
      parent: "holidays",
      description: "The whole table: turkey, stuffing, rolls and pumpkin pie.",
    },
  ]) {
    const created = await request.post("/api/taxonomies/tag", {
      headers,
      data,
    });
    expect(created.status(), JSON.stringify(data)).toBe(201);
  }
  const now = Date.now();
  /* Oldest first: the classics, then the newest imports, then tonight's. */
  for (const [index, data] of [
    {
      name: "Roast Turkey",
      slug: "roast-turkey",
      tags: ["main", "thanksgiving"],
    },
    {
      name: "Cornbread Stuffing",
      slug: "cornbread-stuffing",
      tags: ["side", "thanksgiving"],
    },
    {
      name: "Pumpkin Pie",
      slug: "pumpkin-pie",
      tags: ["dessert", "thanksgiving"],
    },
    {
      name: "Cranberry Pie Bars",
      slug: "pie-bars",
      tags: ["dessert", "thanksgiving"],
    },
    {
      name: "Honey Butter Rolls",
      slug: "honey-rolls",
      tags: ["bread", "thanksgiving"],
    },
    {
      name: "Mulled Cider",
      slug: "mulled-cider",
      tags: ["drink", "warm-drinks", "thanksgiving"],
      totalTime: 65,
    },
    {
      name: "Weeknight Stir Fry",
      slug: "stir-fry",
      tags: ["main", "quick", "korean"],
      totalTime: 20,
    },
  ].entries()) {
    const created = await request.post("/api/recipes", {
      headers,
      data: { ...data, date: now - (10 - index) * MINUTE },
    });
    expect(created.status(), data.name).toBe(201);
  }
  const plan = await request.post("/api/groups", {
    headers,
    data: {
      name: "Christmas Baking",
      slug: "christmas-baking",
      tags: ["christmas"],
      items: ["pie-bars", "honey-rolls"],
    },
  });
  expect(plan.status()).toBe(201);
}

const nextUp = (page: Page) => page.getByTestId("next-feast");
const course = (page: Page, slug: string) =>
  nextUp(page).locator(`[data-testid="feast-course"][data-course="${slug}"]`);
const then = (page: Page) =>
  page.getByRole("region", { name: "Then", exact: true });
const tonight = (page: Page) =>
  page.getByRole("region", { name: "Tonight", exact: true });

/** The browser's day has taken over: the countdown is up. */
async function counted(page: Page) {
  await expect(nextUp(page).getByTestId("next-countdown")).toHaveText(
    "in 17 days",
    { timeout: 20_000 },
  );
}

test.describe("Homepage — tonight and the next feast", () => {
  test.beforeEach(async ({ page, request, resetData, createApiToken }) => {
    await resetData("drinks-bar");
    await withFeast(request, await createApiToken());
    await page.clock.setFixedTime(NOV_9);
  });

  test("a reader: tonight's dinner and drink, Thanksgiving by course, Christmas's plan", async ({
    page,
  }) => {
    await page.goto("/");
    await counted(page);

    await expect(page.getByTestId("today-countdown")).toHaveText(
      "· 17 days to Thanksgiving",
    );

    /* Tonight: the one quick main, the Make tile, and — Thanksgiving is
     * within 60 days and has a warm drink — something warm. */
    const quick = tonight(page).getByTestId("tonight-quick");
    await expect(quick.getByRole("listitem")).toHaveCount(1);
    await expect(quick).toContainText("Weeknight Stir Fry");
    await expect(quick).toContainText("20 m · Korean");
    await expect(
      tonight(page).getByRole("link", { name: "All 1 quick main" }),
    ).toHaveAttribute("href", "/search?q=tag%3Aquick%20tag%3Amain");
    await expect(tonight(page).getByTestId("make-tile")).toBeVisible();
    await expect(tonight(page).getByTestId("tonight-warm")).toContainText(
      "Mulled Cider",
    );
    await expect(
      tonight(page).getByRole("link", { name: "All 1 warm drink" }),
    ).toHaveAttribute("href", "/search?q=tag%3Awarm-drinks");

    /* Next up: Thanksgiving's menu by course, each led by its classic —
     * the turkey, the stuffing and the pie, not the newest imports. */
    await expect(nextUp(page)).toContainText("Thanksgiving");
    await expect(nextUp(page)).toContainText("5 dishes · 1 drink");
    await expect(
      nextUp(page).locator('time[datetime="2026-11-26"]'),
    ).toHaveText("Thu 26 Nov");
    await expect(nextUp(page).getByTestId("feast-course")).toHaveText([
      /Mains · 1\s*Roast Turkey/,
      /Sides · 1\s*Cornbread Stuffing/,
      /Breads · 1\s*Honey Butter Rolls/,
      /Desserts · 2\s*Pumpkin Pie/,
      /Drinks · 1\s*Mulled Cider/,
    ]);
    await expect(course(page, "main").getByRole("link")).toHaveAttribute(
      "href",
      "/recipe/roast-turkey",
    );
    await expect(
      nextUp(page).getByRole("link", { name: "Open the menu" }),
    ).toHaveAttribute("href", "/holidays/thanksgiving");
    /* Planning is the editor's. */
    await expect(page.getByTestId("feast-plan-prompt")).toHaveCount(0);

    /* Then: Christmas, with its plan; the plan isn't "On the plan" again. */
    const christmas = then(page).getByTestId("then-feast");
    await expect(christmas).toHaveCount(1);
    await expect(christmas).toContainText("Christmas");
    await expect(christmas.getByTestId("then-countdown")).toHaveText(
      "in 46 days",
    );
    await expect(christmas).toContainText(
      "On the plan: Christmas Baking · 2 recipes",
    );
    await expect(
      christmas
        .getByRole("list", { name: "On Christmas Baking" })
        .getByRole("link"),
    ).toHaveCount(2);
    await expect(
      christmas.getByRole("link", { name: "Open the plan" }),
    ).toHaveAttribute("href", "/group/christmas-baking");
    await expect(
      christmas.getByRole("link", { name: "Put it on the shopping list" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "On the plan", exact: true }),
    ).toHaveCount(0);
    await expect(
      then(page).getByRole("link", { name: "All holidays" }),
    ).toHaveAttribute("href", "/holidays");

    /* New in the collection: tonight's batch says what it is; the
     * cuisine it brings is named. */
    const fresh = page.getByRole("region", {
      name: "New in the collection",
      exact: true,
    });
    await expect(fresh.getByTestId("fresh-batch").first()).toContainText(
      "Thanksgiving",
    );
    await expect(fresh.getByTestId("fresh-cuisines")).toContainText(
      "Korean 1 new",
    );
    await expect(
      fresh.getByTestId("fresh-cuisines").getByRole("link"),
    ).toHaveAttribute("href", "/tags/korean");

    /* Ask is the editor's (43q): a reader has the plain search field. */
    await expect(page.getByTestId("home-ask-switch")).toHaveCount(0);
  });

  test("a recipe shows once: tonight's dinner and a course's lead nowhere else", async ({
    page,
  }) => {
    await page.goto("/");
    await counted(page);
    /* The stir fry is tonight's; no section below shows it again. */
    const main = page.getByRole("main");
    await expect(
      main.getByRole("link", { name: /^Weeknight Stir Fry/ }),
    ).toHaveCount(1);
    /* The turkey leads Mains and is in no other section. */
    await expect(main.getByRole("link", { name: /^Roast Turkey/ })).toHaveCount(
      1,
    );
  });

  test("an editor: start a plan from the menu, filled in, and the plan's shopping list", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/");
    await counted(page);

    const prompt = page.getByTestId("feast-plan-prompt");
    await expect(prompt).toContainText("No Thanksgiving plan yet.");
    /* No model in the suite: no Ask beside the field, no curator hand-off. */
    await expect(page.getByTestId("home-ask-switch")).toHaveCount(0);
    await expect(
      prompt.getByRole("link", { name: "Ask the curator" }),
    ).toHaveCount(0);
    await expect(
      then(page).getByRole("link", { name: "Put it on the shopping list" }),
    ).toHaveAttribute("href", "/group/christmas-baking#plan-shopping-heading");

    const start = prompt.getByRole("link", {
      name: "Start a plan from the menu",
    });
    await expect(start).toHaveAttribute(
      "href",
      /^\/group\/new\?name=Thanksgiving&tags=thanksgiving&recipe=roast-turkey&/,
    );
    await expectHydrated(start);
    await start.click();
    await expect(page).toHaveURL(/\/group\/new\?/);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "Thanksgiving",
    );
    /* A row per course card, each labelled with its course. */
    await expect(page.getByTestId("group-item-row")).toHaveCount(5);
    await expect(page.getByText("Selected: Roast Turkey")).toBeVisible();
    await expect(page.getByText("Selected: Pumpkin Pie")).toBeVisible();
  });

  for (const mode of ["light", "dark"] as const) {
    test(`has no WCAG 2.2 AA violations in ${mode} mode, as a reader and an editor`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto("/");
      await expectMode(page, mode);
      await counted(page);
      await expectNoViolations(page);
      await signIn(page);
      await page.goto("/");
      await counted(page);
      await expect(page.getByTestId("feast-plan-prompt")).toBeVisible();
      await expectNoViolations(page);
    });
  }

  test("fits a phone, its holiday links ≥ 24 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await counted(page);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    /* On a phone the courses are rows, and "Open the whole menu" a button. */
    await expect(
      nextUp(page).getByRole("link", { name: "Open the whole menu" }),
    ).toBeVisible();
    const boxes = await page
      .locator(
        '[data-testid="next-feast"], [data-testid="then-feast"], [data-testid="tonight-quick"]',
      )
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .filter((link) => (link as HTMLElement).offsetParent !== null)
          .map((link) => {
            const { width, height } = link.getBoundingClientRect();
            return { name: link.textContent || link.ariaLabel, width, height };
          }),
      );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(
        Math.min(box.width, box.height),
        String(box.name),
      ).toBeGreaterThanOrEqual(24);
    }
  });
});
