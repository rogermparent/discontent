import {
  ImportedRecipe,
  importRecipeData,
} from "recipe-website-common/util/importRecipeData";
import { fetchYtdlpMetadata } from "./ytdlp";

export interface RecipeActionState {
  url?: string;
  message?: string;
  error?: Error;
  recipe?: Partial<ImportedRecipe>;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname.includes("youtube.com") || hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

/**
 * The `*Imported from [url](url)*` line this used to open with is gone (D7):
 * the citation is carried by `source` instead, which the detail page renders
 * and the form can edit. What the prefix never covered — the channel and the
 * video's own description — still belongs here.
 */
function formatYouTubeDescription(
  description?: string,
  channel?: string,
): string | undefined {
  const segments: string[] = [];
  if (channel) {
    segments.push(`Channel: ${channel}`);
  }
  if (description) {
    segments.push(description);
  }
  if (segments.length === 0) {
    return undefined;
  }
  return segments.join("\n\n---\n\n");
}

export async function reduceRecipeImport(
  _state: RecipeActionState | null,
  url: string | null,
) {
  if (!url) {
    return { message: "No URL provided" };
  }
  try {
    if (typeof url === "string") {
      if (isYouTubeUrl(url)) {
        const result = await fetchYtdlpMetadata(url);
        if (result.status === "success") {
          const { metadata } = result;
          return {
            url,
            recipe: {
              name: metadata.title,
              description: formatYouTubeDescription(
                metadata.description,
                metadata.channel,
              ),
              source: {
                url,
                name: "YouTube",
                author: metadata.channel,
              },
              videoImportUrl: metadata.webpage_url,
              imageImportUrl: metadata.thumbnail,
            } as Partial<ImportedRecipe>,
          };
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
