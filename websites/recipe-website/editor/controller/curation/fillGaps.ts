/**
 * Fill a recipe's gaps from its source (epic 45, 45b): the merge, pure and
 * browser-safe — the fill job runs it over the stored recipe (`fillRecipe`,
 * the CLI's patch), and the edit form runs it again over what the form holds
 * when the job ends, so nothing typed before the fill is lost.
 *
 * The rules are epic 45's F1 and F3: a field is filled only when it is empty
 * — `0` or absent for a time, `""` after trim for a string, `[]` or absent
 * for a list, absent for the image, the video and the drink spec — and never
 * from an empty value. `name` and `slug` are never filled, and tags are never
 * added: the source's tags become the picker's import suggestions (43e2,
 * never applied by themselves). Where `mergeExtraction` lays the model's
 * reading over the mapper's, this lays the source's over the stored recipe,
 * the other way round: what is there wins.
 *
 * The estimate (F4, `../llm/estimateTimes`) is applied after, by
 * `applyEstimate`, to the time and yield fields still empty.
 */
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import type { DrinkSpec, Recipe } from "recipe-website-common/controller/types";
import { videoHostName } from "recipe-website-common/util/videoUrl";
import {
  ESTIMATE_FIELDS,
  FILL_FIELD_LABELS,
  type EstimateField,
  type FillField,
} from "recipe-website-common/components/Form/fillMarks";

export {
  ESTIMATE_FIELDS,
  FILL_FIELDS,
  type EstimateField,
  type FillField,
} from "recipe-website-common/components/Form/fillMarks";

/** The times and the yield an estimate may give (whole minutes). */
export interface EstimateValues {
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  recipeYield?: string;
}

type FillableRecipe = Partial<ImportedRecipe> | Recipe;

