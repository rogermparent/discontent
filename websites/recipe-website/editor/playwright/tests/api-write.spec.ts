import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../support/test";

const execFileAsync = promisify(execFile);

/**
 * The JSON write API (22d).
 *
 * Two claims, and the second is the one the phase exists for.
 *
 * **Every write is authenticated.** There is no middleware in this editor (the
 * `authorized` callback in `auth.config.ts` is unreferenced and guests are
 * allowed), so each handler calls `authenticateRequest` itself. A route that
 * forgot would be an unauthenticated write path with nothing above it to catch
 * the omission, so every method here is asserted both without a token and with
 * one.
 *
 * **A write through the API revalidates in-process.** This is the whole
 * difference from 22c's CLI: a write that lands over HTTP goes through the
 * process that owns the render cache, so it fires the same
 * `revalidateContentWrite` a browser form fires (D9). Every case therefore
 * asserts the *rendered page* after the request — with no `resetData` and no
 * "Settings → Maintenance → Reload" in between, which is exactly what a stale
 * cache would need.
 *
 * These are also the only tests the routes have. A route file that imports a
 * cached read (`recipe/[slug]/route.ts` → `recipeItems`) cannot be loaded under
 * vitest, so vitest covers the pure pieces and this covers the routes (T17).
 */
test.describe("JSON write API", () => {
  let token: string;

  test.beforeEach(async ({ resetData, createApiToken }) => {
    /*
     * `importable-uploads` has no recipes and does have the HTML pages the
     * editor serves at `/uploads/*` — so the corpus starts empty (every recipe
     * below is one this suite created) and the import case has a real URL to
     * fetch from this same server.
     */
    await resetData("importable-uploads");
    token = await createApiToken();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  test("refuses every write without a token, and accepts it with one", async ({
    request,
  }) => {
    const anonymous = await request.post("/api/recipes", {
      data: { name: "Sneaky" },
    });
    expect(anonymous.status()).toBe(401);
    expect((await anonymous.json()).error.code).toBe("unauthenticated");

    const bad = await request.post("/api/recipes", {
      headers: { authorization: "Bearer rcp_deadbeef_nope" },
      data: { name: "Sneaky" },
    });
    expect(bad.status()).toBe(401);

    const created = await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "Sneaky" },
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).slug).toBe("sneaky");
  });

  test("a created recipe renders immediately, with no cache reload", async ({
    request,
    page,
  }) => {
    const response = await request.post("/api/recipes", {
      headers: auth(),
      data: {
        name: "API Naan",
        description: "Written over HTTP.",
        tags: ["Bread"],
        ingredients: ["2 cups flour"],
        instructions: ["Knead."],
      },
    });
    expect(response.status()).toBe(201);
    const { slug, url } = await response.json();
    expect(slug).toBe("api-naan");
    expect(url).toBe("/recipe/api-naan");

    await page.goto("/recipe/api-naan");
    await expect(page.getByRole("heading", { name: "API Naan" })).toBeVisible();

    await page.goto("/recipes");
    await expect(
      page.getByTestId("recipe-list").getByText("API Naan"),
    ).toBeVisible();
  });

  test("a duplicate create is 409, and ?overwrite=1 replaces it", async ({
    request,
    page,
  }) => {
    await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan", description: "First." },
    });

    const conflict = await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan", description: "Second." },
    });
    expect(conflict.status()).toBe(409);
    const body = await conflict.json();
    expect(body.error.code).toBe("slug_conflict");
    expect(body.error.slug).toBe("api-naan");

    const overwritten = await request.post("/api/recipes?overwrite=1", {
      headers: auth(),
      data: { name: "API Naan", description: "Second." },
    });
    expect(overwritten.status()).toBe(201);

    await page.goto("/recipe/api-naan");
    await expect(page.getByText("Second.")).toBeVisible();
  });

  test("imports a recipe with its citation and renders it", async ({
    request,
    page,
    baseURL,
  }) => {
    const source = new URL("/uploads/naan.html", baseURL!).href;
    const response = await request.post("/api/import", {
      headers: auth(),
      data: { url: source, tags: ["bread"] },
    });
    expect(response.status()).toBe(201);
    const { slug } = await response.json();
    expect(slug).toBe("naan");

    /*
     * The kept GET on this route returns the *record*, which is what
     * `RecipeSelect` reads — so this also pins that the write did not change
     * its shape.
     */
    const record = await request.get(`/api/recipe/${slug}`);
    expect(record.status()).toBe(200);
    const recipe = await record.json();
    expect(recipe.name).toBe("Naan");
    expect(recipe.source.url).toBe(source);

    await page.goto(`/recipe/${slug}`);
    await expect(page.getByTestId("recipe-source")).toContainText(
      "King Arthur Baking",
    );
  });

  test("a PUT renames and retitles, visible on both surfaces at once", async ({
    request,
    page,
  }) => {
    await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan" },
    });

    const response = await request.put("/api/recipe/api-naan", {
      headers: auth(),
      data: { name: "Renamed Naan" },
    });
    expect(response.status()).toBe(200);
    /* No `slug` in the patch, so the URL deliberately does not move. */
    expect((await response.json()).slug).toBe("api-naan");

    await page.goto("/recipe/api-naan");
    await expect(
      page.getByRole("heading", { name: "Renamed Naan" }),
    ).toBeVisible();

    await page.goto("/recipes");
    await expect(
      page.getByTestId("recipe-list").getByText("Renamed Naan"),
    ).toBeVisible();
  });

  test("creates a group, adds to it, and refuses an unknown recipe without force", async ({
    request,
    page,
  }) => {
    await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan" },
    });

    const created = await request.post("/api/groups", {
      headers: auth(),
      data: {
        name: "API week",
        kind: "meal-plan",
        slug: "api-week",
        items: ["api-naan:Mon · Dinner"],
      },
    });
    expect(created.status()).toBe(201);

    await page.goto("/group/api-week");
    await expect(page.getByTestId("group-kind")).toHaveText("Meal plan");
    const items = page.getByTestId("group-item");
    await expect(items).toHaveCount(1);
    await expect(items.nth(0)).toContainText("Mon · Dinner");
    await expect(items.nth(0)).toContainText("API Naan");

    await page.goto("/groups");
    await expect(
      page.getByTestId("group-list").getByText("API week"),
    ).toBeVisible();

    /* An item naming nothing is 422 by default — a legitimate state, refused. */
    const refused = await request.post("/api/group/api-week/items", {
      headers: auth(),
      data: { recipe: "ghost", label: "Tue · Dinner" },
    });
    expect(refused.status()).toBe(422);
    const refusedBody = await refused.json();
    expect(refusedBody.error.code).toBe("unknown_recipe");
    expect(refusedBody.error.recipes).toEqual(["ghost"]);

    const forced = await request.post("/api/group/api-week/items?force=1", {
      headers: auth(),
      data: { recipe: "ghost", label: "Tue · Dinner" },
    });
    expect(forced.status()).toBe(200);
    expect((await forced.json()).warnings).toEqual(["Unknown recipe: ghost"]);

    await page.goto("/group/api-week");
    await expect(page.getByTestId("group-item-missing")).toHaveText(
      "Recipe not found: ghost",
    );

    /* And the inverse takes it back out. */
    const removed = await request.delete("/api/group/api-week/items/ghost", {
      headers: auth(),
    });
    expect(removed.status()).toBe(200);
    await page.goto("/group/api-week");
    await expect(page.getByTestId("group-item-missing")).toHaveCount(0);
  });

  test("a delete 404s the recipe page and leaves the group's row dangling", async ({
    request,
    page,
  }) => {
    await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan" },
    });
    await request.post("/api/groups", {
      headers: auth(),
      data: {
        name: "API week",
        kind: "meal-plan",
        slug: "api-week",
        items: ["api-naan"],
      },
    });

    const response = await request.delete("/api/recipe/api-naan", {
      headers: auth(),
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      slug: "api-naan",
      deleted: true,
    });

    expect((await request.get("/recipe/api-naan")).status()).toBe(404);

    /*
     * Groups declare no references (D3), so the item survives as a dangling
     * slug — the same state `groups.spec.ts` covers from a fixture, reached
     * here by an actual delete.
     */
    await page.goto("/group/api-week");
    await expect(page.getByTestId("group-item-missing")).toHaveText(
      "Recipe not found: api-naan",
    );

    /* And the second delete is a 404, not a silent success. */
    const gone = await request.delete("/api/recipe/api-naan", {
      headers: auth(),
    });
    expect(gone.status()).toBe(404);
    expect((await gone.json()).error.code).toBe("not_found");
  });

  test("reads are public and search the server's own corpus", async ({
    request,
  }) => {
    await request.post("/api/recipes", {
      headers: auth(),
      data: { name: "API Naan", tags: ["bread"] },
    });

    const list = await request.get("/api/recipes");
    expect(list.status()).toBe(200);
    expect((await list.json()).recipes[0].slug).toBe("api-naan");

    const search = await request.get("/api/recipes?q=naan");
    expect(search.status()).toBe(200);
    const found = await search.json();
    expect(found.total).toBe(1);
    expect(found.recipes[0].slug).toBe("api-naan");

    const tagged = await request.get("/api/recipes?tag=bread");
    expect((await tagged.json()).total).toBe(1);

    const groups = await request.get("/api/groups");
    expect(groups.status()).toBe(200);
    expect((await groups.json()).total).toBe(0);
  });

  test("revalidate and reindex are gated, and answer 200 with a token", async ({
    request,
  }) => {
    expect((await request.post("/api/revalidate")).status()).toBe(401);

    const revalidated = await request.post("/api/revalidate", {
      headers: auth(),
    });
    expect(revalidated.status()).toBe(200);
    expect(await revalidated.json()).toEqual({ revalidated: true });

    expect((await request.post("/api/reindex")).status()).toBe(401);

    const reindexed = await request.post("/api/reindex", { headers: auth() });
    expect(reindexed.status()).toBe(200);
    expect((await reindexed.json()).rebuilt).toEqual([
      "recipes",
      "featured-recipes",
      "pages",
      "groups",
    ]);

    /* The body is optional, not unchecked: a malformed one is still a 400. */
    const malformed = await request.post("/api/reindex", {
      headers: { ...auth(), "content-type": "application/json" },
      data: "{not json",
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error.code).toBe("validation");

    const one = await request.post("/api/reindex", {
      headers: auth(),
      data: { contentType: "groups" },
    });
    expect(one.status()).toBe(200);
    expect((await one.json()).rebuilt).toEqual(["groups"]);
  });

  test("a malformed body is 400 with the CLI's error shape", async ({
    request,
  }) => {
    const empty = await request.post("/api/recipes", { headers: auth() });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error.code).toBe("validation");

    const wrong = await request.post("/api/recipes", {
      headers: auth(),
      data: { nmae: "typo" },
    });
    expect(wrong.status()).toBe(400);
    const body = await wrong.json();
    expect(body.error.code).toBe("validation");
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  /**
   * The CLI's HTTP backend, against a real editor.
   *
   * `cliJson.test.ts` can only prove the *unreachable* case — a unit test has no
   * server — so this is the only place `--remote` is exercised end to end, and
   * it is worth the spawn: the backend hand-writes every URL, method and query
   * parameter in the route table, and a wrong one fails as a 404 rather than as
   * a type error.
   *
   * The spawned process never opens LMDB (`createHttpBackend` does not, and
   * `close()` is a no-op), so it cannot contend with the server for the content
   * environments the way a local CLI write would (T14).
   */
  test.describe("the CLI over --remote", () => {
    const cli = (args: string[], baseURL: string) =>
      execFileAsync(
        "pnpm",
        ["exec", "tsx", "cli/index.ts", "--remote", baseURL, ...args],
        {
          cwd: resolve(__dirname, "..", ".."),
          env: {
            ...process.env,
            RECIPE_API_TOKEN: token,
            /* Prove the write really went remote: no local directory at all. */
            CONTENT_DIRECTORY: "/nonexistent",
          },
        },
      );

    test("creates, reads and lists through the API", async ({
      baseURL,
      page,
    }) => {
      const group = await cli(
        [
          "group",
          "create",
          "--name",
          "Remote week",
          "--kind",
          "meal-plan",
          "--force",
          "--item",
          "ghost:Mon · Dinner",
          "--json",
        ],
        baseURL!,
      );
      const result = JSON.parse(group.stdout);
      expect(result.url).toBe(`/group/${result.slug}`);
      expect(result.warnings).toEqual(["Unknown recipe: ghost"]);
      /* Nothing about a stale editor: the server revalidated itself. */
      expect(group.stderr).not.toContain("Maintenance");

      const listed = await cli(["group", "list", "--json"], baseURL!);
      expect(JSON.parse(listed.stdout).groups[0].slug).toBe(result.slug);

      const shown = await cli(
        ["group", "show", result.slug, "--json"],
        baseURL!,
      );
      expect(JSON.parse(shown.stdout).items[0].missing).toBe(true);

      /* And the page the server rendered agrees, with no reload in between. */
      await page.goto(`/group/${result.slug}`);
      await expect(
        page.getByRole("heading", { name: "Remote week" }),
      ).toBeVisible();
    });

    test("rehydrates a remote failure into the CLI's own exit code", async ({
      baseURL,
    }) => {
      await cli(
        ["group", "create", "--name", "Dupe", "--slug", "dupe", "--json"],
        baseURL!,
      );

      const conflict = await cli(
        ["group", "create", "--name", "Dupe", "--slug", "dupe", "--json"],
        baseURL!,
      ).catch((error) => error);
      /* 409 over the wire becomes exit 2, exactly as a local conflict does. */
      expect(conflict.code).toBe(2);
      expect(JSON.parse(conflict.stdout).error.code).toBe("slug_conflict");

      const missing = await cli(["show", "nope", "--json"], baseURL!).catch(
        (error) => error,
      );
      expect(missing.code).toBe(1);
      expect(JSON.parse(missing.stdout).error.code).toBe("not_found");
    });
  });
});
