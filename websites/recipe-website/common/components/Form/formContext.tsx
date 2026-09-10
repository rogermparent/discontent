"use client";

import { createContext, useContext } from "react";
import { useForm } from "@tanstack/react-form";
import { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import {
  Ingredient,
  InstructionEntry,
  Timeline,
} from "recipe-website-common/controller/types";

/**
 * The controlled subset of the recipe form managed by TanStack Form. Fields
 * are migrated to this incrementally; inputs not yet listed here still submit
 * via their uncontrolled `name` attributes (the form posts FormData either way).
 */
export interface RecipeFormValues {
  name: string;
  slug: string;
  description: string;
  recipeYield: string;
  tags: string[];
  ingredients: Ingredient[];
  instructions: InstructionEntry[];
  timelines: Timeline[];
  prepTime: number;
  cookTime: number;
  totalTime: number;
  date?: number;
  /**
   * Provenance (D6/22a). Flat empty strings rather than an optional object:
   * the three inputs are always mounted, and `parseRecipeFormData` is what
   * collapses an untouched block back to no `source` at all.
   */
  source: { url: string; name: string; author: string };
}

export function recipeToFormValues(
  recipe?: Partial<ImportedRecipe>,
  slug?: string,
): RecipeFormValues {
  return {
    name: recipe?.name ?? "",
    slug: slug ?? "",
    description: recipe?.description ?? "",
    recipeYield: recipe?.recipeYield ?? "",
    tags: recipe?.tags ?? [],
    ingredients: recipe?.ingredients ?? [],
    instructions: recipe?.instructions ?? [],
    timelines: recipe?.timelines ?? [],
    prepTime: recipe?.prepTime ?? 0,
    cookTime: recipe?.cookTime ?? 0,
    totalTime: recipe?.totalTime ?? 0,
    date: recipe?.date,
    source: {
      url: recipe?.source?.url ?? "",
      name: recipe?.source?.name ?? "",
      author: recipe?.source?.author ?? "",
    },
  };
}

/** Creates the recipe form instance. Used by RecipeFormShell. */
export function useRecipeFormInstance(
  recipe?: Partial<ImportedRecipe>,
  slug?: string,
) {
  return useForm({
    defaultValues: recipeToFormValues(recipe, slug),
  });
}

export type RecipeForm = ReturnType<typeof useRecipeFormInstance>;

const RecipeFormContext = createContext<RecipeForm | undefined>(undefined);

export const RecipeFormProvider = RecipeFormContext.Provider;

export function useRecipeForm(): RecipeForm {
  const form = useContext(RecipeFormContext);
  if (!form) {
    throw new Error("useRecipeForm must be used within a RecipeFormShell");
  }
  return form;
}
