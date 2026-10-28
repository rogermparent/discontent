import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import checkboxSchema from "@discontent/cms/forms/schema/checkbox";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
import { normalizeTags } from "recipe-website-common/controller/normalizeTags";
import { choiceProblems } from "recipe-website-common/util/choiceChecks";
import {
  DRINK_METHODS,
  type DrinkSpec,
  type Ingredient,
  type Instruction,
  type InstructionEntry,
} from "recipe-website-common/controller/types";

const durationSchema = z
  .object({
    hours: z.string().optional(),
    minutes: z.string().optional(),
  })
  .transform((arg, ctx) => {
    if (!arg) {
      return undefined;
    }
    const { hours, minutes } = arg;
    const hoursNumber = hours ? Number(hours) : 0;
    const minutesNumber = minutes ? Number(minutes) : 0;
    if (isNaN(hoursNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["hours"],
        message: "Invalid number",
      });
    }
    if (isNaN(minutesNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["minutes"],
        message: "Invalid number",
      });
    }
    return hoursNumber * 60 + minutesNumber;
  });

const optionalDurationSchema = z
  .object({
    hours: z.string().optional(),
    minutes: z.string().optional(),
  })
  .transform((arg, ctx) => {
    if (!arg) {
      return undefined;
    }
    const { hours, minutes } = arg;
    if (!hours && !minutes) {
      return undefined;
    }
    const hoursNumber = hours ? Number(hours) : 0;
    const minutesNumber = minutes ? Number(minutes) : 0;
    if (isNaN(hoursNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["hours"],
        message: "Invalid number",
      });
    }
    if (isNaN(minutesNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["minutes"],
        message: "Invalid number",
      });
    }
    return hoursNumber * 60 + minutesNumber;
  });

/**
 * Provenance (D6/22a). Three text inputs in the form's Advanced section, so an
 * untouched block still arrives as three empty strings — hence the collapse to
 * `undefined` rather than persisting an empty `source` object on the recipe.
 * `url` is the citation, so it is what decides whether a source exists at all,
 * and it is validated as a URL only once something has been typed into it.
 */
const sourceSchema = z
  .object({
    url: z.string().optional(),
    name: z.string().optional(),
    author: z.string().optional(),
  })
  .transform((arg, ctx) => {
    const url = arg?.url?.trim();
    if (!url) {
      return undefined;
    }
    try {
      new URL(url);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "Source link isn't a URL",
      });
      return undefined;
    }
    return {
      url,
      name: arg.name?.trim() || undefined,
      author: arg.author?.trim() || undefined,
    };
  });

/**
 * The drink spec (25a/D3). Four always-mounted inputs in the form's Drink
 * section, so an untouched block arrives as four empty strings — trimmed to
 * `undefined` one by one, and the block itself to `undefined` when nothing is
 * left, exactly as `sourceSchema` keeps an empty `source` off disk. Unlike
 * `source` no single part decides existence: a garnish alone is a spec.
 */
const drinkSchema = z
  .object({
    method: z.enum(DRINK_METHODS).or(z.literal("")).optional(),
    glass: z.string().optional(),
    ice: z.string().optional(),
    garnish: z.string().optional(),
  })
  .transform((arg): DrinkSpec | undefined => {
    const drink: DrinkSpec = {
      method: arg?.method || undefined,
      glass: arg?.glass?.trim() || undefined,
      ice: arg?.ice?.trim() || undefined,
      garnish: arg?.garnish?.trim() || undefined,
    };
    return Object.values(drink).some(Boolean) ? drink : undefined;
  });

/** A posted row: lodash `set` builds objects, and leaves holes `undefined`. */
function rowOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The times an option may carry (46f), in the order they are stored. */
const OPTION_TIMES = ["prepTime", "cookTime", "totalTime"] as const;

/**
 * An option's posted time (46f): its hours and minutes inputs, as
 * `optionalDurationSchema` reads a timeline's — both blank (or a total of
 * 0) is no time, so an untouched card stores nothing. A number that is not
 * one is refused at the field.
 */
function optionMinutes(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
): number | undefined {
  const row = rowOf(value);
  if (!row) return undefined;
  const hours = textOf(row.hours).trim();
  const minutes = textOf(row.minutes).trim();
  if (!hours && !minutes) return undefined;
  const hoursNumber = hours ? Number(hours) : 0;
  const minutesNumber = minutes ? Number(minutes) : 0;
  let bad = false;
  for (const [part, number] of [
    ["hours", hoursNumber],
    ["minutes", minutesNumber],
  ] as const) {
    if (!Number.isFinite(number) || number < 0) {
      bad = true;
      ctx.addIssue({
        code: "custom",
        path: [...path, part],
        message: "Invalid number",
      });
    }
  }
  if (bad) return undefined;
  const total = Math.round(hoursNumber * 60 + minutesNumber);
  return total > 0 ? total : undefined;
}

