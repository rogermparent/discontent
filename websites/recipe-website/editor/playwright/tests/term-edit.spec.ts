import { readFileSync } from "node:fs";
import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";
import { fixturePath } from "../support/tasks";

/*
 * The term edit form (31e): `/tags/new` and `/tags/<slug>/edit`, a browser
 * transport onto 31c's term seats.
 *
 * The `christmas-cookies` fixture has three records — `dessert` (root),
 * `cookies` (under dessert) and `holiday` (a root nothing carries) — and
 * `christmas`, a term that lives only on its carriers.
 */
test.describe("Term edit form", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("christmas-cookies");
  });

  test("creates a child term, then moves it to another parent", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/tags");
    await page.getByRole("link", { name: "New term", exact: true }).click();
    await fillSignInForm(page);
    await expect(page).toHaveURL(baseURL + "/tags/new");
    await markdownEditorReady(page, "description");

    await page.getByLabel("Label", { exact: true }).fill("Bar Cookies");
    await page.getByLabel("Parent", { exact: true }).selectOption("cookies");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(baseURL + "/tags/bar-cookies");
    await expect(
      page.getByRole("heading", { name: "Bar Cookies", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("term-breadcrumb").getByRole("link"),
    ).toHaveText([/Dessert/, /Cookies/]);

    /* The Edit link beside Feature, and the form opens on the record. */
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(baseURL + "/tags/bar-cookies/edit");
    await markdownEditorReady(page, "description");
    const parent = page.getByLabel("Parent", { exact: true });
    await expect(parent).toHaveValue("cookies");
    /* A term is never offered as its own parent (24-T8). */
    await expect(parent.locator('option[value="bar-cookies"]')).toHaveCount(0);

    await parent.selectOption("dessert");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(baseURL + "/tags/bar-cookies");
    await expect(
      page.getByTestId("term-breadcrumb").getByRole("link"),
    ).toHaveText([/Dessert/]);

    await page.goto("/tags/dessert");
    await expect(
      page
        .getByTestId("term-children")
        .getByRole("link", { name: /Bar Cookies/ }),
    ).toHaveAttribute("href", "/tags/bar-cookies");
  });

  test("a cycle is refused on Parent and nothing is written", async ({
    page,
    request,
    createApiToken,
  }) => {
    /*
     * The select leaves out the term and everything under it, so the form
     * cannot even offer Dessert → Cookies.
     */
    await page.goto("/tags/dessert/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    const parent = page.getByLabel("Parent", { exact: true });
    await expect(parent.locator("option")).toHaveText([
      "None (a top-level term)",
      "Holiday",
    ]);

    /*
     * So the refusal is driven the way it really happens: a stale page. The
     * Holiday form is opened while Cookies is still a fair parent for it, then
     * Dessert moves under Holiday through the API, and Holiday → Cookies now
     * closes Holiday → Cookies → Dessert → Holiday. The seat checks at submit
     * time, against the data files.
     */
    await page.goto("/tags/holiday/edit");
    await markdownEditorReady(page, "description");
    await expect(parent.locator('option[value="cookies"]')).toHaveCount(1);

    const token = await createApiToken();
    const moved = await request.patch("/api/taxonomies/tag/dessert", {
      headers: { authorization: `Bearer ${token}` },
      data: { parent: "holiday" },
    });
    expect(moved.status()).toBe(200);

    await parent.selectOption("cookies");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText(/underneath itself/)).toContainText(
      "holiday → cookies → dessert → holiday",
    );
    await expect(page.getByText("The term was not saved.")).toBeVisible();
    await expect(page).toHaveURL(/\/tags\/holiday\/edit$/);
    /* The choice is echoed back, not reset away. */
    await expect(parent).toHaveValue("cookies");

    const holiday = await request.get("/api/taxonomies/tag/holiday");
    expect(holiday.status()).toBe(200);
    const body = await holiday.json();
    expect(body.record.parent).toBeUndefined();
    expect(body.parent).toBeUndefined();
  });

  test("a term with only carriers gets a record from its Edit link", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/tags/christmas/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    await expect(page.getByText("This term has no record yet")).toBeVisible();
    /* The fold's label is the starting point. */
    await expect(page.getByLabel("Label", { exact: true })).toHaveValue(
      "christmas",
    );

    await page.getByLabel("Label", { exact: true }).fill("Christmas");
    /* The term's own recipes are the pin suggestions. */
    const suggestion = page
      .getByRole("button", { name: /^Add pinned recipe / })
      .first();
    const pinnedName = (await suggestion.getAttribute("aria-label"))?.replace(
      "Add pinned recipe ",
      "",
    );
    await suggestion.click();
    await expect(
      page.getByRole("button", { name: `Remove pinned recipe ${pinnedName}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page).toHaveURL(baseURL + "/tags/christmas");
    await expect(
      page.getByRole("heading", { name: "Christmas", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("recipe-list").locator("> li").first(),
    ).toBeVisible();
  });

  /* 32c (D2): the term form takes a file, as the recipe and group forms do. */
  test("uploads a picture from a file, then removes it", async ({
    page,
    request,
  }) => {
    await page.goto("/tags/cookies/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");
    await expect(page.getByTestId("term-image")).toHaveCount(0);

    await page.getByLabel("Image", { exact: true }).setInputFiles({
      name: "recipe-6-test-image.png",
      mimeType: "image/png",
      buffer: readFileSync(fixturePath("images", "recipe-6-test-image.png")),
    });
    await expect(page.getByAltText("Image to upload")).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    /* The redirect, not a heading: the edit page has one too (T19). */
    await page.waitForURL((url) => url.pathname === "/tags/cookies");
    await expect(
      page.getByTestId("term-image").getByRole("img", {
        name: "Photo of Cookies",
      }),
    ).toBeVisible();
    const stored = await request.get("/api/taxonomies/tag/cookies");
    const { record } = await stored.json();
    expect(record.image).toBe("recipe-6-test-image.png");
    /* Nothing else about the record moved. */
    expect(record.parent).toBe("dessert");
    expect(record.pinned).toHaveLength(3);

    /* The edit form shows it, and "Remove Image" takes it away. */
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/tags/cookies/edit");
    await markdownEditorReady(page, "description");
    await expect(page.getByAltText("Existing term image")).toBeVisible();
    await page.getByLabel("Remove Image", { exact: true }).check();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await page.waitForURL((url) => url.pathname === "/tags/cookies");
    await expect(
      page.getByRole("heading", { name: "Cookies", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("term-image")).toHaveCount(0);
    const cleared = await request.get("/api/taxonomies/tag/cookies");
    expect((await cleared.json()).record.image).toBeUndefined();
  });

  /* 32i (D5): aliases from the form; `/tags/<alias>` lands on the term. */
  test("adds an alias from the chips, and /tags/<alias> redirects to the term", async ({
    page,
    request,
  }) => {
    await page.goto("/tags/cookies/edit");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");

    const add = page.getByLabel("Add a synonym", { exact: true });
    await add.fill("Biscuits");
    await add.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove synonym Biscuits" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/tags/cookies");

    const stored = await request.get("/api/taxonomies/tag/cookies");
    const body = await stored.json();
    expect(body.aliases).toEqual(["biscuits"]);
    /* Nothing else about the record moved. */
    expect(body.record.parent).toBe("dessert");
    expect(body.record.pinned).toHaveLength(3);

    await page.goto("/tags/biscuits");
    await page.waitForURL((url) => url.pathname === "/tags/cookies");
    await expect(
      page.getByRole("heading", { name: "Cookies", exact: true }),
    ).toBeVisible();

    /* An alias naming another term is refused on the field, nothing saved. */
    await page.goto("/tags/cookies/edit");
    await markdownEditorReady(page, "description");
    await expect(
      page.getByRole("button", { name: "Remove synonym biscuits" }),
    ).toBeVisible();
    await add.fill("holiday");
    await add.press("Enter");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/names the term "holiday"/)).toBeVisible();
    await expect(page).toHaveURL(/\/tags\/cookies\/edit$/);
    const after = await request.get("/api/taxonomies/tag/cookies");
    expect((await after.json()).aliases).toEqual(["biscuits"]);
  });
});
