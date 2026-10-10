/**
 * The term form's server half (31e), everything but the `"use server"` seam.
 *
 * The browser form is a fourth transport onto 31c's term seats, after the API,
 * the CLI and MCP — and like them it validates nothing of its own. FormData
 * becomes the seat's own input (`TermInputSchema` / `TermPatchSchema`),
 * `createTerm` / `updateTerm` decide, and a refusal comes back as the seat's
 * error, filed under the field it is about. That is what "validation is
 * identical" means here: the cycle walk, the record-only parent rule, the
 * pinned-must-carry rule and the label check are the seat's, and a form that
 * re-implemented any of them would drift from the CLI on the first change.
 *
 * Its own module rather than inside `actions/tagTerms.ts` because a
 * `"use server"` module may export only async functions, and the mapping below
 * is the part worth unit-testing as a pure function. `submitTermForm` takes the
 * `CurationContext` from its caller, so a test drives it against a tmpdir and
 * the action hands it the session's context.
 */
import parseFormData from "@discontent/cms/forms/parseFormData";
import { exists } from "fs-extra";
import type {
  TermFormErrors,
  TermFormState,
  TermFormValues,
} from "recipe-website-common/controller/termFormState";
import { z } from "zod";
import { termPath, type CurationContext } from "./curation/context";
import { toErrorObject } from "./curation/errors";
import type { TermInput, TermPatch } from "./curation/schema";
import { createTerm, updateTerm } from "./curation/terms";

/** Blank text is absent text: the form always submits every input. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

/*
 * Deliberately lenient: nothing here refuses what the seat would accept, or
 * accepts what it would refuse. `label` stays a string even when blank, so the
 * seat's "A term needs a label" is the message a blank label gets.
 */
const TermFormSchema = z.object({
  label: z.string().default(""),
  slug: optionalText,
  description: optionalText,
  /** `""` is the select's "None": a root term. */
  parent: optionalText,
  /*
   * The chips (T13). `.default([])` because `FormData` cannot represent an
   * empty array: removing every chip submits no `pinned[i]` key at all, and
   * that is the edit that means "clear the pinned front".
   */
  pinned: z
    .array(z.string())
    .default([])
    .transform((pinned) =>
      pinned.map((slug) => slug.trim()).filter((slug) => slug.length > 0),
    ),
  /** `ImageInput`'s hidden field, set when a URL is typed (31e: URL only). */
  imageImportUrl: optionalText,
  clearImage: z.coerce.boolean(),
});

export type ParsedTermForm = z.infer<typeof TermFormSchema>;

export function parseTermFormData(formData: FormData) {
  return parseFormData(formData, TermFormSchema);
}

/**
 * A new record's input. Only what was filled in is sent, so an empty
 * description writes no `description` key, as the CLI's create does.
 * `slug` is the page's when it fixes one (`/tags/<slug>/edit` for a term that
 * has carriers and no record yet), else the form's Slug field, else the seat
 * derives it from the label.
 */
export function termInputFromForm(
  parsed: ParsedTermForm,
  slug?: string,
): TermInput {
  const fixedSlug = slug ?? parsed.slug;
  return {
    label: parsed.label,
    ...(fixedSlug ? { slug: fixedSlug } : {}),
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.parent ? { parent: parsed.parent } : {}),
    ...(parsed.pinned.length > 0 ? { pinned: parsed.pinned } : {}),
    ...(parsed.imageImportUrl ? { imageImportUrl: parsed.imageImportUrl } : {}),
  };
}

/**
 * An existing record's patch. The form shows every field, so every field is
 * stated: a blank description, "None" as parent and no chips all mean
 * *clear* (`null`), never "leave alone". The picture is the exception — the
 * form never shows the stored file's URL, so an empty URL field leaves it, a
 * typed URL replaces it, and "Remove Image" clears it.
 */
export function termPatchFromForm(parsed: ParsedTermForm): TermPatch {
  return {
    label: parsed.label,
    description: parsed.description ?? null,
    parent: parsed.parent ?? null,
    pinned: parsed.pinned.length > 0 ? parsed.pinned : null,
    ...(parsed.imageImportUrl
      ? { imageImportUrl: parsed.imageImportUrl }
      : parsed.clearImage
        ? { imageImportUrl: null }
        : {}),
  };
}

/** What the form submitted, for the echo on a refusal. */
export function termFormValues(parsed: ParsedTermForm): TermFormValues {
  return {
    label: parsed.label,
    ...(parsed.slug ? { slug: parsed.slug } : {}),
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.parent ? { parent: parsed.parent } : {}),
    pinned: parsed.pinned,
    ...(parsed.imageImportUrl ? { imageImportUrl: parsed.imageImportUrl } : {}),
  };
}

