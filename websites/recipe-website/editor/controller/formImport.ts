/**
 * The `/new-recipe` form's import (moved here from `new-recipe/common.tsx`
 * in epic 37, so the job registry — which the CLI loads too — can run it as
 * the `form-url` / `form-text` job kinds; `common.tsx` re-exports it).
 *
 * It fills the form and writes nothing: yt-dlp for a video host, the page
 * importer otherwise, then the local model as the mode says (epic 36), with
 * the steps logged to the job (37a) when there is one.
 */
import {
  ImportedRecipe,
  isVideoUrl,
  mapRecipeNodes,
} from "recipe-website-common/util/importRecipeData";
import { fetchYtdlpMetadata, ytdlpToRecipe } from "./ytdlp";
import {
  applyLlm,
  readPastedText,
  schemaReadings,
  videoFetchOptions,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
  type SplitReading,
} from "./llm/importWithLlm";
import { pacedRequest } from "./curation/sitePacing";
import { jobContext, type JobRun } from "./jobs/context";
import { fetchPageStep, parsePage, videoLinkStep } from "./jobs/steps";

export interface RecipeActionState {
  url?: string;
  /**
   * Remounts the recipe form on each import: a pasted text has no URL to do
   * it with (36c).
   */
  key?: string;
  message?: string;
  error?: Error;
  recipe?: Partial<ImportedRecipe>;
  /** The local model's part (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
  /** What the local model did, or why it was not used. */
  warnings?: string[];
  /**
   * The model found several recipes in a video or a paste (36e): the form
   * shows a picker instead of filling itself, and `recipe` is unused.
   */
  recipes?: SplitReading[];
  /** A several-recipe video's title: "Import as one recipe" names it so. */
  batchTitle?: string;
  /** Listed but left out of `recipes` (36e): counted in "2 of 4". */
  leftOut?: { n: number; name: string; reason: string }[];
  /** Read from pasted text (36c): the picker says "This text". */
  pastedText?: boolean;
  /**
   * The batch is a page's own Recipe nodes (38c), read by no model: the
   * picker says "This page", and the commits do not say "local model".
   */
  fromPage?: boolean;
  /** The import's job (epic 37): its step log. */
  job?: string;
}

/** A batch of a page's own Recipe nodes (38c): no reading has `llm`. */
function fromPageBatch(readings: readonly SplitReading[]): boolean {
  return readings.length > 0 && readings.every((reading) => !reading.llm);
}

