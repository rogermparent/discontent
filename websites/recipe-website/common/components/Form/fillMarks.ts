/**
 * The edit page's "Fill gaps from the source" (45b): which fields a fill
 * took from the source and which the model estimated — the marks the form
 * and its rail draw. Pure and browser-safe: the editor's `fillGaps` (its
 * controller) names fields with these, and the form only reads them.
 *
 * Nothing here is stored: a mark lives in the form until Save or Undo, and
 * the saved recipe carries no trace of where a value came from (45b,
 * "Roger to confirm").
 */
import type { RecipeSectionId } from "./sections";

/** The fields a fill may set (epic 45 F3): never `name`, `slug` or `tags`. */
export const FILL_FIELDS = [
  "description",
  "recipeYield",
  "prepTime",
  "cookTime",
  "totalTime",
  "ingredients",
  "instructions",
  "image",
  "video",
  "drink",
] as const;

export type FillField = (typeof FILL_FIELDS)[number];

/** The fields an estimate may set (F4): the times and the yield. */
export const ESTIMATE_FIELDS = [
  "prepTime",
  "cookTime",
  "totalTime",
  "recipeYield",
] as const;

export type EstimateField = (typeof ESTIMATE_FIELDS)[number];

/** Where each field sits in the form (43e1's sections). */
export const FILL_FIELD_SECTION: Record<FillField, RecipeSectionId> = {
  description: "recipe",
  recipeYield: "recipe",
  prepTime: "times",
  cookTime: "times",
  totalTime: "times",
  ingredients: "ingredients",
  instructions: "steps",
  image: "picture",
  video: "picture",
  drink: "drink",
};

/** A person's name for a field, in a summary line. */
export const FILL_FIELD_LABELS: Record<FillField, string> = {
  description: "description",
  recipeYield: "yield",
  prepTime: "prep time",
  cookTime: "cook time",
  totalTime: "total time",
  ingredients: "ingredients",
  instructions: "steps",
  image: "picture",
  video: "video",
  drink: "drink spec",
};

/** What a fill did to the form: the form and the rail mark these. */
export interface FillMarks {
  /** Taken from the source, as it says it. */
  filled: FillField[];
  /** Estimated by the model, the source being silent (F4). */
  estimated: EstimateField[];
  /** The estimate's one-sentence reasoning ("25 min rise + …"). */
  basis?: string;
  /** Who estimated: the model's name, for the text beside the basis. */
  model?: string;
}

/** How a section was filled: from the source, estimated, or both. */
export type SectionFill = "source" | "estimated" | "both";

/** Each section the fill touched, and how. */
export function fillSections(
  marks: FillMarks | undefined,
): Partial<Record<RecipeSectionId, SectionFill>> {
  const out: Partial<Record<RecipeSectionId, SectionFill>> = {};
  if (!marks) return out;
  const add = (field: FillField, how: "source" | "estimated") => {
    const section = FILL_FIELD_SECTION[field];
    const before = out[section];
    out[section] = !before || before === how ? how : "both";
  };
  for (const field of marks.filled) add(field, "source");
  for (const field of marks.estimated) add(field, "estimated");
  return out;
}

/** "from the source", "estimated", "from the source · estimated". */
export function sectionFillLabel(
  how: SectionFill | undefined,
): string | undefined {
  switch (how) {
    case "source":
      return "from the source";
    case "estimated":
      return "estimated";
    case "both":
      return "from the source · estimated";
    default:
      return undefined;
  }
}

/** "description, ingredients and steps". */
export function fieldList(fields: readonly FillField[]): string {
  const names = fields.map((field) => FILL_FIELD_LABELS[field]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
