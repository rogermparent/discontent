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
  importRecipeData,
  isVideoUrl,
} from "recipe-website-common/util/importRecipeData";
import { fetchYtdlpMetadata, ytdlpToRecipe } from "./ytdlp";
import {
  applyLlm,
  readPastedText,
  videoFetchOptions,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
  type SplitReading,
} from "./llm/importWithLlm";
import { NO_LOG, type JobRun } from "./jobs/log";
import { fetchPageStep, parsePage } from "./jobs/steps";

/** A person is waiting on the form: a 403 is retried at once (epic 31, D3). */
const BROWSER_RETRY = { delayMs: 0 };

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
  /** The import's job (epic 37): its step log. */
  job?: string;
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
  { log = NO_LOG, signal }: JobRun = {},
): Promise<RecipeActionState> {
  if (!url) {
    return { message: "No URL provided" };
  }
  try {
    if (typeof url === "string") {
      if (isVideoUrl(url)) {
        const result = await fetchYtdlpMetadata(url, {
          ...videoFetchOptions(mode),
          log,
        });
        if (result.status === "success") {
          const state = withLlm(
            url,
            await applyLlm({
              url,
              source: videoSource(result.metadata),
              mapped: ytdlpToRecipe(result.metadata, url),
              mode,
              /* 36e: several recipes come back to a picker. */
              split: true,
              log,
              signal,
            }),
          );
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
            mapped: await importRecipeData(url, BROWSER_RETRY),
            mode,
            log,
            signal,
          }),
          message,
        );
      }
      const pageUrl = url.split("#")[0];
      /* Unpaced: a person is waiting (37b puts it on the site's queue). */
      const page = await fetchPageStep(log, pageUrl, BROWSER_RETRY);
      const { parsed, mapped } = await parsePage(log, pageUrl, page);
      return withLlm(
        url,
        await applyLlm({
          url: pageUrl,
          source: { html: page.html, ok: page.ok, meta: parsed.meta },
          mapped,
          mode,
          log,
          signal,
        }),
      );
    } else {
      return { message: "Invalid URL provided" };
    }
  } catch (e: unknown) {
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
  { log = NO_LOG, signal }: JobRun = {},
): Promise<RecipeActionState> {
  if (!text?.trim()) {
    return { message: "No text provided" };
  }
  try {
    const reading = await readPastedText({
      text,
      source: source || undefined,
      log,
      signal,
    });
    return {
      ...withLlm(reading.recipe.source?.url, reading),
      /* Unique per import, even two in one millisecond. */
      key: `text-${crypto.randomUUID()}`,
      pastedText: true,
    };
  } catch (e: unknown) {
    const message = typeof e === "string" ? e : (e as Error)?.message;
    return { message: message || "Unknown error occurred!" };
  }
}
