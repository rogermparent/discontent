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
import {
  EDIT_FIELD_SECTION,
  sameEditValue,
  type EditField,
  type EditValues,
} from "../../util/editRequest";

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
  "notes",
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
  notes: "notes",
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
  notes: "notes",
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
  /**
   * The steps the model suggests a "uses" for (47g) — offered under each
   * step, not applied: the numbers when the fill landed, and who suggested.
   */
  uses?: { model: string; steps: number[] };
  /**
   * What "Edit with AI" requests changed (47i): applied in the form, marked
   * "edited", each field with Accept and Undo until Save.
   */
  edited?: EditMarks;
}

/** One request the form holds the change of (47i). */
export interface EditRequestMark {
  /** What the person asked, as typed. */
  request: string;
  /** Who answered: "local model qwen3:8b", "the Claude API (…)". */
  model: string;
  /** The model's one line about what it did. */
  note?: string;
}

/**
 * The requests' changes the form holds (47i): every field one changed, in
 * the form's order, with its value before the first of them — Undo puts that
 * back — and the fields the person accepted. A field is marked while it is
 * changed, not accepted, and still holds what the request left.
 */
export interface EditMarks {
  requests: EditRequestMark[];
  fields: EditField[];
  accepted: EditField[];
  before: Partial<EditValues>;
  /** What the latest request that changed each field left in it. */
  after: Partial<EditValues>;
}

/** The edited fields still waiting for a look: changed and not accepted. */
export function editPending(marks: FillMarks | undefined): EditField[] {
  const edited = marks?.edited;
  if (!edited) return [];
  return edited.fields.filter((field) => !edited.accepted.includes(field));
}

/**
 * The sections with a field a request changed that is not accepted yet —
 * and, given the form's values and what the request left (the form's
 * defaults after its remount), still holds it: an edit by hand drops the
 * mark, as it drops a fill's.
 */
export function editedSections(
  marks: FillMarks | undefined,
  values?: Partial<EditValues>,
  left?: Partial<EditValues>,
): Partial<Record<RecipeSectionId, EditField[]>> {
  const out: Partial<Record<RecipeSectionId, EditField[]>> = {};
  for (const field of editPending(marks)) {
    if (values && left && !sameEditValue(values[field], left[field])) continue;
    const section = EDIT_FIELD_SECTION[field];
    (out[section] ??= []).push(field);
  }
  return out;
}

/** "edited", or a fill's label with it: "from the source · edited". */
export function withEditedLabel(
  label: string | undefined,
  edited: boolean,
): string | undefined {
  if (!edited) return label;
  return label ? `${label} · edited` : "edited";
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
