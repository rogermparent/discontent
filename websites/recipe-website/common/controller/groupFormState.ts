import type { ContentFormState } from "recipe-website-common/controller/formState";

export interface GroupFormErrors extends Record<string, string[] | undefined> {
  name?: string[];
  kind?: string[];
  description?: string[];
  date?: string[];
  slug?: string[];
  /**
   * Flattened field errors are keyed by the *top-level* field, so anything zod
   * rejects inside a row — a blank `recipe`, say — arrives here as one list
   * rather than per row. The form prints them above the item rows.
   */
  items?: string[];
}

export type GroupFormState = ContentFormState<GroupFormErrors>;
