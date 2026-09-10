import { test } from "../support/test";

test.describe("Index Page", () => {
  test.describe("with linked recipes fixture", () => {
    test.beforeEach(async ({ resetData }) => {
      await resetData("linked-recipes");
    });
  });
});
