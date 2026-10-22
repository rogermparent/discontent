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
): FillGapsResult {
  const recipe: Partial<ImportedRecipe> = {
    ...(stored as Partial<ImportedRecipe>),
  };
  delete recipe.partial;
  const filled: FillField[] = [];
  for (const field of ORDER) {
    if (!isEmptyField(stored, field)) continue;
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
 * `estimate`'s values on the fields still empty in `recipe` (F4: an
 * estimate never replaces a value, the source's or the person's).
 */
export function applyEstimate(
  recipe: Partial<ImportedRecipe>,
  estimate: EstimateValues | undefined,
): { recipe: Partial<ImportedRecipe>; estimated: EstimateField[] } {
  const out: Partial<ImportedRecipe> = { ...recipe };
  const estimated: EstimateField[] = [];
  if (!estimate) return { recipe: out, estimated };
  for (const field of ESTIMATE_FIELDS) {
    const value = estimate[field];
    if (value === undefined || !isEmptyField(recipe, field)) continue;
    (out as Record<string, unknown>)[field] = value;
    estimated.push(field);
  }
  return { recipe: out, estimated };
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
