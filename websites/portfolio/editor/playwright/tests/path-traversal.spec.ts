import { test, expect } from "../support/test";

/*
 * Regression cover for the path-traversal class. See recipe's copy of this spec
 * for the mechanism — both sites shipped the same unguarded `resolve()` on a
 * decoded route param, and it was demonstrably exploitable: before
 * `resolveWithin` landed, `/uploads/..%2Fsecret.txt` returned an out-of-tree
 * file's contents with a 200.
 */
test.describe("path traversal", () => {
  test.beforeEach(async ({ resetData }) => {
    await resetData();
  });

  test("refuses to serve an upload from outside the uploads tree", async ({
    request,
  }) => {
    const response = await request.get("/uploads/..%2Fsecret.txt");
    expect(response.status()).toBe(404);
  });

  test("refuses to serve an image from outside the images tree", async ({
    request,
  }) => {
    const response = await request.get("/image/..%2F..%2Fsecret.txt");
    expect(response.status()).toBe(404);
  });
});
