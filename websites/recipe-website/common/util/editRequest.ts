/**
 * "Edit with AI" (47i): a request the person types on the edit page
 * ("remove the parentheses from the ingredients"), answered by a model as a
 * change to the form's fields — the names, the form's shape of each field,
 * and the before → after view the edit box shows. Pure and browser-safe:
 * the editor's check (`controller/curation/editRecipe.ts`) builds the
 * change, and the form only applies and marks it.
 *
 * Nothing here is stored: like 45b's fill marks, a request's marks live in
 * the form until Save or Undo.
 */
import type { RecipeFormValues } from "../components/Form/formContext";
import type { RecipeSectionId } from "../components/Form/sections";
import { plainLine } from "../components/Form/Ingredients/ingredientRows";
import type { Ingredient, InstructionEntry, Recipe } from "../controller/types";

/**
 * The fields a request may change (47i Di3): the form's, but never the
 * slug, the date, the picture or video files, or the timelines — and
 * nothing outside the recipe. Unlike a fill (F3), the name and the tags:
 * the person asked.
 */
export const EDIT_FIELDS = [
  "name",
  "description",
  "recipeYield",
  "tags",
  "ingredients",
  "instructions",
  "prepTime",
  "cookTime",
  "totalTime",
  "drink",
  "source",
] as const;

export type EditField = (typeof EDIT_FIELDS)[number];

/** The form's values a request reads and changes. */
export type EditValues = Pick<RecipeFormValues, EditField>;

/** A person's name for a field, in a summary line. */
export const EDIT_FIELD_LABELS: Record<EditField, string> = {
  name: "name",
  description: "description",
  recipeYield: "yield",
  tags: "tags",
  ingredients: "ingredients",
  instructions: "steps",
  prepTime: "prep time",
  cookTime: "cook time",
  totalTime: "total time",
  drink: "drink spec",
  source: "source",
};

/** Where each field sits in the form (43e1's sections). */
export const EDIT_FIELD_SECTION: Record<EditField, RecipeSectionId> = {
  name: "recipe",
  description: "recipe",
  recipeYield: "recipe",
  tags: "tags",
  ingredients: "ingredients",
  instructions: "steps",
  prepTime: "times",
  cookTime: "times",
  totalTime: "times",
  drink: "drink",
  source: "source",
};

/** The longest request a person may send (a sentence or two). */
export const EDIT_REQUEST_MAX = 1_000;

/** "name, ingredients and steps". */
export function editFieldList(fields: readonly EditField[]): string {
  const names = fields.map((field) => EDIT_FIELD_LABELS[field]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The request's fields out of the form's values. */
export function editValuesOf(values: RecipeFormValues): EditValues {
  return {
    name: values.name,
    description: values.description,
    recipeYield: values.recipeYield,
    tags: values.tags,
    ingredients: values.ingredients,
    instructions: values.instructions,
    prepTime: values.prepTime,
    cookTime: values.cookTime,
    totalTime: values.totalTime,
    drink: values.drink,
    source: values.source,
  };
}

/**
 * A stored recipe's request fields, as the form would load them
 * (`recipeToFormValues`, which lives in a client module): the CLI and the
 * JSON API read the stored recipe, the edit page its form.
 */
export function editValuesOfRecipe(recipe: Partial<Recipe>): EditValues {
  return {
    name: recipe.name ?? "",
    description: recipe.description ?? "",
    recipeYield: recipe.recipeYield ?? "",
    tags: recipe.tags ?? [],
    ingredients: recipe.ingredients ?? [],
    instructions: recipe.instructions ?? [],
    prepTime: recipe.prepTime ?? 0,
    cookTime: recipe.cookTime ?? 0,
    totalTime: recipe.totalTime ?? 0,
    drink: {
      method: recipe.drink?.method ?? "",
      glass: recipe.drink?.glass ?? "",
      ice: recipe.drink?.ice ?? "",
      garnish: recipe.drink?.garnish ?? "",
    },
    source: {
      url: recipe.source?.url ?? "",
      name: recipe.source?.name ?? "",
      author: recipe.source?.author ?? "",
    },
  };
}

/** 0 minutes is no time, `""` no text; arrays and objects by their JSON. */
function normalize(value: unknown): unknown {
  if (value === 0 || value === null || value === "") return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, part]) => [key, normalize(part)] as const)
        .filter(([, part]) => part !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  }
  return value;
}

