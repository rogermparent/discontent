import { test, expect, type Page } from "../support/test";
import { signIn } from "../support/helpers";
import { expectHydrated } from "../support/hydration";

/*
 * 51: the recipe page's "Group" opens a picker of the existing groups plus
 * "New group…", and the group form offers the holidays coming up as tag chips.
 *
 * `three-recipes-groups`: "Week of May 4" (a meal plan: first, second and a
 * missing recipe) is newer than "Weeknight Favourites" (first, third).
 */

async function openPicker(page: Page, slug: string) {
  await page.goto(`/recipe/${slug}`);
  await signIn(page);
  await page.goto(`/recipe/${slug}`);
  const trigger = page.getByTestId("group-picker-trigger");
  await expectHydrated(trigger);
  return trigger;
}

test.describe("Recipe page — the Group picker", () => {
  test("adds the recipe to an existing group, then it is on the group page", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData("three-recipes-groups");
    await initializeContentGit();
    const trigger = await openPicker(page, "third-recipe");
    await trigger.click();

    const picker = page.getByTestId("group-picker");
    const rows = picker.getByTestId("group-picker-row");
    /* Newest first, each with its size; Weeknight already has this recipe. */
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Week of May 4");
    await expect(rows.nth(0)).toContainText("3 items");
    await expect(rows.nth(1)).toContainText("Weeknight Favourites");

    await rows.nth(0).click();
    const result = page.getByTestId("group-picker-result");
    await expect(result).toContainText("Added to Week of May 4");
    await result.getByRole("link", { name: "Open" }).click();
    /* Cold `next dev` compiles the group page on this click. */
    await expect(page).toHaveURL(/\/group\/week-of-may-4$/, {
      timeout: 30_000,
    });
    const items = page.getByTestId("group-item");
    await expect(items).toHaveCount(4);
    await expect(items.nth(3)).toContainText("Third Recipe");
  });

  test("a group that already has the recipe says so and opens that group", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    const trigger = await openPicker(page, "third-recipe");
    await trigger.click();

    const already = page
      .getByTestId("group-picker-row")
      .filter({ hasText: "Weeknight Favourites" });
    await expect(already).toContainText("Already in it");
    await expect(already).toHaveAttribute("data-already", "true");
    await already.click();
    await expect(page).toHaveURL(/\/group\/weeknight-favourites$/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("group-item")).toHaveCount(2);
  });

  test("New group… lands on the prefilled form", async ({
    page,
    resetData,
  }) => {
    await resetData("three-recipes-groups");
    const trigger = await openPicker(page, "second-recipe");
    await trigger.click();
    await page.getByTestId("group-picker-new").click();
    await expect(page).toHaveURL(/\/group\/new\?recipe=second-recipe$/);
    await expect(page.locator("#group-form")).toContainText(
      "Selected: Second Recipe",
    );
  });

  test("works from the keyboard alone, and Escape returns to the button", async ({
    page,
    resetData,
    initializeContentGit,
  }) => {
    await resetData("three-recipes-groups");
    await initializeContentGit();
    const trigger = await openPicker(page, "second-recipe");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const rows = page.getByTestId("group-picker-row");
    await expect(rows.first()).toBeFocused();

    /* Escape closes it and gives the focus back. */
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("group-picker")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    /* Arrow down past the group already holding the recipe to Weeknight. */
    await page.keyboard.press("Enter");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("group-picker-new")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("group-picker-result")).toContainText(
      "Added to Weeknight Favourites",
    );
  });
});

test.describe("Group form — upcoming holiday chips", () => {
  const TODAY = new Date(2026, 10, 24, 12);

  test.beforeEach(async ({ page, request, resetData, createApiToken }) => {
    await resetData("drinks-bar");
    const headers = { authorization: `Bearer ${await createApiToken()}` };
    for (const label of ["Thanksgiving", "Christmas", "Easter"]) {
      const created = await request.post("/api/taxonomies/tag", {
        headers,
        data: { label, parent: "holidays" },
      });
      /* 409: the fixture already has that term. */
      expect([201, 409], label).toContain(created.status());
    }
    await page.clock.setFixedTime(TODAY);
  });

  test("the new group form offers Thanksgiving and Christmas, and a click tags it", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/group/new");
    const chips = page.getByTestId("upcoming-holiday");
    await expect(chips).toHaveText([
      /Thanksgiving\s*· Thu 26 Nov/,
      /Christmas\s*· Fri 25 Dec/,
    ]);

    await chips.first().click();
    await expect(
      page.getByRole("button", { name: "Remove tag thanksgiving" }),
    ).toBeVisible();
    await expect(chips).toHaveCount(1);
  });

  test("a form opened from a holiday's menu has that holiday tagged already", async ({
    page,
  }) => {
    await page.goto("/");
    await signIn(page);
    await page.goto("/group/new?name=Thanksgiving&tags=thanksgiving");
    await expect(page.getByTestId("upcoming-holiday")).toHaveText([
      /Christmas/,
    ]);
  });
});
