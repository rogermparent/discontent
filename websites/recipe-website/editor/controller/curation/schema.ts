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
import {
  DRINK_METHODS,
  type DrinkSpec,
} from "recipe-website-common/controller/types";
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

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

/**
 * The drink spec (25a). Strict like everything here, so a `glas` typo fails
 * rather than landing in `recipe.json`. Blank parts are dropped, and a block
 * with nothing left becomes `null` — which `buildRecipeWrite`'s `put` treats as
 * "clear", so in a patch `{}` and `null` mean the same thing and neither ever
 * stores an empty object (D3/D4). It is a whole-object value: a patch's `drink`
 * replaces the stored one, it does not merge into it.
 */
export const DrinkSpecSchema = z
  .strictObject({
    method: z.enum(DRINK_METHODS).optional(),
    glass: optionalTrimmed,
    ice: optionalTrimmed,
    garnish: optionalTrimmed,
  })
  .transform((drink): DrinkSpec | null => {
    const kept = Object.fromEntries(
      Object.entries(drink).filter(([, value]) => value !== undefined),
    ) as DrinkSpec;
    return Object.keys(kept).length > 0 ? kept : null;
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
  drink: DrinkSpecSchema.optional(),
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
  /** Replaces the whole spec; `null` — or an all-blank object — clears it. */
  drink: DrinkSpecSchema.nullable().optional(),
  /** A URL replaces the image; `null` clears it, as `clearImage` does (26a). */
  imageImportUrl: z.string().nullable().optional(),
  /** Remove the image. Loses to an `imageImportUrl` in the same patch. */
  clearImage: z.boolean().optional(),
  videoUrl: z.string().nullable().optional(),
  videoImportUrl: z.string().nullable().optional(),
});

export type RecipePatch = z.infer<typeof RecipePatchSchema>;

/**
 * One item, as JSON: a recipe **or** a group, and the two free-text fields.
 *
 * Exported since 23c so `POST /api/group/<slug>/items` can parse its body with
 * it rather than with a private near-copy — the route had one, and a route
 * schema that drifts from this one is a body the CLI accepts and the API does
 * not.
 *
 * The XOR is a `.refine` rather than a union of two object schemas, exactly as
 * `FeaturedInputSchema`'s is and for the same reason: naming both, or neither,
 * fails as one message on one field instead of as two unreadable branch
 * failures. It reports on `recipe` because that is the side a caller who named
 * nothing is looking at.
 */
