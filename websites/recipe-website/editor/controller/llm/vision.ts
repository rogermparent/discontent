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
 * fail. A machine with neither hides the mode.
 *
 * **The Claude API (38g, Dg7)** reads pictures itself: under
 * `RECIPE_LLM_API=anthropic` the vision model defaults to the text model,
 * so photo import is on with the key alone (`RECIPE_LLM_VISION_MODEL`
 * still overrides). Nothing is loaded or unloaded there — a hosted API
 * holds no `gpu` slot — and a photo is fitted inside 1568 px, not 1024
 * (`photoLimits`).
 *
 * ## One GPU at a time
 *
 * Each photo is its own call (De4) and its own `gpu` acquire (`chatText`);
 * the last one unloads the vision model before it lets the slot go
 * (`unload`, an `llm.unload` step), and a failed one unloads it too
 * (`unloadOnError`, and always after a runner failure — 38-Te5): the 8 GB
 * GPU never holds the vision model and the text model together, and a
 * crashed runner is never left for the next job. The extractor's call that
 * follows is the next acquire, and the placement check runs for both (D6).
 *
 * ## The pictures sent
 *
 * Every photo is turned upright, fitted inside `PHOTO_MAX_SIDE` (1024 px)
 * and `PHOTO_MAX_PIXELS`, and sent as a JPEG (`photoPrep.ts`) — never the
 * original, however small: a larger picture crashed the model runner on
 * the 8 GB GPU (38-Te5). HEIC is refused with advice (`HEIC_ADVICE`): this
 * `sharp` reads no HEVC; SVG, ICO and BMP are refused as no photo.
 */
import { createHash } from "node:crypto";
import type { Metadata } from "sharp";
import { ImportError, UsageError, ValidationError } from "../curation/errors";
import { jobContext, type JobRun } from "../jobs/context";
import { HEIC_ADVICE } from "../photoLimits";
import {
  chatText,
  LlmError,
  llmConfig,
  type ChatImage,
  type ChatTextResult,
  type LlmConfig,
} from "./client";
import {
  CLAUDE_PHOTO_LIMITS,
  OLLAMA_PHOTO_LIMITS,
  PHOTO_MAX_PIXELS,
  PHOTO_MAX_SIDE,
  PHOTO_SHARP_OPTIONS,
  photoForVision,
  type PhotoLimits,
} from "./photoPrep";

export { PHOTO_MAX_PIXELS, PHOTO_MAX_SIDE };

export const VISION_MODEL_ENV = "RECIPE_LLM_VISION_MODEL";

/** The model the docs name: ~6 GB, which fits the 8 GB GPU alone (38e). */
export const RECOMMENDED_VISION_MODEL = "qwen2.5vl:7b";

/**
 * Ollama's `num_ctx` for a transcription: one photo per call (De4) at
 * ≤ 0.75 MP is ~1 100 image tokens, then the prompt and a card's worth of
 * text out. The 38e real check read at Ollama's default 4 096; two pages
 * in one call took 2 116 prompt tokens, so four would not have fitted.
 */
export const VISION_NUM_CTX = 4_096;

export const PHOTO_UNCONFIGURED_MESSAGE = `photo import needs a vision model: set RECIPE_LLM_URL and ${VISION_MODEL_ENV} (e.g. ${RECOMMENDED_VISION_MODEL}) in editor/.env, or use the Claude API (RECIPE_LLM_API=anthropic with RECIPE_LLM_API_KEY)`;

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
 * import is off: no text model, or no `RECIPE_LLM_VISION_MODEL` (De1). The
 * Claude API's defaults to its text model (38g, Dg7): Claude reads images.
 */
export function visionConfig(
  env: NodeJS.ProcessEnv = process.env,
): LlmConfig | undefined {
  const base = llmConfig(env);
  if (!base) return undefined;
  const override = env.TEST_MODE
    ? (globalThis as VisionGlobal).__discontentVisionModelOverride
    : undefined;
  const model =
    override ??
    envValue(env, VISION_MODEL_ENV) ??
    (base.api === "anthropic" ? base.model : undefined);
  return model ? { ...base, model } : undefined;
}

