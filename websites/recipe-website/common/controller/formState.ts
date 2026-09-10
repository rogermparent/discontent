import type {
  Ingredient,
  InstructionEntry,
  RecipeSource,
  Timeline,
} from "recipe-website-common/controller/types";

// Promoted to @discontent/cms (portfolio rebuild PR 01d). That one import was
// the only thing tying createGenericActions to this site; re-exported here so
// recipe's existing import paths keep working. Imported as well as re-exported
// because `export … from` does not bind the name locally, and RecipeFormState
// below is defined in terms of it.
import type { ContentFormState } from "@discontent/cms/forms/formState";
export type { ContentFormState };

export interface RecipeFormErrors extends Record<string, string[] | undefined> {
  description?: string[];
  name?: string[];
  date?: string[];
  slug?: string[];
}

export type RecipeFormData = {
  name?: string;
  description?: string;
  slug?: string;
  date?: number;
  ingredients?: Ingredient[];
  instructions?: InstructionEntry[];
  timelines?: Timeline[];
  tags?: string[];
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  recipeYield?: string;
  videoUrl?: string;
  source?: RecipeSource;
};

export type RecipeFormState = ContentFormState<
  RecipeFormErrors,
  RecipeFormData
>;