export const GroupItemObjectSchema = z
  .strictObject({
    recipe: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
    label: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((data) => Boolean(data.recipe) !== Boolean(data.group), {
    message: "Name exactly one of `recipe` or `group`",
    path: ["recipe"],
  });

/**
 * `"first-recipe:Mon · Dinner"` is the shorthand `--item` accepts.
 *
 * The string form stays **recipe-only** (D15). A bare slug is what a human
 * types after `--item`, and making it ambiguous between the two content types
 * would be a guess; the CLI's `--group-item` and the object form's `{group}`
 * are the two ways to name a group.
 */
export const GroupItemInputSchema = z.union([
  z.string(),
  GroupItemObjectSchema,
]);

/**
 * The kinds a group may be **written** with: `meal-plan` alone, since 31c.
 *
 * `Group.kind` narrowed at 24e (`24-D5`, landed as 31c): a curated collection
 * is now a term with a pinned front (`term_create`, `term_assign`), and a group
 * is an ordered, dated, per-item-annotated list — a meal plan. The *type* keeps
 * `"collection"` so records already on disk stay readable and editable; only a
 * create, or a patch that names a kind, is refused one. The message is the
 * whole migration guide an agent gets, so it names the replacement.
 */
export const GroupWriteKindSchema = z.enum(["meal-plan"], {
  error:
    'Only "meal-plan" groups can be created now — a collection is a term: create it with term_create and tag recipes with term_assign',
});

export const GroupInputSchema = z.strictObject({
  name: z.string().min(1, "A group needs a name"),
  slug: z.string().optional(),
  kind: GroupWriteKindSchema.default("meal-plan"),
  description: z.string().optional(),
  date: EpochSchema.optional(),
  /**
   * Import the group's picture from a URL (22h) — the CLI's `--image-url` and
   * the API's own key. Declared rather than tolerated: this is a
   * `strictObject`, so an undeclared key is a validation error, which is the
   * property the "rejects unknown keys" case pins.
   */
  imageImportUrl: z.string().optional(),
  /**
   * The site's one `tag` vocabulary, which groups joined at 24b (D4).
   * Declared rather than tolerated for the same reason `imageImportUrl` is —
   * this is a `strictObject`, so an undeclared key is a validation error and a
   * group write carrying tags would fail outright (T7).
   */
  tags: z.array(z.string()).optional(),
  items: z.array(GroupItemInputSchema).default([]),
});

export type GroupInput = z.infer<typeof GroupInputSchema>;

/**
 * The same fields, all optional, and `null` where clearing is meaningful.
 *
 * **No `items`** (D4). Item edits stay on `setItems`/`addItem`/`removeItem`, so
 * a patch meaning "rename this group" cannot silently wipe a meal plan — the
 * one mistake a hand-written patch over an existing plan is most likely to
 * make, and `strictObject` turns an `items` key here into a validation error
 * rather than a lost week. `name`, `kind` and `date` are not nullable for the
 * reason `RecipePatchSchema`'s are not: a group with no name is not a group,
 * and a cleared date would take the index key with it.
 */
export const GroupPatchSchema = z.strictObject({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  /*
   * `meal-plan` only (31c). A patch that leaves `kind` out keeps whatever the
   * record has, so an existing collection can still be renamed or re-tagged —
   * it just cannot be *made* one.
   */
  kind: GroupWriteKindSchema.optional(),
  date: EpochSchema.optional(),
  description: z.string().nullable().optional(),
  imageImportUrl: z.string().nullable().optional(),
  /** `null` clears every tag; an array replaces the whole list (T7). */
  tags: z.array(z.string()).nullable().optional(),
});

export type GroupPatch = z.infer<typeof GroupPatchSchema>;

/**
 * What `feature` accepts: exactly one target of **three** (24c), and the three
 * fields around it.
 *
 * The rule is a `.refine` rather than a union of object schemas, so a body
 * naming two — or none — fails as one message on one field, exactly as
 * `parseFeaturedRecipeFormData`'s refine does for the form. Counting rather
 * than comparing, now that there are three: `Boolean(a) !== Boolean(b)` says
 * "exactly one" only for a pair. It reports on `recipe` for the same reason it
 * always has: it is the side a caller who named nothing is looking at.
 */
export const FeaturedInputSchema = z
  .strictObject({
    recipe: z.string().min(1).optional(),
    group: z.string().min(1).optional(),
    /** A term record's slug (24c) — not a bare tag: the record must exist. */
    term: z.string().min(1).optional(),
    note: z.string().optional(),
    date: EpochSchema.optional(),
    slug: z.string().optional(),
  })
  .refine(
    (data) => [data.recipe, data.group, data.term].filter(Boolean).length === 1,
    {
      message: "Name exactly one of `recipe`, `group` or `term`",
      path: ["recipe"],
    },
  );

export type FeaturedInput = z.infer<typeof FeaturedInputSchema>;

/* --- terms (31c, 24e) ----------------------------------------------------- */

/**
 * The recipe slugs a term pins to the front of its page, in order (24c/D5).
 * The seat checks that each one actually carries the tag; the schema checks
 * only that they are slugs at all.
 */
const PinnedSchema = z.array(z.string().min(1));

/**
 * A new term **record** (`term_create`).
 *
 * `slug` defaults to the label's slug — the identity every carrier string is
 * folded to (`tagSlug`), so a record created from "Christmas Cookies" lands at
 * `christmas-cookies`, exactly where the carriers' fold already puts the term.
 * `parent` names another record's slug; `pinned` names recipe slugs.
 * `imageImportUrl` is fetched at write time, as a group's is.
 */
export const TermInputSchema = z.strictObject({
  label: z.string().trim().min(1, "A term needs a label"),
  slug: z.string().optional(),
  description: z.string().optional(),
  parent: z.string().min(1).optional(),
  pinned: PinnedSchema.optional(),
  imageImportUrl: z.string().optional(),
  date: EpochSchema.optional(),
});

export type TermInput = z.infer<typeof TermInputSchema>;

/**
 * The same fields, all optional, and `null` where clearing is meaningful.
 *
 * **No `slug`.** Moving a term is `term_rename`, because a rename also rewrites
 * every carrier's tag string — a patch that only moved the record would leave
 * the carriers folding to the old slug and the record describing nothing.
 */
export const TermPatchSchema = z.strictObject({
  label: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  /** `null` makes the term a root. */
  parent: z.string().min(1).nullable().optional(),
  /** Replaces the whole list; `null` clears it. */
  pinned: PinnedSchema.nullable().optional(),
  imageImportUrl: z.string().nullable().optional(),
  date: EpochSchema.optional(),
});

export type TermPatch = z.infer<typeof TermPatchSchema>;

/**
 * `term_rename`: the new slug — or a label, which is slugged — and optionally
 * the label the record (and every carrier) should carry afterwards.
 */
export const TermRenameSchema = z.strictObject({
  to: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
});

export type TermRenameInput = z.infer<typeof TermRenameSchema>;

/** `term_merge`: fold this term into `into`. */
export const TermMergeSchema = z.strictObject({
  into: z.string().trim().min(1),
});

/** Which carrier type `term_assign` names. Recipes unless said otherwise. */
export const TermCarrierTypeSchema = z.enum(["recipe", "group"]);

/**
 * `term_assign`: carriers to tag and to untag, one update each. A slug in both
 * lists is refused rather than resolved by order.
 */
export const TermAssignSchema = z
  .strictObject({
    add: z.array(z.string().min(1)).optional(),
    remove: z.array(z.string().min(1)).optional(),
    type: TermCarrierTypeSchema.optional(),
  })
  .refine((data) => (data.add?.length ?? 0) + (data.remove?.length ?? 0) > 0, {
    message: "Name at least one carrier to `add` or `remove`",
    path: ["add"],
  })
  .refine(
    (data) => !(data.add ?? []).some((slug) => data.remove?.includes(slug)),
    {
      message: "A slug may not be in both `add` and `remove`",
      path: ["remove"],
    },
  );

export type TermAssignInput = z.infer<typeof TermAssignSchema>;

/* --- inventory (25d) ----------------------------------------------------- */

/**
 * One thing on hand, as a person writes it — "vodka", "Gnista", "lime". The
 * same limits the browser's import applies (`inventoryText.ts`), so a list
 * that round-trips through Export → `inventory set` cannot be refused here.
 */
export const InventoryItemSchema = z.string().trim().min(1).max(80);

/** At most 500 items, the import cap. */
const InventoryItems = z.array(InventoryItemSchema).max(500);

/**
 * `{add?, remove?}` — a diff, which is what both the browser's "Save to
 * shared list" and an agent's "I bought Gnista" are. Remove applies first,
 * then add, so an item in both ends up present.
 */
export const InventoryPatchSchema = z
  .strictObject({
    add: InventoryItems.optional(),
    remove: InventoryItems.optional(),
  })
  .refine((data) => (data.add?.length ?? 0) + (data.remove?.length ?? 0) > 0, {
    message: "Name at least one item to `add` or `remove`",
    path: ["add"],
  });

export type InventoryPatch = z.infer<typeof InventoryPatchSchema>;

/** `{items}` — the whole list, replaced. Held back from the agent's seats. */
export const InventorySetSchema = z.strictObject({ items: InventoryItems });

/**
 * What to judge the list against: a search-language scope (`tag:drink` when
 * absent) and how many rows each bucket answers with.
 */
export const InventoryMakeQuerySchema = z.strictObject({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

/* --- git (23d/D23) ------------------------------------------------------- */

/**
 * Which content type a git seat is talking about.
 *
 * A closed enum rather than a free string, so the published JSON Schema names
 * the choices (`term` joined at 31c) and a typo is a schema rejection instead of a `not_found`
 * from inside `git.ts`. Singular, because these name one item.
 */
export const GitTypeSchema = z.enum(["recipe", "group", "featured", "term"]);

export type GitTypeInput = z.infer<typeof GitTypeSchema>;

export const GitLogQuerySchema = z.strictObject({
  type: GitTypeSchema.optional(),
  slug: z.string().min(1).optional(),
  limit: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * A commit hash, in the only shape git will answer to.
 *
 * The pattern is published *and* re-checked. Here it buys an early, documented
 * rejection: the JSON Schema an MCP client reads says what a hash looks like,
 * so `{hash: "zzz"}` is refused before dispatch with the SDK's own message
 * (T28) instead of travelling two layers to be refused there. `git.ts` checks
 * the same pattern anyway, because that check is not about a request's shape —
 * it is what keeps a string from reaching git's argv as an option (T45), and a
 * direct caller of the module has no schema in front of it.
 *
 * Slugs and revisions stay bare strings on purpose: a revision is `HEAD~2`,
 * `v1.2`, a branch name or a hash, and enumerating that in a schema would
 * refuse legitimate input.
 */
export const GitHashSchema = z
  .string()
  .regex(/^[0-9a-f]{7,40}$/i, "Expected 7 to 40 hexadecimal characters");

export const GitRevertSchema = z.strictObject({
  hash: GitHashSchema,
});

export const GitRestoreSchema = z.strictObject({
  type: GitTypeSchema,
  slug: z.string().min(1),
  rev: z.string().min(1),
});

export const GitPushSchema = z.strictObject({
  remote: z.string().min(1).optional(),
  setUpstream: z.boolean().optional(),
});

/** `git fetch` and `git pull` (27b): which remote, defaulting to the upstream's. */
export const GitFetchSchema = z.strictObject({
  remote: z.string().min(1).optional(),
});

export const GitPullSchema = GitFetchSchema;

/**
 * `git sync {remote?}` (epic 28, D3). The mirror's ssh host and directory for
 * the mirror-dirty preflight are *not* accepted over the wire: they come from
 * the workstation's own configuration (28c) or the local CLI's flags, so a
 * request cannot choose what this process ssh-es to.
 */
export const GitSyncSchema = GitFetchSchema;

/** `git status --fetch`: refresh the remote refs first, so ahead/behind are current. */
export const GitStatusQuerySchema = z.strictObject({
  fetch: z.boolean().optional(),
});

export const GitDiffQuerySchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
});

export const GitFileQuerySchema = z.strictObject({
  type: GitTypeSchema,
  slug: z.string().min(1),
  rev: z.string().min(1),
});

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
  return (
    input
      .map((entry): z.infer<typeof GroupItemObjectSchema> => {
        if (typeof entry !== "string") return entry;
        const colon = entry.indexOf(":");
        if (colon === -1) return { recipe: entry.trim() };
        const label = entry.slice(colon + 1).trim();
        return {
          recipe: entry.slice(0, colon).trim(),
          ...(label ? { label } : {}),
        };
      })
      /* An item naming neither is a row the caller left blank, not an error. */
      .filter((item) => Boolean(item.recipe || item.group))
      /*
       * The parsed object keeps both keys optional — the XOR lives in a refine,
       * which zod cannot narrow a type through — while `GroupItem` is a union
       * that has already made the choice. The filter above is what makes the
       * assertion true; the entries themselves pass through verbatim, so an
       * object item lands on disk exactly as it was written.
       */
      .map((item) => item as GroupItem)
  );
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