function withLlm(
  url: string | undefined,
  { recipe, llm, warnings, recipes, leftOut }: ApplyLlmResult,
  message?: string,
): RecipeActionState {
  return {
    ...(url ? { url } : {}),
    recipe,
    ...(message ? { message } : {}),
    ...(llm ? { llm } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    /* A batch remounts its picker on every import, even of the same URL. */
    ...(recipes && recipes.length > 1
      ? {
          recipes,
          key: `batch-${crypto.randomUUID()}`,
          ...(leftOut?.length ? { leftOut } : {}),
        }
      : {}),
  };
}

/**
 * The form's import: yt-dlp for a video host, the page importer otherwise,
 * then the local model as `mode` says (epic 36, D3: `auto` unless the form's
 * "Re-read with AI even if the page has recipe data" box asked for `force`).
 *
 * The video mapping is `ytdlpToRecipe`, the same one the curation layer uses
 * (26a), so a video imported here and one imported with `recipes import` carry
 * the same name, description, citation and thumbnail; the page goes through
 * the importer's own `fetchRecipePage` → `parseRecipePage` → `mapRecipePage`,
 * which `importRecipeData` is, because the model needs the HTML. A video
 * fetch asks yt-dlp for the pinned comment too when a model will read it
 * (`videoFetchOptions`, 36d).
 */
export async function reduceRecipeImport(
  _state: RecipeActionState | null,
  url: string | null,
  mode?: LlmMode,
  run?: JobRun,
): Promise<RecipeActionState> {
  const job = jobContext(run);
  if (!url) {
    return { message: "No URL provided" };
  }
  try {
    if (typeof url === "string") {
      if (isVideoUrl(url)) {
        const result = await fetchYtdlpMetadata(url, {
          ...videoFetchOptions(mode),
          job,
        });
        if (result.status === "success") {
          const applied = await applyLlm({
            url,
            source: videoSource(result.metadata),
            mapped: ytdlpToRecipe(result.metadata, url),
            mode,
            /* 36e: several recipes come back to a picker. */
            split: true,
            job,
          });
          /* 38c: no recipe in the description, one recipe link — follow it. */
          const { followRecipeLink } = await import("./curation/videoFollow");
          const followed = await followRecipeLink({
            url,
            metadata: result.metadata,
            applied,
            mode,
            job,
          });
          const state = withLlm(url, followed ?? applied);
          if (followed?.recipes && fromPageBatch(followed.recipes)) {
            return { ...state, fromPage: true };
          }
          return state.recipes && result.metadata.title
            ? { ...state, batchTitle: result.metadata.title }
            : state;
        }
        const message =
          result.status === "not-found"
            ? "yt-dlp binary was not found. Please check your settings."
            : `yt-dlp error: ${result.message}`;
        return withLlm(
          url,
          await applyLlm({
            url,
            source: { text: "" },
            /* The bare link, as a `parse` step: a video URL is not fetched. */
            mapped: await videoLinkStep(url, job),
            mode,
            job,
          }),
          message,
        );
      }
      const pageUrl = url.split("#")[0];
      /*
       * On the site's queue (37b), like every other page fetch: the polite
       * gap holds across processes, and a 403's one retry waits it too
       * (30-D5 over 31-D3's retry at once).
       */
      const page = await pacedRequest(
        pageUrl,
        (retry) => fetchPageStep(pageUrl, retry, job),
        (fetched) => fetched.finalUrl,
        job,
      );
      const { parsed, mapped } = await parsePage(pageUrl, page, { job });
      /* 38c: a page with several recipes of its own goes to the picker. */
      const several = mapRecipeNodes(pageUrl, parsed, { ok: page.ok });
      if (several) {
        return {
          ...withLlm(url, schemaReadings(several, { mode, job })),
          fromPage: true,
        };
      }
      return withLlm(
        url,
        await applyLlm({
          url: pageUrl,
          source: { html: page.html, ok: page.ok, meta: parsed.meta },
          mapped,
          mode,
          job,
        }),
      );
    } else {
      return { message: "Invalid URL provided" };
    }
  } catch (e: unknown) {
    /* A cancel is the job's to record (37b/37c), not a form message. */
    if (job.signal?.aborted) throw e;
    const message = typeof e === "string" ? e : (e as Error)?.message;
    if (message) {
      return { message };
    }
    return { message: "Unknown error occurred!" };
  }
}

/**
 * The form's pasted-text mode (36c, D8; since 36d the "No link? Paste the
 * recipe text instead" fallback): the local model reads the pasted
 * recipe — `readPastedText`, the same reading as `recipes import --text` —
 * and fills the form as a URL import does. `source`, when given, is cited
 * (a video URL is also the video) and never fetched.
 */
export async function reduceTextImport(
  _state: RecipeActionState | null,
  text: string | null,
  source?: string | null,
  run?: JobRun,
): Promise<RecipeActionState> {
  const job = jobContext(run);
  if (!text?.trim()) {
    return { message: "No text provided" };
  }
  try {
    const reading = await readPastedText({
      text,
      source: source || undefined,
      job,
    });
    return {
      ...withLlm(reading.recipe.source?.url, reading),
      /* Unique per import, even two in one millisecond. */
      key: `text-${crypto.randomUUID()}`,
      pastedText: true,
    };
  } catch (e: unknown) {
    if (job.signal?.aborted) throw e;
    const message = typeof e === "string" ? e : (e as Error)?.message;
    return { message: message || "Unknown error occurred!" };
  }
}