/** How a photo is fitted for `config`'s server: 1024 px for a local GPU, 1568 for Claude (Dg7). */
export function photoLimits(config?: LlmConfig): PhotoLimits {
  return config?.api === "anthropic"
    ? CLAUDE_PHOTO_LIMITS
    : OLLAMA_PHOTO_LIMITS;
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

/** A drawing or an icon, not a photo: SVG (a document `sharp` would render), ICO, BMP. */
function isNoPhoto(photo: Pick<PhotoBytes, "type" | "name">): boolean {
  return (
    /^image\/(svg|x-icon|vnd\.microsoft\.icon|bmp|x-bmp|x-ms-bmp)/i.test(
      photo.type,
    ) || /\.(svgz?|ico|bmp)$/i.test(photo.name)
  );
}

const NO_PHOTO_ADVICE =
  "is not a photo this import reads — send a JPEG, PNG, WebP, AVIF, TIFF or GIF";

/** Refuse what will never be read, before it is stored (`storePhotos`). */
export function checkPhotoFormat(photo: Pick<PhotoBytes, "type" | "name">) {
  if (isHeic(photo)) {
    throw new ValidationError(`${photo.name}: ${HEIC_ADVICE}.`);
  }
  if (isNoPhoto(photo)) {
    throw new ValidationError(`${photo.name} ${NO_PHOTO_ADVICE}.`);
  }
}

/**
 * The picture as the model gets it (see the module comment): always
 * upright, fitted inside `limits` (`PHOTO_MAX_SIDE` / `PHOTO_MAX_PIXELS`
 * by default; `photoLimits`) and re-encoded as a JPEG (`photoForVision`).
 */
export async function preparePhoto(
  photo: PhotoBytes,
  limits: PhotoLimits = OLLAMA_PHOTO_LIMITS,
): Promise<ChatImage> {
  checkPhotoFormat(photo);
  const { default: sharp } = await import("sharp");
  let meta: Metadata;
  try {
    meta = await sharp(photo.bytes, PHOTO_SHARP_OPTIONS).metadata();
  } catch (error) {
    throw new ValidationError(
      `${photo.name} could not be read as an image: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (meta.format === "heif" && meta.compression === "hevc") {
    throw new ValidationError(`${photo.name}: ${HEIC_ADVICE}.`);
  }
  if (meta.format === "svg") {
    throw new ValidationError(`${photo.name} ${NO_PHOTO_ADVICE}.`);
  }
  try {
    return {
      bytes: await photoForVision(photo.bytes, limits),
      type: "image/jpeg",
    };
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
- Do not add, correct, translate, summarise or explain anything. Do not describe the photo.
- If a word cannot be read, write [?] in its place.
- Answer with the transcribed text only.`;

/** One photo per call (De4): page `page` of `pages`. */
export function transcribeUserPrompt(page = 1, pages = 1): string {
  return pages > 1
    ? `Transcribe this photo — page ${page} of ${pages} of one recipe card or page.`
    : "Transcribe this photo of a recipe.";
}

/**
 * What a kept transcription must have been made with to be reused
 * (`photos.ts`): the prompts and how the photos are sent. The model's name
 * is checked beside it — so a re-pulled model under the same name reuses
 * it (38-Te6). The size caps are the server's (`photoLimits`, 38g); the
 * default is the key every transcript kept before 38g was made with.
 */
export function transcribeKey(
  limits: PhotoLimits = OLLAMA_PHOTO_LIMITS,
): string {
  return textSha(
    JSON.stringify([
      TRANSCRIBE_SYSTEM_PROMPT,
      transcribeUserPrompt(),
      transcribeUserPrompt(1, 2),
      "one call per photo",
      limits.maxSide,
      limits.maxPixels,
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
 * and one call per photo, in page order (De4), the pages joined with a
 * blank line; the vision model unloaded after the last call (an
 * `llm.unload` step) — or after a failed one — and a `vision` note naming
 * the model that reads next. Each step keeps its page's length, line count,
 * hash and a `TRANSCRIPT_EXCERPT_CHARS` excerpt — never the whole text
 * (37-D2); the caller keeps the whole beside the photos.
 *
 * Every photo is prepared before the first call, so a photo that cannot be
 * read fails the import before the model loads. Throws `ValidationError`
 * for such a photo, `ImportError` when the model failed (its server's own
 * words, 38-Te5) or read no text in any photo.
 */
export async function transcribePhotos({
  photos,
  config = visionConfig(),
  next,
  signal,
  job: run,
}: {
  photos: readonly PhotoBytes[];
  config?: LlmConfig;
  /** The text model that reads the transcription next, for the swap note. */
  next?: string;
  signal?: AbortSignal;
  job?: JobRun;
}): Promise<Transcription> {
  const vision = assertPhotoImport(config);
  const job = jobContext(run);
  const { log } = job;
  if (photos.length === 0) {
    throw new ValidationError("No photos to read.");
  }
  const images: ChatImage[] = [];
  const limits = photoLimits(vision);
  for (const photo of photos) images.push(await preparePhoto(photo, limits));
  /* Only a local model is unloaded (38g): a hosted API has nothing to unload. */
  const unloads = vision.api === "ollama";
  const pages: string[] = [];
  let durationMs = 0;
  for (const [index, photo] of photos.entries()) {
    const last = index === photos.length - 1;
    const image = images[index];
    const page = photos.length > 1 ? `${index + 1}/${photos.length}` : "";
    let result: ChatTextResult;
    try {
      result = await log.step(
        "vision.transcribe",
        {
          model: vision.model,
          photos: 1,
          bytes: photo.bytes.length,
          sent: image.bytes.length,
          ...(page ? { part: page } : {}),
        },
        async (step) => {
          const answer = await chatText({
            system: TRANSCRIBE_SYSTEM_PROMPT,
            user: transcribeUserPrompt(index + 1, photos.length),
            images: [image],
            config: vision,
            numCtx: VISION_NUM_CTX,
            /* The vision model leaves the GPU before the text model needs
             * it: after the last page, or after a page that failed. */
            unload: last,
            unloadOnError: true,
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
    } catch (error) {
      if (
        !(error instanceof LlmError) ||
        signal?.aborted ||
        job.signal?.aborted
      )
        throw error;
      throw new ImportError(
        `the vision model ${vision.model} failed${page ? ` on page ${page}` : ""}: ${error.message}`,
      );
    }
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
    `${vision.model} read ${text.length} characters${photos.length > 1 ? ` from ${photos.length} photos` : ""}${unloads ? " and was unloaded" : ""}${next ? ` — ${next} reads the transcription` : ""}`,
    {
      model: vision.model,
      ...(next ? { next } : {}),
      chars: text.length,
      ...(photos.length > 1 ? { photos: photos.length } : {}),
    },
  );
  return { text, model: vision.model, durationMs, sha: textSha(text) };
}
