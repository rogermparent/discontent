import { ZodSafeParseResult, z } from "zod";
import parseFormData from "@discontent/cms/forms/parseFormData";
import dateEpochSchema from "@discontent/cms/forms/schema/dateEpoch";

/**
 * A link row. `links` is a repeatable field, and an empty repeatable emits no
 * FormData key at all — so "no links" parses as `undefined`, not `[]`. The form
 * submits a sentinel when the list is deliberately empty; see the `links` field
 * in the project form.
 */
const ProjectLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

/**
 * Decode the empty-list sentinel.
 *
 * With rows present the form emits `links[0].label`, `links[1].url`… and lodash
 * `set` builds an array. With none, it emits a single bare `links=""`, which
 * would otherwise reach zod as a string and fail. This turns it back into `[]`
 * so "the user removed every link" parses as an empty list rather than as
 * "links were never in the form".
 *
 * Today `buildProjectData` collapses `[]` and `undefined` to the same stored
 * value, so this is about the parse being truthful rather than about a live
 * bug — which is exactly the point at which it is cheap to get right.
 */
const emptyListSentinel = (value: unknown) => (value === "" ? [] : value);

/**
 * Treat an empty string as "not set".
 *
 * FormData only carries strings, so a `<select>` whose "none" option is
 * `value=""` submits `""` — and `z.enum([...]).optional()` accepts `undefined`,
 * not `""`. Without this, creating a project without choosing a status was
 * rejected outright with `Invalid option: expected one of "shipped"|"wip"|…`,
 * which is a confusing way to say "this field is optional".
 */
const blankAsAbsent = (value: unknown) => (value === "" ? undefined : value);

const ProjectFormSchema = z.object({
  name: z.string().min(1),
  content: z.string(),
  summary: z.string().optional(),
  /*
   * The image trio. Zod strips unknown keys, so their absence here was not a
   * missing feature so much as a silent one: a posted file was parsed away
   * before any code could look at it, and no error said so.
   *
   * `clearImage` is how "remove the image I already have" is expressed —
   * distinct from simply not posting a file, which means "leave it alone".
   * `imageImportUrl` carries an image chosen by URL rather than by file picker.
   */
  image: z.instanceof(File).optional(),
  clearImage: z.coerce.boolean().optional(),
  imageImportUrl: z.string().optional(),
  date: z.optional(dateEpochSchema),
  slug: z.string().optional(),
  role: z.string().optional(),
  client: z.string().optional(),
  status: z.preprocess(
    blankAsAbsent,
    z.enum(["shipped", "wip", "archived"]).optional(),
  ),
  featured: z.coerce.boolean().optional(),
  tags: z.array(z.string()).optional(),
  links: z.preprocess(emptyListSentinel, z.array(ProjectLinkSchema).optional()),
});

export type ParsedProjectFormData = z.infer<typeof ProjectFormSchema>;

export default function parseProjectFormData(
  formData: FormData,
): ZodSafeParseResult<ParsedProjectFormData> {
  return parseFormData(formData, ProjectFormSchema);
}
