import type { ContentFormState } from "recipe-website-common/controller/formState";

export interface FeaturedRecipeFormErrors extends Record<
  string,
  string[] | undefined
> {
  recipe?: string[];
  /** 22g: the group picker's own errors, when the toggle is on Group. */
  group?: string[];
  date?: string[];
  note?: string[];
  slug?: string[];
}

export type FeaturedRecipeFormState =
  ContentFormState<FeaturedRecipeFormErrors>;
