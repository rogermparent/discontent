import {
  ImportedRecipe,
  fetchRecipePage,
  importRecipeData,
  isVideoUrl,
  mapRecipePage,
  parseRecipePage,
} from "recipe-website-common/util/importRecipeData";
import { ytdlpToRecipe } from "recipe-editor/controller/ytdlp";
import {
  applyLlm,
  readPastedText,
  videoFetchOptions,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
} from "recipe-editor/controller/llm/importWithLlm";
import { fetchYtdlpMetadata } from "./ytdlp";

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
}

function withLlm(
  url: string | undefined,
  { recipe, llm, warnings }: ApplyLlmResult,
  message?: string,
): RecipeActionState {
  return {
    ...(url ? { url } : {}),
    recipe,
    ...(message ? { message } : {}),
    ...(llm ? { llm } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * The form's import: yt-dlp for a video host, the page importer otherwise,
 * then the local model as `mode` says (epic 36, D3: `auto` unless the form's
 * "Extract with AI" box asked for `force`).
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
): Promise<RecipeActionState> {
  if (!url) {
    return { message: "No URL provided" };
  }
  try {
    if (typeof url === "string") {
      if (isVideoUrl(url)) {
        const result = await fetchYtdlpMetadata(url, videoFetchOptions(mode));
        if (result.status === "success") {
          return withLlm(
            url,
            await applyLlm({
              url,
              source: videoSource(result.metadata),
              mapped: ytdlpToRecipe(result.metadata, url),
              mode,
            }),
          );
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
          }),
          message,
        );
      }
      const pageUrl = url.split("#")[0];
      const page = await fetchRecipePage(pageUrl, BROWSER_RETRY);
      const parsed = parseRecipePage(page.html, pageUrl);
      return withLlm(
        url,
        await applyLlm({
          url: pageUrl,
          source: { html: page.html, ok: page.ok, meta: parsed.meta },
          mapped: mapRecipePage(pageUrl, parsed, { ok: page.ok }),
          mode,
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
 * The form's "Paste text" tab (36c, D8): the local model reads the pasted
 * recipe — `readPastedText`, the same reading as `recipes import --text` —
 * and fills the form as a URL import does. `source`, when given, is cited
 * (a video URL is also the video) and never fetched.
 */
export async function reduceTextImport(
  _state: RecipeActionState | null,
  text: string | null,
  source?: string | null,
): Promise<RecipeActionState> {
  if (!text?.trim()) {
    return { message: "No text provided" };
  }
  try {
    const reading = await readPastedText({
      text,
      source: source || undefined,
    });
    return {
      ...withLlm(reading.recipe.source?.url, reading),
      /* Unique per import, even two in one millisecond. */
      key: `text-${crypto.randomUUID()}`,
    };
  } catch (e: unknown) {
    const message = typeof e === "string" ? e : (e as Error)?.message;
    return { message: message || "Unknown error occurred!" };
  }
}