/**
 * The ingredient rows (45d). A blank row — an untouched "Add ingredient",
 * a blank heading — is dropped rather than refused: it carries nothing, and
 * refusing it is what left Roger with "Error parsing recipe" and no field
 * to look at. A kept line is kept exactly as posted (D4's round trip). An
 * all-blank list is no list, as an untouched one is.
 */
const ingredientsSchema = z
  .array(z.unknown())
  .optional()
  .transform((rows, ctx): Ingredient[] | undefined => {
    if (!rows) return undefined;
    const kept: Ingredient[] = [];
    rows.forEach((value: unknown, index) => {
      const row = rowOf(value);
      if (!row) return;
      const { ingredient, type } = row;
      if (typeof ingredient !== "string" || !ingredient.trim()) return;
      if (type !== undefined && type !== "" && type !== "heading") {
        ctx.addIssue({
          code: "custom",
          path: [index, "type"],
          message: `Ingredient ${index + 1} has an unknown kind`,
        });
        return;
      }
      /* 45e: a heading's `choice` (a hidden input) ties it to an option. */
      const choice = textOf(row.choice).trim();
      kept.push(
        type === "heading"
          ? { ingredient, type, ...(choice ? { choice } : {}) }
          : { ingredient },
      );
    });
    return kept.length ? kept : undefined;
  });

