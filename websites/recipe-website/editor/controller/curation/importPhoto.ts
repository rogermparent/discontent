/**
 * Import a recipe from photos of it (38e, D5): a recipe card, a cookbook
 * page, a handwritten note — up to `MAX_PHOTOS` pages, in order.
 *
 * Two model calls, each its own `gpu` acquire: the vision model
 * **transcribes** (`vision.transcribe`, `llm/vision.ts`, then unloaded), and
 * the transcription is imported as pasted text is (`importFromText`): the
 * extractor, the grounding guard — against the transcription, which is the
 * source — the 36e several-recipe split, `partial`, the dry run, `pick` /
 * `all`. A create commits "(local model, photo)".
 *
 * The photos are already in the job store (`storePhotos`, at enqueue time):
 * the spec names them, and Retry reads them again. The transcription is
 * kept beside them (`saveTranscript`); a later import of the same photos
 * with the same vision model and prompt — a Retry, a `--pick` after a
 * several-recipe refusal — reuses it instead of reading the photos again.
 *
 * `photoAsImage` (off by default — a card is rarely a picture of the dish)
 * sets the first photo as the image of each recipe the import creates,
 * through `setRecipeImage` — one more commit per recipe.
 */
import { jobContext, type JobRun } from "../jobs/context";
import { jobsDirectory } from "../jobs/location";
import type { StoredPhoto } from "../jobs/photos";
import type { CurationContext } from "./context";
import { UsageError } from "./errors";
import type { ReadingCache } from "../jobs/readingCache";
import type {
  ImportBatchResult,
  ImportResult,
  ImportWriteOptions,
  UrlImport,
} from "./importRecipe";

/** What a photo import takes besides the photos. */
export interface PhotoImportOptions extends ImportWriteOptions {
  /** Where the photo came from (a cookbook's page): cited, never fetched. */
  source?: string;
  /** Set the first photo as each created recipe's image (default off). */
  photoAsImage?: boolean;
}

/** `photoAsImage` with `image` is two images for one recipe. */
export function checkPhotoOptions({
  photoAsImage,
  image,
}: PhotoImportOptions): void {
  if (photoAsImage && image) {
    throw new UsageError(
      "photoAsImage (--photo-as-image) or image (--image), not both: the recipe has one image.",
    );
  }
}

/**
 * The transcription of `photos`: the one kept beside them when the same
 * model and prompt made it, else the vision model's, kept for next time.
 */
export async function photoText(
  photos: readonly StoredPhoto[],
  { dir = jobsDirectory(), job: run }: { dir?: string; job?: JobRun } = {},
): Promise<string> {
  const job = jobContext(run);
  const { assertPhotoImport, photoLimits, transcribePhotos, transcribeKey } =
    await import("../llm/vision");
  const { llmConfig } = await import("../llm/client");
  const { loadTranscript, readStoredPhotos, saveTranscript } =
    await import("../jobs/photos");
  const vision = assertPhotoImport();
  const prompt = transcribeKey(photoLimits(vision));
  const kept = await loadTranscript(dir, photos, {
    model: vision.model,
    prompt,
  });
  if (kept) {
    job.log.info(
      "vision",
      `the transcription ${kept.job ? `from job ${kept.job}` : "kept"} reused — the photos were not read again`,
      {
        cached: true,
        model: kept.model,
        chars: kept.text.length,
        ...(kept.job ? { from: kept.job } : {}),
      },
    );
    return kept.text;
  }
  const transcription = await transcribePhotos({
    photos: await readStoredPhotos(dir, photos),
    config: vision,
    next: llmConfig()?.model,
    job,
  });
  await saveTranscript(dir, photos, {
    text: transcription.text,
    model: transcription.model,
    prompt,
    ...(job.jobId ? { job: job.jobId } : {}),
  });
  return transcription.text;
}

/**
 * The `import` seat for photos: `import-photo` jobs (the CLI, `/api/import`
 * multipart, MCP `photos`). Throws `usage` with no vision model configured.
 */
