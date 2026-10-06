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
 */
import {
  importRecipeData,
  isVideoUrl,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";
import type {
  Recipe,
  RecipeSource,
} from "recipe-website-common/controller/types";
import type { ImageProbe } from "../imageImport";
import { fetchYtdlpMetadata, ytdlpToRecipe } from "../ytdlp";
import type { CurationContext } from "./context";
import { ImportError, ValidationError } from "./errors";
import { toDraft, type RecipeDraft } from "./inspect";
import {
  buildRecipeWrite,
  createRecipe,
  resolveCreateSlug,
  type RecipeWriteResult,
} from "./recipes";
import { RecipeInputSchema, parseInput, type RecipeInput } from "./schema";

export interface ImportDryRunResult {
  dryRun: true;
  url: string;
  slug: string;
  /** The page had no Recipe node: name, description and image only. */
  partial?: true;
  recipe: Recipe;
  /**
   * The same import as a create-ready `RecipeInput` (26b): plain lines, no
   * markup, the image as a URL. Edit it and pass it to `create`.
   */
  draft: RecipeDraft;
  image?: ImageProbe;
  video?: string;
}

export interface ImportCreateResult extends RecipeWriteResult {
  source?: RecipeSource;
}

export type ImportResult = ImportDryRunResult | ImportCreateResult;

/**
 * A video page through yt-dlp, or `undefined` when yt-dlp is missing or fails
 * — the caller then falls back to the importer's bare link (and `--name`).
 */
async function importVideo(
  url: string,
): Promise<Partial<ImportedRecipe> | undefined> {
  const result = await fetchYtdlpMetadata(url);
  return result.status === "success"
    ? ytdlpToRecipe(result.metadata, url)
    : undefined;
}

/** The importer's own return, with "nothing here" turned into an error. */
export async function importFromUrl(
  url: string,
): Promise<Partial<ImportedRecipe>> {
  let imported;
  try {
    imported =
      (isVideoUrl(url) ? await importVideo(url) : undefined) ??
      (await importRecipeData(url));
  } catch (error) {
    throw new ImportError(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!imported) {
    throw new ImportError(`No schema.org Recipe found at ${url}`);
  }
  return imported;
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
      "The imported page carries no recipe name (a video host without yt-dlp never does) — pass --name to supply one.",
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

export async function importAndCreate(
  ctx: CurationContext,
  url: string,
  {
    tags,
    slug,
    name,
    image,
    dryRun = false,
    overwrite = false,
    allowPartial = false,
  }: {
    tags?: string[];
    slug?: string;
    name?: string;
    /** Use this image URL instead of the page's best one. */
    image?: string;
    dryRun?: boolean;
    overwrite?: boolean;
    /** Create from an SEO-only (no Recipe node) page anyway. */
    allowPartial?: boolean;
  } = {},
): Promise<ImportResult> {
  const imported = await importFromUrl(url);
  const partial = imported.partial === true;
  if (partial && !dryRun && !allowPartial) {
    throw new ImportError(
      `No schema.org Recipe found at ${url} — only its title, description and image. ` +
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
    const { data, image: probe } = await buildRecipeWrite(input, {
      date,
      probe: true,
    });
    return {
      dryRun: true,
      url,
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
      ...(probe ? { image: probe } : {}),
      ...(data.video ? { video: data.video } : {}),
    };
  }

  const result = await createRecipe(ctx, input, { overwrite });
  return { ...result, ...(input.source ? { source: input.source } : {}) };
}
