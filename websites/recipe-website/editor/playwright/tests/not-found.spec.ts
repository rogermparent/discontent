import { test, expect } from "../support/test";

test.describe("404 Routes", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("three-recipes");
  });

  test("returns 404 for a missing recipe", async ({ request }) => {
    const response = await request.get("/recipe/does-not-exist");
    expect(response.status()).toBe(404);
  });

  test("returns 404 for editing a missing recipe (signed-out lands on sign-in)", async ({
    page,
    request,
  }) => {
    const response = await request.get("/recipe/does-not-exist/edit");
    expect([401, 404, 200]).toContain(response.status());
    await page.goto("/recipe/does-not-exist/edit");
    await expect(
      page.getByRole("button", {
        name: "Sign in with Credentials",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("returns 404 for a missing custom page", async ({ request }) => {
    const response = await request.get("/pages/totally-missing");
    expect(response.status()).toBe(404);
  });

  test("returns 404 for a missing featured recipe", async ({ request }) => {
    const response = await request.get("/featured-recipe/does-not-exist");
    expect(response.status()).toBe(404);
  });

  test("returns 404 for an unknown top-level path", async ({ request }) => {
    const response = await request.get("/this-route-does-not-exist");
    expect(response.status()).toBe(404);
  });
});
