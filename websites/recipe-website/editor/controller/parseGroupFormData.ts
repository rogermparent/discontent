import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
import type { GroupItem } from "recipe-website-common/controller/types";

/** Blank text is absent text — the form always submits the input, empty or not. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

/**
 * One row of the items fieldset: a recipe the picker chose, or a sub-group the
 * form is carrying through read-only (23c/D18).
 *
 * Both refs are optional and neither is refused when both arrive, unlike the
 * JSON schema's XOR: this parses a *browser form*, whose group rows are hidden
 * inputs the page rendered from what was already on disk, and the honest
 * failure mode for a hand-forged post is a row that writes one key, not a 400
 * on a form nobody can submit wrong. `{group}` wins because a group row has no
 * recipe input at all.
 */
const GroupItemSchema = z.object({
  recipe: optionalText,
  group: optionalText,
  label: optionalText,
  note: optionalText,
});

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  /*
   * Defaulted rather than required so a form posted without the select — a
   * programmatic write, or a future create surface — lands on the harmless
   * kind rather than failing validation.
   */
  kind: z.enum(["meal-plan", "collection"]).default("collection"),
  description: optionalText,
  /*
   * The group's own picture (22h), declared exactly as the recipe form declares
   * its own: the file itself, and the checkbox that clears one. There is no
   * `imageImportUrl` here — the browser form has no import flow, and the
   * import-by-URL path is the CLI's (`--image-url` → `GroupInputSchema`).
   */
  image: z.instanceof(File).optional(),
  clearImage: z.coerce.boolean(),
  date: z.optional(dateEpochSchema),
  slug: z.string().optional(),
  /*
   * `.default([])` is load-bearing (T11): `FormData` cannot represent an empty
   * array, so a group with every row removed submits no `items[...]` key at all
   * and the parsed value is `undefined`. Without the default that is a
   * validation failure on the one edit a curator most wants — emptying a group
   * — rather than an empty group.
   */
  items: z
    .array(GroupItemSchema)
    .default([])
    /*
     * A row that names neither is a row the user added and left blank, not an
     * error: the picker starts empty and "Add recipe" appends another empty
     * one. Dropping them here keeps the form forgiving and keeps every ref
     * downstream non-empty — the aggregate folds would otherwise key a list on
     * "". `optionalText` has already trimmed and emptied both.
     */
    .transform((items) =>
      items.filter((item) => Boolean(item.recipe || item.group)),
    )
    /*
     * One key each, group first. The rows are what goes on disk, and a recipe
     * row carrying `group: undefined` — or worse, both — would be a data file
     * that no longer matches `GroupItem`'s union.
     */
    .transform((items): GroupItem[] =>
      items.map(({ recipe, group, label, note }) => ({
        ...(group ? { group } : { recipe: recipe as string }),
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
      })),
    ),
});

export type ParsedGroupFormData = z.infer<typeof GroupFormSchema>;

export default function parseGroupFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedGroupFormData> {
  return parseFormData(formData, GroupFormSchema);
}
