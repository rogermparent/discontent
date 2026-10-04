import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";
import { normalizeTags } from "recipe-website-common/controller/normalizeTags";
import {
  DRINK_METHODS,
  type DrinkSpec,
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
        message: "Invalid URL",
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

const RecipeFormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  image: z.instanceof(File).optional(),
  clearImage: z.coerce.boolean(),
  video: z.instanceof(File).optional(),
  clearVideo: z.coerce.boolean(),
  videoImportUrl: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
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
  ingredients: z
    .array(
      z.object({
        ingredient: z.string().min(1),
        type: z.enum(["heading"]).optional(),
      }),
    )
    .optional(),
  instructions: z
    .array(
      z.union([
        z.object({
          name: z.string().optional(),
          text: z.string().min(1),
        }),
        z.object({
          name: z.string().min(1),
          instructions: z.array(
            z.object({
              name: z.string().optional(),
              text: z.string().min(1),
            }),
          ),
        }),
      ]),
    )
    .optional(),
  timelines: z
    .array(
      z.object({
        name: z.string().optional(),
        note: z.string().optional(),
        default_offset: optionalDurationSchema.optional(),
        events: z.array(
          z.object({
            name: z.string().optional(),
            activeTime: z.coerce.boolean(),
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
