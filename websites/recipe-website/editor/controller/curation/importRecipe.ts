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
  readPastedText,
  usedModel,
  videoFetchOptions,
  videoSource,
  type ApplyLlmResult,
  type LlmImportInfo,
  type LlmMode,
  type SplitReading,
} from "../llm/importWithLlm";
import type { ChapterRef } from "../llm/chapterTime";
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
  resolveCreateSlug,
  slugIsTaken,
  type RecipeWriteResult,
} from "./recipes";
import { RecipeInputSchema, parseInput, type RecipeInput } from "./schema";
import { pacedRequest } from "./sitePacing";

export interface ImportDryRunResult {
  dryRun: true;
  /** The page; for pasted text, its source URL when one was given. */
  url?: string;
  /** Read from pasted text by the local model (D8), not fetched. */
  pastedText?: true;
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

/** One recipe of a several-recipe import (36e). */
export interface ImportBatchItem {
  /** Its position among the recipes found, 1-based: what `pick` names. */
  n: number;
  name: string;
  /** `would-import` in a dry run; `failed` says why in `error`. */
  status: "would-import" | "imported" | "failed";
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
  batch: true;
  dryRun?: true;
  /** The video (or a pasted text's source). */
  url?: string;
  pastedText?: true;
  /** Every recipe the model found, in the text's order. */
  found: FoundRecipe[];
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
  { llm: mode }: { llm?: LlmMode } = {},
): Promise<UrlImport> {
  let applied: ApplyLlmResult;
  if (isVideoUrl(url)) {
    const result = await fetchYtdlpMetadata(url, videoFetchOptions(mode));
    applied =
      result.status === "success"
        ? await applyLlm({
            url,
            source: videoSource(result.metadata),
            mapped: ytdlpToRecipe(result.metadata, url),
            mode,
            /* 36e: one video, several recipes. */
            split: true,
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
    let page, parsed, mapped;
    try {
      /* On the per-site queue (34f), like every page and image fetch. */
      page = await pacedRequest(pageUrl, (retry) =>
        fetchRecipePage(pageUrl, retry),
      );
      parsed = parseRecipePage(page.html, pageUrl);
      /* Inside the try, as `importRecipeData` was: malformed JSON-LD is
       * `import_failed`, not `internal`. */
      mapped = mapRecipePage(pageUrl, parsed, { ok: page.ok });
    } catch (error) {
      throw new ImportError(
        `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    applied = await applyLlm({
      url: pageUrl,
      source: { html: page.html, ok: page.ok, meta: parsed.meta },
      mapped,
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
   * The model found several recipes (36e): import these, by position
   * (1-based). Without `pick` or `all` such an import is refused.
   */
  pick?: number[];
  /** The model found several recipes: import them all (36e). */
  all?: boolean;
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
): Promise<ImportResult> {
  checkPickOptions(options);
  const imported = await importFromUrl(url, { llm: mode });
  if (imported.recipes) {
    return finishBatch(ctx, imported.recipes, {
      ...options,
      url,
      suggestedTags: imported.recipe.suggestedTags,
      batchWarnings: imported.warnings.filter(
        (warning) => !imported.recipes![0].warnings.includes(warning),
      ),
      commitNote: `local model, {n} of {total} from ${shortSource(url)}`,
    });
  }
  checkSinglePick(options);
  return finishImport(ctx, imported, {
    ...options,
    url,
    refusal: (warnings) =>
      usedModel(imported.llm)
        ? `The local model's reading of ${url} is partial (${warnings.join("; ")}). `
        : `No schema.org Recipe found at ${url} — only its title, description and image` +
          (warnings.length ? ` (${warnings.join("; ")}). ` : ". "),
    commitNote: usedModel(imported.llm) ? "local model" : undefined,
  });
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
): Promise<ImportResult> {
  checkPickOptions(options);
  const reading = await readPastedText({ text, source });
  if (reading.recipes) {
    const url = source ? reading.recipe.source?.url : undefined;
    return finishBatch(ctx, reading.recipes, {
      ...options,
      url,
      pastedText: true,
      batchWarnings: reading.warnings.filter(
        (warning) => !reading.recipes![0].warnings.includes(warning),
      ),
      commitNote: `local model, pasted text, {n} of {total}`,
    });
  }
  checkSinglePick(options);
  return finishImport(ctx, reading, {
    ...options,
    url: reading.recipe.source?.url,
    pastedText: true,
    refusal: (warnings) =>
      `The local model's reading of the pasted text is partial (${warnings.join("; ")}). `,
    commitNote: "local model, pasted text",
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
    refusal,
    commitNote,
  }: ImportWriteOptions & {
    /** The page, or a pasted text's source URL. */
    url: string | undefined;
    pastedText?: boolean;
    /** The refusal of a partial result, before the "dry-run it" advice. */
    refusal: (warnings: string[]) => string;
    commitNote?: string;
  },
): Promise<ImportResult> {
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
        pacedRequest(imageUrl, (retry) => probeImageFile(imageUrl, retry)),
    });
    return {
      dryRun: true,
      ...(url ? { url } : {}),
      ...(pastedText ? { pastedText: true as const } : {}),
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
    ...(commitNote ? { commitNote } : {}),
  });
  const allWarnings = [...llmWarnings, ...(result.warnings ?? [])];
  return {
    ...result,
    ...(input.source ? { source: input.source } : {}),
    ...(llm ? { llm } : {}),
    ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Several recipes in one video or paste (36e, D10)                    */
/* ------------------------------------------------------------------ */

/** `pick` and `all` together, or an empty `pick`: refused before any fetch. */
function checkPickOptions({ pick, all }: ImportWriteOptions): void {
  if (pick && all) {
    throw new UsageError("Give pick (--pick 1,3) or all (--all), not both.");
  }
  if (pick && pick.length === 0) {
    throw new UsageError("pick names no recipes.");
  }
}

/** One recipe found: `pick` can only name it. */
function checkSinglePick({ pick }: ImportWriteOptions): void {
  if (pick?.some((n) => n !== 1)) {
    throw new ValidationError(
      `This import holds one recipe: pick ${pick.join(",")} names none of it (pick 1, or leave it out).`,
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
    ...(llm.grounded !== undefined ? { grounded: llm.grounded } : {}),
    ...(llm.total !== undefined ? { total: llm.total } : {}),
    ...(recipe.partial ? { partial: true as const } : {}),
    trusted: reading.trusted,
    ...(chapter ? { chapter } : {}),
  };
}

/** The refusal of a several-recipe import with no pick (36e). */
export function severalRecipesMessage(
  found: readonly FoundRecipe[],
  where: string,
): string {
  return (
    `The local model found ${found.length} recipes in ${where}: ` +
    found.map((recipe) => `${recipe.n}. ${recipe.name}`).join(", ") +
    ". Import them all with --all, or some with --pick 1,3 (`all` / `pick` over MCP and the API); --dry-run shows them all."
  );
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
}

export interface BatchOptions extends Omit<ImportWriteOptions, "pick" | "all"> {
  /** How many recipes the source held: "2 of 4" in each commit. */
  total: number;
  /**
   * The commit note, `{n}` and `{total}` filled in per recipe:
   * "local model, 2 of 4 from youtube.com/watch?v=…".
   */
  commitNote: string;
}

/**
 * Import picked recipes of one source (36e), each its own commit: the seat's
 * `--all` / `--pick`, and the form's "Import selected".
 *
 * Every pick is checked before anything is written — a partial reading
 * without `allowPartial`, a slug already taken (unless `overwrite`) or taken
 * twice in the batch fails that pick alone — so the links can be settled: an
 * ingredient line naming another recipe of the batch becomes a link to that
 * recipe's slug, and only when that recipe is being created too. The shared
 * picture (a video's thumbnail) is downloaded once, and probed once in a dry
 * run. One pick failing never fails the batch.
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
  }: BatchOptions,
): Promise<ImportBatchItem[]> {
  const { linkLine } = await import("../llm/splitRecipes");
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

  /* 1. Plan: the gate and the slug, nothing written. */
  for (const pick of picks) {
    try {
      if (pick.recipe.partial && !dryRun && !allowPartial) {
        throw new ImportError(
          `The local model's reading of "${pick.recipe.name ?? pick.n}" is partial` +
            (pick.warnings?.length ? ` (${pick.warnings.join("; ")})` : "") +
            ". Dry-run it to see it, or pass --allow-partial to create it anyway.",
        );
      }
      const recipeSlug = resolveCreateSlug(
        importedToInput(pick.recipe, { tags, slug, name, image }),
      );
      if (taken.has(recipeSlug)) {
        throw new CurationError(
          "slug_conflict",
          `Another recipe of this import has the slug "${recipeSlug}" — import this one on its own with --pick ${pick.n} --slug <another>.`,
          { slug: recipeSlug },
        );
      }
      if (!dryRun && !overwrite && (await slugIsTaken(ctx, recipeSlug))) {
        throw new CurationError(
          "slug_conflict",
          `A recipe already has the slug "${recipeSlug}" — import this one on its own with --pick ${pick.n} --slug <another> (or --overwrite).`,
          { slug: recipeSlug },
        );
      }
      taken.add(recipeSlug);
      planned.set(pick.n, { slug: recipeSlug, pick });
    } catch (error) {
      items.set(pick.n, {
        ...baseOf(pick),
        error: toErrorObject(error).error,
      });
    }
  }

  /* 2. Links: to a recipe of the batch that is being made too. */
  const linked = new Map<number, Partial<ImportedRecipe>>();
  for (const [n, { pick }] of planned) {
    const ingredients = [...(pick.recipe.ingredients ?? [])];
    for (const ref of pick.components ?? []) {
      const target = planned.get(ref.target);
      const entry = ingredients[ref.line];
      if (!target || !entry || entry.type === "heading") continue;
      ingredients[ref.line] = {
        ...entry,
        ingredient: linkLine(entry.ingredient, target.slug),
      };
    }
    linked.set(n, { ...pick.recipe, ingredients });
  }

  /* 3. The shared picture, once per URL. */
  const probes = new Map<string, Promise<ImageProbe>>();
  const probeOnce = (imageUrl: string) => {
    if (!probes.has(imageUrl)) {
      probes.set(
        imageUrl,
        pacedRequest(imageUrl, (retry) => probeImageFile(imageUrl, retry)),
      );
    }
    return probes.get(imageUrl)!;
  };
  const files = new Map<string, Promise<File>>();
  const fetchOnce = (imageUrl: string) => {
    if (!files.has(imageUrl)) {
      files.set(
        imageUrl,
        pacedRequest(imageUrl, (retry) => fetchImageFile(imageUrl, { retry })),
      );
    }
    return files.get(imageUrl)!;
  };

  /* 4. Each pick: a dry run, or its own commit. */
  for (const pick of picks) {
    const plan = planned.get(pick.n);
    if (!plan) continue;
    const recipe = linked.get(pick.n)!;
    const base = baseOf(pick);
    try {
      const input = importedToInput(recipe, { tags, slug, name, image });
      if (dryRun) {
        const date = input.date ?? Date.now();
        const {
          data,
          image: probe,
          warnings,
        } = await buildRecipeWrite(input, {
          date,
          probe: true,
          probeImage: probeOnce,
        });
        const allWarnings = [...(base.warnings ?? []), ...warnings];
        items.set(pick.n, {
          ...base,
          status: "would-import",
          slug: plan.slug,
          recipe: data,
          draft: {
            ...toDraft(recipe),
            name: input.name,
            ...(slug ? { slug } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.imageImportUrl
              ? { imageImportUrl: input.imageImportUrl }
              : {}),
          },
          ...(probe ? { image: probe } : {}),
          ...(allWarnings.length ? { warnings: allWarnings } : {}),
        });
        continue;
      }
      const warnings = [...(base.warnings ?? [])];
      const imageUrl = input.imageImportUrl ?? undefined;
      let file: File | undefined;
      if (imageUrl) {
        try {
          file = await fetchOnce(imageUrl);
        } catch (error) {
          warnings.push(
            `Imported without its image (${error instanceof Error ? error.message : String(error)}) — set one later with recipe_set_image.`,
          );
        }
      }
      const result = await createRecipe(
        ctx,
        file ? input : { ...input, imageImportUrl: undefined },
        {
          overwrite,
          ...(file ? { fetchImage: async () => file } : {}),
          commitNote: commitNote
            .replace("{n}", String(pick.n))
            .replace("{total}", String(total)),
        },
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
      items.set(pick.n, { ...base, error: toErrorObject(error).error });
    }
  }
  return picks.map((pick) => items.get(pick.n)!);
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
    url,
    pastedText = false,
    suggestedTags,
    batchWarnings,
    commitNote,
    ...options
  }: ImportWriteOptions & {
    url: string | undefined;
    pastedText?: boolean;
    suggestedTags?: string[];
    batchWarnings: string[];
    commitNote: string;
  },
): Promise<ImportBatchResult> {
  const found = readings.map(foundRecipe);
  let picked: SplitReading[];
  if (all) {
    picked = readings;
  } else if (pick) {
    const beyond = pick.filter((n) => n < 1 || n > readings.length);
    if (beyond.length > 0) {
      throw new ValidationError(
        `pick ${beyond.join(",")}: the local model found ${readings.length} recipes (` +
          found.map((recipe) => `${recipe.n}. ${recipe.name}`).join(", ") +
          ").",
        [{ path: "pick", message: `1 to ${readings.length}` }],
      );
    }
    const wanted = new Set(pick);
    picked = readings.filter((reading) => wanted.has(reading.n));
  } else if (options.dryRun) {
    picked = readings;
  } else {
    throw new UsageError(
      severalRecipesMessage(
        found,
        pastedText ? "the pasted text" : (url ?? "the text"),
      ),
    );
  }
  if ((options.slug || options.name) && picked.length > 1) {
    throw new UsageError(
      "slug and name are one recipe's: pick one recipe (--pick N) to give them.",
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
    { ...options, total: readings.length, commitNote },
  );
  return {
    batch: true,
    ...(options.dryRun ? { dryRun: true as const } : {}),
    ...(url ? { url } : {}),
    ...(pastedText ? { pastedText: true as const } : {}),
    found,
    recipes,
    ...(suggestedTags?.length ? { suggestedTags } : {}),
    ...(batchWarnings.length ? { warnings: batchWarnings } : {}),
  };
}
