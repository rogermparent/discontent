/**
 * The pictures a photo import makes from a photo (38e): the one the vision
 * model is sent, and the one a recipe keeps as its image (`photoAsImage`).
 * Both are turned upright, fitted and re-encoded as a JPEG by `sharp`,
 * loaded only when called.
 *
 * Nothing else is imported here, on purpose: the Playwright stand-in model
 * keys its transcripts by the bytes a photo is **sent** as, so it computes
 * them with this same code (`photoForVision`) without loading the seats.
 */
import type { Metadata, SharpOptions } from "sharp";

/**
 * The longest side a photo is sent to the vision model at. **Every** photo
 * is fitted and re-encoded, even a small upright JPEG: measured in the 38e
 * real check (RX 6600 8 GB, Ollama 0.34.3 on Vulkan, `qwen2.5vl:7b`, 100%
 * GPU), a 1833×1217 card sent as it was and a 1280×850 one (1.09 MP) both
 * crashed the model runner (`vk::Queue::submit: ErrorDeviceLost`), while
 * 1024×680 (0.70 MP, 1 111 prompt tokens) read verbatim in 16.3 s, model
 * load included (38-Te5).
 */
export const PHOTO_MAX_SIDE = 1024;

/**
 * And at most this many pixels, for a photo of an odd shape: a square
 * 1024×1024 is 1.05 MP, nearer the crash than anything measured to read.
 */
export const PHOTO_MAX_PIXELS = 750_000;

/**
 * The longest side a photo is sent to the Claude API at (38g, Dg7): the
 * 1024 px cap is the workstation GPU's limit (38-Te5), not Claude's.
 * Claude's *standard* resolution tier (`claude-haiku-4-5` and the models
 * before 4.7) downscales anything past 1568 px on the long edge or ~1 568
 * visual tokens (28 × 28 px each, ~1.15 MP), so this is what that tier
 * reads at full detail. The high-resolution tier (`claude-sonnet-5`, the
 * 4.7+ models) reads up to 2576 px and 4 784 tokens; holding it to the
 * standard tier's size is a cost choice — a recipe card's print reads at
 * this size, and a full-size photo would cost ~3× the image tokens.
 */
export const CLAUDE_PHOTO_MAX_SIDE = 1568;

/** The standard tier's area: ~1 568 visual tokens of 28 × 28 px (Dg7). */
export const CLAUDE_PHOTO_MAX_PIXELS = 1_150_000;

/** How a photo is fitted before it is sent: the longest side, and the area. */
export interface PhotoLimits {
  maxSide: number;
  maxPixels: number;
}

/** Ollama on the workstation's 8 GB GPU (38-Te5). */
export const OLLAMA_PHOTO_LIMITS: PhotoLimits = {
  maxSide: PHOTO_MAX_SIDE,
  maxPixels: PHOTO_MAX_PIXELS,
};

/** The Claude API (38g): the standard tier's 1568 px and ~1.15 MP. */
export const CLAUDE_PHOTO_LIMITS: PhotoLimits = {
  maxSide: CLAUDE_PHOTO_MAX_SIDE,
  maxPixels: CLAUDE_PHOTO_MAX_PIXELS,
};

/**
 * The longest side of a photo kept as a recipe's image (`photoAsImage`):
 * upright and re-encoded, large enough for the site's own sizes, and not a
 * phone's 10 MB original in the content repository.
 */
export const PHOTO_IMAGE_MAX_SIDE = 2000;

/** What `sharp` will decode at most: a 100 MP photo, not a decompression bomb. */
export const PHOTO_INPUT_PIXELS = 100_000_000;

/** `sharp`'s options for a photo: the input pixel cap. */
export const PHOTO_SHARP_OPTIONS: SharpOptions = {
  limitInputPixels: PHOTO_INPUT_PIXELS,
};

/**
 * `width` × `height` scaled down (never up) so the longest side is at most
 * `maxSide` and the area at most `maxPixels`.
 */
export function fittedSize(
  width: number,
  height: number,
  maxSide: number,
  maxPixels = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    maxSide / Math.max(width, height),
    Math.sqrt(maxPixels / (width * height)),
  );
  /* The epsilon: 1833 × (1024 / 1833) is 1023.9999… in floating point. */
  return {
    width: Math.max(1, Math.floor(width * scale + 1e-9)),
    height: Math.max(1, Math.floor(height * scale + 1e-9)),
  };
}

async function fitJpeg(
  bytes: Buffer,
  {
    maxSide,
    maxPixels,
    quality,
  }: { maxSide: number; maxPixels?: number; quality: number },
): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const meta: Metadata = await sharp(bytes, PHOTO_SHARP_OPTIONS).metadata();
  /* EXIF orientations 5–8 turn the picture a quarter: its sides swap. */
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  if (!width || !height) {
    throw new Error("the picture has no dimensions");
  }
  return (
    sharp(bytes, PHOTO_SHARP_OPTIONS)
      .rotate()
      /* Exactly the size computed ("fill": it keeps the shape to within a
       * pixel), never larger than the photo (`fittedSize` scales ≤ 1). */
      .resize({ ...fittedSize(width, height, maxSide, maxPixels), fit: "fill" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality })
      .toBuffer()
  );
}

/**
 * The photo as the vision model is sent it: upright, a JPEG, fitted inside
 * `limits` — ≤ 1024 px and 0.75 MP for Ollama (the default, which the
 * Playwright stand-in keys by), ≤ 1568 px for the Claude API (38g).
 */
export function photoForVision(
  bytes: Buffer,
  limits: PhotoLimits = OLLAMA_PHOTO_LIMITS,
): Promise<Buffer> {
  return fitJpeg(bytes, { ...limits, quality: 90 });
}

/** The photo as a recipe keeps it (`photoAsImage`): upright, ≤ 2000 px, a JPEG. */
export function photoForImage(bytes: Buffer): Promise<Buffer> {
  return fitJpeg(bytes, { maxSide: PHOTO_IMAGE_MAX_SIDE, quality: 85 });
}
