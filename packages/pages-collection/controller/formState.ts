import type { ContentFormState } from "@discontent/cms/forms/formState";

export interface PageFormErrors extends Record<string, string[] | undefined> {
  name?: string[];
  content?: string[];
  date?: string[];
  slug?: string[];
}

/**
 * Values echoed back on a failed round-trip, so the form can be remounted with
 * what the user typed instead of with the original record. This matters more
 * now than it did: the write path is authenticated, so a session that expired
 * mid-edit returns "Authentication required" — and without the echo that reply
 * would silently discard the edit it just refused.
 */
export type PageFormData = {
  name?: string;
  content?: string;
  slug?: string;
  date?: number;
};

export type PageFormState = ContentFormState<PageFormErrors, PageFormData>;
