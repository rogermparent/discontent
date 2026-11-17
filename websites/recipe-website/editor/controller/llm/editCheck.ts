/**
 * "Edit with AI" (47i): what the model reads, and the check its answer goes
 * through before the form may show it. Pure (no model, no fetch): the
 * `edit` job, the CLI's `recipes revise` and the unit tests share it.
 *
 * **What the model reads** (`editView`): the form's current values (unsaved
 * edits included) as the JSON a recipe write takes (`RecipePatchSchema`'s
 * shape) — ingredient lines as plain text (the amount markup undone, as the
 * form's rows show them), headings and steps as objects where they carry
 * more than their text. Never the slug, the date, the picture or video, the
 * timelines or anything outside the recipe.
 *
 * **What its answer may be** (`checkEditAnswer`): `{change, note}` — only
 * the fields it changes, among `EDIT_FIELDS`. The check, all or nothing
 * (Di6): a field outside those, or one the recipe schema refuses (the 47f
 * limits on a step's `uses` included), refuses the whole answer; so does a
 * change that drops an ingredient section, a step group, a set of
 * alternatives or a stored `uses` name the request did not ask about.
 * A field whose new value says what the form already holds is no change;
 * nothing left is "no change", with the model's note. Stored `uses` names a
 * rename leaves finding no line are said as warnings (47f Df4: kept, not
 * refused). Nothing here ever writes: the form shows the change marked, and
 * Save is the write.
 */
import { z } from "zod";
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import {
  EDIT_FIELDS,
  EDIT_FIELD_LABELS,
  editFieldList,
  sameEditValue,
  type EditField,
  type EditValues,
} from "recipe-website-common/util/editRequest";
import {
  markLine,
  plainLine,
} from "recipe-website-common/components/Form/Ingredients/ingredientRows";
import { resolveStepUses } from "recipe-website-common/util/stepIngredients";
import { DRINK_METHODS } from "recipe-website-common/controller/types";
import {
  RecipePatchSchema,
  toInstructions,
  type RecipePatch,
} from "../curation/schema";
import { issuesOf } from "../curation/errors";

/* ------------------------------------------------------------------ */
/* What the form sends                                                 */
/* ------------------------------------------------------------------ */

const text = (max: number) => z.string().max(max);

const StepValueSchema = z.strictObject({
  name: text(500).optional(),
  text: text(20_000),
  uses: z.array(text(200)).max(100).optional(),
});

const GroupValueSchema = z.strictObject({
  name: text(500),
  instructions: z.array(StepValueSchema).max(300),
  choice: text(80).optional(),
  recipeYield: text(500).optional(),
  prepTime: z.number().int().min(0).max(100_000).optional(),
  cookTime: z.number().int().min(0).max(100_000).optional(),
  totalTime: z.number().int().min(0).max(100_000).optional(),
});

const minutes = z.number().int().min(0).max(100_000);

/**
 * The form's values as the edit page posts them (`editValuesOf`): bounded,
 * so a job's spec stays small, and strict, so nothing but the recipe's own
 * fields reaches the model.
 */
export const EditValuesSchema = z.strictObject({
  name: text(500),
  description: text(20_000),
  recipeYield: text(500),
  tags: z.array(text(200)).max(200),
  ingredients: z
    .array(
      z.strictObject({
        ingredient: text(2_000),
        type: z.literal("heading").optional(),
        choice: text(80).optional(),
      }),
    )
    .max(500),
  instructions: z.array(z.union([GroupValueSchema, StepValueSchema])).max(300),
  prepTime: minutes,
  cookTime: minutes,
  totalTime: minutes,
  drink: z.strictObject({
    method: text(20),
    glass: text(500),
    ice: text(500),
    garnish: text(500),
  }),
  source: z.strictObject({
    url: text(2_000),
    name: text(500),
    author: text(500),
  }),
});

/* ------------------------------------------------------------------ */
/* What the model reads                                                */
/* ------------------------------------------------------------------ */

/** A step as a write takes it: its text alone, or an object with more. */
type ViewStep = string | { name?: string; text: string; uses?: string[] };

