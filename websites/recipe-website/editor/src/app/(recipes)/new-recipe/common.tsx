import {
  ImportedRecipe,
  importRecipeData,
  isVideoUrl,
} from "recipe-website-common/util/importRecipeData";
import { ytdlpToRecipe } from "recipe-editor/controller/ytdlp";
import { fetchYtdlpMetadata } from "./ytdlp";

export interface RecipeActionState {
  url?: string;
  message?: string;
  error?: Error;
  recipe?: Partial<ImportedRecipe>;
}

/**
 * The form's import: yt-dlp for a video host, the page importer otherwise.
 *
 * The video mapping is `ytdlpToRecipe`, the same one the curation layer uses
 * (26a), so a video imported here and one imported with `recipes import` carry
 * the same name, description, citation and thumbnail.
 */
export async function reduceRecipeImport(
  _state: RecipeActionState | null,
  url: string | null,
) {
  if (!url) {
    return { message: "No URL provided" };
  }
  try {
    if (typeof url === "string") {
      if (isVideoUrl(url)) {
        const result = await fetchYtdlpMetadata(url);
        if (result.status === "success") {
          return { url, recipe: ytdlpToRecipe(result.metadata, url) };
        }
        const message =
          result.status === "not-found"
            ? "yt-dlp binary was not found. Please check your settings."
            : `yt-dlp error: ${result.message}`;
        return {
          url,
          message,
          recipe: await importRecipeData(url),
        };
      }
      return { recipe: await importRecipeData(url), url };
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
