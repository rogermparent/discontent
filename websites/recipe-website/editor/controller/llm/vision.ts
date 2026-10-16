/**
 * A photo of a recipe, read by a vision model (38e, D5): the model only
 * **transcribes** — `vision.transcribe` — and the pasted-text path does the
 * reading (the extractor, the grounding guard against the transcription, the
 * 36e several-recipe split).
 *
 * ## Configuration (De1)
 *
 * `RECIPE_LLM_VISION_MODEL` names the vision model, served by the same
 * server as the text model (`RECIPE_LLM_URL`, `RECIPE_LLM_API`). Photo
 * import is on only when **both** are set: unlike the text model, the
 * vision model has no silent default — `qwen2.5vl:7b`
 * (`RECOMMENDED_VISION_MODEL`) is what the docs and `--help` name, so a
 * workstation that never pulled one shows no Photo mode that would only
 * fail. The Pi sets neither, so the mode is hidden there.
 *
 * ## One GPU at a time
 *
 * The transcription is its own `gpu` acquire (`chatText`), and it unloads
 * the vision model before it lets the slot go (`unload`, an `llm.unload`
 * step): the 8 GB GPU never holds the vision model and the text model
 * together. The extractor's call that follows is the next acquire, and the
 * placement check runs for both (D6).
 *
 * ## The pictures sent
 *
 * A JPEG or PNG no larger than `PHOTO_MAX_SIDE` and upright goes as it is;
 * anything else — a phone's 4000 px photo, an EXIF rotation, WebP, AVIF,
 * TIFF, GIF — is turned upright, fitted inside `PHOTO_MAX_SIDE` and sent as
 * a JPEG (`sharp`, loaded only here). Ollama's qwen2.5-VL reads at most
 * ~1 M pixels anyway; the rest would be upload and base64. HEIC is refused
 * with advice (`HEIC_ADVICE`): this `sharp` reads no HEVC.
 */
import { createHash } from "node:crypto";
import type { Metadata } from "sharp";
import { ImportError, UsageError, ValidationError } from "../curation/errors";
import { jobContext, type JobRun } from "../jobs/context";
import { HEIC_ADVICE } from "../photoLimits";
import {
  chatText,
  llmConfig,
  type ChatImage,
  type ChatTextResult,
  type LlmConfig,
} from "./client";

export const VISION_MODEL_ENV = "RECIPE_LLM_VISION_MODEL";

/** The model the docs name: ~6 GB, which fits the 8 GB GPU alone (38e). */
export const RECOMMENDED_VISION_MODEL = "qwen2.5vl:7b";

/** The longest side a photo is sent at (see the module comment). */
export const PHOTO_MAX_SIDE = 1600;

/**
 * Ollama's `num_ctx` for a transcription: four photos at qwen2.5-VL's
 * ~1 280 image tokens each, the prompt, and a card's worth of text out.
 */
export const VISION_NUM_CTX = 8_192;

/**
 * Several photos go to the model in **one** call, in page order (De4,
 * measured in the real check), rather than one call per photo joined.
 */
export const TRANSCRIBE_TOGETHER = true;

export const PHOTO_UNCONFIGURED_MESSAGE = `photo import needs a vision model: set RECIPE_LLM_URL and ${VISION_MODEL_ENV} (e.g. ${RECOMMENDED_VISION_MODEL}) in editor/.env`;

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

interface VisionGlobal {
  __discontentVisionModelOverride?: string;
}

/**
 * Test-only, as `setLlmUrlOverride` is (36e): under `TEST_MODE`,
 * `/settings/test-llm?url=…&vision=<model>` turns photo import on for one
 * Playwright spec, read by the loopback stand-in model. `undefined` clears
 * it.
 */
export function setVisionModelOverride(model: string | undefined): void {
  (globalThis as VisionGlobal).__discontentVisionModelOverride =
    model || undefined;
}

/**
 * The vision model, on the text model's server — or `undefined` when photo
 * import is off: no `RECIPE_LLM_URL`, or no `RECIPE_LLM_VISION_MODEL` (De1).
 */
