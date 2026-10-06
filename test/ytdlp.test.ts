// @vitest-environment node
//
// yt-dlp, moved server-side at 26a so the curation layer imports video pages
// the way the `/new-recipe` form does. Pinned here: the one mapper both share
// (`ytdlpToRecipe`), the thumbnail pick, and which binary runs — against the
// Playwright suite's `ytdlp-mimic.mjs`, so no real yt-dlp and no network.

import { mkdtemp, outputJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bestThumbnail,
  fetchYtdlpMetadata,
  pickYtdlpMetadata,
  resolveYtdlpBinary,
  ytdlpToRecipe,
} from "../websites/recipe-website/editor/controller/ytdlp";

const MIMIC = join(
  dirname(fileURLToPath(import.meta.url)),
  "../websites/recipe-website/editor/playwright/fixtures/yt-dlp/ytdlp-mimic.mjs",
);
const VIDEO = "https://www.youtube.com/watch?v=SUCCESS_TEST";

describe("ytdlpToRecipe", () => {
  const dump = {
    title: "Perfect Negroni",
    description: "Equal parts gin, Campari and sweet vermouth.",
    thumbnail: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    thumbnails: [
      { url: "https://i.ytimg.com/vi/x/default.jpg", width: 120, height: 90 },
      {
        url: "https://i.ytimg.com/vi_webp/x/maxresdefault.webp",
        width: 1280,
        height: 720,
      },
      {
        url: "https://i.ytimg.com/vi/x/maxresdefault.jpg",
        width: 1280,
        height: 720,
      },
      { url: "https://i.ytimg.com/vi/x/no-dims.jpg" },
    ],
    webpage_url: VIDEO,
    duration: 312,
    channel: "Bar Channel",
    upload_date: "20240105",
    chapters: [
      { title: "Intro", start_time: 0, end_time: 30 },
      { title: "Stir", start_time: 30 },
      { start_time: 99 },
    ],
    tags: ["negroni", 7, "cocktail"],
    extractor: "youtube",
    extractor_key: "Youtube",
    formats: [{ huge: true }],
  };

  it("keeps the fields this app uses and drops the rest", () => {
    const meta = pickYtdlpMetadata(dump, VIDEO);
    expect(meta).toMatchObject({
      title: "Perfect Negroni",
      upload_date: "20240105",
      tags: ["negroni", "cocktail"],
      chapters: [
        { title: "Intro", start_time: 0, end_time: 30 },
        { title: "Stir", start_time: 30, end_time: undefined },
      ],
    });
    expect(meta.thumbnails).toHaveLength(4);
    expect("formats" in meta).toBe(false);
  });

  it("picks the largest thumbnail, JPEG over WebP on a tie", () => {
    expect(bestThumbnail(pickYtdlpMetadata(dump, VIDEO))).toBe(
      "https://i.ytimg.com/vi/x/maxresdefault.jpg",
    );
    expect(
      bestThumbnail(
        pickYtdlpMetadata({ thumbnail: "https://t/only.jpg" }, VIDEO),
      ),
    ).toBe("https://t/only.jpg");
  });

  it("maps to the import both the form and the curation layer use", () => {
    expect(ytdlpToRecipe(pickYtdlpMetadata(dump, VIDEO), VIDEO)).toEqual({
      name: "Perfect Negroni",
      description:
        "Channel: Bar Channel\n\n---\n\nEqual parts gin, Campari and sweet vermouth.",
      source: { url: VIDEO, name: "YouTube", author: "Bar Channel" },
      videoImportUrl: VIDEO,
      imageImportUrl: "https://i.ytimg.com/vi/x/maxresdefault.jpg",
    });
  });

  it("names a non-YouTube site from the extractor", () => {
    const vimeo = "https://vimeo.com/12345";
    const recipe = ytdlpToRecipe(
      pickYtdlpMetadata(
        { title: "Old Fashioned", uploader: "Someone", extractor: "vimeo" },
        vimeo,
      ),
      vimeo,
    );
    expect(recipe.source).toEqual({
      url: vimeo,
      name: "Vimeo",
      author: "Someone",
    });
    expect(recipe.videoImportUrl).toBe(vimeo);
  });
});

describe("resolveYtdlpBinary", () => {
  let settingsDirectory: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    settingsDirectory = await mkdtemp(join(tmpdir(), "ytdlp-settings-"));
    for (const key of ["YTDLP_PATH", "SETTINGS_DIRECTORY"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.SETTINGS_DIRECTORY = settingsDirectory;
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(settingsDirectory, { recursive: true, force: true });
  });

  it("falls back from YTDLP_PATH to settings.ytdlpPath to yt-dlp", async () => {
    expect(await resolveYtdlpBinary()).toBe("yt-dlp");
    await outputJson(join(settingsDirectory, "settings.json"), {
      ytdlpPath: "/opt/settings/yt-dlp",
    });
    expect(await resolveYtdlpBinary()).toBe("/opt/settings/yt-dlp");
    process.env.YTDLP_PATH = "/opt/env/yt-dlp";
    expect(await resolveYtdlpBinary()).toBe("/opt/env/yt-dlp");
  });

  it("runs the binary from settings — the mimic answers the fixture URL", async () => {
    await outputJson(join(settingsDirectory, "settings.json"), {
      ytdlpPath: MIMIC,
    });
    const result = await fetchYtdlpMetadata(VIDEO);
    expect(result).toMatchObject({
      status: "success",
      metadata: {
        title: "Test Recipe Video",
        channel: "Test Kitchen Channel",
        thumbnails: [],
        chapters: [],
      },
    });
  });

  it("reports a missing binary and a failing run distinctly", async () => {
    process.env.YTDLP_PATH = "/nonexistent/yt-dlp";
    expect(await fetchYtdlpMetadata(VIDEO)).toEqual({ status: "not-found" });

    process.env.YTDLP_PATH = MIMIC;
    const failed = await fetchYtdlpMetadata(
      "https://www.youtube.com/watch?v=ERROR_TEST",
    );
    expect(failed.status).toBe("error");
    if (failed.status === "error") {
      expect(failed.message).toContain("Video unavailable");
    }
  });
});
