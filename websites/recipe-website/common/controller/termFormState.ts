import type { ContentFormState } from "recipe-website-common/controller/formState";

/**
 * The term form's field errors (31e), keyed by the form's own field names.
 *
 * The keys are the term seat's input keys too (`TermInputSchema` /
 * `TermPatchSchema`), which is what lets `termFormStateFromError` file a seat
 * issue such as `pinned.1` under `pinned` without a translation table. `image`
 * is the form's name for the seat's `imageImportUrl`, because that is the
 * field the person sees.
 */
export interface TermFormErrors extends Record<string, string[] | undefined> {
  label?: string[];
  slug?: string[];
  description?: string[];
  image?: string[];
  parent?: string[];
  pinned?: string[];
}

/** What the form submitted, echoed back on a refusal so nothing typed is lost. */
export interface TermFormValues {
  label?: string;
  slug?: string;
  description?: string;
  parent?: string;
  pinned?: string[];
  imageImportUrl?: string;
}

export type TermFormState = ContentFormState<TermFormErrors, TermFormValues>;
