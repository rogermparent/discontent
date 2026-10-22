/**
 * Fill a stored recipe's gaps from its source (epic 45, 45b) — written
 * nowhere. The `fill` job's seat: the edit page's "Fill gaps from the
 * source" and `recipes fill <slug>` both run it.
 *
 * 1. The recipe's source link (or its video, `fillSourceUrl`) is imported
 *    as `import --dry-run` would read it — `importFromUrl`, the mode `auto`
 *    (a page with recipe data is not read by a model; a video's text is),
 *    as one recipe.
 * 2. `fillGaps` fills the stored recipe's empty fields from it (F1/F3).
 * 3. The times and yield still empty are estimated by the editor's model
 *    (`estimateTimes`, F4/F5) — unless asked not to, or there is nothing to
 *    estimate from. No model configured: the fill is the source's alone,
 *    and a warning says the estimate was skipped.
 *
 * The result is what the source offers (`source`, for the form to fill its
 * own current values from), the estimate, what filling the stored recipe
 * would change (`filled`, `estimated`) and that as a patch `recipes update`
 * takes. Nothing is written: the form's Save, or `update`, is the write.
 */
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { jobContext, type JobRun } from "../jobs/context";
import type { LlmImportInfo, LlmMode } from "../llm/importWithLlm";
import type { CurationContext } from "./context";
import { UsageError } from "./errors";
import {
  applyEstimate,
  estimateWanted,
  fillGaps,
  fillSourceUrl,
  type EstimateField,
  type EstimateValues,
  type FillField,
} from "./fillGaps";
import { importFromUrl } from "./importRecipe";
import { toDraft } from "./inspect";
import { getRecipe } from "./recipes";
import type { RecipePatch } from "./schema";

export interface FillOptions {
  /** Estimate the times and yield the source leaves out (default true). */
  estimate?: boolean;
  /** How the source is read (default `auto`, as an import's). */
  llm?: LlmMode;
}

/** The estimate a fill made (F4). */
export interface FillEstimate {
  /** The fields it filled on the stored recipe. */
  fields: EstimateField[];
  /** Every value it gave (the form applies them to its own empty fields). */
  values: EstimateValues;
  /** One sentence: how the model got there. */
  basis: string;
  /** Who estimated: "local model qwen3:8b", "the Claude API (…)". */
  model: string;
}

export interface FillResult {
  /** The job that ran it: `recipes jobs show <job>` has its steps. */
  job?: string;
  slug: string;
  /** The link that was read. */
  url: string;
  /**
   * What the source offers, as fields a fill may take — the form fills its
   * own current values from it (`fillGaps` again), so nothing typed before
   * the fill is lost. Its `suggestedTags` are the picker's to offer.
   */
  source: Partial<ImportedRecipe>;
  /** The stored recipe's fields the source fills. */
  filled: FillField[];
  /** The model's estimate, when one was made and passed. */
  estimated?: FillEstimate;
  /**
   * The same fill as a patch for `recipes update` (`RecipePatchSchema`):
   * plain ingredient lines, the picture as `imageImportUrl`.
   */
  patch: RecipePatch;
  /** The source's tags the recipe lacks: suggestions, never applied. */
  suggestedTags?: string[];
  /** The model's part in reading the source (epic 36), whenever it was asked. */
  llm?: LlmImportInfo;
  /** What the reading said, why the estimate was skipped or dropped. */
  warnings?: string[];
}

/** Only the fields a fill may take, from the importer's reading. */
function fillable(draft: Partial<ImportedRecipe>): Partial<ImportedRecipe> {
  const keep: (keyof ImportedRecipe)[] = [
    "description",
    "recipeYield",
    "prepTime",
    "cookTime",
    "totalTime",
    "ingredients",
    "instructions",
    "imageImportUrl",
    "images",
    "videoImportUrl",
    "drink",
    "suggestedTags",
  ];
  const out: Partial<ImportedRecipe> = {};
  for (const key of keep) {
    if (draft[key] !== undefined) {
      (out as Record<string, unknown>)[key] = draft[key];
    }
  }
  return out;
}