/** The recipe as the model reads it: `RecipePatchSchema`'s shape. */
export interface EditView {
  name: string;
  description?: string;
  recipeYield?: string;
  tags: string[];
  ingredients: (
    string | { ingredient: string; type: "heading"; choice?: string }
  )[];
  instructions: (
    | ViewStep
    | {
        name: string;
        instructions: Exclude<ViewStep, string>[];
        choice?: string;
        recipeYield?: string;
        prepTime?: number;
        cookTime?: number;
        totalTime?: number;
      }
  )[];
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  drink?: Record<string, string>;
  source?: Record<string, string>;
}

function viewStep(step: Instruction): ViewStep {
  const one = {
    ...(step.name ? { name: step.name } : {}),
    text: step.text,
    ...(Array.isArray(step.uses) ? { uses: [...step.uses] } : {}),
  };
  return one.name || one.uses ? one : one.text;
}

function blankless(parts: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parts).filter(([, part]) => part.trim()),
  );
}

/**
 * The form's values as the model reads them. The name, description, yield,
 * tags, ingredients and steps are always there (an empty one as `""` or
 * `[]`); the times, the drink spec and the source only when set.
 */
export function editView(values: EditValues): EditView {
  const drink = blankless(values.drink);
  const source = blankless(values.source);
  return {
    name: values.name,
    description: values.description,
    recipeYield: values.recipeYield,
    tags: [...values.tags],
    ingredients: values.ingredients.map((line) =>
      line.type === "heading"
        ? {
            ingredient: plainLine(line.ingredient),
            type: "heading" as const,
            ...(line.choice ? { choice: line.choice } : {}),
          }
        : plainLine(line.ingredient),
    ),
    instructions: values.instructions.map((entry) =>
      "instructions" in entry
        ? {
            name: entry.name,
            instructions: entry.instructions.map((step) => {
              const one = viewStep(step);
              return typeof one === "string" ? { text: one } : one;
            }),
            ...(entry.choice ? { choice: entry.choice } : {}),
            ...(entry.recipeYield ? { recipeYield: entry.recipeYield } : {}),
            ...(entry.prepTime ? { prepTime: entry.prepTime } : {}),
            ...(entry.cookTime ? { cookTime: entry.cookTime } : {}),
            ...(entry.totalTime ? { totalTime: entry.totalTime } : {}),
          }
        : viewStep(entry),
    ),
    ...(values.prepTime ? { prepTime: values.prepTime } : {}),
    ...(values.cookTime ? { cookTime: values.cookTime } : {}),
    ...(values.totalTime ? { totalTime: values.totalTime } : {}),
    ...(Object.keys(drink).length ? { drink } : {}),
    ...(Object.keys(source).length ? { source } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

/** The longest a time may be: a week, as an estimate's (45b). */
export const EDIT_MAX_MINUTES = 10_080;

/** At most this many tags, each at most this long. */
export const EDIT_MAX_TAGS = 50;
export const EDIT_MAX_TAG_LENGTH = 80;

/** The fields a request may change, as the write schema checks them. */
const ChangeSchema = RecipePatchSchema.pick({
  name: true,
  description: true,
  recipeYield: true,
  tags: true,
  ingredients: true,
  instructions: true,
  prepTime: true,
  cookTime: true,
  totalTime: true,
  drink: true,
  source: true,
}).superRefine((change, ctx) => {
  for (const key of ["prepTime", "cookTime", "totalTime"] as const) {
    const value = change[key];
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < 0 || value > EDIT_MAX_MINUTES) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: `a time is whole minutes, 0 to ${EDIT_MAX_MINUTES}`,
      });
    }
  }
  if (change.tags) {
    if (change.tags.length > EDIT_MAX_TAGS) {
      ctx.addIssue({
        code: "custom",
        path: ["tags"],
        message: `at most ${EDIT_MAX_TAGS} tags`,
      });
    }
    change.tags.forEach((tag, index) => {
      if (!tag.trim() || tag.trim().length > EDIT_MAX_TAG_LENGTH) {
        ctx.addIssue({
          code: "custom",
          path: ["tags", index],
          message: `a tag is 1 to ${EDIT_MAX_TAG_LENGTH} characters`,
        });
      }
    });
  }
  if (change.name !== undefined && !change.name.trim()) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "a name" });
  }
});