export function visionConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmConfig | undefined {
  const base = llmConfig(env);
  if (!base) return undefined;
  const override = env.TEST_MODE
    ? (globalThis as VisionGlobal).__discontentVisionModelOverride
    : undefined;
  const model = override ?? envValue(env, VISION_MODEL_ENV);
  return model ? { ...base, model } : undefined;
}

/** Photo import's surfaces refuse (`usage`) when it is off. */
export function assertPhotoImport(
  config: LlmConfig | undefined = visionConfig(),
): LlmConfig {
  if (!config) throw new UsageError(PHOTO_UNCONFIGURED_MESSAGE);
  return config;
}

/** A photo as the seats hold it: bytes, media type, and the name it came with. */
export interface PhotoBytes {
  bytes: Buffer;
  type: string;
  name: string;
}

function isHeic(photo: Pick<PhotoBytes, "type" | "name">): boolean {
  return (
    /^image\/hei[cf]/i.test(photo.type) || /\.(heic|heif)$/i.test(photo.name)
  );
}

/** Refuse what will never be read, before it is stored (`storePhotos`). */
export function checkPhotoFormat(photo: Pick<PhotoBytes, "type" | "name">) {
  if (isHeic(photo)) {
    throw new ValidationError(`${photo.name}: ${HEIC_ADVICE}.`);
  }
}

/**
 * The picture as the model gets it (see the module comment): as it is, or
 * upright, fitted and re-encoded as a JPEG.
 */
