import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";

/**
 * A feature names exactly one target: a recipe, or — since 22g — a group.
 *
 * Both fields are optional-and-trimmed rather than `min(1)`, because
 * `parseFormData` hands every field over as a raw string and the form renders
 * only the *active* input. An inactive input that stayed mounted would submit
 * `""`, which is why the trim collapses empty to `undefined` before the refine
 * counts: "" is the same as absent here, and treating it otherwise would let a
 * hidden field decide what a feature points at.
 *
 * The refine is an XOR rather than a pair of `required` rules, so the error is
 * one message on one field rather than two contradictory ones. It reports on
 * `recipe` because that is the toggle's default side and the field a form with
 * neither set is looking at.
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
    date: z.optional(dateEpochSchema),
    note: z.string().optional(),
    slug: z.string().optional(),
  })
  .refine((data) => Boolean(data.recipe) !== Boolean(data.group), {
    message: "Choose a recipe or a group",
    path: ["recipe"],
  });

export type ParsedFeaturedRecipeFormData = z.infer<
  typeof FeaturedRecipeFormSchema
>;

export default function parseFeaturedRecipeFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedFeaturedRecipeFormData> {
  return parseFormData(formData, FeaturedRecipeFormSchema);
}
