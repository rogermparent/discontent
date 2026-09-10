/**
 * What a caller may hand this layer, and what it becomes.
 *
 * The browser forms have `parseFormData.ts`; JSON callers have this. The two
 * are deliberately separate schemas over the same content types, because the
 * inputs differ in kind: `FormData` is all strings and cannot carry an empty
 * array (T11), while a JSON body carries real numbers, real arrays, and
 * `null` — which is the one thing a form can never say and the one thing a
 * *patch* needs, since "clear this field" and "leave it alone" are different
 * intents.
 *
 * Everything is `.strict()` on purpose. A typo'd key in a hand-written or
 * agent-written JSON file is the failure this layer is most likely to see, and
 * `Recipe` has an index signature — so a silently accepted `tag:` or
 * `ingredents:` would be written verbatim into `recipe.json` and never noticed.
 */
import { createIngredient } from "recipe-website-common/util/parseIngredients";
import type {
  GroupItem,
  Ingredient,
  Instruction,
  InstructionEntry,
  InstructionGroup,
} from "recipe-website-common/controller/types";
import { z } from "zod";
import { ValidationError, issuesOf } from "./errors";

/**
 * A date as an epoch integer, or as anything `Date.parse` understands.
 *
 * The retry with a `Z` suffix mirrors `packages/cms/forms/schema/dateEpoch.ts`,
 * which is what the browser forms use: a bare `2026-05-04T18:30` from a
 * datetime-local input is parsed by `Date.parse` as *local* time, and the forms
 * have always pinned it to UTC. Trying the string as given first is the
 * addition — a caller that writes `2026-05-04T18:30:00Z` or an RFC 2822 date
 * means exactly what it says.
 */
export const EpochSchema = z.union([
  z.number().int(),
  z.string().transform((value, ctx) => {
    const direct = Date.parse(value);
    if (!Number.isNaN(direct)) return direct;
    const asUtc = Date.parse(`${value}Z`);
    if (!Number.isNaN(asUtc)) return asUtc;
    ctx.addIssue({ code: "custom", message: "Invalid Date" });
    return z.NEVER;
  }),
]);

const IngredientObjectSchema = z.strictObject({
  ingredient: z.string(),
  type: z.literal("heading").optional(),
});

/** A line of ingredients is either prose or an already-shaped `Ingredient`. */
export const IngredientInputSchema = z.union([
  z.string(),
  IngredientObjectSchema,
]);

const InstructionObjectSchema = z.strictObject({
  name: z.string().optional(),
  text: z.string(),
});

const InstructionGroupSchema = z.strictObject({
  name: z.string(),
  instructions: z.array(InstructionObjectSchema),
});

/*
 * Group before step: both shapes carry `name`, and only the group carries
 * `instructions`, so trying the narrower one first is what keeps a group from
 * failing as a step with a missing `text`.
 */
export const InstructionInputSchema = z.union([
  z.string(),
  InstructionGroupSchema,
  InstructionObjectSchema,
]);

