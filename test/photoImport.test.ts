// @vitest-environment node
//
// 38e: a recipe from photos of it. The vision model only transcribes
// (`vision.transcribe`, `chatText` with `images`, then unloaded); the
// transcription is read as pasted text is. Never a real model: `fetch` is
// stubbed with the Playwright stand-in (`standInModel.ts`), which answers a
// transcription from a transcript filed by the photo's hash.

import { mkdtemp, readFile, readdir, rm, utimes } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import {
  chatJson,
  chatText,
  type LlmConfig,
} from "../websites/recipe-website/editor/controller/llm/client";
import {
  PHOTO_MAX_PIXELS,
  PHOTO_MAX_SIDE,
  preparePhoto,
  transcribePhotos,
  visionConfig,
} from "../websites/recipe-website/editor/controller/llm/vision";
import { fittedSize } from "../websites/recipe-website/editor/controller/llm/photoPrep";
import {
  PHOTOS_DIR,
  loadTranscript,
  prunePhotos,
  readStoredPhotos,
  storePhotos,
} from "../websites/recipe-website/editor/controller/jobs/photos";
import { runSpec } from "../websites/recipe-website/editor/controller/jobs/kinds";
import { runJob } from "../websites/recipe-website/editor/controller/jobs/run";
import {
  pruneJobs,
  readJobLog,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  photoKey,
  sentPhotoKey,
  standInChat,
} from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

const MODEL_URL = "http://model.test:11434";

const CARD_TEXT = [
  "Grandma's Oat Cookies",
  "1 cup butter",
  "1 cup brown sugar",
  "2 eggs",
  "3 cups rolled oats",
  "",
  "Cream the butter and sugar. Beat in the eggs. Stir in the oats and bake at 350 for 12 minutes.",
].join("\n");

/** A small upright JPEG: sent to the model as it is. */
async function cardJpeg(seed = 0): Promise<Buffer> {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      /* A colour per seed: two seeds are two different files. */
      background: { r: 250 - seed * 30, g: 245, b: 230 - seed * 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

function file(bytes: Buffer, name: string, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

interface Call {
  path: string;
  body?: Record<string, unknown>;
}

/** The stand-in model behind `fetch`: chat, `/api/ps` and the unload. */
function stubModel(transcripts: Record<string, string>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin !== MODEL_URL) {
        throw new Error(`unexpected fetch: ${String(input)}`);
      }
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path: url.pathname, ...(body ? { body } : {}) });
      if (url.pathname === "/api/chat") {
        return Response.json(standInChat(body, { transcripts }));
      }
      if (url.pathname === "/api/ps") {
        return Response.json({
          models: [
            { name: body?.model ?? "qwen2.5vl:7b", size: 100, size_vram: 100 },
          ],
        });
      }
      return Response.json({});
    }),
  );
  return calls;
}

let jobsDir: string;
let contentDirectory: string;

