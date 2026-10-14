import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/*
 * 35r: "Import from a roundup" on /new-recipe — the picker over 34f's
 * `inspectList` / `importList` seats, a few picks per server action call.
 *
 * The `importable-uploads` fixture serves its own pages under /uploads:
 * `roundup.html` (three dinners, as 34f's api-write case uses it) and
 * `roundup-five.html` (five tiny recipes with local pictures — one more call
 * than three, so a run can stop between calls). Loopback is not paced
 * (30-D5), so nothing here waits 15 s.
 */
test.describe("Import from a roundup", () => {
  test.beforeEach(async ({ page, resetData }) => {
    await resetData("importable-uploads");
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    await page.getByText("Import from a roundup", { exact: true }).click();
  });

  const list = async (page: import("@playwright/test").Page, url: string) => {
    await page.getByLabel("Roundup URL", { exact: true }).fill(url);
    await page
      .getByRole("button", { name: "List recipes", exact: true })
      .click();
  };

  test("lists the items, imports two with a term, and marks them existing", async ({
    page,
    baseURL,
    request,
  }) => {
    const url = new URL("/uploads/roundup-five.html", baseURL!).href;
    await list(page, url);
    const items = page.getByTestId("roundup-items");
    await expect(items.locator("li")).toHaveCount(5);
    await expect(items.locator("li").first()).toContainText("1. Picker Soup");
    /* Everything new starts ticked. */
    await expect(
      page.getByLabel("1. Picker Soup", { exact: true }),
    ).toBeChecked();

    await page
      .getByRole("button", { name: "Select none", exact: true })
      .click();
    await page.getByLabel("2. Picker Stew", { exact: true }).check();
    await page.getByLabel("4. Picker Bread", { exact: true }).check();
    await page
      .getByLabel("Collection term (optional)", { exact: true })
      .fill("picker-dishes");
    await page
      .getByLabel("Label, if the term is new (optional)", { exact: true })
      .fill("Picker Dishes");
    await page
      .getByRole("button", { name: "Import 2 selected", exact: true })
      .click();

    await expect(page.getByTestId("roundup-progress")).toHaveText(
      "Imported 2 of 2 · done",
    );
    const results = page.getByTestId("roundup-results");
    await expect(
      results.getByRole("link", { name: "picker-stew" }),
    ).toHaveAttribute("href", "/recipe/picker-stew");
    await expect(
      results.getByRole("link", { name: "picker-bread" }),
    ).toBeVisible();

    const term = await (
      await request.get("/api/taxonomies/tag/picker-dishes")
    ).json();
    expect(term.label).toBe("Picker Dishes");
    expect([...term.recipes].sort()).toEqual(["picker-bread", "picker-stew"]);

    /* Listed again: the two are existing, linked, and not pickable alone. */
    await page
      .getByLabel("Collection term (optional)", { exact: true })
      .fill("");
    await list(page, url);
    const stew = items.locator("li").nth(1);
    await expect(stew).toContainText("already imported as picker-stew");
    await expect(
      stew.getByRole("link", { name: "picker-stew" }),
    ).toHaveAttribute("href", "/recipe/picker-stew");
    await expect(
      page.getByLabel("2. Picker Stew", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("1. Picker Soup", { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Import 3 selected", exact: true }),
    ).toBeVisible();
    /* With a term, an existing one may be ticked, to tag it too. */
    await page
      .getByLabel("Collection term (optional)", { exact: true })
      .fill("picker-dishes");
    await expect(
      page.getByLabel("2. Picker Stew", { exact: true }),
    ).toBeEnabled();
  });

  test("stops after the current call and resumes from the rest", async ({
    page,
    baseURL,
  }) => {
    await list(page, new URL("/uploads/roundup-five.html", baseURL!).href);
    await page
      .getByRole("button", { name: "Import 5 selected", exact: true })
      .click();
    /* Asked while the first call (three picks) is still running. */
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    /* Still in flight: Import stays put, disabled, and the form waits. */
    await expect(
      page.getByRole("button", { name: "Importing…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Submit", exact: true }),
    ).toBeDisabled();

    const progress = page.getByTestId("roundup-progress");
    await expect(progress).toHaveText(
      "Imported 3 of 5 · stopped with 2 picks left",
    );
    await expect(
      page.getByRole("button", { name: "Submit", exact: true }),
    ).toBeEnabled();
    const results = page.getByTestId("roundup-results").locator("li");
    await expect(results).toHaveCount(3);

    await page
      .getByRole("button", { name: "Resume (2 left)", exact: true })
      .click();
    await expect(progress).toHaveText("Imported 5 of 5 · done");
    await expect(results).toHaveCount(5);
    await expect(results.nth(4)).toContainText("5. Picker Pie — imported");
    await expect(page.getByRole("button", { name: /^Resume/ })).toHaveCount(0);
  });

  /* 35r review: the seat slugs what it gets, and this label is not `effort`'s slug. */
  test("a typed label names its term, not a new one", async ({
    page,
    baseURL,
    request,
    createApiToken,
  }) => {
    const token = await createApiToken();
    const created = await request.post("/api/taxonomies/tag", {
      headers: { authorization: `Bearer ${token}` },
      data: { label: "Speed & effort", slug: "effort" },
    });
    expect(created.status()).toBe(201);
    /* The term exists now; the page's suggestions were read before it. */
    await page.reload();
    await page.getByText("Import from a roundup", { exact: true }).click();

    await list(page, new URL("/uploads/roundup-five.html", baseURL!).href);
    await page
      .getByRole("button", { name: "Select none", exact: true })
      .click();
    await page.getByLabel("3. Picker Salad", { exact: true }).check();
    await page
      .getByLabel("Collection term (optional)", { exact: true })
      .fill("Speed & effort");
    await page
      .getByRole("button", { name: "Import 1 selected", exact: true })
      .click();
    await expect(page.getByTestId("roundup-progress")).toHaveText(
      "Imported 1 of 1 · done",
    );

    const effort = await (
      await request.get("/api/taxonomies/tag/effort")
    ).json();
    expect(effort.recipes).toEqual(["picker-salad"]);
    expect(
      (await request.get("/api/taxonomies/tag/speed-and-effort")).status(),
    ).toBe(404);
  });

  test("says why a page is not a roundup, and offers the single import", async ({
    page,
    baseURL,
  }) => {
    const url = new URL("/uploads/picker-soup.html", baseURL!).href;
    await list(page, url);
    const reason = page.getByTestId("roundup-reason");
    await expect(reason).toContainText("Recipe of its own");
    await expect(
      reason.getByRole("link", { name: "Import it as one recipe" }),
    ).toHaveAttribute("href", `/new-recipe?import=${encodeURIComponent(url)}`);
    await expect(page.getByTestId("roundup-items")).toHaveCount(0);
  });
});
