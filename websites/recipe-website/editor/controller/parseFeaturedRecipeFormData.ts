import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
import { tagSlug } from "recipe-website-common/controller/tagSlug";

/**
 * A feature names exactly one target: a recipe, a group (22g), or a term record
 * (24c).
 *
 * All three fields are optional-and-trimmed rather than `min(1)`, because
 * `parseFormData` hands every field over as a raw string and the form renders
 * only the *active* input. An inactive input that stayed mounted would submit
 * `""`, which is why the trim collapses empty to `undefined` before the refine
 * counts: "" is the same as absent here, and treating it otherwise would let a
 * hidden field decide what a feature points at.
 *
 * `term` is put through `tagSlug` rather than taken verbatim, where the other
 * two arrive from pickers that already hold a slug. It is a free-text input —
 * there is no term picker in 24c — so "Christmas Cookies" typed into it has to
 * become `christmas-cookies` before the seat looks for a record, exactly as
 * every other place the site turns a typed tag into an identity.
 *
 * The refine counts rather than comparing, since 24c: `Boolean(a) !== Boolean(b)`
 * says "exactly one" only for a pair. It reports on `recipe` because that is
 * the toggle's default side and the field a form with none set is looking at.
 */
const FeaturedRecipeFormSchema = z
  .object({
    recipe: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    group: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    term: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? tagSlug(trimmed) : undefined;
      }),
    date: z.optional(dateEpochSchema),
    note: z.string().optional(),
    slug: z.string().optional(),
  })
  .refine(
    (data) => [data.recipe, data.group, data.term].filter(Boolean).length === 1,
    {
      message: "Choose a recipe, a group or a term",
      path: ["recipe"],
    },
  );

export type ParsedFeaturedRecipeFormData = z.infer<
  typeof FeaturedRecipeFormSchema
>;

export default function parseFeaturedRecipeFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedFeaturedRecipeFormData> {
  return parseFormData(formData, FeaturedRecipeFormSchema);
}