export async function importFromPhotos(
  ctx: CurationContext,
  {
    photos,
    source,
    photoAsImage = false,
    ...options
  }: PhotoImportOptions & { photos: readonly StoredPhoto[] },
  run?: JobRun,
  {
    dir = jobsDirectory(),
    cacheFor,
  }: {
    dir?: string;
    /** 38c's kept reading for this transcription (`kinds.ts`). */
    cacheFor?: (text: string) => Promise<ReadingCache<UrlImport> | undefined>;
  } = {},
): Promise<ImportResult> {
  checkPhotoOptions({ photoAsImage, ...options });
  const text = await photoText(photos, { dir, job: run });
  const { importFromText } = await import("./importRecipe");
  const cache = await cacheFor?.(text);
  const result = await importFromText(
    ctx,
    { text, ...(source ? { source } : {}), ...options },
    run,
    { photos: { count: photos.length }, ...(cache ? { cache } : {}) },
  );
  if (!photoAsImage) return result;
  return withPhotoImage(ctx, result, photos[0], { dir, job: run });
}

/** The slugs an import created. */
function createdSlugs(result: ImportResult): string[] {
  if ("batch" in result) {
    return result.recipes
      .filter((recipe) => recipe.status === "imported" && recipe.slug)
      .map((recipe) => recipe.slug!);
  }
  return "dryRun" in result ? [] : [result.slug];
}

/**
 * `photoAsImage`: the first photo becomes each created recipe's image, one
 * `image` step and one commit each (`setRecipeImage`). A failure is a
 * warning — the recipe is written. A dry run says what would happen.
 */
async function withPhotoImage(
  ctx: CurationContext,
  result: ImportResult,
  photo: StoredPhoto,
  { dir, job: run }: { dir: string; job?: JobRun },
): Promise<ImportResult> {
  const warnings = [...(result.warnings ?? [])];
  if ("dryRun" in result && result.dryRun) {
    warnings.push(
      `the photo ${photo.name} would be set as the recipe's image (photoAsImage)`,
    );
    return { ...result, warnings };
  }
  const slugs = createdSlugs(result);
  if (slugs.length === 0) return result;
  warnings.push(
    ...(await setPhotoAsImage(ctx, slugs, photo, { dir, job: run })),
  );
  if ("batch" in result) {
    const batch: ImportBatchResult = { ...result, warnings };
    return batch;
  }
  return { ...result, warnings };
}

/**
 * The photo as the image of each of `slugs` (De7): the photo upright and
 * fitted inside 2000 px as a JPEG (`storedPhotoImage`), one `image` step
 * and one commit per recipe. Shared by the seats' `photoAsImage` and the
 * form's picker (`form-batch`, 38e review). Never throws but for a cancel:
 * answers the warnings — a recipe whose image failed is still written.
 */
export async function setPhotoAsImage(
  ctx: CurationContext,
  slugs: readonly string[],
  photo: StoredPhoto,
  { dir = jobsDirectory(), job: run }: { dir?: string; job?: JobRun } = {},
): Promise<string[]> {
  const job = jobContext(run);
  const warnings: string[] = [];
  if (slugs.length === 0) return warnings;
  const { storedPhotoImage } = await import("../jobs/photos");
  const { setRecipeImage } = await import("./recipeImage");
  let file: File;
  try {
    file = await storedPhotoImage(dir, photo);
  } catch (error) {
    return [
      `the photo ${photo.name} was not set as an image (${error instanceof Error ? error.message : String(error)}) — set one with recipe_set_image`,
    ];
  }
  const set: string[] = [];
  for (const slug of slugs) {
    try {
      const written = await job.log.step(
        "image",
        { from: "photo", slug, type: file.type, bytes: file.size },
        () => setRecipeImage(ctx, slug, { file }),
      );
      set.push(slug);
      warnings.push(...(written.warnings ?? []));
    } catch (error) {
      if (job.signal?.aborted) throw error;
      warnings.push(
        `${slug}: the photo was not set as its image (${error instanceof Error ? error.message : String(error)}) — set one with recipe_set_image`,
      );
    }
  }
  if (set.length > 0) {
    warnings.push(
      `the photo ${photo.name} is the image of ${set.join(", ")} (photoAsImage)`,
    );
  }
  return warnings;
}
