/**
 * The recipe form's sections and what the rail says about each (43e1, edit
 * form B "Review, then save"): which parts of the recipe came in from an
 * import, which need a look, and how many fields differ from what was
 * loaded. Pure, so the rail and its unit tests read the same rules.
 *
 * The statuses only ever describe the form's own state — counts, a total
 * time, the source's site — never a guess about the recipe.
 */
import { detectHeading } from "../../util/detectHeading";
import { hostnameLabel } from "../../util/hostnameLabel";
import { matchStepIngredients } from "../../util/stepIngredients";
import { formatDurationCompact } from "../../util/formatDuration";
import {
  DRINK_METHOD_LABELS,
  type DrinkMethod,
  type InstructionEntry,
} from "../../controller/types";
import type { RecipeFormValues } from "./formContext";
import type { SectionFill } from "./fillMarks";
import { ingredientFlags, plainLine } from "./Ingredients/ingredientRows";

/** The sections, in page order. "Start from" is the new-recipe page's own. */
export const RECIPE_SECTIONS = [
  { id: "recipe", label: "Recipe" },
  { id: "tags", label: "Tags" },
  { id: "picture", label: "Picture" },
  { id: "ingredients", label: "Ingredients" },
  { id: "steps", label: "Steps" },
  { id: "times", label: "Times" },
  { id: "source", label: "Source" },
] as const;

/** The drink spec's section: first, on a drink (43e2). */
export const DRINK_SECTION = { id: "drink", label: "Drink spec" } as const;

export type RecipeSectionId =
  (typeof RECIPE_SECTIONS)[number]["id"] | (typeof DRINK_SECTION)["id"];

/** The sections in page order: the drink spec leads on a drink. */
export function recipeSections(
  drink: boolean,
): ReadonlyArray<{ id: RecipeSectionId; label: string }> {
  return drink ? [DRINK_SECTION, ...RECIPE_SECTIONS] : RECIPE_SECTIONS;
}

/** The DOM id a section's heading block carries: the rail links to it. */
export function sectionAnchor(id: RecipeSectionId | "start"): string {
  return `recipe-section-${id}`;
}

export type StatusTone = "ok" | "warn" | "error" | "active";

export interface SectionStatus {
  text?: string;
  tone?: StatusTone;
}

/**
 * Which section a server-side error key belongs to: `name`,
 * `ingredients[2].ingredient`, `source.url` → its first segment.
 */
const ERROR_SECTION: Record<string, RecipeSectionId> = {
  name: "recipe",
  description: "recipe",
  recipeYield: "recipe",
  tags: "tags",
  image: "picture",
  video: "picture",
  videoUrl: "picture",
  ingredients: "ingredients",
  instructions: "steps",
  timelines: "steps",
  prepTime: "times",
  cookTime: "times",
  totalTime: "times",
  slug: "source",
  date: "source",
  source: "source",
  drink: "drink",
};

