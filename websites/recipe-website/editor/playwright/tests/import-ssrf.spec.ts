import { test, expect } from "../support/test";
import { fillSignInForm, markdownEditorReady } from "../support/helpers";

/*
 * 46a: the importer's SSRF guard. A URL inside the network — a private
 * address, loopback, link-local metadata — is refused before anything is
 * fetched, and the form and the API say so plainly. This server's own
 * fixture pages (`/uploads/*.html` on `localhost:<port>`) still import:
 * `playwright.config.ts` lets exactly that host and port through
 * (the guard reads that allowance under `TEST_MODE` only).
 */
const REFUSAL = /points inside your network; imports only read public sites/;

test.describe("Import SSRF guard (46a)", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData("importable-uploads");
  });

  test("the form refuses a private address and says why", async ({ page }) => {
    await page.goto("/new-recipe");
    await fillSignInForm(page);
    await markdownEditorReady(page, "description");

    await page.getByLabel("Import from URL").fill("http://192.168.1.5/recipe");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText(REFUSAL)).toBeVisible();
    /* Nothing was filled in. */
    await expect(page.locator('#recipe-form [name="name"]')).toHaveValue("");
  });

  test("the API answers 422 url_refused, and still reads this server's fixture", async ({
    request,
    baseURL,
    createApiToken,
  }) => {
    const auth = { authorization: `Bearer ${await createApiToken()}` };
    const refused: [string, Record<string, unknown>][] = [
      ["/api/inspect", { url: "http://169.254.169.254/latest/meta-data/" }],
      ["/api/import", { url: "http://10.0.0.1/recipe", dryRun: true }],
      ["/api/inspect-list", { url: "http://[::1]/list" }],
      ["/api/import-list", { url: "http://127.0.0.1:9/list", all: true }],
    ];
    for (const [route, data] of refused) {
      const response = await request.post(route, { headers: auth, data });
      expect(response.status(), route).toBe(422);
      const { error } = await response.json();
      expect(error.code, route).toBe("url_refused");
      expect(error.message, route).toMatch(REFUSAL);
    }

    const fixture = new URL("/uploads/blackstone-nachos.html", baseURL!).href;
    const inspected = await request.post("/api/inspect", {
      headers: auth,
      data: { url: fixture },
    });
    expect(inspected.status()).toBe(200);
    expect((await inspected.json()).draft.name).toBe(
      "Blackstone Griddle Grilled Nachos",
    );
  });
});
