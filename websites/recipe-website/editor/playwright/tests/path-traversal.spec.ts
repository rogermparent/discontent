import { test, expect } from "../support/test";

/*
 * Regression cover for the path-traversal class.
 *
 * These are not hypothetical. Before `resolveWithin` landed, requesting
 * `/uploads/..%2Fsecret.txt` against this app returned the out-of-tree file's
 * contents with a 200 — an unauthenticated arbitrary read of anything the server
 * process could open outside the uploads tree.
 *
 * The encoded slash is the whole mechanism, and it is worth stating why: Next
 * decodes `%2F` before it reaches `params`, so a single dynamic segment can
 * carry `../` even though the router would never match a literal slash there.
 * That behaviour is version-dependent, which is exactly why the guard does not
 * rely on the router and why this spec pins the outcome.
 */
test.describe("path traversal", () => {
  test("refuses to serve an upload from outside the uploads tree", async ({
    request,
    resetData,
  }) => {
    await resetData();
    const response = await request.get("/uploads/..%2Fsecret.txt");
    expect(response.status()).toBe(404);
  });

  test("refuses to serve an image from outside the images tree", async ({
    request,
    resetData,
  }) => {
    await resetData();
    const response = await request.get("/image/..%2F..%2Fsecret.txt");
    expect(response.status()).toBe(404);
  });

  test("still serves a legitimate nested upload", async ({
    request,
    resetData,
  }) => {
    // The positive control. Guarding must not be indistinguishable from
    // breaking the route: this path arrives through the *same* decoded-`%2F`
    // mechanism as the attack above, but resolves inside the tree, so it must
    // still be served.
    await resetData("two-pages");
    const response = await request.get(
      "/uploads/recipe%2Frecipe-6%2Fuploads%2Frecipe-6-test-image.png",
    );
    expect(response.status()).toBe(200);
  });

  /*
   * 32-close. The four-segment recipe uploads route had no guard: both its
   * `slug` and its `filename` reached `join()` decoded, so either could walk
   * to any file the server could open. Each target below exists in the
   * fixture, so a 404 is the guard and not a missing file.
   */
  test("serves a recipe upload, and refuses to walk out of it", async ({
    request,
    resetData,
  }) => {
    await resetData("two-pages");
    const served = await request.get(
      "/uploads/recipe/recipe-6/uploads/recipe-6-test-image.png",
    );
    expect(served.status()).toBe(200);

    for (const path of [
      // through the filename
      "/uploads/recipe/recipe-6/uploads/..%2F..%2F..%2F..%2Frecipes%2Fdata%2Frecipe-6%2Frecipe.json",
      // through the slug
      "/uploads/recipe/..%2F..%2Frecipes%2Fdata%2Frecipe-6/uploads/..%2Frecipe.json",
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });
});
