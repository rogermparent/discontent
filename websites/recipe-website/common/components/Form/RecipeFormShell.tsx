"use client";

import { ReactNode } from "react";
import { FormShell } from "@discontent/component-library/components/Form/FormShell";
import { RecipeFormProvider, useRecipeFormInstance } from "./formContext";
import { ImportedRecipe } from "recipe-website-common/util/importRecipeData";

/**
 * Owns the TanStack Form instance for the recipe form and shares it with the
 * field components (RecipeFields) via context.
 *
 * The <form> element itself is now the shared FormShell (promoted in the
 * portfolio rebuild, PR 01d) — the submission mechanism is identical for every
 * content type, so only the *instance* and its context are recipe-specific.
 *
 * Children (the fields, messages, submit/overwrite buttons) are provided by each
 * page wrapper so their differing layouts are preserved.
 */
export function RecipeFormShell({
  action,
  recipe,
  slug,
  className,
  children,
}: {
  action: (formData: FormData) => void;
  recipe?: Partial<ImportedRecipe>;
  slug?: string;
  className?: string;
  children: ReactNode;
}) {
  const form = useRecipeFormInstance(recipe, slug);

  return (
    <RecipeFormProvider value={form}>
      <FormShell
        id="recipe-form"
        className={className}
        action={action}
        form={form}
      >
        {children}
      </FormShell>
    </RecipeFormProvider>
  );
}