const TimelineEventSchema = z.looseObject({
  name: z.string().optional(),
  activeTime: z.boolean(),
  defaultLength: z.number(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

const TimelineSchema = z.looseObject({
  name: z.string().optional(),
  events: z.array(TimelineEventSchema),
  default_offset: z.number().optional(),
  note: z.string().optional(),
});

const SourceSchema = z.strictObject({
  url: z.string().min(1),
  name: z.string().optional(),
  author: z.string().optional(),
});

export const RecipeInputSchema = z.strictObject({
  name: z.string().min(1, "A recipe needs a name"),
  slug: z.string().optional(),
  date: EpochSchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  prepTime: z.number().optional(),
  cookTime: z.number().optional(),
  totalTime: z.number().optional(),
  recipeYield: z.string().optional(),
  ingredients: z.array(IngredientInputSchema).optional(),
  instructions: z.array(InstructionInputSchema).optional(),
  timelines: z.array(TimelineSchema).optional(),
  source: SourceSchema.optional(),
  /** Downloaded into the recipe's uploads directory, never stored verbatim. */
  imageImportUrl: z.string().optional(),
  /** A video the site links rather than hosts. */
  videoUrl: z.string().optional(),
  videoImportUrl: z.string().optional(),
});

export type RecipeInput = z.infer<typeof RecipeInputSchema>;

/**
 * The same fields, all optional, and `null` where clearing is meaningful.
 *
 * `name` and `date` are not nullable: a recipe with no name is not a recipe,
 * and a cleared date would take the index key with it.
 */
export const RecipePatchSchema = z.strictObject({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  date: EpochSchema.optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  prepTime: z.number().nullable().optional(),
  cookTime: z.number().nullable().optional(),
  totalTime: z.number().nullable().optional(),
  recipeYield: z.string().nullable().optional(),
  ingredients: z.array(IngredientInputSchema).nullable().optional(),
  instructions: z.array(InstructionInputSchema).nullable().optional(),
  timelines: z.array(TimelineSchema).nullable().optional(),
  source: SourceSchema.nullable().optional(),
  imageImportUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  videoImportUrl: z.string().nullable().optional(),
});

export type RecipePatch = z.infer<typeof RecipePatchSchema>;

const GroupItemObjectSchema = z.strictObject({
  recipe: z.string().min(1),
  label: z.string().optional(),
  note: z.string().optional(),
});

/** `"first-recipe:Mon · Dinner"` is the shorthand `--item` accepts. */
export const GroupItemInputSchema = z.union([
  z.string(),
  GroupItemObjectSchema,
]);

export const GroupInputSchema = z.strictObject({
  name: z.string().min(1, "A group needs a name"),
  slug: z.string().optional(),
  kind: z.enum(["meal-plan", "collection"]).default("collection"),
  description: z.string().optional(),
  date: EpochSchema.optional(),
  items: z.array(GroupItemInputSchema).default([]),
});

export type GroupInput = z.infer<typeof GroupInputSchema>;

/* --- coercions ----------------------------------------------------------- */

/**
 * Prose becomes an `Ingredient` through the same parser the paste flow uses, so
 * `"2 cups flour"` gains its `<Multiplyable>` markup here exactly as it would
 * in the browser. `createIngredient` returns `undefined` for a blank line.
 */
export function toIngredients(
  input: z.infer<typeof IngredientInputSchema>[],
): Ingredient[] {
  return input
    .map((entry) =>
      typeof entry === "string" ? createIngredient(entry) : entry,
    )
    .filter((entry): entry is Ingredient => Boolean(entry));
}

export function toInstructions(
  input: z.infer<typeof InstructionInputSchema>[],
): InstructionEntry[] {
  return input.map((entry) =>
    typeof entry === "string"
      ? ({ text: entry } as Instruction)
      : (entry as Instruction | InstructionGroup),
  );
}

/**
 * `"slug:label"` splits at the **first** colon, so a label may contain one —
 * `"first-recipe:Mon: Dinner"` is a Monday dinner, not a parse error. A slug
 * cannot contain a colon, so the first one is unambiguous.
 */
export function toGroupItems(
  input: z.infer<typeof GroupItemInputSchema>[],
): GroupItem[] {
  return input
    .map((entry) => {
      if (typeof entry !== "string") return entry;
      const colon = entry.indexOf(":");
      if (colon === -1) return { recipe: entry.trim() };
      const label = entry.slice(colon + 1).trim();
      return {
        recipe: entry.slice(0, colon).trim(),
        ...(label ? { label } : {}),
      };
    })
    .filter((item) => Boolean(item.recipe));
}

/** Parse, or throw the layer's own `ValidationError` with zod's issues on it. */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  raw: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Invalid input", issuesOf(result.error));
  }
  return result.data;
}