/** The fill as `recipes update` takes it: only what it would change. */
export function fillPatch(
  recipe: Partial<ImportedRecipe>,
  fields: readonly (FillField | EstimateField)[],
): RecipePatch {
  const wanted = new Set(fields);
  const draft = toDraft({
    ...(wanted.has("description") ? { description: recipe.description } : {}),
    ...(wanted.has("recipeYield") ? { recipeYield: recipe.recipeYield } : {}),
    ...(wanted.has("prepTime") ? { prepTime: recipe.prepTime } : {}),
    ...(wanted.has("cookTime") ? { cookTime: recipe.cookTime } : {}),
    ...(wanted.has("totalTime") ? { totalTime: recipe.totalTime } : {}),
    ...(wanted.has("ingredients") ? { ingredients: recipe.ingredients } : {}),
    ...(wanted.has("instructions")
      ? { instructions: recipe.instructions }
      : {}),
    ...(wanted.has("image") ? { imageImportUrl: recipe.imageImportUrl } : {}),
    ...(wanted.has("video") ? { videoImportUrl: recipe.videoImportUrl } : {}),
  });
  return {
    ...draft,
    ...(wanted.has("drink") && recipe.drink ? { drink: recipe.drink } : {}),
  } as RecipePatch;
}

/**
 * Read `slug`'s source and fill its gaps — written nowhere (see the module
 * note). `usage` when the recipe has no source link or video; the import's
 * own errors (`import_failed`: the page could not be fetched, or holds no
 * recipe) as they are.
 */
export async function fillRecipe(
  ctx: CurationContext,
  slug: string,
  { estimate = true, llm = "auto" }: FillOptions = {},
  run?: JobRun,
): Promise<FillResult> {
  const job = jobContext(run);
  const { log } = job;
  const { recipe: stored } = await getRecipe(ctx, slug);
  const url = fillSourceUrl(stored);
  if (!url) {
    throw new UsageError(
      `"${slug}" has no source link or video to fill from — add its source link first.`,
    );
  }
  const imported = await importFromUrl(url, { llm, asOne: true }, job);
  const source = fillable(imported.recipe);
  const warnings = [...imported.warnings];
  const { recipe: filledRecipe, filled } = fillGaps(stored, source);
  log.info(
    "fill",
    filled.length > 0
      ? `from the source: ${filled.join(", ")}`
      : "nothing new from the source",
    { filled },
  );

  let estimated: FillEstimate | undefined;
  let recipe = filledRecipe;
  const want = estimateWanted(filledRecipe);
  const hasBody =
    (filledRecipe.ingredients?.length ?? 0) > 0 ||
    (filledRecipe.instructions?.length ?? 0) > 0;
  if (estimate && want.length > 0) {
    if (!hasBody) {
      log.info(
        "llm.estimate",
        "no ingredients or steps — nothing to estimate from",
      );
      warnings.push(
        "The times and yield were not estimated: the recipe has no ingredients or steps to estimate from.",
      );
    } else {
      const { estimateTimes } = await import("../llm/estimateTimes");
      const result = await estimateTimes(filledRecipe, { want, job });
      warnings.push(...result.warnings);
      if (result.estimate) {
        const applied = applyEstimate(filledRecipe, result.estimate.values);
        recipe = applied.recipe;
        estimated = {
          fields: applied.estimated,
          values: result.estimate.values,
          basis: result.estimate.basis,
          model: result.estimate.model,
        };
      }
    }
  }

  return {
    slug,
    url,
    source,
    filled,
    ...(estimated ? { estimated } : {}),
    patch: fillPatch(recipe, [...filled, ...(estimated?.fields ?? [])]),
    ...(filledRecipe.suggestedTags?.length
      ? { suggestedTags: filledRecipe.suggestedTags }
      : {}),
    ...(imported.llm ? { llm: imported.llm } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