export function errorSections(
  errors: Record<string, string[] | undefined> | undefined,
): Set<RecipeSectionId> {
  const sections = new Set<RecipeSectionId>();
  for (const [key, messages] of Object.entries(errors ?? {})) {
    if (!messages?.length) continue;
    const section = ERROR_SECTION[key.split(/[.[]/)[0]];
    if (section) sections.add(section);
  }
  return sections;
}

/** The ingredient lines that are lines, not headings. */
function ingredientLines(values: RecipeFormValues): number[] {
  const lines: number[] = [];
  values.ingredients.forEach((ingredient, index) => {
    if (ingredient.type === "heading") return;
    if (!ingredient.ingredient?.trim()) return;
    if (detectHeading(ingredient.ingredient)) return;
    lines.push(index);
  });
  return lines;
}

/** Steps, counting a group's steps rather than the group. */
export function stepCount(instructions: readonly InstructionEntry[]): number {
  let count = 0;
  for (const entry of instructions) {
    count += "instructions" in entry ? entry.instructions.length : 1;
  }
  return count;
}

/**
 * Whether every ingredient line is named in some step — the recipe page's
 * own matcher (42c1), which lists only confident matches, so "all lines
 * used" is said only when it is plainly so, and nothing is said otherwise.
 */
export function allLinesUsed(values: RecipeFormValues): boolean {
  const lines = ingredientLines(values);
  if (lines.length === 0 || values.instructions.length === 0) return false;
  let matched: number[][][];
  try {
    matched = matchStepIngredients(values.ingredients, values.instructions);
  } catch {
    return false;
  }
  const used = new Set(matched.flat(2));
  return lines.every((line) => used.has(line));
}

/** How many ingredient lines carry a flag ("The * points at a note…"). */
export function ingredientChecks(values: RecipeFormValues): number {
  return values.ingredients.filter(
    (line) =>
      line.type !== "heading" &&
      ingredientFlags(plainLine(line.ingredient ?? "")).length > 0,
  ).length;
}

export interface StatusContext {
  /** "from the page" / "from the text" / "from the photo", after an import. */
  fromLabel?: string;
  /** The values the form was loaded with (the import, or the stored recipe). */
  loaded: RecipeFormValues;
  /** What the picture field holds: the page's image, one already saved, a new file, or none. */
  picture: "page" | "saved" | "new" | "none";
  errors?: Record<string, string[] | undefined>;
  /**
   * A fill from the source (45b): the sections it touched, and the values
   * it left in the form — a section is marked while it still holds them.
   */
  fill?: {
    sections: Partial<Record<RecipeSectionId, SectionFill>>;
    values: RecipeFormValues;
  };
}

/** The form values each section holds, for "still as the fill left it". */
const SECTION_KEYS: Record<RecipeSectionId, (keyof RecipeFormValues)[]> = {
  drink: ["drink"],
  recipe: ["description", "recipeYield"],
  tags: [],
  /* Files, not values: a filled picture stays marked until Undo. */
  picture: [],
  ingredients: ["ingredients"],
  steps: ["instructions"],
  times: ["prepTime", "cookTime", "totalTime"],
  source: [],
};

/** The rail's word for a fill (45b): "filled", "est.", or both. */
const FILL_WORD: Record<SectionFill, string> = {
  source: "filled",
  estimated: "est.",
  both: "filled · est.",
};

/** The rail's status for each section. */
export function sectionStatuses(
  values: RecipeFormValues,
  { fromLabel, loaded, picture, errors, fill }: StatusContext,
): Record<RecipeSectionId, SectionStatus> {
  const unchanged = (keys: (keyof RecipeFormValues)[]) =>
    keys.every((key) => same(values[key], loaded[key]));
  const fromPage = (keys: (keyof RecipeFormValues)[]): SectionStatus =>
    fromLabel && unchanged(keys) ? { text: fromLabel } : {};

  const lines = ingredientLines(values).length;
  const steps = stepCount(values.instructions);
  const total =
    values.totalTime || (values.prepTime || 0) + (values.cookTime || 0);
  const site =
    values.source.name.trim() ||
    (values.source.url.trim() && hostnameLabel(values.source.url.trim()));

  const checks = ingredientChecks(values);
  const method = values.drink.method as DrinkMethod | "";
  const statuses: Record<RecipeSectionId, SectionStatus> = {
    drink: method
      ? { text: DRINK_METHOD_LABELS[method] ?? method }
      : Object.values(values.drink).some((part) => part.trim())
        ? { text: "set" }
        : { text: "none yet" },
    recipe: values.name.trim()
      ? fromPage(["name", "description", "recipeYield"])
      : { text: "needs a name", tone: "warn" },
    tags: values.tags.length
      ? { text: `${values.tags.length} chosen` }
      : { text: "none yet" },
    picture:
      picture === "page"
        ? { text: fromLabel ?? "from the page" }
        : picture === "new"
          ? { text: "new" }
          : picture === "saved"
            ? { text: "set" }
            : { text: "none" },
    ingredients: lines
      ? checks
        ? {
            text: `${lines} · ${checks} ${checks === 1 ? "check" : "checks"}`,
            tone: "warn",
          }
        : { text: String(lines) }
      : { text: "none yet" },
    steps: steps
      ? allLinesUsed(values)
        ? { text: `${steps} · all lines used`, tone: "ok" }
        : { text: String(steps) }
      : { text: "none yet" },
    times: total ? { text: formatDurationCompact(total) } : {},
    source: site ? { text: site } : {},
  };
  /*
   * 45b: a section the fill touched says so while it holds what the fill
   * left — an estimate in the warning tone (it wants a look), a fill from
   * the source in the active one — after its own count or time.
   */
  for (const [section, how] of Object.entries(fill?.sections ?? {}) as [
    RecipeSectionId,
    SectionFill,
  ][]) {
    const kept = SECTION_KEYS[section].every((key) =>
      same(values[key], fill!.values[key]),
    );
    if (!kept) continue;
    /* A count or a time stays ("12 · filled"); words give way. */
    const { text: base, tone } = statuses[section];
    statuses[section] = {
      text:
        base && /^\d/.test(base)
          ? `${base} · ${FILL_WORD[how]}`
          : FILL_WORD[how],
      /* A flag the section already raised ("2 checks") keeps its tone. */
      tone: tone === "warn" || how !== "source" ? "warn" : "active",
    };
  }
  for (const section of errorSections(errors)) {
    statuses[section] = { text: "check", tone: "error" };
  }
  return statuses;
}

/* ------------------------------------------------------------------ */
/* Changes                                                             */
/* ------------------------------------------------------------------ */

/**
 * A text field's value as far as a change is concerned: a textarea's `\r\n`
 * and the editor's trailing newline are not edits.
 */
function normalize(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").trim();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = normalize((value as Record<string, unknown>)[key]);
      /* `{type: undefined}` and `{}` are the same line. */
      if (item === undefined || item === "") continue;
      out[key] = item;
    }
    return out;
  }
  /* 0 minutes and no minutes are the same time. */
  if (value === 0 || value === null) return undefined;
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/**
 * The fields that differ from what the form was loaded with — real field
 * changes, not keystrokes: typing a letter and deleting it is no change.
 * `source` and `drink` count per part (site, author…); a list (tags,
 * ingredients, steps, timelines) counts once however much of it moved.
 */