function emptyText(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function emptyTime(value: unknown): boolean {
  return typeof value !== "number" || !(value > 0);
}

function emptyList(value: unknown): boolean {
  return !Array.isArray(value) || value.length === 0;
}

function hasDrink(drink: DrinkSpec | undefined): boolean {
  return (
    !!drink &&
    Object.values(drink).some(
      (part) => typeof part === "string" && part.trim() !== "",
    )
  );
}

/** Whether `field` is empty in `recipe` (F3). */
export function isEmptyField(
  recipe: FillableRecipe,
  field: FillField,
): boolean {
  switch (field) {
    case "description":
    case "recipeYield":
      return emptyText(recipe[field]);
    case "prepTime":
    case "cookTime":
    case "totalTime":
      return emptyTime(recipe[field]);
    case "ingredients":
    case "instructions":
      return emptyList(recipe[field]);
    case "image":
      return emptyText(recipe.image);
    case "video":
      return emptyText(recipe.video);
    case "drink":
      return recipe.drink === undefined || recipe.drink === null;
  }
}

/**
 * The value the source offers for `field`, or `undefined` when it offers
 * nothing (an empty value never fills). The image and the video are the
 * importer's URLs: the form's Save downloads the picture through the checked
 * download (`fetchImageFile`, 26a), as an import's create does.
 */
function offered(
  draft: Partial<ImportedRecipe>,
  field: FillField,
): Partial<ImportedRecipe> | undefined {
  switch (field) {
    case "description":
    case "recipeYield":
      return emptyText(draft[field])
        ? undefined
        : { [field]: (draft[field] as string).trim() };
    case "prepTime":
    case "cookTime":
    case "totalTime":
      return emptyTime(draft[field])
        ? undefined
        : { [field]: Math.round(draft[field] as number) };
    case "ingredients":
      return emptyList(draft.ingredients)
        ? undefined
        : { ingredients: draft.ingredients };
    case "instructions":
      return emptyList(draft.instructions)
        ? undefined
        : { instructions: draft.instructions };
    case "image":
      return emptyText(draft.imageImportUrl)
        ? undefined
        : {
            imageImportUrl: draft.imageImportUrl,
            ...(draft.images?.length ? { images: draft.images } : {}),
          };
    case "video":
      return emptyText(draft.videoImportUrl)
        ? undefined
        : { videoImportUrl: draft.videoImportUrl };
    case "drink":
      return hasDrink(draft.drink) ? { drink: draft.drink } : undefined;
  }
}

/** Every field a fill may set, in the form's order. */
const ORDER: readonly FillField[] = [
  "description",
  "recipeYield",
  "image",
  "video",
  "ingredients",
  "instructions",
  "prepTime",
  "cookTime",
  "totalTime",
  "drink",
];

export interface FillGapsResult {
  /** The stored recipe with its empty fields filled; tags untouched. */
  recipe: Partial<ImportedRecipe>;
  /** What was filled, in the form's order. */
  filled: FillField[];
}

/**
 * `stored` with every empty field the source has a value for filled from
 * `draft` (F1/F3). The source's tags (`suggestedTags`, and any `tags` it
 * carries) come back as `suggestedTags` — those the recipe has not already
 * got — for the picker to offer; `tags` itself is never changed. `partial`
 * and the source's name, slug, date, source and timelines are never copied.
 */
export function fillGaps(
  stored: FillableRecipe,
  draft: Partial<ImportedRecipe>,
  {
    keep = [],
  }: {
    /**
     * Fields to treat as filled whatever `stored` says (45b review): the
     * edit form's picture and video inputs, which a person can set without
     * the form's values seeing it — a typed video URL is not overwritten.
     */
    keep?: readonly FillField[];
  } = {},
): FillGapsResult {
  const recipe: Partial<ImportedRecipe> = {
    ...(stored as Partial<ImportedRecipe>),
  };
  delete recipe.partial;
  const filled: FillField[] = [];
  for (const field of ORDER) {
    if (keep.includes(field) || !isEmptyField(stored, field)) continue;
    const value = offered(draft, field);
    if (!value) continue;
    Object.assign(recipe, value);
    filled.push(field);
  }
  const have = new Set((stored.tags ?? []).map((tag) => tag.toLowerCase()));
  const suggested = [
    ...new Set([...(draft.suggestedTags ?? []), ...(draft.tags ?? [])]),
  ].filter((tag) => tag.trim() && !have.has(tag.toLowerCase()));
  if (suggested.length > 0) recipe.suggestedTags = suggested;
  else delete recipe.suggestedTags;
  return { recipe, filled };
}

/** The estimate fields still empty in `recipe`: what an estimate is asked for. */
export function estimateWanted(recipe: FillableRecipe): EstimateField[] {
  return ESTIMATE_FIELDS.filter((field) => isEmptyField(recipe, field));
}

/**
 * Why a recipe's times do not add up (F4's total rule), or `undefined`: a
 * total shorter than the cook or the prep time. A `0` or absent time is not
 * compared. `checkEstimate` refuses a model's answer with it; `applyEstimate`
 * holds the form's values to it as well.
 */
export function totalTimeProblem(
  times: Pick<EstimateValues, "prepTime" | "cookTime" | "totalTime">,
): string | undefined {
  const at = (field: "prepTime" | "cookTime" | "totalTime") => {
    const value = times[field];
    return typeof value === "number" && value > 0 ? value : 0;
  };
  const total = at("totalTime");
  if (!total) return undefined;
  if (total < at("cookTime")) {
    return `the total (${total} min) is shorter than the cook time (${at("cookTime")} min)`;
  }
  if (total < at("prepTime")) {
    return `the total (${total} min) is shorter than the prep time (${at("prepTime")} min)`;
  }
  return undefined;
}

/**
 * `estimate`'s values on the fields still empty in `recipe` (F4: an
 * estimate never replaces a value, the source's or the person's). The
 * result is held to the total rule (`totalTimeProblem`) against what
 * `recipe` already holds — the edit form's values may have changed since
 * the job checked the estimate against the stored recipe (45b review): an
 * estimated total shorter than a typed cook time is dropped, and so is an
 * estimated prep or cook time longer than a total that is there, each with
 * a warning.
 */
export function applyEstimate(
  recipe: Partial<ImportedRecipe>,
  estimate: EstimateValues | undefined,
): {
  recipe: Partial<ImportedRecipe>;
  estimated: EstimateField[];
  warnings: string[];
} {
  const out: Partial<ImportedRecipe> = { ...recipe };
  const warnings: string[] = [];
  if (!estimate) return { recipe: out, estimated: [], warnings };
  let estimated: EstimateField[] = [];
  for (const field of ESTIMATE_FIELDS) {
    const value = estimate[field];
    if (value === undefined || !isEmptyField(recipe, field)) continue;
    (out as Record<string, unknown>)[field] = value;
    estimated.push(field);
  }
  const drop = (field: "prepTime" | "cookTime" | "totalTime") => {
    const why = totalTimeProblem(out);
    (out as Record<string, unknown>)[field] = recipe[field];
    estimated = estimated.filter((one) => one !== field);
    warnings.push(
      `The estimated ${FILL_FIELD_LABELS[field]} was dropped: ${why}.`,
    );
  };
  if (totalTimeProblem(out)) {
    if (estimated.includes("totalTime")) drop("totalTime");
    for (const field of ["cookTime", "prepTime"] as const) {
      if (totalTimeProblem(out) && estimated.includes(field)) drop(field);
    }
  }
  return { recipe: out, estimated, warnings };
}

/**
 * Whether a job's result is a fill's (45b review): `?fill=<job>` may name any
 * job, and an import's result has a `slug` too — only a `fill` job's has
 * the source's reading to fill from.
 */
export function isFillResult(
  value: unknown,
): value is { slug: string; source: Partial<ImportedRecipe> } {
  if (!value || typeof value !== "object") return false;
  const { slug, source } = value as { slug?: unknown; source?: unknown };
  return (
    typeof slug === "string" &&
    !!source &&
    typeof source === "object" &&
    !Array.isArray(source)
  );
}

/**
 * The link a fill reads (45b): the recipe's source link, else its video when
 * that is a video host's page (a link yt-dlp can read, not an uploaded
 * file). `undefined` — no "Fill gaps" — when it has neither.
 */
export function fillSourceUrl(
  recipe: Pick<Recipe, "source" | "video">,
): string | undefined {
  const url = recipe.source?.url?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  const video = typeof recipe.video === "string" ? recipe.video.trim() : "";
  if (/^https?:\/\//i.test(video) && videoHostName(video)) return video;
  return undefined;
}
