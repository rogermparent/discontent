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
 *
 * Since 36b the local model (`applyLlm`, epic 36 D3) reads a page with no
 * Recipe node — or every page, under `force` — and the draft is its reading;
 * `llm` says how much of it was found on the page.
 *
 * Since 36e a video can hold several recipes: `recipes` lists each with its
 * own draft, and `recipe` / `draft` stay the first one's, so a caller that
 * reads only `draft` still gets a recipe — and a warning that says there
 * are more.
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
  applyLlm,
  videoFetchOptions,
  videoSource,
  type LlmImportInfo,
  type LlmMode,
  type SplitReading,
} from "../llm/importWithLlm";
import type { ChapterRef } from "../llm/chapterTime";
import {
  fetchYtdlpMetadata,
  ytdlpToRecipe,
  type YtdlpMetadata,
} from "../ytdlp";
import { ImportError } from "./errors";
import { pacedRequest } from "./sitePacing";
import { resolveCreateSlug } from "./recipes";
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
  /** The local model's part (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
  /** What the local model did, or why it was not used (epic 36). */
  warnings?: string[];
  /**
   * The video holds several recipes (36e): each with its own draft, in the
   * text's order. `recipe` and `draft` above are the first one's.
   */
  recipes?: InspectRecipe[];
}

/** One recipe of several in a video (36e). */
export interface InspectRecipe {
  /** 1-based: what `recipe_import`'s `pick` names. */
  n: number;
  name: string;
  /** The video chapter it is made in; the draft's source starts there. */
  chapter?: ChapterRef;
  /** The model's reading is not trusted (D4): check it before creating. */
  partial?: true;
  /** The slug a create would use — what the other drafts link to. */
  slug: string;
  recipe: Partial<ImportedRecipe>;
  /**
   * Create-ready; a line naming another recipe of the video links to that
   * one's `slug` ("[Crispy fried shallots …](/recipe/fried-shallots)").
   */
  draft: RecipeDraft;
  llm: LlmImportInfo;
  warnings?: string[];
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
export async function inspectUrl(
  rawUrl: string,
  { llm: mode }: { llm?: LlmMode } = {},
): Promise<InspectResult> {
  const url = rawUrl.split("#")[0];
  let ytdlpNote: string | undefined;

  if (isVideoUrl(url)) {
    const result = await fetchYtdlpMetadata(url, videoFetchOptions(mode));
    if (result.status === "success") {
      const applied = await applyLlm({
        url,
        source: videoSource(result.metadata),
        mapped: ytdlpToRecipe(result.metadata, url),
        mode,
        /* 36e: one video, several recipes. */
        split: true,
      });
      /* `ytdlpToRecipe` always names the video, so a recipe comes back. The
       * video's tags (36d) are top-level here, as a page's keywords are. */
      const { suggestedTags, ...recipe } = applied.recipe!;
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
        ...(suggestedTags?.length ? { suggestedTags } : {}),
        video: toVideo(result.metadata),
        ...llmFields(applied),
        ...(applied.recipes
          ? { recipes: await inspectRecipes(applied.recipes) }
          : {}),
      };
    }
    ytdlpNote =
      result.status === "not-found"
        ? "yt-dlp is not installed (set YTDLP_PATH or the Settings page's path); read the page instead."
        : `yt-dlp failed: ${result.message}`;
  }

  let page;
  try {
    /* On the per-site queue (34f): polite after a roundup call, too. */
    page = await pacedRequest(
      url,
      (retry) => fetchRecipePage(url, retry),
      (fetched) => fetched.finalUrl,
    );
  } catch (error) {
    throw new ImportError(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = parseRecipePage(page.html, page.finalUrl);
  const applied = await applyLlm({
    url,
    source: { html: page.html, ok: page.ok, meta: parsed.meta },
    mapped: mapRecipePage(url, parsed, { ok: page.ok }),
    mode,
  });
  const recipe = applied.recipe;
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
    ...llmFields(applied),
  };
}

function llmFields({
  llm,
  warnings,
}: {
  llm?: LlmImportInfo;
  warnings: string[];
}): Pick<InspectResult, "llm" | "warnings"> {
  return {
    ...(llm ? { llm } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * Each recipe of a several-recipe video as `inspect` shows it (36e): its own
 * draft, with a line naming another recipe of the video linked to the slug
 * that one would be created at — the batch import links the same lines, to
 * the slugs it actually used.
 */
async function inspectRecipes(
  readings: readonly SplitReading[],
): Promise<InspectRecipe[]> {
  const { linkLine } = await import("../llm/splitRecipes");
  const slugs = new Map(
    readings.map((reading) => [
      reading.n,
      resolveCreateSlug({
        name: reading.recipe.name ?? `recipe-${reading.n}`,
      } as RecipeInput),
    ]),
  );
  return readings.map((reading) => {
    const { suggestedTags: _tags, images: _images, ...recipe } = reading.recipe;
    void _tags;
    void _images;
    const draft = toDraft(recipe);
    for (const ref of reading.components ?? []) {
      const target = slugs.get(ref.target);
      const line = draft.ingredients?.[ref.line];
      if (target && typeof line === "string") {
        draft.ingredients![ref.line] = linkLine(line, target);
      }
    }
    return {
      n: reading.n,
      name: reading.recipe.name ?? `Recipe ${reading.n}`,
      ...(reading.chapter ? { chapter: reading.chapter } : {}),
      ...(reading.recipe.partial ? { partial: true as const } : {}),
      slug: slugs.get(reading.n)!,
      recipe,
      draft,
      llm: reading.llm,
      ...(reading.warnings.length ? { warnings: reading.warnings } : {}),
    };
  });
}