beforeEach(async () => {
  jobsDir = await mkdtemp(join(tmpdir(), "photo-jobs-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "photo-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", jobsDir);
  vi.stubEnv("RECIPE_QUEUE_DIR", join(jobsDir, "queue"));
  vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
  vi.stubEnv("RECIPE_LLM_VISION_MODEL", "qwen2.5vl:7b");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(jobsDir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("the vision model's configuration (De1)", () => {
  it("is on only with both the server and a vision model", () => {
    expect(visionConfig()).toEqual({
      url: MODEL_URL,
      model: "qwen2.5vl:7b",
      api: "ollama",
    });
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "");
    expect(visionConfig()).toBeUndefined();
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "qwen2.5vl:7b");
    vi.stubEnv("RECIPE_LLM_URL", "");
    expect(visionConfig()).toBeUndefined();
  });
});

describe("chatText with images (De2)", () => {
  const config: LlmConfig = {
    url: MODEL_URL,
    model: "qwen2.5vl:7b",
    api: "ollama",
  };

  it("sends Ollama `images` as base64, no `format`, and unloads after", async () => {
    const bytes = await cardJpeg();
    const calls = stubModel({ [photoKey(bytes)]: CARD_TEXT });
    const answer = await chatText({
      system: "You transcribe photographs of recipes.",
      user: "Transcribe this photo of a recipe.",
      images: [{ bytes, type: "image/jpeg" }],
      config,
      unload: true,
    });
    expect(answer.text).toBe(CARD_TEXT);
    expect(calls.map((call) => call.path)).toEqual([
      "/api/chat",
      "/api/generate",
    ]);
    const chat = calls[0].body!;
    expect(chat.format).toBeUndefined();
    expect((chat.messages as { images?: string[] }[])[1].images).toEqual([
      bytes.toString("base64"),
    ]);
    expect(calls[1].body).toEqual({ model: "qwen2.5vl:7b", keep_alive: 0 });
  });

  it("sends OpenAI-style image_url parts as data: URLs", async () => {
    const bytes = await cardJpeg();
    let sent: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return Response.json({
          choices: [{ message: { content: "<think>…</think>\n  text  " } }],
        });
      }),
    );
    const answer = await chatText({
      system: "s",
      user: "u",
      images: [{ bytes, type: "image/png" }],
      config: { ...config, api: "openai" },
      unload: true,
    });
    expect(answer.text).toBe("text");
    expect(sent?.response_format).toBeUndefined();
    expect((sent?.messages as { content: unknown }[])[1].content).toEqual([
      { type: "text", text: "u" },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${bytes.toString("base64")}` },
      },
    ]);
  });
});

describe("preparePhoto", () => {
  it("re-encodes even a small upright JPEG (38-Te5): never the original", async () => {
    const bytes = await cardJpeg();
    const prepared = await preparePhoto({
      bytes,
      type: "image/jpeg",
      name: "card.jpg",
    });
    expect(prepared.bytes).not.toBe(bytes);
    expect(prepared.type).toBe("image/jpeg");
    const meta = await sharp(prepared.bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 120, 80]);
    /* What the stand-in keys a photo by: the bytes sent. */
    expect(await sentPhotoKey(bytes)).toBe(photoKey(prepared.bytes));
  });

  it("fits inside 1024 px and 0.75 MP", () => {
    expect(PHOTO_MAX_SIDE).toBe(1024);
    expect(fittedSize(1833, 1217, PHOTO_MAX_SIDE, PHOTO_MAX_PIXELS)).toEqual({
      width: 1024,
      height: 679,
    });
    const square = fittedSize(2000, 2000, PHOTO_MAX_SIDE, PHOTO_MAX_PIXELS);
    expect(square.width).toBe(square.height);
    expect(square.width * square.height).toBeLessThanOrEqual(PHOTO_MAX_PIXELS);
    expect(square.width).toBeLessThan(1024);
    expect(fittedSize(300, 200, PHOTO_MAX_SIDE, PHOTO_MAX_PIXELS)).toEqual({
      width: 300,
      height: 200,
    });
  });

  it("fits a large or rotated photo, and turns WebP into a JPEG", async () => {
    const large = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const fitted = await preparePhoto({
      bytes: large,
      type: "image/png",
      name: "big.png",
    });
    const meta = await sharp(fitted.bytes).metadata();
    expect(fitted.type).toBe("image/jpeg");
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(PHOTO_MAX_SIDE);

    const rotated = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#fff" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const upright = await sharp(
      (
        await preparePhoto({
          bytes: rotated,
          type: "image/jpeg",
          name: "r.jpg",
        })
      ).bytes,
    ).metadata();
    expect([upright.width, upright.height]).toEqual([100, 200]);

    const webp = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "#fff" },
    })
      .webp()
      .toBuffer();
    expect(
      (await preparePhoto({ bytes: webp, type: "image/webp", name: "w.webp" }))
        .type,
    ).toBe("image/jpeg");
  });

  it("refuses SVG, ICO and BMP as no photo", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    for (const [type, name] of [
      ["image/svg+xml", "card.svg"],
      ["image/x-icon", "favicon.ico"],
      ["image/bmp", "scan.bmp"],
    ]) {
      await expect(preparePhoto({ bytes: svg, type, name })).rejects.toThrow(
        `${name} is not a photo this import reads`,
      );
      await expect(
        storePhotos(jobsDir, [file(svg, name, type)]),
      ).rejects.toThrow(`${name} is not a photo this import reads`);
    }
    /* An SVG under a photo's name is still found out. */
    await expect(
      preparePhoto({ bytes: svg, type: "image/jpeg", name: "card.jpg" }),
    ).rejects.toThrow("card.jpg is not a photo this import reads");
  });

  it("refuses HEIC with advice, and bytes that are no image", async () => {
    await expect(
      preparePhoto({
        bytes: Buffer.from("x"),
        type: "image/heic",
        name: "IMG_0001.HEIC",
      }),
    ).rejects.toThrow(/HEIC photos cannot be read here — save .* as a JPEG/);
    await expect(
      preparePhoto({
        bytes: Buffer.from("not an image"),
        type: "image/jpeg",
        name: "fake.jpg",
      }),
    ).rejects.toThrow(/fake\.jpg could not be read as an image/);
  });
});

describe("the photo store (D5)", () => {
  it("stores photos by content, in order, and refuses what it cannot take", async () => {
    const one = await cardJpeg(1);
    const two = await cardJpeg(2);
    const stored = await storePhotos(jobsDir, [
      file(one, "front.jpg"),
      file(two, "back.jpeg"),
    ]);
    expect(stored).toEqual([
      expect.objectContaining({
        path: expect.stringMatching(/^photos\/[0-9a-f]{32}\.jpg$/),
        name: "front.jpg",
        type: "image/jpeg",
        bytes: one.length,
      }),
      expect.objectContaining({ name: "back.jpeg", bytes: two.length }),
    ]);
    const again = await storePhotos(jobsDir, [file(one, "renamed.jpg")]);
    expect(again[0].path).toBe(stored[0].path);
    expect(await readdir(join(jobsDir, PHOTOS_DIR))).toHaveLength(2);
    const [read] = await readStoredPhotos(jobsDir, [stored[0]]);
    expect(read.bytes.equals(one)).toBe(true);

    const five = await Promise.all(
      [1, 2, 3, 4, 5].map(async (n) => file(await cardJpeg(n), `${n}.jpg`)),
    );
    await expect(storePhotos(jobsDir, five)).rejects.toThrow(
      "5 photos given; a photo import takes at most 4",
    );
    await expect(storePhotos(jobsDir, [])).rejects.toThrow("No photos given");
    await expect(
      storePhotos(jobsDir, [
        file(Buffer.from("hi"), "notes.txt", "text/plain"),
      ]),
    ).rejects.toThrow("notes.txt is not an image");
    await expect(
      storePhotos(jobsDir, [file(one, "IMG_1.heic", "image/heic")]),
    ).rejects.toThrow(/HEIC photos cannot be read here/);
    /* A spec read back names nothing outside the store. */
    await expect(
      readStoredPhotos(jobsDir, [
        { path: "../secret.jpg", name: "x", type: "image/jpeg", bytes: 1 },
      ]),
    ).rejects.toThrow('"../secret.jpg" is not a stored photo\'s path.');
  });

  it("prunes what no remaining job names, once past the grace", async () => {
    const [kept] = await storePhotos(jobsDir, [
      file(await cardJpeg(1), "a.jpg"),
    ]);
    const [old] = await storePhotos(jobsDir, [
      file(await cardJpeg(2), "b.jpg"),
    ]);
    const [young] = await storePhotos(jobsDir, [
      file(await cardJpeg(3), "c.jpg"),
    ]);
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const photo of [kept, old]) {
      await utimes(join(jobsDir, photo.path), past, past);
    }
    const removed = await prunePhotos(jobsDir, [
      { kind: "import-photo", photos: [kept] },
      { kind: "import-url", url: "https://example.com" },
    ]);
    expect(removed).toBe(1);
    const left = await readdir(join(jobsDir, PHOTOS_DIR));
    expect(left.sort()).toEqual(
      [kept.path, young.path].map((p) => p.split("/")[1]).sort(),
    );
  });
});

describe("transcribePhotos in a job", () => {
  it("is one vision.transcribe step per photo, the model unloaded once, the swap said", async () => {
    const one = await cardJpeg(1);
    const two = await cardJpeg(2);
    const calls = stubModel({
      [await sentPhotoKey(one)]: "Page one\n1 cup flour",
      [await sentPhotoKey(two)]: "Page two\nBake it.",
    });
    const { job, result } = await runJob(
      { kind: "test", label: "transcribe", spec: {} },
      (context) =>
        transcribePhotos({
          photos: [
            { bytes: one, type: "image/jpeg", name: "1.jpg" },
            { bytes: two, type: "image/jpeg", name: "2.jpg" },
          ],
          next: "qwen3:8b",
          job: context,
        }),
      { dir: jobsDir, mirror: null },
    );
    expect(result.text).toBe("Page one\n1 cup flour\n\nPage two\nBake it.");
    /* One call per photo (De4), in page order, each placement read; the
     * unload once, after the last page. */
    expect(calls.map((call) => call.path)).toEqual([
      "/api/chat",
      "/api/ps",
      "/api/chat",
      "/api/ps",
      "/api/generate",
    ]);
    for (const [at, page] of [
      [0, 1],
      [2, 2],
    ]) {
      const user = (
        calls[at].body!.messages as { content: string; images?: string[] }[]
      )[1];
      expect(user.images).toHaveLength(1);
      expect(user.content).toBe(
        `Transcribe this photo — page ${page} of 2 of one recipe card or page.`,
      );
    }
    expect(calls[1].body).toBeUndefined();
    const { lines } = await readJobLog(jobsDir, job);
    const ends = lines.filter(
      (line) => line.step === "vision.transcribe" && line.phase === "end",
    );
    expect(ends.map((line) => line.data)).toEqual([
      expect.objectContaining({
        model: "qwen2.5vl:7b",
        photos: 1,
        part: "1/2",
        chars: 20,
        lines: 2,
        excerpt: "Page one\n1 cup flour",
        gpu: 100,
      }),
      expect.objectContaining({ part: "2/2", excerpt: "Page two\nBake it." }),
    ]);
    const unloads = lines.filter(
      (line) => line.step === "llm.unload" && line.phase === "end",
    );
    expect(unloads).toHaveLength(1);
    expect(unloads[0].data).toMatchObject({ reason: "done" });
    expect(
      lines.find((line) => line.step === "vision" && line.phase === "note")
        ?.msg,
    ).toBe(
      `qwen2.5vl:7b read ${result.text.length} characters from 2 photos and was unloaded — qwen3:8b reads the transcription`,
    );
  });

  it("fails clearly when the model read nothing", async () => {
    stubModel({});
    await expect(
      transcribePhotos({
        photos: [
          { bytes: await cardJpeg(), type: "image/jpeg", name: "x.jpg" },
        ],
      }),
    ).rejects.toThrow(
      "the vision model qwen2.5vl:7b read no text in the photo",
    );
  });
});

describe("recipes import --photo, through the local backend", () => {
  it("dry-runs: transcribes, reads the transcription, grounds against it", async () => {
    const card = await cardJpeg();
    const calls = stubModel({ [await sentPhotoKey(card)]: CARD_TEXT });
    const backend = createLocalBackend({ contentDirectory });
    try {
      const result = await backend.importPhotos([file(card, "card.jpg")], {
        dryRun: true,
      });
      expect(result).toMatchObject({
        dryRun: true,
        photos: 1,
        transcription: CARD_TEXT,
        slug: "grandmas-oat-cookies",
        llm: { mode: "force", found: true, grounded: 4, total: 4 },
        draft: {
          name: "Grandma's Oat Cookies",
          ingredients: [
            "1 cup butter",
            "1 cup brown sugar",
            "2 eggs",
            "3 cups rolled oats",
          ],
        },
      });
      expect("pastedText" in result).toBe(false);
      expect((result as { warnings?: string[] }).warnings?.[0]).toMatch(
        /^read from the photo's transcription by local model qwen3:8b — 4\/4/,
      );
      /* Two acquires: the vision call (unloaded after), then the text call. */
      expect(calls.map((call) => [call.path, call.body?.model])).toEqual([
        ["/api/chat", "qwen2.5vl:7b"],
        ["/api/ps", undefined],
        ["/api/generate", "qwen2.5vl:7b"],
        ["/api/chat", "qwen3:8b"],
        ["/api/ps", undefined],
      ]);
      /* The transcription is kept beside the photo, and reused. */
      const stored = (await readdir(join(jobsDir, PHOTOS_DIR))).sort();
      expect(stored).toEqual([
        expect.stringMatching(/^[0-9a-f]{32}\.jpg$/),
        expect.stringMatching(/^[0-9a-f]{32}\.transcript\.json$/),
      ]);
      /* Again: the transcript is reused, and 38c's kept reading of it too —
       * no model is asked at all. */
      calls.length = 0;
      const again = await backend.importPhotos([file(card, "card.jpg")], {
        dryRun: true,
      });
      expect(calls).toEqual([]);
      expect(again).toMatchObject({ photos: 1, transcription: CARD_TEXT });
      expect((again as { warnings?: string[] }).warnings).toContainEqual(
        expect.stringMatching(/reading from .* was reused, not read again$/),
      );
      /* A pasted text of the same words is another reading (its warnings
       * name the text, not the photo). */
      await backend.importText(CARD_TEXT, { dryRun: true });
      expect(calls.map((call) => call.body?.model ?? call.path)).toEqual([
        "qwen3:8b",
        "/api/ps",
      ]);
    } finally {
      await backend.close();
    }
  });

  it("creates, and photoAsImage makes the photo the recipe's image", async () => {
    /* A sideways 2400×1200 phone photo: kept upright, fitted inside 2000 px. */
    const card = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: "#fbf6e9" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    stubModel({ [await sentPhotoKey(card)]: CARD_TEXT });
    const backend = createLocalBackend({ contentDirectory });
    try {
      const result = await backend.importPhotos([file(card, "card.jpg")], {
        photoAsImage: true,
      });
      expect(result).toMatchObject({
        slug: "grandmas-oat-cookies",
        photos: 1,
        llm: { found: true },
      });
      expect((result as { warnings?: string[] }).warnings).toContain(
        "the photo card.jpg is the image of grandmas-oat-cookies (photoAsImage)",
      );
      const recipe = JSON.parse(
        await readFile((result as { path: string }).path, "utf8"),
      );
      expect(recipe.image).toBe("card.jpg");
      const upload = await readFile(
        join(
          contentDirectory,
          "uploads/recipe/grandmas-oat-cookies/uploads/card.jpg",
        ),
      );
      const kept = await sharp(upload).metadata();
      expect([kept.format, kept.width, kept.height]).toEqual([
        "jpeg",
        1000,
        2000,
      ]);
      expect(kept.orientation ?? 1).toBe(1);
    } finally {
      await backend.close();
    }
  });

  it("refuses with usage when no vision model is configured", async () => {
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "");
    const backend = createLocalBackend({ contentDirectory });
    try {
      await expect(
        backend.importPhotos([file(await cardJpeg(), "card.jpg")], {
          dryRun: true,
        }),
      ).rejects.toMatchObject({
        code: "usage",
        message: expect.stringContaining("RECIPE_LLM_VISION_MODEL"),
      });
      /* Nothing stored for an import that never ran. */
      expect(await readdir(jobsDir)).not.toContain(PHOTOS_DIR);
      await expect(
        backend.importPhotos([file(await cardJpeg(), "card.jpg")], {
          photoAsImage: true,
          image: "https://example.com/x.jpg",
        }),
      ).rejects.toMatchObject({ code: "usage" });
    } finally {
      await backend.close();
    }
  });

  it("keeps the transcript under the set's key with its model", async () => {
    const card = await cardJpeg();
    stubModel({ [await sentPhotoKey(card)]: CARD_TEXT });
    const backend = createLocalBackend({ contentDirectory });
    try {
      await backend.importPhotos([file(card, "card.jpg")], { dryRun: true });
      const [photo] = await storePhotos(jobsDir, [file(card, "card.jpg")]);
      const { transcribeKey } =
        await import("../websites/recipe-website/editor/controller/llm/vision");
      expect(
        await loadTranscript(jobsDir, [photo], {
          model: "qwen2.5vl:7b",
          prompt: transcribeKey(),
        }),
      ).toMatchObject({ text: CARD_TEXT, model: "qwen2.5vl:7b" });
      /* Another vision model reads again. */
      expect(
        await loadTranscript(jobsDir, [photo], {
          model: "llava:7b",
          prompt: transcribeKey(),
        }),
      ).toBeUndefined();
    } finally {
      await backend.close();
    }
  });
});

describe("the form's Photo mode (reducePhotoImport)", () => {
  it("fills the form's state, with the transcription", async () => {
    const card = await cardJpeg();
    stubModel({ [await sentPhotoKey(card)]: CARD_TEXT });
    const { reducePhotoImport } =
      await import("../websites/recipe-website/editor/controller/formImport");
    const photos = await storePhotos(jobsDir, [file(card, "card.jpg")]);
    const state = await reducePhotoImport(null, photos, undefined, {
      dir: jobsDir,
    });
    expect(state.message).toBeUndefined();
    expect(state).toMatchObject({
      fromPhotos: 1,
      transcription: CARD_TEXT,
      key: expect.stringMatching(/^photo-[0-9a-f-]{36}$/),
      llm: { found: true, grounded: 4, total: 4 },
      recipe: { name: "Grandma's Oat Cookies" },
    });
    expect(await reducePhotoImport(null, [])).toEqual({
      message: "No photos provided",
    });
  });

  it("answers a failed reading as the form's message, keeping what was read", async () => {
    const card = await cardJpeg();
    stubModel({
      [await sentPhotoKey(card)]: "Just a shopping list, no recipe",
    });
    const { reducePhotoImport } =
      await import("../websites/recipe-website/editor/controller/formImport");
    const photos = await storePhotos(jobsDir, [file(card, "card.jpg")]);
    const state = await reducePhotoImport(null, photos, undefined, {
      dir: jobsDir,
    });
    expect(state.recipe).toBeUndefined();
    expect(state.message).toMatch(
      /^No recipe read from the photo's transcription/,
    );
    expect(state.transcription).toBe("Just a shopping list, no recipe");
  });
});

/* 38e real GPU: what a crashed runner looks like, and what is done about it. */
describe("a failed model call (38-Te5)", () => {
  const RUNNER =
    "model runner has unexpectedly stopped, this may be due to resource limitations or an internal error, check ollama server logs for details: vk::Queue::submit: ErrorDeviceLost";

  function stubFailing(answer: () => Response): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ path: url.pathname, ...(body ? { body } : {}) });
        return url.pathname === "/api/chat" ? answer() : Response.json({});
      }),
    );
    return calls;
  }

  it("surfaces Ollama's error, and unloads the model before reporting", async () => {
    const calls = stubFailing(() =>
      Response.json({ error: RUNNER }, { status: 500 }),
    );
    const card = await cardJpeg();
    let failure: unknown;
    const { job } = await runJob(
      { kind: "test", label: "transcribe", spec: {} },
      async (context) => {
        try {
          return await transcribePhotos({
            photos: [{ bytes: card, type: "image/jpeg", name: "card.jpg" }],
            job: context,
          });
        } catch (error) {
          failure = error;
          return undefined;
        }
      },
      { dir: jobsDir, mirror: null },
    );
    expect(failure).toMatchObject({
      code: "import_failed",
      message: expect.stringMatching(
        /^the vision model qwen2\.5vl:7b failed: the local model at .* answered 500: model runner has unexpectedly stopped.*ErrorDeviceLost$/,
      ),
    });
    expect(calls.map((call) => call.path)).toEqual([
      "/api/chat",
      "/api/generate",
    ]);
    expect(calls[1].body).toEqual({ model: "qwen2.5vl:7b", keep_alive: 0 });
    const { lines } = await readJobLog(jobsDir, job);
    expect(
      lines.find((line) => line.step === "llm.unload" && line.phase === "end")
        ?.data,
    ).toMatchObject({ reason: "runner failed" });
  });

  it("reads an empty done:false answer as a crashed runner, for the text model too", async () => {
    const calls = stubFailing(() =>
      Response.json({
        model: "",
        message: { role: "", content: "" },
        done: false,
      }),
    );
    await expect(
      chatJson({
        system: "s",
        user: "u",
        schema: { type: "object" },
        config: { url: MODEL_URL, model: "qwen3:8b", api: "ollama" },
      }),
    ).rejects.toMatchObject({
      kind: "model",
      runnerFailed: true,
      message: expect.stringContaining(
        "qwen3:8b at http://model.test:11434 stopped without an answer (done: false, an empty message) — its runner has likely crashed",
      ),
    });
    expect(calls.map((call) => [call.path, call.body?.keep_alive])).toEqual([
      ["/api/chat", "10m"],
      ["/api/generate", 0],
    ]);
  });

  it("reads a 200 carrying an error as a failure, not as no text", async () => {
    const calls = stubFailing(() => Response.json({ error: RUNNER }));
    await expect(
      transcribePhotos({
        photos: [
          { bytes: await cardJpeg(), type: "image/jpeg", name: "card.jpg" },
        ],
      }),
    ).rejects.toThrow(
      /failed: the local model qwen2\.5vl:7b at .* failed: model runner has unexpectedly stopped/,
    );
    expect(calls.map((call) => call.path)).toEqual([
      "/api/chat",
      "/api/generate",
    ]);
  });

  it("unloads a vision model whose call was cancelled (38e review)", async () => {
    const calls: Call[] = [];
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ path: url.pathname });
        if (url.pathname !== "/api/chat") return Response.json({});
        controller.abort();
        throw init?.signal?.reason ?? new DOMException("aborted", "AbortError");
      }),
    );
    await expect(
      chatText({
        system: "s",
        user: "u",
        config: { url: MODEL_URL, model: "qwen2.5vl:7b", api: "ollama" },
        unload: true,
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
    expect(calls.map((call) => call.path)).toEqual([
      "/api/chat",
      "/api/generate",
    ]);
  });

  it("leaves a call that failed on its own (no unloadOnError) loaded", async () => {
    const calls = stubFailing(
      () => new Response("model 'nope' not found", { status: 404 }),
    );
    await expect(
      chatText({
        system: "s",
        user: "u",
        config: { url: MODEL_URL, model: "nope", api: "ollama" },
      }),
    ).rejects.toMatchObject({ kind: "http", status: 404 });
    expect(calls.map((call) => call.path)).toEqual(["/api/chat"]);
  });
});

describe("the prune and the photos (38e review)", () => {
  it("prunes no photo when a job's meta cannot be read", async () => {
    const [photo] = await storePhotos(jobsDir, [
      file(await cardJpeg(1), "a.jpg"),
    ]);
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(jobsDir, photo.path), past, past);
    const { ulid } = await import("@discontent/cms/util/ulid");
    const { writeFile } = await import("fs-extra");
    /* A job naming the photo, whose meta is half-written garbage. */
    await writeFile(join(jobsDir, `${ulid()}.meta.json`), '{"spec": {"phot');
    await pruneJobs(jobsDir, { force: true });
    expect(await readdir(join(jobsDir, PHOTOS_DIR))).toEqual([
      photo.path.split("/")[1],
    ]);
  });
});

describe("the picker's photo (form-batch, 38e review)", () => {
  it("sets the stored photo as each created recipe's image", async () => {
    const [photo] = await storePhotos(jobsDir, [
      file(await cardJpeg(1), "card.jpg"),
    ]);
    const result = await runSpec(
      {
        kind: "form-batch",
        contentDirectory,
        picks: [
          {
            n: 1,
            recipe: {
              name: "Cake",
              ingredients: ["200g flour"],
              instructions: ["Mix and bake."],
            },
          },
          {
            n: 2,
            recipe: {
              name: "Glaze",
              ingredients: ["100g icing sugar"],
              instructions: ["Whisk."],
            },
          },
        ],
        total: 2,
        commitNote: "local model, photo, {n} of {total}",
        photos: [photo],
      },
      { dir: jobsDir, mirror: null },
    );
    expect(result.recipes).toEqual([
      expect.objectContaining({
        n: 1,
        status: "imported",
        slug: "cake",
        warnings: expect.arrayContaining([
          "the photo card.jpg is the image of cake (photoAsImage)",
        ]),
      }),
      expect.objectContaining({
        n: 2,
        slug: "glaze",
        warnings: expect.arrayContaining([
          "the photo card.jpg is the image of glaze (photoAsImage)",
        ]),
      }),
    ]);
    for (const slug of ["cake", "glaze"]) {
      const recipe = JSON.parse(
        await readFile(
          join(contentDirectory, "recipes/data", slug, "recipe.json"),
          "utf8",
        ),
      );
      expect(recipe.image).toBe("card.jpg");
    }
  });
});
