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
 */
import {
  fetchRecipePage,
  importRecipeData,
  isVideoUrl,
  mapRecipePage,
  parseRecipePage,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";
import type {
  Recipe,
  RecipeSource,
} from "recipe-website-common/controller/types";
import type { ImageProbe } from "../imageImport";
import { fetchImageFile, probeImageFile } from "../imageImport";
import {
  applyLlm,
  usedModel,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
} from "../llm/importWithLlm";
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
import { pacedRequest } from "./sitePacing";

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
  source?: RecipeSource;
  /** The local model's part (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
}

export type ImportResult = ImportDryRunResult | ImportCreateResult;

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
  { llm: mode }: { llm?: LlmMode } = {},
): Promise<UrlImport> {
  let applied: ApplyLlmResult;
  if (isVideoUrl(url)) {
    const result = await fetchYtdlpMetadata(url);
    applied =
      result.status === "success"
        ? await applyLlm({
            url,
            source: videoSource(result.metadata),
            mapped: ytdlpToRecipe(result.metadata, url),
            mode,
          })
        : /* No text to read; `force` still says when there is no model. */
          await applyLlm({
            url,
            source: { text: "" },
            mapped: await importRecipeData(url),
            mode,
          });
  } else {
    /* The importer's own rule: no fragment in the fetch or the citation. */
    const pageUrl = url.split("#")[0];
    let page, parsed;
    try {
      /* On the per-site queue (34f), like every page and image fetch. */
      page = await pacedRequest(pageUrl, (retry) =>
        fetchRecipePage(pageUrl, retry),
      );
      parsed = parseRecipePage(page.html, pageUrl);
    } catch (error) {
      throw new ImportError(
        `Could not fetch ${pageUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    applied = await applyLlm({
      url: pageUrl,
      source: { html: page.html, ok: page.ok, meta: parsed.meta },
      mapped: mapRecipePage(pageUrl, parsed, { ok: page.ok }),
      mode,
    });
  }
  if (!applied.recipe) {
    throw new ImportError(
      [`No schema.org Recipe found at ${url}`, ...applied.warnings].join(" — "),
    );
  }
  return { ...applied, recipe: applied.recipe };
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
    llm: mode,
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
    /** The local model: `auto` (default), `force` or `off` (epic 36, D3). */
    llm?: LlmMode;
  } = {},
): Promise<ImportResult> {
  const {
    recipe: imported,
    llm,
    warnings: llmWarnings,
  } = await importFromUrl(url, { llm: mode });
  const partial = imported.partial === true;
  if (partial && !dryRun && !allowPartial) {
    throw new ImportError(
      (usedModel(llm)
        ? `The local model's reading of ${url} is partial (${llmWarnings.join("; ")}). `
        : `No schema.org Recipe found at ${url} — only its title, description and image` +
          (llmWarnings.length ? ` (${llmWarnings.join("; ")}). ` : ". ")) +
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
        pacedRequest(imageUrl, (retry) => probeImageFile(imageUrl, retry)),
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

  const result = await createRecipe(ctx, input, {
    overwrite,
    fetchImage: (imageUrl) =>
      pacedRequest(imageUrl, (retry) => fetchImageFile(imageUrl, { retry })),
    ...(usedModel(llm) ? { commitNote: "local model" } : {}),
  });
  const allWarnings = [...llmWarnings, ...(result.warnings ?? [])];
  return {
    ...result,
    ...(input.source ? { source: input.source } : {}),
    ...(llm ? { llm } : {}),
    ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
  };
}
