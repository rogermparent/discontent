/**
 * Look at a page before importing it, and get back a draft to edit (26b).
 *
 * 25e imported 104 recipes by dry-running `import` and hand-normalizing what
 * came back: the dry run shows the *stored* form, with `<Multiplyable>` markup
 * in every ingredient and an image filename where the URL was, and nothing of
 * the page beyond the mapped recipe. `inspect` returns the whole picture — the
 * mapped import, a create-ready `draft`, the raw Recipe node, the SEO
 * metadata, the ranked image candidates and, for a video host, yt-dlp's
 * metadata — and writes nothing.
 *
 * The tweak loop it serves: `inspect` (or `import --dry-run --out d.json`) →
 * edit the draft → `create --file d.json`.
 */
import {
  fetchRecipePage,
  isVideoUrl,
  mapRecipePage,
  parseRecipePage,
  type ImageCandidate,
  type ImportedRecipe,
  type JsonLdNode,
} from "recipe-website-common/util/importRecipeData";
import type { PageMeta } from "recipe-website-common/util/pageMetadata";
import {
  fetchYtdlpMetadata,
  ytdlpToRecipe,
  type YtdlpMetadata,
} from "../ytdlp";
import { ImportError } from "./errors";
import type { RecipeInput } from "./schema";

/** How much of the raw Recipe node `inspect` returns, serialized. */
export const JSON_LD_LIMIT = 20_000;

/** A create-ready recipe, short of what only the curator can add. */
export type RecipeDraft = Partial<RecipeInput>;

export interface InspectVideo {
  title: string;
  description: string;
  channel?: string;
  duration: number;
  uploadDate?: string;
  chapters: YtdlpMetadata["chapters"];
  thumbnails: YtdlpMetadata["thumbnails"];
  tags: string[];
  webpageUrl: string;
}

export interface InspectResult {
  url: string;
  finalUrl: string;
  /** The page's HTTP status; absent when only yt-dlp was asked. */
  status?: number;
  /** No Recipe node: the import and draft are the SEO fallback (26a/D3). */
  partial: boolean;
  /** What `import` maps the page to — the stored form's input. */
  recipe?: Partial<ImportedRecipe>;
  /** `recipe` as a `RecipeInput`: plain lines, no markup, best image. */
  draft?: RecipeDraft;
  /**
   * The page's category, cuisine, method and keywords as candidate tags
   * (26d). Never in `draft`: the curator picks them against `tag_list`.
   */
  suggestedTags?: string[];
  /** The raw Recipe node, cut at `JSON_LD_LIMIT` characters (then a string). */
  jsonLd?: JsonLdNode | string;
  meta?: PageMeta;
  images: ImageCandidate[];
  video?: InspectVideo;
  /** Why yt-dlp was not used for a video host, when it was tried and failed. */
  ytdlp?: string;
}

/** `<Multiplyable baseNumber="1 1/2" />` → `1 1/2`: the markup the form adds. */
export function stripMultiplyable(text: string): string {
  return text.replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g, "$1");
}

/**
 * The importer's mapped recipe as a `RecipeInput`.
 *
 * Ingredients become the plain strings a person would type — `toIngredients`
 * runs `createIngredient` on them again at create time, which re-adds the
 * multiplier markup and re-detects the headings the importer found the same
 * way. Instructions stay objects only where they carry a name; a group with no
 * name is flattened, since the schema's groups need one. `drink`, `tags` and
 * `slug` are the curator's to add.
 */
export function toDraft(imported: Partial<ImportedRecipe>): RecipeDraft {
  const draft: RecipeDraft = {};
  if (imported.name) draft.name = imported.name;
  if (imported.description) draft.description = imported.description;
  if (imported.recipeYield) draft.recipeYield = imported.recipeYield;
  for (const key of ["prepTime", "cookTime", "totalTime"] as const) {
    if (typeof imported[key] === "number") draft[key] = imported[key];
  }
  if (imported.ingredients?.length) {
    draft.ingredients = imported.ingredients.map((line) =>
      stripMultiplyable(line.ingredient),
    );
  }
  if (imported.instructions?.length) {
    draft.instructions = imported.instructions.flatMap(
      (entry): NonNullable<RecipeDraft["instructions"]> => {
        if ("instructions" in entry) {
          const steps = entry.instructions.map((step) =>
            step.name ? { name: step.name, text: step.text } : step.text,
          );
          if (entry.name) {
            return [
              {
                name: entry.name,
                instructions: entry.instructions.map((step) => ({
                  ...(step.name ? { name: step.name } : {}),
                  text: step.text,
                })),
              },
            ];
          }
          return steps;
        }
        return [
          entry.name ? { name: entry.name, text: entry.text } : entry.text,
        ];
      },
    );
  }
  if (imported.source) {
    const { url, name, author } = imported.source;
    draft.source = {
      url,
      ...(name ? { name } : {}),
      ...(author ? { author } : {}),
    };
  }
  if (imported.imageImportUrl) draft.imageImportUrl = imported.imageImportUrl;
  if (imported.videoImportUrl) draft.videoImportUrl = imported.videoImportUrl;
  return draft;
}

