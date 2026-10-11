// @vitest-environment node
//
// The engine's slug guard and the recipe uploads route (32-close).
//
// Slugs reach the engine from decoded route params, and Next decodes `%2F`:
// `/api/recipe/..%2F..%2Fx/image` hands the seat `../../x`. Creates slugify
// first, but reads, updates, image writes and deletes took the slug as given
// and `resolve()`d it against the type's data directory, so the guard sits
// where every one of them builds the path. The recipe uploads route was the
// exploitable one: an unauthenticated GET that read any file the editor could
// open, through an encoded `filename` (or `slug`).

import { mkdtemp, outputFile, outputJSON, pathExists, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidSlugError,
  deleteContentFromFilesystem,
  getContentFilePath,
  getContentItemDirectory,
  getUploadsDirectory,
  isContentSlug,
} from "@discontent/cms/content/filesystem";
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import { GET as getRecipeUpload } from "../websites/recipe-website/editor/src/app/(recipes)/uploads/recipe/[slug]/uploads/[filename]/route";
import type { ContentTypeConfig } from "@discontent/cms/content/types";

const config = recipeContentConfig as unknown as ContentTypeConfig;

/** Every way a slug could leave its directory, decoded and not. */
const TRAVERSALS = [
  "..",
  ".",
  "",
  "../x",
  "../../groups/data/week",
  "a/b",
  "a\\b",
  "/etc/passwd",
  decodeURIComponent("..%2F..%2Fx"),
  decodeURIComponent("%2E%2E%2Fx"),
  "%2E%2E%2Fx",
  "stew\u0000",
];

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "content-slug-"));
});

afterEach(async () => {
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("the engine's slug guard", () => {
  it("resolves an ordinary slug inside the type's directory", () => {
    expect(getContentItemDirectory(config, "stew", contentDirectory)).toBe(
      join(contentDirectory, "recipes/data/stew"),
    );
    expect(getUploadsDirectory(config, "stew", contentDirectory)).toBe(
      join(contentDirectory, "uploads/recipe/stew/uploads"),
    );
    // The `_` placeholder `generateStaticParams` keeps for mocks (24-T14) is
    // a slug that names nothing, not an invalid one.
    expect(isContentSlug("_")).toBe(true);
    expect(isContentSlug("half-half")).toBe(true);
  });

  it.each(TRAVERSALS)("refuses %j for data, files and uploads", (slug) => {
    expect(isContentSlug(slug)).toBe(false);
    expect(() =>
      getContentItemDirectory(config, slug, contentDirectory),
    ).toThrow(InvalidSlugError);
    expect(() => getContentFilePath(config, slug, contentDirectory)).toThrow(
      InvalidSlugError,
    );
    expect(() => getUploadsDirectory(config, slug, contentDirectory)).toThrow(
      InvalidSlugError,
    );
  });

  it("reads a refused slug as absent: null, and not_found on the wire", async () => {
    // A recipe.json one level up, where `../x` would have found it.
    await outputJSON(join(contentDirectory, "recipes/x/recipe.json"), {
      name: "Outside",
    });
    expect(
      await readContentFileOrNull({ config, slug: "../x", contentDirectory }),
    ).toBeNull();

    const error = new InvalidSlugError("../x");
    expect(error.code).toBe("ENOENT");
    expect(toErrorObject(error).error.code).toBe("not_found");
  });

  it("deletes nothing outside the type's directory", async () => {
    const outside = join(contentDirectory, "groups/data/week/group.json");
    await outputJSON(outside, { name: "Week" });
    await expect(
      deleteContentFromFilesystem(
        config,
        "../../groups/data/week",
        contentDirectory,
      ),
    ).rejects.toThrow(InvalidSlugError);
    expect(await pathExists(outside)).toBe(true);
  });
});

describe("GET /uploads/recipe/<slug>/uploads/<filename>", () => {
  const previous = process.env.CONTENT_DIRECTORY;

  beforeEach(async () => {
    process.env.CONTENT_DIRECTORY = contentDirectory;
    await outputFile(
      join(contentDirectory, "uploads/recipe/stew/uploads/stew.jpg"),
      "jpeg bytes",
    );
    await outputFile(join(contentDirectory, "secret.txt"), "secret");
    await outputJSON(join(contentDirectory, "recipes/data/stew/recipe.json"), {
      name: "Stew",
    });
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CONTENT_DIRECTORY;
    else process.env.CONTENT_DIRECTORY = previous;
  });

  function get(slug: string, filename: string) {
    return getRecipeUpload(new Request("http://localhost/x") as never, {
      params: Promise.resolve({ slug, filename }),
    });
  }

  it("serves an upload", async () => {
    const response = await get("stew", "stew.jpg");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("jpeg bytes");
  });

  it.each([
    // What the route saw for `..%2F..%2F..%2F..%2Fsecret.txt` before.
    ["stew", "../../../../secret.txt"],
    ["stew", "../../../../recipes/data/stew/recipe.json"],
    ["../../../recipes/data/stew", "../recipe.json"],
    ["stew", "/etc/hostname"],
    ["/etc", "hostname"],
  ])("404s a traversal: slug %j, filename %j", async (slug, filename) => {
    await expect(get(slug, filename)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
