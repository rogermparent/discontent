import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";

/** Blank text is absent text — the form always submits the input, empty or not. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const GroupItemSchema = z.object({
  recipe: z.string(),
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
     * A row whose recipe was never chosen is a row the user added and left
     * blank, not an error: the picker starts empty and "Add recipe" appends
     * another empty one. Dropping them here keeps the form forgiving and keeps
     * `items[].recipe` non-empty for everything downstream — the aggregate fold
     * would otherwise key a list on "".
     */
    .transform((items) => items.filter((item) => item.recipe.trim().length > 0))
    .transform((items) =>
      items.map((item) => ({ ...item, recipe: item.recipe.trim() })),
    ),
});

export type ParsedGroupFormData = z.infer<typeof GroupFormSchema>;

export default function parseGroupFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedGroupFormData> {
  return parseFormData(formData, GroupFormSchema);
}