/** The answer's JSON Schema (Ollama `format`, Claude's structured output). */
export const EDIT_JSON_SCHEMA = (() => {
  const string = { type: "string" };
  const number = { type: "number" };
  const step = {
    type: "object",
    properties: {
      name: string,
      text: string,
      uses: { type: "array", items: string },
    },
    required: ["text"],
  };
  return {
    type: "object",
    properties: {
      change: {
        type: "object",
        properties: {
          name: string,
          description: string,
          recipeYield: string,
          tags: { type: "array", items: string },
          ingredients: {
            type: "array",
            items: {
              anyOf: [
                string,
                {
                  type: "object",
                  properties: {
                    ingredient: string,
                    type: { type: "string", enum: ["heading"] },
                    choice: string,
                  },
                  required: ["ingredient", "type"],
                },
              ],
            },
          },
          instructions: {
            type: "array",
            items: {
              anyOf: [
                string,
                {
                  type: "object",
                  properties: {
                    name: string,
                    instructions: { type: "array", items: step },
                    choice: string,
                    recipeYield: string,
                    prepTime: number,
                    cookTime: number,
                    totalTime: number,
                  },
                  required: ["name", "instructions"],
                },
                step,
              ],
            },
          },
          prepTime: number,
          cookTime: number,
          totalTime: number,
          /* Every part required, "" for none (47i Ti2): the Claude API
           * takes at most 24 optional parameters in a schema. */
          drink: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["", ...DRINK_METHODS] },
              glass: string,
              ice: string,
              garnish: string,
            },
            required: ["method", "glass", "ice", "garnish"],
          },
          source: {
            type: "object",
            properties: { url: string, name: string, author: string },
            required: ["url", "name", "author"],
          },
        },
      },
      note: string,
    },
    required: ["change", "note"],
  } as const;
})();

/** What the check makes of an answer. */
export type EditCheck =
  | {
      status: "changed";
      /** The fields the change sets, in the form's order. */
      fields: EditField[];
      /** Those fields' new values, as the form holds them. */
      change: Partial<EditValues>;
      /** Their values as the model read them. */
      before: Partial<EditValues>;
      /** The same change as `recipes update` takes it. */
      patch: RecipePatch;
      note: string;
      warnings: string[];
    }
  | { status: "no-change"; note: string; warnings: string[] }
  | {
      status: "refused";
      /** Why the answer was not offered, in a person's words. */
      problem: string;
      note: string;
      warnings: string[];
    };