export function changedFields(
  loaded: RecipeFormValues,
  values: RecipeFormValues,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(loaded) as (keyof RecipeFormValues)[]) {
    if (key === "source" || key === "drink") {
      const before = loaded[key] as Record<string, string>;
      const after = values[key] as Record<string, string>;
      for (const part of Object.keys(before)) {
        if (!same(before[part], after?.[part])) changed.push(`${key}.${part}`);
      }
      continue;
    }
    if (!same(loaded[key], values[key])) changed.push(key);
  }
  return changed;
}

/** "No changes" · "1 change · not saved" · "3 changes · not saved". */
export function changeText(count: number): {
  count: string;
  rest?: string;
} {
  if (count === 0) return { count: "No changes" };
  return {
    count: `${count} ${count === 1 ? "change" : "changes"}`,
    rest: "· not saved",
  };
}

/** What the Slug field says after a slug conflict (see `withSlugConflict`). */
export const SLUG_TAKEN =
  "This slug is taken: change it, or overwrite that recipe.";

/**
 * The form state as the fields and the rail see it: a slug conflict is a
 * message and an Overwrite button from the server, with no field error —
 * so the Slug field gets one (43e1: "inline under fields + a rail
 * marker"), worded apart from the message so each is said once.
 */
export function withSlugConflict<
  State extends {
    errors?: Record<string, string[] | undefined>;
    slugConflict?: string;
  },
>(state: State): State {
  if (!state.slugConflict) return state;
  return {
    ...state,
    errors: {
      ...state.errors,
      slug: [...(state.errors?.slug ?? []), SLUG_TAKEN],
    },
  };
}
