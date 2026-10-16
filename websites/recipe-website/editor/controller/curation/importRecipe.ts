/**
 * Import a recipe from a URL, cite it, and (optionally) write it.
 *
 * `importRecipeData` is shared with the browser's `/new-recipe` flow, so the
 * parsing, the markdown conversion and the `source` citation are identical.
 * What this adds is everything the form used to do around it: turning the
 * importer's two `*ImportUrl` fields into an upload spec and a stored value
 * (fact 9), supplying a name when the page had none, and a dry run — which is
 * how the curator skill inspects a candidate before deciding to keep it.
 *
 * Since 26a a video host goes through yt-dlp first (`../ytdlp`, the mapper the
 * form uses too), and a page with no Recipe node comes back as the importer's
 * SEO fallback, `partial: true` — which a dry run reports and a create refuses
 * unless asked (`allowPartial`).
 *
 * Since 36b the mapped page (or the video's title and description) goes through
 * `applyLlm` (`../llm/importWithLlm`, epic 36 D3): under `auto` a local model
 * fills a page with no Recipe node, under `force` it replaces the schema's
 * fields. The result carries `llm` and its warnings, and a create from the
 * model's lines says "(local model)" in its commit (D5).
 *
 * Since 36c `importFromText` is the same import from pasted text (D8): the
 * model reads it (`readPastedText`), and the gate, the dry run and the create
 * are shared (`finishImport`).
 *
 * Since 36e a video or a paste can hold several recipes (D10): the model's
 * reading then carries `recipes`, and the import asks which to keep — `all`,
 * or `pick` by position — and refuses (`usage`) to guess. `finishBatch`
 * imports the picks one commit each, links an ingredient line that names
 * another recipe of the batch to it, and answers `ImportBatchResult`.
 */