export async function preparePhoto(photo: PhotoBytes): Promise<ChatImage> {
  checkPhotoFormat(photo);
  const { default: sharp } = await import("sharp");
  let meta: Metadata;
  try {
    meta = await sharp(photo.bytes).metadata();
  } catch (error) {
    throw new ValidationError(
      `${photo.name} could not be read as an image: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (meta.format === "heif" && meta.compression === "hevc") {
    throw new ValidationError(`${photo.name}: ${HEIC_ADVICE}.`);
  }
  const asIs =
    (meta.format === "jpeg" || meta.format === "png") &&
    (meta.orientation ?? 1) === 1 &&
    Math.max(meta.width ?? 0, meta.height ?? 0) <= PHOTO_MAX_SIDE;
  if (asIs) {
    return {
      bytes: photo.bytes,
      type: meta.format === "png" ? "image/png" : "image/jpeg",
    };
  }
  try {
    const bytes = await sharp(photo.bytes)
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { bytes, type: "image/jpeg" };
  } catch (error) {
    throw new ValidationError(
      `${photo.name} could not be converted for the vision model: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const TRANSCRIBE_SYSTEM_PROMPT = `You transcribe photographs of recipes — recipe cards, cookbook pages, handwritten notes — into plain text.

Rules:
- Copy every word exactly as it is written, line by line, from top to bottom. Keep the original spelling, numbers, fractions and units.
- Keep each ingredient on its own line, and each heading or section name ("Frosting", "For the sauce:") on its own line.
- Keep the method's steps as they are written, numbered if they are numbered.
- Several photos are the pages of one card or page, in order: transcribe them one after another.
- Do not add, correct, translate, summarise or explain anything. Do not describe the photo.
- If a word cannot be read, write [?] in its place.
- Answer with the transcribed text only.`;

export function transcribeUserPrompt(count: number): string {
  return count > 1
    ? `Transcribe these ${count} photos — pages of one recipe card or page, page 1 first.`
    : "Transcribe this photo of a recipe.";
}

/**
 * What a kept transcription must have been made with to be reused
 * (`photos.ts`): the prompts and how the photos are sent. The model's name
 * is checked beside it.
 */
export function transcribeKey(): string {
  return textSha(
    JSON.stringify([
      TRANSCRIBE_SYSTEM_PROMPT,
      transcribeUserPrompt(1),
      transcribeUserPrompt(2),
      TRANSCRIBE_TOGETHER,
      PHOTO_MAX_SIDE,
      VISION_NUM_CTX,
    ]),
  );
}

/** Shown in the step log (37-D2): a short excerpt, never the whole text. */
export const TRANSCRIPT_EXCERPT_CHARS = 160;

/** What `transcribePhotos` answers. */
export interface Transcription {
  text: string;
  /** The vision model that read it. */
  model: string;
  /** Wall time of the model call(s). */
  durationMs: number;
  /** A hash of the text: what the step log and the record name it by. */
  sha: string;
}

function textSha(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** A transcript's lines as the extractor will read them: no trailing spaces, at most one blank line in a row. */
export function tidyTranscript(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^```[a-z]*\n?|\n?```$/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Transcribe the photos of one recipe (D5): one `vision.transcribe` step
 * (with `TRANSCRIBE_TOGETHER`, one call with every photo in page order; else
 * one call per photo, joined with a blank line), the vision model unloaded
 * after the last call (an `llm.unload` step), and a `vision` note naming
 * the model that reads next. The step keeps the text's length, line count,
 * hash and a `TRANSCRIPT_EXCERPT_CHARS` excerpt — never the whole text
 * (37-D2); the caller keeps the whole beside the photos.
 *
 * Throws `ImportError` when the model read no text; `LlmError` as
 * `chatText` does.
 */
export async function transcribePhotos({
  photos,
  config = visionConfig(),
  next,
  together = TRANSCRIBE_TOGETHER,
  signal,
  job: run,
}: {
  photos: readonly PhotoBytes[];
  config?: LlmConfig;
  /** The text model that reads the transcription next, for the swap note. */
  next?: string;
  together?: boolean;
  signal?: AbortSignal;
  job?: JobRun;
}): Promise<Transcription> {
  const vision = assertPhotoImport(config);
  const job = jobContext(run);
  const { log } = job;
  if (photos.length === 0) {
    throw new ValidationError("No photos to read.");
  }
  const groups = together ? [photos] : photos.map((photo) => [photo]);
  const pages: string[] = [];
  let durationMs = 0;
  for (const [index, group] of groups.entries()) {
    const last = index === groups.length - 1;
    const result: ChatTextResult = await log.step(
      "vision.transcribe",
      {
        model: vision.model,
        photos: group.length,
        bytes: group.reduce((sum, photo) => sum + photo.bytes.length, 0),
        ...(groups.length > 1 ? { part: `${index + 1}/${groups.length}` } : {}),
      },
      async (step) => {
        const images = await Promise.all(group.map(preparePhoto));
        step.set({
          sent: images.reduce((sum, image) => sum + image.bytes.length, 0),
        });
        const answer = await chatText({
          system: TRANSCRIBE_SYSTEM_PROMPT,
          user: transcribeUserPrompt(group.length),
          images,
          config: vision,
          numCtx: VISION_NUM_CTX,
          /* The vision model leaves the GPU before the text model needs it. */
          unload: last,
          ...(signal ? { signal } : {}),
          job,
          step,
        });
        const text = tidyTranscript(answer.text);
        step.set({
          chars: text.length,
          lines: text ? text.split("\n").length : 0,
          sha: textSha(text),
          excerpt: text.slice(0, TRANSCRIPT_EXCERPT_CHARS),
        });
        if (!text) step.fail("the vision model read no text");
        return { ...answer, text };
      },
    );
    durationMs += result.durationMs;
    if (result.text) pages.push(result.text);
  }
  const text = pages.join("\n\n");
  if (!text) {
    throw new ImportError(
      `the vision model ${vision.model} read no text in the photo${photos.length > 1 ? "s" : ""}`,
    );
  }
  log.info(
    "vision",
    `${vision.model} read ${text.length} characters and was unloaded${next ? ` — ${next} reads the transcription` : ""}`,
    {
      model: vision.model,
      ...(next ? { next } : {}),
      chars: text.length,
    },
  );
  return { text, model: vision.model, durationMs, sha: textSha(text) };
}