/** Whether two values of a field say the same (blank and 0 are none). */
export function sameEditValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** "1h 15m", "20 min": a time as the before → after view says it. */
function minutesText(value: unknown): string {
  const minutes = typeof value === "number" ? value : 0;
  if (!minutes) return "none";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** An ingredient line as a person reads it: the heading marked as one. */
function ingredientLine(line: Ingredient): string {
  const text = plainLine(line.ingredient ?? "").trim();
  if (line.type !== "heading") return text;
  return `[${text}]${line.choice ? ` (one way to do “${line.choice}”)` : ""}`;
}

/** The steps, one line each: a group's name in brackets, then its steps. */
function stepLines(entries: readonly InstructionEntry[]): string[] {
  const lines: string[] = [];
  const step = (one: { name?: string; text: string; uses?: string[] }) =>
    `${one.name ? `${one.name}: ` : ""}${one.text.trim()}${
      Array.isArray(one.uses)
        ? ` (uses: ${one.uses.length ? one.uses.join(", ") : "nothing"})`
        : ""
    }`;
  for (const entry of entries) {
    if ("instructions" in entry) {
      lines.push(
        `[${entry.name}]${entry.choice ? ` (one way to do “${entry.choice}”)` : ""}`,
      );
      for (const one of entry.instructions) lines.push(step(one));
    } else {
      lines.push(step(entry));
    }
  }
  return lines;
}

/**
 * A field's value as lines for the before → after view: the ingredients
 * line by line, the steps step by step, a time in hours and minutes, the
 * drink spec and the source part by part, any other field as one line.
 */
export function fieldLines(field: EditField, value: unknown): string[] {
  switch (field) {
    case "ingredients":
      return ((value as Ingredient[] | undefined) ?? []).map(ingredientLine);
    case "instructions":
      return stepLines((value as InstructionEntry[] | undefined) ?? []);
    case "tags":
      return [...((value as string[] | undefined) ?? [])];
    case "prepTime":
    case "cookTime":
    case "totalTime":
      return [minutesText(value)];
    case "drink":
    case "source":
      return Object.entries((value as Record<string, string>) ?? {})
        .filter(([, part]) => typeof part === "string" && part.trim())
        .map(([part, text]) => `${part}: ${text.trim()}`);
    default: {
      const text = typeof value === "string" ? value.trim() : "";
      return text ? [text] : [];
    }
  }
}

/** One row of a before → after view. */
export interface DiffRow {
  kind: "same" | "removed" | "added";
  text: string;
}

/**
 * The lines of `before` and `after` in order, each kept, removed or added —
 * a longest-common-subsequence diff, so a line changed in place shows as
 * the old line removed and the new one added beside it. Long lists past
 * the table's bound are shown removed whole, then added whole.
 */
export function lineDiff(
  before: readonly string[],
  after: readonly string[],
): DiffRow[] {
  const n = before.length;
  const m = after.length;
  if (n * m > 250_000) {
    return [
      ...before.map((text) => ({ kind: "removed" as const, text })),
      ...after.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  /* lengths[i][j]: the common run of before[i..] and after[j..]. */
  const lengths: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        before[i] === after[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      rows.push({ kind: "same", text: before[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      rows.push({ kind: "removed", text: before[i] });
      i += 1;
    } else {
      rows.push({ kind: "added", text: after[j] });
      j += 1;
    }
  }
  for (; i < n; i += 1) rows.push({ kind: "removed", text: before[i] });
  for (; j < m; j += 1) rows.push({ kind: "added", text: after[j] });
  return rows;
}

/** A field's before → after, as the edit box shows it. */
export function fieldDiff(
  field: EditField,
  before: unknown,
  after: unknown,
): DiffRow[] {
  return lineDiff(fieldLines(field, before), fieldLines(field, after));
}
