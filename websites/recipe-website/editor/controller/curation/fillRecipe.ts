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
 * 4. The model reads what each step brings in (47g, `suggestUses`) — the
 *    Claude API by default, a local model only when opted in — unless asked
 *    not to, or the recipe has no ingredient lines or steps. Its answer is
 *    numbers, checked, and never applied by itself: a step that already
 *    stores a `uses` is left alone unless `usesAll`.
 *
 * The result is what the source offers (`source`, for the form to fill its
 * own current values from), the estimate, the steps' answers (`uses`), what
 * filling the stored recipe would change (`filled`, `estimated`,
 * `uses.steps`) and that as a patch `recipes update` takes. Nothing is written: the form's Save, or `update`, is the write.
 */
import type { InstructionEntry } from "recipe-website-common/controller/types";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import {
  usesChanges,
  type StepUsesAnswer,
} from "recipe-website-common/util/usesSuggestions";
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
  /**
   * Ask the model what each step uses (47g). Unset: the Claude API is
   * asked, a local model only when `RECIPE_LLM_USES` says so
   * (`usesModelAsked`). `true`: whatever model is configured is asked.
   * `false`: none is.
   */
  uses?: boolean;
  /**
   * Suggest for the steps that already store a `uses` as well (default
   * false: a stored list is a person's, and is left alone).
   */
  usesAll?: boolean;
}

/** What the model read each step as using (47g). */
export interface FillUses {
  /** Who read them: "local model qwen3:8b", "the Claude API (…)". */
  model: string;
  /**
   * Every step's checked answer, the ones the page already shows included:
   * the form offers those that differ from what it holds.
   */
  answers: StepUsesAnswer[];
  /** The numbers of the steps the patch gives a `uses`, in reading order. */
  steps: number[];
  /**
   * Those of `steps` whose stored list the patch replaces (`usesAll`,
   * `--all-uses`): `recipes fill` marks them so. Absent when none.
   */
  replaced?: number[];
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
  /** The model's reading of what each step uses, when it gave one (47g). */
  uses?: FillUses;
  /**
   * The local model that was not asked what each step uses (47g Dg2), by
   * its label ("local model qwen3:8b"): `recipes fill` says so and how to
   * ask it. Absent when a model was asked, or there was none, or nothing to
   * read.
   */
  usesNotAsked?: string;
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
 * Steps as a write takes them (`InstructionInputSchema`), every field kept —
 * a step's `uses`, a group's `choice`, yield and times — where `toDraft`
 * keeps the name and the text only. A group stays a group whatever its
 * name: the schema takes an empty one, and a stored recipe's shape is not
 * this patch's to change (`toDraft` flattens an import's unnamed group).
 */
export function patchInstructions(
  instructions: readonly InstructionEntry[],
): NonNullable<RecipePatch["instructions"]> {
  const object = (one: { name?: string; text: string; uses?: string[] }) => ({
    ...(one.name ? { name: one.name } : {}),
    text: one.text,
    ...(Array.isArray(one.uses) ? { uses: [...one.uses] } : {}),
  });
  const step = (one: { name?: string; text: string; uses?: string[] }) =>
    one.name || Array.isArray(one.uses) ? object(one) : one.text;
  return instructions.flatMap(
    (entry): NonNullable<RecipePatch["instructions"]> => {
      if (!("instructions" in entry)) return [step(entry)];
      return [
        {
          name: entry.name ?? "",
          instructions: entry.instructions.map(object),
          ...(entry.choice ? { choice: entry.choice } : {}),
          ...(entry.recipeYield ? { recipeYield: entry.recipeYield } : {}),
          ...(entry.prepTime ? { prepTime: entry.prepTime } : {}),
          ...(entry.cookTime ? { cookTime: entry.cookTime } : {}),
          ...(entry.totalTime ? { totalTime: entry.totalTime } : {}),
        },
      ];
    },
  );
}