function truncateJsonLd(node: JsonLdNode | undefined) {
  if (!node) return undefined;
  const text = JSON.stringify(node);
  return text.length <= JSON_LD_LIMIT
    ? node
    : `${text.slice(0, JSON_LD_LIMIT)}… [truncated, ${text.length} characters]`;
}

function toVideo(meta: YtdlpMetadata): InspectVideo {
  return {
    title: meta.title,
    description: meta.description,
    ...(meta.channel || meta.uploader
      ? { channel: meta.channel || meta.uploader }
      : {}),
    duration: meta.duration,
    ...(meta.upload_date ? { uploadDate: meta.upload_date } : {}),
    chapters: meta.chapters,
    thumbnails: meta.thumbnails,
    tags: meta.tags,
    webpageUrl: meta.webpage_url,
  };
}

/**
 * Inspect `rawUrl`. Read-only: nothing is written, and the only requests are
 * the page fetch (or yt-dlp, for a video host).
 *
 * Throws `ImportError` only when the page cannot be fetched at all. A page
 * with no recipe — or one that answered 404 — is a result with no `recipe`
 * and no `draft`, because what the page *does* say is the useful part.
 */
export async function inspectUrl(rawUrl: string): Promise<InspectResult> {
  const url = rawUrl.split("#")[0];
  let ytdlpNote: string | undefined;

  if (isVideoUrl(url)) {
    const result = await fetchYtdlpMetadata(url);
    if (result.status === "success") {
      const recipe = ytdlpToRecipe(result.metadata, url);
      const thumbnails = [...result.metadata.thumbnails]
        .filter((thumb) => thumb.width && thumb.height)
        .sort((a, b) => b.width! * b.height! - a.width! * a.height!)
        .slice(0, 10)
        .map((thumb) => ({ ...thumb, from: "ytdlp" as const }));
      return {
        url,
        finalUrl: result.metadata.webpage_url || url,
        partial: false,
        recipe,
        draft: toDraft(recipe),
        images: recipe.imageImportUrl
          ? [
              { url: recipe.imageImportUrl, from: "ytdlp" as const },
              ...thumbnails.filter(
                (thumb) => thumb.url !== recipe.imageImportUrl,
              ),
            ].slice(0, 10)
          : thumbnails,
        video: toVideo(result.metadata),
      };
    }
    ytdlpNote =
      result.status === "not-found"
        ? "yt-dlp is not installed (set YTDLP_PATH or the Settings page's path); read the page instead."
        : `yt-dlp failed: ${result.message}`;
  }

  let page;
  try {
    page = await fetchRecipePage(url);
  } catch (error) {
    throw new ImportError(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = parseRecipePage(page.html, page.finalUrl);
  const recipe = mapRecipePage(url, parsed, { ok: page.ok });
  /* `images` and `suggestedTags` ride on the mapped recipe for the form; here
   * they are top-level. */
  const { images: _images, partial, suggestedTags, ...mapped } = recipe ?? {};
  void _images;

  return {
    url,
    finalUrl: page.finalUrl,
    status: page.status,
    partial: partial === true,
    ...(recipe ? { recipe: mapped, draft: toDraft(mapped) } : {}),
    ...(suggestedTags?.length ? { suggestedTags } : {}),
    ...(parsed.recipeNodes[0]
      ? { jsonLd: truncateJsonLd(parsed.recipeNodes[0]) }
      : {}),
    meta: parsed.meta,
    images: parsed.images.slice(0, 10),
    ...(ytdlpNote ? { ytdlp: ytdlpNote } : {}),
  };
}