/** "for the crust" ← "For the Crust:": a heading, a group or a label as a key. */
function key(text: string): string {
  return plainLine(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Whether the request names `words` (as a key, inside the request's key). */
function names(request: string, words: string): boolean {
  const asked = ` ${key(request)} `;
  const wanted = key(words);
  return wanted.length > 0 && asked.includes(` ${wanted} `);
}

const ABOUT_SECTIONS =
  /\b(sections?|headings?|headers?|groups?|parts?|subheadings?)\b/i;
const ABOUT_CHOICES =
  /\b(choices?|alternatives?|options?|versions?|ways?|methods?|variations?)\b/i;
const ABOUT_USES = /\b(uses|used|using)\b/i;
/**
 * A request that removes lines or steps themselves ("remove step 2",
 * "delete the last two ingredients", "shorten the steps") — not one that
 * removes something *from* them ("remove the parentheses from the
 * ingredients", review).
 */
const ABOUT_REMOVING_ITEMS =
  /\b(?:remove|delete|drop|cut)\s+(?:(?:the|all|any|every)\s+)?(?:[\w-]+\s+){0,2}?(?:lines?|steps?|ingredients?|items?|headings?|sections?|groups?)\b|\b(?:shorten|condense|simplify|fewer|trim)\b/i;

/** A request to empty a list ("clear the steps", "remove all ingredients"). */
const ABOUT_CLEARING =
  /\b(?:clear|empty)\b|\b(?:remove|delete)\s+(?:all|every)\b/i;

/**
 * A list that comes back much shorter than it went (Di7, the 47i
 * measurement: qwen3:8b answered "merge steps 2 and 3" with 6 of 14 steps):
 * emptied — unless the request clears it — or at least 3 items and more
 * than a third of it gone, unless the request removes lines or steps.
 */
function shrinks(before: number, after: number, request: string): boolean {
  if (before > 0 && after === 0) return !ABOUT_CLEARING.test(request);
  const lost = before - after;
  return lost >= 3 && lost * 3 > before && !ABOUT_REMOVING_ITEMS.test(request);
}

function steps(entries: readonly InstructionEntry[]): Instruction[] {
  return entries.flatMap((entry) =>
    "instructions" in entry ? entry.instructions : [entry],
  );
}

/** The ingredient headings, the step groups, the sets and the stored names. */
function structure(values: Pick<EditValues, "ingredients" | "instructions">) {
  const headings = values.ingredients
    .filter((line) => line.type === "heading")
    .map((line) => plainLine(line.ingredient).trim());
  const groups = values.instructions
    .filter(
      (entry): entry is Extract<InstructionEntry, { instructions: unknown }> =>
        "instructions" in entry && !!entry.name?.trim(),
    )
    .map((entry) => entry.name.trim());
  const choices = [
    ...values.ingredients.map((line) => line.choice),
    ...values.instructions.map((entry) =>
      "instructions" in entry ? entry.choice : undefined,
    ),
  ].filter((label): label is string => !!label?.trim());
  return { headings, groups, choices };
}

/** The first of `before` whose key no entry of `after` has. */
function lost(before: readonly string[], after: readonly string[]) {
  /* As many as before, in place: renamed ("For the 9-inch crust" → "For
   * the 23 cm crust" under "convert to metric"), not dropped (review). */
  if (before.length === after.length) return [];
  const kept = new Set(after.map(key));
  return before.filter((one) => !kept.has(key(one)));
}

/** "flour, egg": a stored list's names as one key, case and order aside. */
function usesKey(list: readonly string[] | undefined): string | undefined {
  return list === undefined ? undefined : list.map(key).sort().join("|");
}

/**
 * Whether the steps' stored `uses` lists survive (Di7, review): with as
 * many steps as before, step by step — the same list on each, `[]` and
 * none told apart; with a split, a merge or a removal, every name a kept
 * step stored is still stored somewhere (a removed step's go with it when
 * the request removes steps), and no name is stored that was not before.
 */
function usesProblem(
  before: readonly InstructionEntry[],
  after: readonly InstructionEntry[],
  request: string,
): string | undefined {
  if (ABOUT_USES.test(request)) return undefined;
  const was = steps(before);
  const now = steps(after);
  if (was.length === now.length) {
    const at = was.findIndex(
      (step, index) => usesKey(step.uses) !== usesKey(now[index].uses),
    );
    if (at < 0) return undefined;
    return Array.isArray(was[at].uses)
      ? `it changes what step ${at + 1} uses (its stored “uses”), which the request did not ask about`
      : `it gives step ${at + 1} a stored “uses” list, which the request did not ask for`;
  }
  const names = (list: readonly Instruction[]) =>
    new Set(list.flatMap((step) => (step.uses ?? []).map(key)));
  const stored = names(was);
  const kept = names(now);
  const invented = [...kept].find((name) => !stored.has(name));
  if (invented) {
    return `it adds “${invented}” to what a step uses (its stored “uses”), which the request did not ask for`;
  }
  if (now.length < was.length && ABOUT_REMOVING_ITEMS.test(request)) {
    return undefined;
  }
  const dropped = was
    .flatMap((step) => step.uses ?? [])
    .find((name) => !kept.has(key(name)));
  return dropped
    ? `it drops “${dropped}” from what a step uses (its stored “uses”), which the request did not ask about`
    : undefined;
}

/**
 * Why a change to the ingredients or steps breaks the recipe's structure
 * (Di7), or nothing: an ingredient section, a step group, a set of
 * alternatives or a stored `uses` name dropped, that the request is not
 * about.
 */
export function structureProblem(
  before: Pick<EditValues, "ingredients" | "instructions">,
  after: Pick<EditValues, "ingredients" | "instructions">,
  request: string,
): string | undefined {
  const lines = (values: Pick<EditValues, "ingredients">) =>
    values.ingredients.filter((line) => line.type !== "heading").length;
  if (shrinks(lines(before), lines(after), request)) {
    return `it leaves ${lines(after)} of the ${lines(before)} ingredient lines, which the request did not ask for`;
  }
  const count = (values: Pick<EditValues, "instructions">) =>
    steps(values.instructions).length;
  if (shrinks(count(before), count(after), request)) {
    return `it leaves ${count(after)} of the ${count(before)} steps, which the request did not ask for`;
  }
  const was = structure(before);
  const now = structure(after);
  const sections = ABOUT_SECTIONS.test(request);
  const heading = lost(was.headings, now.headings).find(
    (one) => !sections && !names(request, one),
  );
  if (heading) {
    return `it drops the ingredient section “${heading}”, which the request did not ask about`;
  }
  const group = lost(was.groups, now.groups).find(
    (one) => !sections && !names(request, one),
  );
  if (group) {
    return `it drops the step group “${group}”, which the request did not ask about`;
  }
  /* Added ones too (the 47i measurement: qwen3:8b made a group of every
   * step it recapitalised). */
  const addedHeading = lost(now.headings, was.headings).find(
    (one) => !sections && !names(request, one),
  );
  if (addedHeading) {
    return `it adds the ingredient section “${addedHeading}”, which the request did not ask for`;
  }
  const addedGroup = lost(now.groups, was.groups).find(
    (one) => !sections && !names(request, one),
  );
  if (addedGroup) {
    return `it adds the step group “${addedGroup}”, which the request did not ask for`;
  }
  const choices = ABOUT_CHOICES.test(request);
  const choice = lost(was.choices, now.choices).find(
    (one) => !choices && !names(request, one),
  );
  if (choice) {
    return `it drops the set of alternatives “${choice}”, which the request did not ask about`;
  }
  return usesProblem(before.instructions, after.instructions, request);
}

/**
 * The model's ingredient lines as the form holds them: a line it left as it
 * was keeps the form's own object (its amount markup byte for byte); a new
 * or changed line is marked up as a typed one is (`markLine`).
 */
function formIngredients(
  lines: NonNullable<RecipePatch["ingredients"]>,
  current: readonly Ingredient[],
): Ingredient[] {
  const unused = [...current];
  const take = (plain: string, heading: boolean, choice?: string) => {
    const at = unused.findIndex(
      (line) =>
        plainLine(line.ingredient).trim() === plain &&
        (line.type === "heading") === heading &&
        (!heading || (line.choice ?? "") === (choice ?? "")),
    );
    return at >= 0 ? unused.splice(at, 1)[0] : undefined;
  };
  const out: Ingredient[] = [];
  for (const entry of lines) {
    const raw = typeof entry === "string" ? entry : entry.ingredient;
    const plain = plainLine(raw).trim();
    if (!plain) continue;
    const heading = typeof entry !== "string" && entry.type === "heading";
    const choice = typeof entry !== "string" ? entry.choice : undefined;
    const kept = take(plain, heading, choice);
    if (kept) {
      out.push(kept);
    } else if (heading) {
      out.push({
        ingredient: plain,
        type: "heading",
        ...(choice ? { choice } : {}),
      });
    } else {
      const marked = markLine(plain);
      /* A line the parser reads as a heading stays a line: the model said. */
      if (marked) out.push({ ingredient: marked.ingredient });
    }
  }
  return out;
}

/** A step's text trimmed, its name and `uses` kept as given. */
function formSteps(
  entries: NonNullable<RecipePatch["instructions"]>,
): InstructionEntry[] {
  const step = (one: Instruction): Instruction => ({
    ...(one.name?.trim() ? { name: one.name.trim() } : {}),
    text: one.text.trim(),
    ...(Array.isArray(one.uses) ? { uses: [...one.uses] } : {}),
  });
  return toInstructions(entries).map((entry) =>
    "instructions" in entry
      ? {
          ...entry,
          name: entry.name.trim(),
          instructions: entry.instructions.map(step),
        }
      : step(entry),
  );
}

/** Tags trimmed, blank and repeated ones (case aside) dropped. */
function formTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    const folded = trimmed.toLowerCase();
    if (!trimmed || seen.has(folded)) continue;
    seen.add(folded);
    out.push(trimmed);
  }
  return out;
}

type Parsed = z.infer<typeof ChangeSchema>;

/** The parsed change as the form's values, field by field. */
function formChange(parsed: Parsed, current: EditValues): Partial<EditValues> {
  const out: Partial<EditValues> = {};
  for (const field of EDIT_FIELDS) {
    if (!(field in parsed) || parsed[field] === undefined) continue;
    switch (field) {
      case "name":
        out.name = parsed.name!.trim();
        break;
      case "description":
      case "recipeYield":
        out[field] = (parsed[field] ?? "").trim();
        break;
      case "tags":
        out.tags = formTags(parsed.tags ?? []);
        break;
      case "ingredients":
        out.ingredients = formIngredients(
          parsed.ingredients ?? [],
          current.ingredients,
        );
        break;
      case "instructions":
        out.instructions = formSteps(parsed.instructions ?? []);
        break;
      case "prepTime":
      case "cookTime":
      case "totalTime":
        out[field] = parsed[field] ?? 0;
        break;
      case "drink": {
        const drink = parsed.drink ?? null;
        out.drink = {
          method: drink?.method ?? "",
          glass: drink?.glass ?? "",
          ice: drink?.ice ?? "",
          garnish: drink?.garnish ?? "",
        };
        break;
      }
      case "source": {
        const source = parsed.source ?? null;
        out.source = {
          url: source?.url.trim() ?? "",
          name: source?.name?.trim() ?? "",
          author: source?.author?.trim() ?? "",
        };
        break;
      }
    }
  }
  return out;
}

/**
 * Steps as a write takes them, every field kept (47g's `patchInstructions`,
 * here without the import of the fill's seat).
 */
function patchSteps(
  entries: readonly InstructionEntry[],
): NonNullable<RecipePatch["instructions"]> {
  const object = (one: Instruction) => ({
    ...(one.name ? { name: one.name } : {}),
    text: one.text,
    ...(Array.isArray(one.uses) ? { uses: [...one.uses] } : {}),
  });
  return entries.map((entry) => {
    if (!("instructions" in entry)) {
      return entry.name || Array.isArray(entry.uses)
        ? object(entry)
        : entry.text;
    }
    return {
      name: entry.name ?? "",
      instructions: entry.instructions.map(object),
      ...(entry.choice ? { choice: entry.choice } : {}),
      ...(entry.recipeYield ? { recipeYield: entry.recipeYield } : {}),
      ...(entry.prepTime ? { prepTime: entry.prepTime } : {}),
      ...(entry.cookTime ? { cookTime: entry.cookTime } : {}),
      ...(entry.totalTime ? { totalTime: entry.totalTime } : {}),
    };
  });
}

/** The change as `recipes update --file` takes it: only the changed fields. */
export function editPatch(
  change: Partial<EditValues>,
  fields: readonly EditField[],
): RecipePatch {
  const patch: RecipePatch = {};
  for (const field of fields) {
    switch (field) {
      case "name":
        patch.name = change.name;
        break;
      case "description":
      case "recipeYield":
        patch[field] = change[field]?.trim() ? change[field] : null;
        break;
      case "tags":
        patch.tags = change.tags ?? [];
        break;
      case "ingredients":
        patch.ingredients = change.ingredients?.length
          ? change.ingredients.map((line) => ({ ...line }))
          : null;
        break;
      case "instructions":
        patch.instructions = change.instructions?.length
          ? patchSteps(change.instructions)
          : null;
        break;
      case "prepTime":
      case "cookTime":
      case "totalTime":
        patch[field] = change[field] || null;
        break;
      case "drink": {
        const parts = blankless(change.drink ?? {});
        patch.drink = Object.keys(parts).length
          ? (parts as RecipePatch["drink"])
          : null;
        break;
      }
      case "source": {
        const parts = blankless(change.source ?? {});
        patch.source = parts.url
          ? (parts as NonNullable<RecipePatch["source"]>)
          : null;
        break;
      }
    }
  }
  return patch;
}

/** Stored names a change leaves finding no line (47f Df4): said, not refused. */
function unresolvedWarnings(
  before: Pick<EditValues, "ingredients" | "instructions">,
  after: Pick<EditValues, "ingredients" | "instructions">,
): string[] {
  const missing = (values: Pick<EditValues, "ingredients" | "instructions">) =>
    resolveStepUses(values.ingredients, values.instructions)
      .unresolved.flat()
      .map((names) => names.map((name) => key(name)));
  const was = new Set(missing(before).flat());
  const now = resolveStepUses(after.ingredients, after.instructions).unresolved;
  const warnings: string[] = [];
  let number = 0;
  for (const entry of now) {
    for (const names of entry) {
      number += 1;
      const fresh = names.filter((name) => !was.has(key(name)));
      if (fresh.length) {
        warnings.push(
          `Step ${number}’s stored “uses” names ${fresh.map((name) => `“${name}”`).join(", ")}, which no ingredient line goes by after this change: it is kept, and shown nowhere until a line has that name.`,
        );
      }
    }
  }
  return warnings;
}

/**
 * The drink spec's and the source's blank parts left out, as the schema
 * has the model write them (`""` for none): a blank method is no method,
 * and a source with a blank link is no source.
 */
function withoutBlankParts(raw: object): object {
  const out: Record<string, unknown> = { ...raw };
  for (const field of ["drink", "source"] as const) {
    const parts = out[field];
    if (!parts || typeof parts !== "object" || Array.isArray(parts)) continue;
    const kept = Object.fromEntries(
      Object.entries(parts).filter(
        ([, part]) => !(typeof part === "string" && !part.trim()),
      ),
    );
    out[field] =
      field === "source" && !("url" in kept)
        ? null
        : Object.keys(kept).length
          ? kept
          : null;
  }
  return out;
}

/**
 * How many optional properties `schema` has, counted as the Claude API
 * counts them for its limit of 24 (47i Ti2): every property not in its
 * object's `required`, wherever it sits.
 */
export function optionalProperties(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  if (Array.isArray(schema)) {
    return schema.reduce((sum, node) => sum + optionalProperties(node), 0);
  }
  const node = schema as Record<string, unknown>;
  let count = 0;
  if (node.properties && typeof node.properties === "object") {
    const required = new Set(
      Array.isArray(node.required) ? (node.required as string[]) : [],
    );
    for (const [name, child] of Object.entries(node.properties)) {
      if (!required.has(name)) count += 1;
      count += optionalProperties(child);
    }
  }
  for (const key of ["items", "anyOf", "allOf"]) {
    if (key in node) count += optionalProperties(node[key]);
  }
  return count;
}

/** A refusal, in the words the panel and the CLI say. */
function refused(problem: string, note: string): EditCheck {
  return { status: "refused", problem, note, warnings: [] };
}

/**
 * Check a model's answer against the form's values it read (see the module
 * note). Never throws: every failure is `refused` with a problem to say.
 */
export function checkEditAnswer(
  data: unknown,
  current: EditValues,
  request: string,
): EditCheck {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return refused("the model's answer was not a change to the recipe", "");
  }
  const answer = data as { change?: unknown; note?: unknown };
  const note =
    typeof answer.note === "string"
      ? answer.note.replace(/\s+/g, " ").trim().slice(0, 300)
      : "";
  const raw = answer.change ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return refused("the model's answer was not a change to the recipe", note);
  }
  const outside = Object.keys(raw).filter(
    (field) => !(EDIT_FIELDS as readonly string[]).includes(field),
  );
  if (outside.length) {
    return refused(
      `it changes ${outside.map((field) => `“${field}”`).join(", ")}, which a request may not change (only ${editFieldList(EDIT_FIELDS)})`,
      note,
    );
  }
  const parsed = ChangeSchema.safeParse(withoutBlankParts(raw));
  if (!parsed.success) {
    const [first] = issuesOf(parsed.error);
    return refused(
      `it does not pass the recipe's checks${first ? ` (${first.path ? `${first.path}: ` : ""}${first.message})` : ""}`,
      note,
    );
  }
  const proposed = formChange(parsed.data, current);
  const fields = EDIT_FIELDS.filter(
    (field) =>
      proposed[field] !== undefined &&
      !sameEditValue(proposed[field], current[field]),
  );
  if (fields.length === 0) {
    return { status: "no-change", note, warnings: [] };
  }
  const change: Partial<EditValues> = {};
  const before: Partial<EditValues> = {};
  for (const field of fields) {
    (change as Record<string, unknown>)[field] = proposed[field];
    (before as Record<string, unknown>)[field] = current[field];
  }
  const after = {
    ingredients: change.ingredients ?? current.ingredients,
    instructions: change.instructions ?? current.instructions,
  };
  if (change.ingredients || change.instructions) {
    const problem = structureProblem(current, after, request);
    if (problem) return refused(problem, note);
  }
  if (change.name !== undefined && !change.name) {
    return refused(
      `it leaves the recipe with no ${EDIT_FIELD_LABELS.name}`,
      note,
    );
  }
  return {
    status: "changed",
    fields,
    change,
    before,
    patch: editPatch(change, fields),
    note,
    warnings:
      change.ingredients || change.instructions
        ? unresolvedWarnings(current, after)
        : [],
  };
}