/** What `fillUses` answers: the reading, its patch, and what to say. */
export interface FillUsesResult {
  uses?: FillUses;
  /** `instructions` with the new lists, when any step changes. */
  patch: Pick<RecipePatch, "instructions">;
  warnings: string[];
  notAsked?: string;
}

type SuggestUses = (typeof import("../llm/suggestUses"))["suggestUses"];

/**
 * The fill's uses part (47g), whole: the model's reading, what it changes
 * and that as a patch. Nothing in it can fail the fill — a throw anywhere
 * (the call, the settling, the patch) is a warning, and the source's fill
 * and the estimate stand. Only a cancel is rethrown.
 */
export async function fillUses(
  recipe: Partial<ImportedRecipe>,
  {
    force = false,
    usesAll = false,
    job: run,
    suggest,
  }: {
    /** Ask whatever model is configured (`--uses`). */
    force?: boolean;
    usesAll?: boolean;
    job?: JobRun;
    /** `suggestUses`, or a stand-in for it in a test. */
    suggest?: SuggestUses;
  } = {},
): Promise<FillUsesResult> {
  const job = jobContext(run);
  const warnings: string[] = [];
  try {
    const ask = suggest ?? (await import("../llm/suggestUses")).suggestUses;
    const read = await ask(recipe, { job, force });
    warnings.push(...read.warnings);
    if (!read.model || read.answers.length === 0) {
      return {
        patch: {},
        warnings,
        ...(read.notAsked ? { notAsked: read.notAsked } : {}),
      };
    }
    const changes = usesChanges(
      recipe.ingredients ?? [],
      recipe.instructions ?? [],
      read.answers,
      { all: usesAll },
    );
    const instructions = recipe.instructions ?? [];
    const replaced = changes.changed
      .filter((answer) => {
        const at = instructions[answer.entry];
        const step =
          at && "instructions" in at ? at.instructions?.[answer.step] : at;
        return Array.isArray(step?.uses);
      })
      .map((answer) => answer.number);
    return {
      uses: {
        model: read.model,
        answers: read.answers,
        steps: changes.changed.map((answer) => answer.number),
        ...(replaced.length > 0 ? { replaced } : {}),
      },
      patch:
        changes.changed.length > 0
          ? { instructions: patchInstructions(changes.instructions) }
          : {},
      warnings,
    };
  } catch (error) {
    if (job.signal?.aborted) throw error;
    const why = error instanceof Error ? error.message : String(error);
    return {
      patch: {},
      warnings: [...warnings, `What each step uses was not suggested: ${why}.`],
    };
  }
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
  {
    estimate = true,
    llm = "auto",
    uses: askUses,
    usesAll = false,
  }: FillOptions = {},
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
        warnings.push(...applied.warnings);
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

  /* 47g: what each step brings in, read by the model — over the recipe as
   * filled, so steps the source just gave are read too. */
  const read =
    askUses === false
      ? undefined
      : await fillUses(recipe, { force: askUses === true, usesAll, job });
  warnings.push(...(read?.warnings ?? []));
  const uses = read?.uses;
  const usesPatch = read?.patch ?? {};
  if (uses) {
    log.info(
      "fill",
      uses.steps.length > 0
        ? `uses suggested for step${uses.steps.length === 1 ? "" : "s"} ${uses.steps.join(", ")}`
        : "the model's reading of what each step uses is what the page shows",
      { uses: uses.steps },
    );
  }

  return {
    slug,
    url,
    source,
    filled,
    ...(estimated ? { estimated } : {}),
    ...(uses ? { uses } : {}),
    ...(read?.notAsked ? { usesNotAsked: read.notAsked } : {}),
    patch: {
      ...fillPatch(recipe, [...filled, ...(estimated?.fields ?? [])]),
      ...usesPatch,
    },
    ...(filledRecipe.suggestedTags?.length
      ? { suggestedTags: filledRecipe.suggestedTags }
      : {}),
    ...(imported.llm ? { llm: imported.llm } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