import {
  isVideoUrl,
  mapRecipeNodes,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";
import { jobContext, type JobRun } from "../jobs/context";
import {
  fetchPageStep,
  headSha,
  parsePage,
  videoLinkStep,
} from "../jobs/steps";
import type {
  Recipe,
  RecipeSource,
} from "recipe-website-common/controller/types";
import type { ImageProbe } from "../imageImport";
import { fetchImageFile, probeImageFile } from "../imageImport";
import {
  applyLlm,
  MAX_BATCH_RECIPES,
  pickedWarnings,
  readPastedText,
  schemaReadings,
  usedModel,
  videoFetchOptions,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
  type SplitReading,
} from "../llm/importWithLlm";

export { MAX_BATCH_RECIPES };
import type { ChapterRef } from "../llm/chapterTime";
import { readerNote, readerNoun } from "../llm/readerLabel";
import { PHOTO_TEXT_LABEL } from "../photoLimits";
import type { ReadingCache } from "../jobs/readingCache";
import type { ComponentRef } from "../llm/splitRecipes";
import { fetchYtdlpMetadata, ytdlpToRecipe } from "../ytdlp";
import type { CurationContext } from "./context";
import {
  CurationError,
  ImportError,
  UsageError,
  ValidationError,
  toErrorObject,
  type ErrorObject,
} from "./errors";
import { toDraft, type RecipeDraft } from "./inspect";
import {
  buildRecipeWrite,
  createRecipe,
  getRecipe,
  resolveCreateSlug,
  slugIsTaken,
  type RecipeWriteResult,
} from "./recipes";
import { RecipeInputSchema, parseInput, type RecipeInput } from "./schema";
import { pacedRequest } from "./sitePacing";

export interface ImportDryRunResult {
  /** The job that ran it (epic 37): `recipes jobs show <job>` has its steps. */
  job?: string;
  dryRun: true;
  /** The page; for pasted text, its source URL when one was given. */
  url?: string;
  /** Read from pasted text by the local model (D8), not fetched. */
  pastedText?: true;
  /** Read from this many photos' transcription (38e). */
  photos?: number;
  /** The vision model's transcription the recipe was read from (38e). */
  transcription?: string;
  slug: string;
  /** The page had no Recipe node: name, description and image only. */
  partial?: true;
  recipe: Recipe;
  /**
   * The same import as a create-ready `RecipeInput` (26b): plain lines, no
   * markup, the image as a URL. Edit it and pass it to `create`.
   */
  draft: RecipeDraft;
  /** The page's own category signals (26d) — see `InspectResult`. */
  suggestedTags?: string[];
  image?: ImageProbe;
  video?: string;
  /** The local model's part (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
  /**
   * An image over 2 MB (epic 31): a smaller candidate may be worth `--image`;
   * what the local model did, or why it was not used (epic 36).
   */
  warnings?: string[];
}

export interface ImportCreateResult extends RecipeWriteResult {
  /** The job that ran it (epic 37): `recipes jobs show <job>` has its steps. */
  job?: string;
  source?: RecipeSource;
  /** Read from this many photos' transcription (38e). */
  photos?: number;
  /** The local model's part (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
}

/** One recipe of a several-recipe import (36e). */
export interface ImportBatchItem {
  /** Its place in the model's list, 1-based (gaps where one was left out). */
  n: number;
  name: string;
  /**
   * `would-import` in a dry run; `existing` when the same source's recipe
   * is already at its slug (skipped); `failed` says why in `error`.
   */
  status: "would-import" | "imported" | "existing" | "failed";
  slug?: string;
  /** The video chapter it is made in; its `source` starts there. */
  chapter?: ChapterRef;
  /** The model's reading is not trusted (D4): a create needs `allowPartial`. */
  partial?: true;
  llm?: LlmImportInfo;
  warnings?: string[];
  /** A dry run: what would be stored, and the create-ready draft. */
  recipe?: Recipe;
  draft?: RecipeDraft;
  image?: ImageProbe;
  /** A create: where it was written. */
  path?: string;
  url?: string;
  error?: ErrorObject["error"];
}

/** A recipe the model found, picked or not (36e). */
export interface FoundRecipe {
  n: number;
  name: string;
  /** Ingredient lines, headings left out. */
  ingredients: number;
  steps: number;
  /** The model's own lines found in the text, of `total` (D4). */
  grounded?: number;
  total?: number;
  partial?: true;
  /** D4 held for it (36e): untrusted ones are "check it", partial or not. */
  trusted: boolean;
  chapter?: ChapterRef;
}

/**
 * A video or a paste that holds several recipes (36e): what was found, and
 * what became of each pick.
 */
export interface ImportBatchResult {
  /** The job that ran it (epic 37): `recipes jobs show <job>` has its steps. */
  job?: string;
  batch: true;
  dryRun?: true;
  /** The video (or a pasted text's source). */
  url?: string;
  pastedText?: true;
  /** Read from this many photos' transcription (38e). */
  photos?: number;
  /** The vision model's transcription, with a dry run (38e). */
  transcription?: string;
  /** Every recipe the model found, in the text's order. */
  found: FoundRecipe[];
  /** Listed by the model but left out: no recipe in its part, a failed call. */
  leftOut?: { n: number; name: string; reason: string }[];
  /** The picks: all of them in a dry run without `pick`. */
  recipes: ImportBatchItem[];
  /** The source's own category signals (26d), the whole batch's. */
  suggestedTags?: string[];
  warnings?: string[];
}

export type ImportResult =
  | ImportDryRunResult
  | ImportCreateResult
  | ImportBatchResult;

/** The importer's recipe, plus what the local model did with it. */
export interface UrlImport extends ApplyLlmResult {
  recipe: Partial<ImportedRecipe>;
}

/**
 * The page (or video) at `url`, mapped and — as `llm` says (default `auto`) —
 * read by the local model, with "nothing here" turned into an error.
 *
 * A video host goes through yt-dlp; when that is missing or fails, the
 * importer's bare link is the result (and `--name` the way to import it).
 */
export async function importFromUrl(
  url: string,
  { llm: mode, asOne = false }: { llm?: LlmMode; asOne?: boolean } = {},
  run?: JobRun,
): Promise<UrlImport> {
  const job = jobContext(run);
  let applied: ApplyLlmResult;
  if (isVideoUrl(url)) {
    const result = await fetchYtdlpMetadata(url, {
      ...videoFetchOptions(mode),
      job,
    });
    applied =
      result.status === "success"
        ? await applyLlm({
            url,
            source: videoSource(result.metadata),
            mapped: ytdlpToRecipe(result.metadata, url),
            mode,
            /* 36e: one video, several recipes — unless asked for one. */
            split: !asOne,
            job,
          })
        : /* No text to read; `force` still says when there is no model. */
          await applyLlm({
            url,
            source: { text: "" },
            mapped: await videoLinkStep(url, job),
            mode,
            job,
          });
    /* 38c: no recipe in the description, one recipe link in it — follow it. */
    if (result.status === "success") {
      const { followRecipeLink } = await import("./videoFollow");
      applied =
        (await followRecipeLink({
          url,
          metadata: result.metadata,
          applied,
          mode,
          asOne,
          job,
        })) ?? applied;
    }
  } else {
    applied = await importPage(url, { llm: mode, asOne }, job);
  }
  if (!applied.recipe) {
    throw new ImportError(
      [`No schema.org Recipe found at ${url}`, ...applied.warnings].join(" — "),
    );
  }
  return { ...applied, recipe: applied.recipe };
}

/**
 * A recipe page (not a video), fetched on its site's queue (34f), parsed,
 * and read as the mode says: the URL path of `importFromUrl`, and the page
 * a video's description links (38c, `followRecipeLink`). A page with
 * several recipes of its own (`mapRecipeNodes`) is a batch, as a
 * several-recipe video is (38c) — unless `asOne`, which maps its first
 * Recipe node as before.
 */
export async function importPage(
  url: string,
  { llm: mode, asOne = false }: { llm?: LlmMode; asOne?: boolean } = {},
  run?: JobRun,
): Promise<ApplyLlmResult> {
  const job = jobContext(run);
  /* The importer's own rule: no fragment in the fetch or the citation. */
  const pageUrl = url.split("#")[0];
  let page, parsed, mapped;
  try {
    /* On the per-site queue (34f), like every page and image fetch. */
    page = await pacedRequest(
      pageUrl,
      (retry) => fetchPageStep(pageUrl, retry, job),
      undefined,
      job,
    );
    /* Inside the try, as `importRecipeData` was: malformed JSON-LD is
     * `import_failed`, not `internal`. */
    ({ parsed, mapped } = await parsePage(pageUrl, page, { job }));
  } catch (error) {
    /* A cancel is the job's to report, not a fetch failure. */
    if (job.signal?.aborted) throw error;
    throw new ImportError(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const several = asOne
    ? undefined
    : mapRecipeNodes(pageUrl, parsed, { ok: page.ok });
  if (several) return schemaReadings(several, { mode, job });
  return applyLlm({
    url: pageUrl,
    source: { html: page.html, ok: page.ok, meta: parsed.meta },
    mapped,
    mode,
    job,
  });
}

/**
 * The importer's shape, as this layer's input.
 *
 * A video-host URL without yt-dlp returns no name at all — `importRecipeData`
 * short-circuits to `{videoImportUrl, source}` for YouTube and friends — so
 * `--name` is the only way to import one, and saying so is more useful than a
 * zod issue on a field the caller never wrote.
 */
export function importedToInput(
  imported: Partial<ImportedRecipe>,
  {
    tags,
    slug,
    name,
    image,
  }: { tags?: string[]; slug?: string; name?: string; image?: string } = {},
): RecipeInput {
  const resolvedName = name ?? imported.name;
  if (!resolvedName) {
    throw new ValidationError(
      "The import carries no recipe name (a video host without yt-dlp never does, nor pasted text whose lines are all links or timestamps); pass --name.",
    );
  }
  const imageImportUrl = image ?? imported.imageImportUrl;
  const raw = {
    name: resolvedName,
    ...(slug ? { slug } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(imported.description ? { description: imported.description } : {}),
    ...(imported.prepTime !== undefined ? { prepTime: imported.prepTime } : {}),
    ...(imported.cookTime !== undefined ? { cookTime: imported.cookTime } : {}),
    ...(imported.totalTime !== undefined
      ? { totalTime: imported.totalTime }
      : {}),
    ...(imported.recipeYield ? { recipeYield: imported.recipeYield } : {}),
    ...(imported.ingredients ? { ingredients: imported.ingredients } : {}),
    ...(imported.instructions ? { instructions: imported.instructions } : {}),
    ...(imported.source ? { source: imported.source } : {}),
    ...(imageImportUrl ? { imageImportUrl } : {}),
    ...(imported.videoImportUrl
      ? { videoImportUrl: imported.videoImportUrl }
      : {}),
  };
  return parseInput(RecipeInputSchema, raw);
}

/** What an import takes besides its URL or text: the same for both. */
export interface ImportWriteOptions {
  tags?: string[];
  slug?: string;
  name?: string;
  /** Use this image URL instead of the page's best one. */
  image?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  /** Create from an SEO-only page, or a partial reading, anyway. */
  allowPartial?: boolean;
  /**
   * The model found several recipes (36e): import these, by name (steady
   * across re-reads) or by position in its list (1-based). Without `pick`
   * or `all` such an import is refused.
   */
  pick?: RecipePick[];
  /** The model found several recipes: import them all (36e). */
  all?: boolean;
  /**
   * Read a video or paste as one recipe, never split (36e review): for a
   * dish the model would split into its parts.
   */
  asOne?: boolean;
}

export async function importAndCreate(
  ctx: CurationContext,
  url: string,
  {
    llm: mode,
    ...options
  }: ImportWriteOptions & {
    /** The local model: `auto` (default), `force` or `off` (epic 36, D3). */
    llm?: LlmMode;
  } = {},
  run: JobRun = {},
  { cache }: { cache?: ReadingCache<UrlImport> } = {},
): Promise<ImportResult> {
  checkPickOptions(options);
  const imported = await keptReading(cache, run, () =>
    importFromUrl(
      url,
      {
        llm: mode,
        asOne: options.asOne,
      },
      run,
    ),
  );
  if (imported.recipes) {
    return finishBatch(
      ctx,
      imported.recipes,
      {
        ...options,
        url,
        leftOut: imported.leftOut,
        suggestedTags: imported.recipe.suggestedTags,
        batchWarnings: imported.warnings.filter(
          (warning) => !imported.recipes![0].warnings.includes(warning),
        ),
        /* A page's own Recipe nodes (38c) were read by no model. */
        commitNote: `${fromPage(imported.recipes) ? "" : `${readerNote(readingLlm(imported.recipes))}, `}{n} of {total} from ${shortSource(url)}`,
      },
      run,
    );
  }
  checkSinglePick(options, imported.recipe.name);
  return finishImport(
    ctx,
    imported,
    {
      ...options,
      url,
      refusal: (warnings) =>
        usedModel(imported.llm)
          ? `The ${readerNoun(imported.llm?.api)}'s reading of ${url} is partial (${warnings.join("; ")}). `
          : `No schema.org Recipe found at ${url} — only its title, description and image` +
            (warnings.length ? ` (${warnings.join("; ")}). ` : ". "),
      commitNote: usedModel(imported.llm)
        ? readerNote(imported.llm)
        : undefined,
    },
    run,
  );
}

/**
 * Import a pasted recipe (epic 36, D8): a YouTube description, an email, a
 * note. The local model reads the text (`readPastedText`: no model, a failed
 * call, no recipe found, or a reading under half grounded is
 * `import_failed`), and the rest is a URL import's — `importedToInput`, the
 * dry run and its draft, `allowPartial` for a reading under 90% grounded.
 *
 * `source` is cited, and a video URL becomes the recipe's `video`; nothing is
 * fetched from it, so no image either (`image` supplies one). The name is the
 * model's, else the text's first line; `name` overrides both. A create
 * commits "Create recipe: <slug> (local model, pasted text)".
 */
export async function importFromText(
  ctx: CurationContext,
  {
    text,
    source,
    ...options
  }: ImportWriteOptions & { text: string; source?: string },
  run?: JobRun,
  {
    cache,
    photos,
  }: { cache?: ReadingCache<UrlImport>; photos?: PhotoOrigin } = {},
): Promise<ImportResult> {
  checkPickOptions(options);
  const reading = await keptReading(cache, run, () =>
    readPastedText({
      text,
      source,
      split: !options.asOne,
      job: run,
      ...(photos ? { label: PHOTO_TEXT_LABEL } : {}),
    }),
  );
  /* 38e: the text is a photo's transcription — said so, and kept with a dry run. */
  const from = photos
    ? {
        photos: photos.count,
        ...(options.dryRun ? { transcription: text } : {}),
      }
    : { pastedText: true };
  const what = photos ? "the photo" : "the pasted text";
  const reader = readerNote(
    reading.recipes ? readingLlm(reading.recipes) : reading.llm,
  );
  const note = photos ? `${reader}, photo` : `${reader}, pasted text`;
  if (reading.recipes) {
    const url = source ? reading.recipe.source?.url : undefined;
    return finishBatch(
      ctx,
      reading.recipes,
      {
        ...options,
        url,
        ...from,
        where: what,
        leftOut: reading.leftOut,
        batchWarnings: reading.warnings.filter(
          (warning) => !reading.recipes![0].warnings.includes(warning),
        ),
        commitNote: `${note}, {n} of {total}`,
      },
      run,
    );
  }
  checkSinglePick(options, reading.recipe.name);
  return finishImport(
    ctx,
    reading,
    {
      ...options,
      url: reading.recipe.source?.url,
      ...from,
      refusal: (warnings) =>
        `The ${readerNoun(reading.llm?.api)}'s reading of ${what} is partial (${warnings.join("; ")}). `,
      commitNote: note,
    },
    run,
  );
}

/** A text import whose text is a photo's transcription (38e). */
export interface PhotoOrigin {
  /** How many photos were read. */
  count: number;
}

/**
 * The import's reading (38c, `readingCache.ts`): the one an earlier job
 * with the same reading key kept — a refusal's, or a dry run's — or `read`'s,
 * kept for the next when the model answered it. A reused reading says so,
 * in the log (`reading`) and in its warnings.
 */
async function keptReading(
  cache: ReadingCache<UrlImport> | undefined,
  run: JobRun | undefined,
  read: () => Promise<UrlImport>,
): Promise<UrlImport> {
  const { log } = jobContext(run);
  if (cache?.fresh) {
    /* 39a: `--fresh` — no kept reading is looked at; this one is kept. */
    log.info("reading", "fresh: any kept reading skipped — read again", {
      fresh: true,
    });
  }
  const kept = await cache?.load();
  if (kept) {
    const ageMs = Math.max(0, Date.now() - kept.savedAt);
    const minutes = Math.max(1, Math.round(ageMs / 60_000));
    const from = kept.job ? `job ${kept.job}` : "an earlier job";
    log.info(
      "reading",
      `the model's reading from ${from}, ${minutes} min ago, reused — not read again`,
      { cached: true, ageMs, ...(kept.job ? { from: kept.job } : {}) },
    );
    return {
      ...kept.value,
      warnings: [
        ...kept.value.warnings,
        `the ${readerNoun(kept.value.llm?.api)}'s reading from ${minutes} min ago (${from}) was reused, not read again`,
      ],
    };
  }
  const reading = await read();
  /*
   * Only what the model answered is worth keeping (a failed call is not),
   * and never a reading whose follow failed (38c review): a transient
   * 403 or timeout must be retried, not served stale from the cache.
   */
  if (cache && reading.llm && !reading.llm.error && !reading.followFailed) {
    await cache.save(reading);
  }
  return reading;
}

/**
 * One recipe write as a `write` step (D3): the slug it landed at and the
 * repository's HEAD after it — best effort (another writer may have
 * committed in between) and only in a job.
 */
function writeStep(
  ctx: CurationContext,
  slug: string | undefined,
  write: () => Promise<RecipeWriteResult>,
  run?: JobRun,
): Promise<RecipeWriteResult> {
  const { log } = jobContext(run);
  return log.step("write", slug ? { slug } : {}, async (step) => {
    const result = await write();
    step.set({
      slug: result.slug,
      ...(log.live ? { commit: await headSha(ctx.contentDirectory) } : {}),
    });
    return result;
  });
}

/**
 * The half of an import that does not care where the recipe came from: the
 * `partial` gate, the dry run (and its draft), or the create.
 */
async function finishImport(
  ctx: CurationContext,
  { recipe: imported, llm, warnings: llmWarnings }: UrlImport,
  {
    tags,
    slug,
    name,
    image,
    dryRun = false,
    overwrite = false,
    allowPartial = false,
    url,
    pastedText = false,
    photos,
    transcription,
    refusal,
    commitNote,
  }: ImportWriteOptions & {
    /** The page, or a pasted text's source URL. */
    url: string | undefined;
    pastedText?: boolean;
    /** A photo import (38e): how many photos, and — dry run — what they said. */
    photos?: number;
    transcription?: string;
    /** The refusal of a partial result, before the "dry-run it" advice. */
    refusal: (warnings: string[]) => string;
    commitNote?: string;
  },
  run?: JobRun,
): Promise<ImportResult> {
  const job = jobContext(run);
  const partial = imported.partial === true;
  if (partial && !dryRun && !allowPartial) {
    throw new ImportError(
      refusal(llmWarnings) +
        "Dry-run it to see them, or pass --allow-partial to create from them anyway.",
    );
  }
  const input = importedToInput(imported, { tags, slug, name, image });

  if (dryRun) {
    /*
     * Everything a real import would compute, and nothing written: no
     * `createContent`, so no data file, no index entry and no commit. The
     * recipe shown is the *shaped* one — parsed ingredients, the image's final
     * filename from a `HEAD` probe — because what the caller is deciding is
     * whether that is worth keeping.
     */
    const date = input.date ?? Date.now();
    const {
      data,
      image: probe,
      warnings,
    } = await buildRecipeWrite(input, {
      date,
      probe: true,
      probeImage: (imageUrl) =>
        pacedRequest(
          imageUrl,
          (retry) => probeImageFile(imageUrl, retry, job),
          undefined,
          job,
          { image: true },
        ),
    });
    return {
      dryRun: true,
      ...(url ? { url } : {}),
      ...(pastedText ? { pastedText: true as const } : {}),
      ...(photos ? { photos } : {}),
      ...(transcription ? { transcription } : {}),
      /*
       * `resolveCreateSlug`, imported rather than re-derived, so a dry run
       * cannot advertise a slug the real run would not use.
       */
      slug: resolveCreateSlug(input),
      ...(partial ? { partial: true as const } : {}),
      recipe: data,
      draft: {
        ...toDraft(imported),
        name: input.name,
        ...(slug ? { slug } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.imageImportUrl
          ? { imageImportUrl: input.imageImportUrl }
          : {}),
      },
      ...(imported.suggestedTags?.length
        ? { suggestedTags: imported.suggestedTags }
        : {}),
      ...(probe ? { image: probe } : {}),
      ...(data.video ? { video: data.video } : {}),
      ...(llm ? { llm } : {}),
      ...(llmWarnings.length + warnings.length > 0
        ? { warnings: [...llmWarnings, ...warnings] }
        : {}),
    };
  }

  const result = await writeStep(
    ctx,
    slug,
    () =>
      createRecipe(ctx, input, {
        overwrite,
        fetchImage: (imageUrl) =>
          pacedRequest(
            imageUrl,
            (retry) => fetchImageFile(imageUrl, { retry, job }),
            undefined,
            job,
            { image: true },
          ),
        ...(commitNote ? { commitNote } : {}),
      }),
    job,
  );
  const allWarnings = [...llmWarnings, ...(result.warnings ?? [])];
  return {
    ...result,
    ...(photos ? { photos } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(llm ? { llm } : {}),
    ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Several recipes in one video or paste (36e, D10)                    */
/* ------------------------------------------------------------------ */

/** A pick: a recipe's position in the model's list, or its name. */
export type RecipePick = number | string;

/** `pick` with `all` or `asOne`, or an empty `pick`: refused before any fetch. */
function checkPickOptions({ pick, all, asOne }: ImportWriteOptions): void {
  if (pick && all) {
    throw new UsageError('Give pick (--pick "Name") or all (--all), not both.');
  }
  if (asOne && (pick || all)) {
    throw new UsageError(
      "asOne (--as-one) reads the text as one recipe: it takes no pick or all.",
    );
  }
  if (pick && pick.length === 0) {
    throw new UsageError("pick names no recipes.");
  }
}

/** A name as picks compare it: case, punctuation and dashes folded. */
function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** One recipe found: `pick` can only name it (1, or its name). */
function checkSinglePick(
  { pick }: ImportWriteOptions,
  name: string | undefined,
): void {
  const off = (pick ?? []).filter((entry) =>
    typeof entry === "number"
      ? entry !== 1
      : !name || nameKey(entry) !== nameKey(name),
  );
  if (off.length > 0) {
    throw new ValidationError(
      `This import holds one recipe${name ? ` ("${name}")` : ""}: pick ${off.map((entry) => JSON.stringify(entry)).join(", ")} names none of it (leave pick out).`,
      [{ path: "pick", message: "one recipe found" }],
    );
  }
}

/** "youtube.com/watch?v=Z8J2HgaaSgQ": the source as a commit names it. */
export function shortSource(url: string): string {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get("v");
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}${v ? `?v=${v}` : ""}`;
  } catch {
    return url;
  }
}

function stepCount(recipe: Partial<ImportedRecipe>): number {
  return (recipe.instructions ?? []).reduce(
    (total, entry) =>
      total + ("instructions" in entry ? entry.instructions.length : 1),
    0,
  );
}

/** What a picker shows of one recipe found (36e). */
export function foundRecipe(reading: SplitReading): FoundRecipe {
  const { n, recipe, llm, chapter } = reading;
  return {
    n,
    name: recipe.name ?? `Recipe ${n}`,
    ingredients: (recipe.ingredients ?? []).filter(
      (entry) => entry.type !== "heading",
    ).length,
    steps: stepCount(recipe),
    ...(llm?.grounded !== undefined ? { grounded: llm.grounded } : {}),
    ...(llm?.total !== undefined ? { total: llm.total } : {}),
    ...(recipe.partial ? { partial: true as const } : {}),
    trusted: reading.trusted,
    ...(chapter ? { chapter } : {}),
  };
}

function foundList(found: readonly FoundRecipe[]): string {
  return found.map((recipe) => `${recipe.n}. ${recipe.name}`).join(", ");
}

/** The model a batch was read by (39a): its first reading's. */
function readingLlm(
  readings: readonly SplitReading[],
): LlmImportInfo | undefined {
  return readings.find((reading) => reading.llm)?.llm;
}

/** A batch of a page's own Recipe nodes (38c): no reading has `llm`. */
export function fromPage(readings: readonly SplitReading[]): boolean {
  return readings.length > 0 && readings.every((reading) => !reading.llm);
}

/**
 * The refusal of a several-recipe import with no pick (36e). Names first: a
 * position is the model's list's, and a re-read can list differently.
 */
export function severalRecipesMessage(
  found: readonly FoundRecipe[],
  where: string,
  /** A page's own Recipe nodes (38c), not the model's reading. */
  page = false,
  /** The model that found them (39a): "The Claude API found …". */
  api?: LlmImportInfo["api"],
): string {
  const example = found.find((recipe) => recipe.n > 1) ?? found[0];
  return (
    (page
      ? `The page ${where} has ${found.length} recipes: ${foundList(found)}. `
      : `The ${readerNoun(api)} found ${found.length} recipes in ${where}: ${foundList(found)}. `) +
    `Import them all with --all, or some by name: --pick "${example?.name ?? "Name"}" ` +
    "(`all` / `pick` over MCP and the API; positions like --pick 1,3 work too, but a re-read can number them differently); " +
    (page
      ? "--dry-run shows them all; --as-one imports the page's first recipe, as before."
      : "--dry-run shows them all; --as-one reads the text as one recipe.")
  );
}

/**
 * The readings `pick` names, in the list's order: a position (a gap left by
 * a recipe left out is refused, saying why) or a name, matched without case
 * or punctuation (and a slug, "green-bean-casserole", matches too). A name
 * not found this time is refused, listing what was.
 */
export function resolvePicks(
  picks: readonly RecipePick[],
  readings: readonly SplitReading[],
  leftOut: readonly { n: number; name: string; reason: string }[] = [],
): SplitReading[] {
  const found = readings.map(foundRecipe);
  const wanted = new Set<number>();
  for (const pick of picks) {
    if (typeof pick === "number") {
      if (readings.some((reading) => reading.n === pick)) {
        wanted.add(pick);
        continue;
      }
      const left = leftOut.find((entry) => entry.n === pick);
      throw new ValidationError(
        left
          ? `pick ${pick} ("${left.name}") was left out this time (${left.reason}). Found: ${foundList(found)}.`
          : `pick ${pick}: the ${readerNoun(readingLlm(readings)?.api)} found ${foundList(found)} — pick by name.`,
        [{ path: "pick", message: left ? "left out" : "no such position" }],
      );
    }
    const key = nameKey(pick);
    const match = readings.find(
      (reading) => nameKey(reading.recipe.name ?? "") === key,
    );
    if (match) {
      wanted.add(match.n);
      continue;
    }
    const left = leftOut.find((entry) => nameKey(entry.name) === key);
    throw new ValidationError(
      left
        ? `pick "${pick}" was left out this time (${left.reason}). Found: ${foundList(found)}.`
        : `pick "${pick}": no recipe of that name this time. Found: ${foundList(found)}.`,
      [{ path: "pick", message: left ? "left out" : "not found" }],
    );
  }
  return readings.filter((reading) => wanted.has(reading.n));
}

/** One recipe of a batch to import, as the seat or the form hands it over. */
export interface BatchPick {
  n: number;
  recipe: Partial<ImportedRecipe>;
  /** Its lines that name another recipe of the batch, by that one's `n`. */
  components?: ComponentRef[];
  chapter?: ChapterRef;
  llm?: LlmImportInfo;
  warnings?: string[];
  /** This recipe's own slug (the form's retry after a conflict). */
  slug?: string;
}

export interface BatchOptions extends Omit<
  ImportWriteOptions,
  "pick" | "all" | "asOne"
> {
  /** How many recipes the source held: "2 of 4" in each commit. */
  total: number;
  /**
   * The commit note, `{n}` and `{total}` filled in per recipe:
   * "local model, 2 of 4 from youtube.com/watch?v=…".
   */
  commitNote: string;
  /**
   * Every recipe the source held, picked or not, by name: a line naming one
   * that is not in this batch links to it when a recipe from the same source
   * already sits at its slug (an earlier `--pick` of the same video).
   */
  siblings?: { n: number; name?: string }[];
}

/** A source URL without the chapter start a recipe was given. */
function withoutStart(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("t");
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url;
  }
}

/** The recipe at `slug` came from `source` (chapter starts aside). */
async function sameSource(
  ctx: CurationContext,
  slug: string,
  source: string | undefined,
): Promise<boolean> {
  if (!source) return false;
  const existing = await getRecipe(ctx, slug).catch(() => undefined);
  return withoutStart(existing?.recipe.source?.url) === source;
}

/**
 * Import picked recipes of one source (36e), each its own commit: the seat's
 * `--all` / `--pick`, and the form's "Import selected".
 *
 * 1. **Plan** every pick before anything is written: a partial reading
 *    without `allowPartial`, or a slug taken twice in the batch, fails that
 *    pick; a slug already taken is `existing` when that recipe came from the
 *    same source (a re-run after a partial success imports only what is
 *    missing, as a roundup does), else a `slug_conflict` (unless
 *    `overwrite`). Nothing is suffixed.
 * 2. **Create** the recipes others link to first, then the rest — so a line
 *    naming another recipe links to it only once it is there: `imported`
 *    or `existing` in this batch, or an earlier pick of the same source at
 *    its slug. Anything else leaves the line as it is, with a warning.
 *
 * The shared picture (a video's thumbnail) is downloaded once, and probed
 * once in a dry run. One pick failing never fails the batch.
 */
export async function importBatchPicks(
  ctx: CurationContext,
  picks: readonly BatchPick[],
  {
    tags,
    slug,
    name,
    image,
    dryRun = false,
    overwrite = false,
    allowPartial = false,
    total,
    commitNote,
    siblings = [],
  }: BatchOptions,
  run?: JobRun,
): Promise<ImportBatchItem[]> {
  const job = jobContext(run);
  const { log } = job;
  const { linkLine } = await import("../llm/mergeReadings");
  const items = new Map<number, ImportBatchItem>();
  const planned = new Map<number, { slug: string; pick: BatchPick }>();
  const taken = new Set<string>();
  const baseOf = (pick: BatchPick): ImportBatchItem => ({
    n: pick.n,
    name: name ?? pick.recipe.name ?? `Recipe ${pick.n}`,
    status: "failed",
    ...(pick.chapter ? { chapter: pick.chapter } : {}),
    ...(pick.recipe.partial ? { partial: true as const } : {}),
    ...(pick.llm ? { llm: pick.llm } : {}),
    ...(pick.warnings?.length ? { warnings: pick.warnings } : {}),
  });
  const inputOf = (pick: BatchPick, recipe = pick.recipe) =>
    importedToInput(recipe, { tags, slug: pick.slug ?? slug, name, image });

  /* 1. Plan: the gate and the slug, nothing written. */
  for (const pick of picks) {
    try {
      if (pick.recipe.partial && !dryRun && !allowPartial) {
        throw new ImportError(
          `The ${readerNoun(pick.llm?.api)}'s reading of "${pick.recipe.name ?? pick.n}" is partial` +
            (pick.warnings?.length ? ` (${pick.warnings.join("; ")})` : "") +
            ". Dry-run it to see it, or pass --allow-partial to create it anyway.",
        );
      }
      const recipeSlug = resolveCreateSlug(inputOf(pick));
      if (taken.has(recipeSlug)) {
        throw new CurationError(
          "slug_conflict",
          `Another recipe of this import has the slug "${recipeSlug}" — import this one on its own with --pick "${pick.recipe.name}" --slug <another>.`,
          { slug: recipeSlug },
        );
      }
      taken.add(recipeSlug);
      if (!overwrite && (await slugIsTaken(ctx, recipeSlug))) {
        if (
          await sameSource(
            ctx,
            recipeSlug,
            withoutStart(pick.recipe.source?.url),
          )
        ) {
          items.set(pick.n, {
            ...baseOf(pick),
            status: "existing",
            slug: recipeSlug,
            warnings: [
              `already imported from this source as "${recipeSlug}" — skipped`,
            ],
          });
          continue;
        }
        if (!dryRun) {
          throw new CurationError(
            "slug_conflict",
            `A recipe already has the slug "${recipeSlug}" — import this one on its own with --pick "${pick.recipe.name}" --slug <another> (or --overwrite).`,
            { slug: recipeSlug },
          );
        }
      }
      planned.set(pick.n, { slug: recipeSlug, pick });
    } catch (error) {
      items.set(pick.n, {
        ...baseOf(pick),
        error: toErrorObject(error).error,
      });
    }
  }

  /* An earlier pick of the same source at a sibling's slug (T52). */
  const earlier = new Map<number, string | null>();
  const earlierSlug = async (n: number, source: string | undefined) => {
    if (!earlier.has(n)) {
      const sibling = siblings.find((entry) => entry.n === n);
      let found: string | null = null;
      if (sibling?.name && source) {
        const siblingSlug = resolveCreateSlug({
          name: sibling.name,
        } as RecipeInput);
        if (
          (await slugIsTaken(ctx, siblingSlug)) &&
          (await sameSource(ctx, siblingSlug, source))
        ) {
          found = siblingSlug;
        }
      }
      earlier.set(n, found);
    }
    return earlier.get(n) ?? undefined;
  };
  const nameOf = (n: number) =>
    picks.find((pick) => pick.n === n)?.recipe.name ??
    siblings.find((entry) => entry.n === n)?.name ??
    `recipe ${n}`;

  /* The shared picture, once per URL. */
  const probes = new Map<string, Promise<ImageProbe>>();
  const probeOnce = (imageUrl: string) => {
    if (!probes.has(imageUrl)) {
      probes.set(
        imageUrl,
        pacedRequest(
          imageUrl,
          (retry) => probeImageFile(imageUrl, retry, job),
          undefined,
          job,
          { image: true },
        ),
      );
    }
    return probes.get(imageUrl)!;
  };
  const files = new Map<string, Promise<File>>();
  const fetchOnce = (imageUrl: string) => {
    if (!files.has(imageUrl)) {
      files.set(
        imageUrl,
        pacedRequest(
          imageUrl,
          (retry) => fetchImageFile(imageUrl, { retry, job }),
          undefined,
          job,
          { image: true },
        ),
      );
    }
    return files.get(imageUrl)!;
  };

  /* 2. Create: what others link to first (L2), then the rest. */
  const targets = new Set(
    picks.flatMap((pick) => (pick.components ?? []).map((ref) => ref.target)),
  );
  const order = [...picks].sort(
    (a, b) => Number(!targets.has(a.n)) - Number(!targets.has(b.n)),
  );
  for (const pick of order) {
    const plan = planned.get(pick.n);
    if (!plan) continue;
    const base = baseOf(pick);
    const warnings = [...(base.warnings ?? [])];
    try {
      /* The links, to what is there now. */
      const ingredients = [...(pick.recipe.ingredients ?? [])];
      const source = withoutStart(pick.recipe.source?.url);
      for (const ref of pick.components ?? []) {
        const entry = ingredients[ref.line];
        if (!entry || entry.type === "heading") continue;
        const target = items.get(ref.target);
        const targetSlug =
          target &&
          (target.status === "imported" ||
            target.status === "existing" ||
            target.status === "would-import")
            ? target.slug
            : planned.has(ref.target) || target
              ? undefined
              : await earlierSlug(ref.target, source);
        if (!targetSlug) {
          warnings.push(
            `"${entry.ingredient.replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g, "$1")}" is not linked: "${nameOf(ref.target)}" ${
              target?.status === "failed"
                ? "was not imported"
                : planned.has(ref.target)
                  ? "is not imported yet"
                  : "is not imported — pick it too"
            }`,
          );
          continue;
        }
        ingredients[ref.line] = {
          ...entry,
          ingredient: linkLine(entry.ingredient, targetSlug),
        };
      }
      const recipe = { ...pick.recipe, ingredients };
      const input = inputOf(pick, recipe);
      if (dryRun) {
        const date = input.date ?? Date.now();
        const {
          data,
          image: probe,
          warnings: writeWarnings,
        } = await buildRecipeWrite(input, {
          date,
          probe: true,
          probeImage: probeOnce,
        });
        if (await slugIsTaken(ctx, plan.slug)) {
          writeWarnings.push(
            `a recipe already has the slug "${plan.slug}": a create would fail it (slug_conflict)`,
          );
        }
        const allWarnings = [...warnings, ...writeWarnings];
        items.set(pick.n, {
          ...base,
          status: "would-import",
          slug: plan.slug,
          recipe: data,
          draft: {
            ...toDraft(recipe),
            name: input.name,
            ...((pick.slug ?? slug) ? { slug: pick.slug ?? slug } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.imageImportUrl
              ? { imageImportUrl: input.imageImportUrl }
              : {}),
          },
          ...(probe ? { image: probe } : {}),
          ...(allWarnings.length
            ? { warnings: allWarnings }
            : { warnings: undefined }),
        });
        continue;
      }
      const imageUrl = input.imageImportUrl ?? undefined;
      let file: File | undefined;
      if (imageUrl) {
        try {
          file = await fetchOnce(imageUrl);
        } catch (error) {
          /* A cancel is the job's, not a picture to do without (T10). */
          if (job.signal?.aborted) throw error;
          const why = error instanceof Error ? error.message : String(error);
          log.warn("image", `skipped — ${why}`, { skipped: true });
          warnings.push(
            `Imported without its image (${why}) — set one later with recipe_set_image.`,
          );
        }
      }
      const result = await writeStep(
        ctx,
        plan.slug,
        () =>
          createRecipe(
            ctx,
            file ? input : { ...input, imageImportUrl: undefined },
            {
              overwrite,
              ...(file ? { fetchImage: async () => file } : {}),
              commitNote: commitNote
                .replace("{n}", String(pick.n))
                .replace("{total}", String(total)),
            },
          ),
        job,
      );
      warnings.push(...(result.warnings ?? []));
      items.set(pick.n, {
        ...base,
        status: "imported",
        slug: result.slug,
        path: result.path,
        url: result.url,
        ...(warnings.length ? { warnings } : { warnings: undefined }),
      });
    } catch (error) {
      /* A cancel ends the batch, not just this pick. */
      if (job.signal?.aborted) throw error;
      items.set(pick.n, {
        ...base,
        ...(warnings.length ? { warnings } : {}),
        error: toErrorObject(error).error,
      });
    }
  }
  return picks.map((pick) => {
    const item = items.get(pick.n)!;
    if (item.warnings === undefined) delete item.warnings;
    return item;
  });
}

/**
 * The seat's half of a several-recipe import (36e): which recipes `pick` /
 * `all` name — a dry run with neither shows them all, a create with neither
 * is refused with their names (`usage`) — then `importBatchPicks`.
 */
async function finishBatch(
  ctx: CurationContext,
  readings: SplitReading[],
  {
    pick,
    all,
    asOne: _asOne,
    url,
    pastedText = false,
    photos,
    transcription,
    where,
    suggestedTags,
    batchWarnings,
    leftOut = [],
    commitNote,
    ...options
  }: ImportWriteOptions & {
    url: string | undefined;
    pastedText?: boolean;
    /** A photo import (38e): how many photos, and — dry run — what they said. */
    photos?: number;
    transcription?: string;
    /** What the refusal calls the source, when not the URL ("the photo"). */
    where?: string;
    suggestedTags?: string[];
    batchWarnings: string[];
    leftOut?: { n: number; name: string; reason: string }[];
    commitNote: string;
  },
  run: JobRun = {},
): Promise<ImportBatchResult> {
  void _asOne;
  const found = readings.map(foundRecipe);
  let picked: SplitReading[];
  if (all) {
    picked = readings;
  } else if (pick) {
    picked = resolvePicks(pick, readings, leftOut);
  } else if (options.dryRun) {
    picked = readings;
  } else {
    throw new UsageError(
      severalRecipesMessage(
        found,
        where ?? (pastedText ? "the pasted text" : (url ?? "the text")),
        fromPage(readings),
        readingLlm(readings)?.api,
      ),
    );
  }
  /* The found-list warning says what was taken, once picks are made. */
  const said = (warnings: string[]) =>
    all
      ? pickedWarnings(warnings, "all")
      : pick
        ? pickedWarnings(
            warnings,
            picked.map((reading) => ({
              n: reading.n,
              name: reading.recipe.name,
            })),
          )
        : warnings;
  if ((options.slug || options.name) && picked.length > 1) {
    throw new UsageError(
      'slug and name are one recipe\'s: pick one recipe (--pick "Name") to give them.',
    );
  }
  const recipes = await importBatchPicks(
    ctx,
    picked.map((reading) => ({
      n: reading.n,
      recipe: reading.recipe,
      ...(reading.components ? { components: reading.components } : {}),
      ...(reading.chapter ? { chapter: reading.chapter } : {}),
      llm: reading.llm,
      warnings: reading.warnings,
    })),
    {
      ...options,
      total: readings.length + leftOut.length,
      commitNote,
      siblings: readings.map((reading) => ({
        n: reading.n,
        name: reading.recipe.name,
      })),
    },
    run,
  );
  return {
    batch: true,
    ...(options.dryRun ? { dryRun: true as const } : {}),
    ...(url ? { url } : {}),
    ...(pastedText ? { pastedText: true as const } : {}),
    ...(photos ? { photos } : {}),
    ...(transcription ? { transcription } : {}),
    found,
    ...(leftOut.length ? { leftOut } : {}),
    recipes,
    ...(suggestedTags?.length ? { suggestedTags } : {}),
    ...(batchWarnings.length ? { warnings: said(batchWarnings) } : {}),
  };
}