/**
 * Which form field a seat issue's path names: its first segment, so
 * `pinned.1` is the pinned chips. `imageImportUrl` is shown as the image
 * field. `date` and `(root)` have no field on the form and go to the message.
 */
const FIELD_OF_PATH: Record<string, keyof TermFormErrors> = {
  label: "label",
  slug: "slug",
  description: "description",
  parent: "parent",
  pinned: "pinned",
  imageImportUrl: "image",
};

/** The top-line message when every reason landed on a field. */
export const TERM_NOT_SAVED = "The term was not saved.";

/**
 * A seat refusal as form state — the one mapping, pure.
 *
 * - `term_cycle` and `unknown_term` are about the **parent**: a parent under
 *   the term itself (24-T8 included), or one with no record.
 * - `slug_conflict` is the **slug** (the engine's `SlugConflictError` or the
 *   seat's own), and `slugConflict` carries the taken slug as the recipe form
 *   has it.
 * - `import_failed` is the **image**: the URL could not be fetched.
 * - `validation` files each issue under its path's field; an issue with no
 *   field (and a validation error with no issues at all) is the message.
 * - Anything else — `not_found` for a record deleted under the form, an
 *   unexpected throw — is the message alone.
 *
 * When at least one reason landed on a field, the message is `TERM_NOT_SAVED`
 * rather than the seat's sentence again, so the reason is printed once, beside
 * the field it is about.
 */
export function termFormStateFromError(
  error: unknown,
  values?: TermFormValues,
): TermFormState {
  const { error: body } = toErrorObject(error);
  const errors: TermFormErrors = {};
  const unplaced: string[] = [];
  const add = (field: keyof TermFormErrors, message: string) => {
    (errors[field] ??= []).push(message);
  };

  switch (body.code) {
    case "term_cycle":
    case "unknown_term":
      add("parent", body.message);
      break;
    case "slug_conflict":
      add("slug", body.message);
      break;
    case "import_failed":
      add("image", body.message);
      break;
    case "validation":
      for (const issue of body.issues ?? []) {
        const field = FIELD_OF_PATH[issue.path.split(".")[0]];
        if (field) add(field, issue.message);
        else unplaced.push(`${issue.path}: ${issue.message}`);
      }
      break;
    default:
      break;
  }

  const placed = Object.keys(errors).length > 0;
  const message = !placed
    ? body.message
    : unplaced.length > 0
      ? `${TERM_NOT_SAVED} ${unplaced.join("; ")}`
      : body.code === "validation" && body.message !== "Invalid input"
        ? `${TERM_NOT_SAVED} ${body.message}.`
        : TERM_NOT_SAVED;

  return {
    message,
    errors,
    ...(body.code === "slug_conflict" && body.slug
      ? { slugConflict: body.slug }
      : {}),
    ...(values ? { formData: values } : {}),
  };
}

/**
 * Which seat a submission goes to.
 *
 * - `new` — `/tags/new`: `createTerm`, slug from the form or the label.
 * - `edit` — `/tags/<slug>/edit`: `updateTerm` when the record exists, and
 *   `createTerm` at that slug when it does not yet (a term that so far lives
 *   only on its carriers). Decided here, on the server, from the data file —
 *   not from what the page believed when it rendered — and the seat still
 *   refuses a race either way (`slug_conflict` / `not_found`).
 */
export type TermFormTarget = { kind: "new" } | { kind: "edit"; slug: string };

export type TermFormOutcome =
  | { ok: true; slug: string; warnings?: string[] }
  | { ok: false; state: TermFormState };

export async function submitTermForm(
  ctx: CurationContext,
  target: TermFormTarget,
  formData: FormData,
): Promise<TermFormOutcome> {
  const parsed = parseTermFormData(formData);
  if (!parsed.success) {
    return {
      ok: false,
      state: {
        message: "Error parsing term",
        errors: z.flattenError(parsed.error).fieldErrors as TermFormErrors,
      },
    };
  }
  const values = termFormValues(parsed.data);
  try {
    const result =
      target.kind === "edit" && (await exists(termPath(ctx, target.slug)))
        ? await updateTerm(ctx, target.slug, termPatchFromForm(parsed.data))
        : await createTerm(
            ctx,
            termInputFromForm(
              parsed.data,
              target.kind === "edit" ? target.slug : undefined,
            ),
          );
    return {
      ok: true,
      slug: result.slug,
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  } catch (error) {
    return { ok: false, state: termFormStateFromError(error, values) };
  }
}