/** A line's start, for a message: "Divide cold dough into four…". */
function excerpt(text: string, max = 30): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const word = cut.lastIndexOf(" ");
  return `${(word > 0 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

/** A nameless group, by its first step or its place (it shows no number). */
function groupPlace(firstStep: string | undefined, stepsBefore: number) {
  if (firstStep) return `The group starting “${excerpt(firstStep)}”`;
  return stepsBefore
    ? `The group after step ${stepsBefore}`
    : "The first group";
}

/**
 * The steps (45d), checked by hand so each refusal names the step as the
 * form numbers it: in reading order across groups, a group's steps counted
 * and the group itself not (`InstructionsListInput`'s numbers).
 *
 * Dropped: a step with no name and no text, and a group with no name whose
 * steps are all blank. Refused, each saying where — a group shows no number,
 * so it is named by its name, its first step or its place: a named step
 * with no text ("Step 4 has no text"), a group with steps and no name
 * ("The group starting “Divide cold dough…” needs a name", "The group
 * after step 4 needs a name"), a named group with no steps ("Group
 * “Topping” has no steps") or only blank ones ("… has only empty steps").
 * A step always posts its text (the markdown field's hidden input), so an
 * entry with neither text nor steps is a group whose steps were removed.
 *
 * A step's empty name is no name (43e2, De2-6): an untitled step posts
 * `""`, which is not written into the recipe.
 */
const instructionsSchema = z
  .array(z.unknown())
  .optional()
  .transform((entries, ctx): InstructionEntry[] | undefined => {
    if (!entries) return undefined;
    const kept: InstructionEntry[] = [];
    /* 45e2: the entries as the sets read them (`choiceProblems`), each with
     * its posted index — a refused one too, so a set keeps its options —
     * and the worked-on set it is an option of (its posted `choiceSet`;
     * none for a set as stored, which no rule judges: 43-D4). */
    const shape: InstructionEntry[] = [];
    const posted: number[] = [];
    const sets: (string | undefined)[] = [];
    const shaped = (entry: InstructionEntry, index: number, set?: string) => {
      shape.push(entry);
      posted.push(index);
      sets.push(set);
    };
    let step = 0;
    entries.forEach((value: unknown, index) => {
      const entry = rowOf(value);
      if (!entry) return;
      const name = textOf(entry.name);
      const isGroup =
        Array.isArray(entry.instructions) || entry.text === undefined;
      if (!isGroup) {
        step += 1;
        const text = textOf(entry.text);
        if (!text.trim()) {
          if (name.trim()) {
            shaped({ text }, index);
            ctx.addIssue({
              code: "custom",
              path: [index, "text"],
              message: `Step ${step} has no text`,
            });
          }
          return;
        }
        shaped({ text }, index);
        kept.push({ name: name || undefined, text });
        return;
      }
      /* 45e2: in a set when `choice` was posted, even blank (a label being
       * typed): a worked-on set's rules are `choiceProblems`', below. */
      const posting =
        entry.choice === undefined ? undefined : textOf(entry.choice);
      const set =
        posting !== undefined && textOf(entry.choiceSet).trim()
          ? textOf(entry.choiceSet).trim()
          : undefined;
      const before = step;
      const steps: Instruction[] = [];
      let refused = false;
      const children = Array.isArray(entry.instructions)
        ? entry.instructions
        : [];
      children.forEach((childValue: unknown, childIndex) => {
        const child = rowOf(childValue);
        if (!child) return;
        step += 1;
        const childName = textOf(child.name);
        const text = textOf(child.text);
        if (!text.trim()) {
          if (childName.trim()) {
            refused = true;
            ctx.addIssue({
              code: "custom",
              path: [index, "instructions", childIndex, "text"],
              message: `Step ${step} has no text`,
            });
          }
          return;
        }
        steps.push({ name: childName || undefined, text });
      });
      if (!name.trim() && steps.length === 0 && !refused) return;
      /* 46f: an option's times, from its card's hours and minutes (or a
       * plain group's leftover ones, from hidden inputs). */
      const times: Partial<Record<(typeof OPTION_TIMES)[number], number>> = {};
      for (const field of OPTION_TIMES) {
        const minutes = optionMinutes(entry[field], [index, field], ctx);
        if (minutes !== undefined) times[field] = minutes;
      }
      shaped(
        {
          name,
          instructions: [],
          ...(posting !== undefined ? { choice: posting } : {}),
          ...times,
        },
        index,
        set,
      );
      if (!name.trim()) {
        /* A worked-on option's missing name is said as the set's (below). */
        if (set !== undefined) return;
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: `${groupPlace(steps[0]?.text, before)} needs a name`,
        });
        return;
      }
      if (steps.length === 0) {
        if (!refused) {
          ctx.addIssue({
            code: "custom",
            path: [index, "instructions"],
            message: `Group “${excerpt(name)}” has ${
              children.length ? "only empty steps" : "no steps"
            }`,
          });
        }
        return;
      }
      /* 45e: an option's set and yield ride along in hidden inputs, so a
         save with no changes keeps them (43-D4); 45e2 edits them. */
      const choice = (posting ?? "").trim();
      const optionYield = textOf(entry.recipeYield);
      kept.push({
        name,
        instructions: steps,
        ...(choice ? { choice } : {}),
        ...(optionYield.trim() ? { recipeYield: optionYield } : {}),
        ...times,
      });
    });
    for (const problem of choiceProblems(shape, sets)) {
      ctx.addIssue({
        code: "custom",
        path: [posted[problem.index], problem.field],
        message: problem.message,
      });
    }
    return kept.length ? kept : undefined;
  });

const RecipeFormSchema = z.object({
  name: z.string().min(1, { error: "Name is required" }),
  description: z.string().optional(),
  image: z.instanceof(File).optional(),
  clearImage: checkboxSchema,
  video: z.instanceof(File).optional(),
  clearVideo: checkboxSchema,
  videoImportUrl: z.string().optional(),
  videoUrl: z
    .string()
    .url({ error: "Video link isn't a URL" })
    .optional()
    .or(z.literal("")),
  date: z.optional(dateEpochSchema),
  slug: z.string().optional(),
  imageImportUrl: z.string().optional(),
  prepTime: durationSchema.optional(),
  cookTime: durationSchema.optional(),
  totalTime: durationSchema.optional(),
  recipeYield: z.string().optional(),
  source: sourceSchema.optional(),
  drink: drinkSchema.optional(),
  tags: z
    .array(z.string())
    .optional()
    .transform((tags) => (tags ? normalizeTags(tags) : undefined)),
  ingredients: ingredientsSchema,
  instructions: instructionsSchema,
  timelines: z
    .array(
      z.object({
        name: z.string().optional(),
        note: z.string().optional(),
        default_offset: optionalDurationSchema.optional(),
        events: z.array(
          z.object({
            name: z.string().optional(),
            activeTime: checkboxSchema,
            defaultLength: durationSchema.transform((val) => val || 0),
            minLength: optionalDurationSchema.optional(),
            maxLength: optionalDurationSchema.optional(),
          }),
        ),
      }),
    )
    .optional(),
  action: z.enum(["overwrite"]).optional(),
});

export type ParsedRecipeFormData = z.infer<typeof RecipeFormSchema>;

export default function parseRecipeFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedRecipeFormData> {
  return parseFormData(formData, RecipeFormSchema);
}
