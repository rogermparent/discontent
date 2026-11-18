// @vitest-environment node
//
// 47h, row 16: `create --dry-run` / `update --dry-run` (MCP `recipe_create`
// / `recipe_update` with `dryRun`) probed the picture with a bare `HEAD`,
// outside the site's queue. 30-D5 counts image requests, so the probe now
// waits its turn on the pacer as a real write's download does — and still
// answers what the real write would store. A site dropped for now is the
// probe's error, not the dry run's failure.
//
// The pacer is spied on (its queue and clock are `sitePacing`'s own
// tests'); `fetch` is stubbed.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paced = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; image?: boolean }>,
  drop: false,
}));

vi.mock(
  "../websites/recipe-website/editor/controller/curation/sitePacing",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../websites/recipe-website/editor/controller/curation/sitePacing")
      >();
    return {
      ...actual,
      pacedRequest: vi.fn(
        async (
          url: string,
          run: (retry: never) => Promise<unknown>,
          _finalUrlOf: unknown,
          _job: unknown,
          options?: { image?: boolean },
        ) => {
          paced.calls.push({ url, ...(options ?? {}) });
          if (paced.drop) {
            throw new actual.SiteDroppedError(
              "example.com is dropped for now: refused twice (HTTP 403)",
            );
          }
          return run(undefined as never);
        },
      ),
    };
  },
);

import { previewCreateRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "dry-run-pacing-"));
  paced.calls.length = 0;
  paced.drop = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(null, {
          status: 200,
          headers: { "content-type": "image/jpeg", "content-length": "1234" },
        }),
    ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("a dry run's picture (47h)", () => {
  it("is probed on the site's queue, as an image, and answers the name", async () => {
    const preview = await previewCreateRecipe(
      { contentDirectory },
      {
        name: "Toast",
        imageImportUrl: "https://example.com/toast.jpg",
        videoImportUrl: null,
      },
    );
    expect(paced.calls).toEqual([
      { url: "https://example.com/toast.jpg", image: true },
    ]);
    expect(preview.image).toMatchObject({ filename: "toast.jpg", bytes: 1234 });
  });

  it("says a dropped site in the probe, and the dry run still answers", async () => {
    paced.drop = true;
    const preview = await previewCreateRecipe(
      { contentDirectory },
      { name: "Toast", imageImportUrl: "https://example.com/toast.jpg" },
    );
    expect(preview.image?.error).toMatch(/dropped for now/);
    expect(preview.recipe.name).toBe("Toast");
    expect(fetch).not.toHaveBeenCalled();
  });
});
