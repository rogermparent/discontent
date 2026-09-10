"use client";

import { useState, useEffect } from "react";
import {
  Errors,
  FieldWrapper,
} from "@discontent/component-library/components/Form";
import { Button } from "@discontent/component-library/components/Button";
import SearchFormModal from "../../../SearchForm/SearchFormModal";
import { MassagedRecipeEntry } from "../../../../controller/data/read";

export function RecipeSelectInput({
  name,
  id = name,
  defaultValue,
  label,
  errors,
  required = false,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
}) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    defaultValue || null,
  );
  const [selectedRecipe, setSelectedRecipe] =
    useState<MassagedRecipeEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(defaultValue));
  /*
   * The hydration read failed — almost always a 404, because the slug names a
   * recipe that has since been renamed or deleted. That is an ordinary state
   * for a group (D3: nothing rewrites `items[].recipe` when a recipe moves),
   * and before this the field simply rendered its empty "Select Recipe" state
   * while the hidden input went on submitting the slug — so an edit that
   * touched nothing looked like it had cleared the row, and saving it kept the
   * dangle anyway. Saying so is the honest version.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  // Fetch recipe data if defaultValue is provided
  useEffect(() => {
    if (isLoading) {
      const value = selectedSlug || defaultValue;
      if (value) {
        fetch(`/api/recipe/${value}`)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`Failed to fetch recipe: ${res.status}`);
            }
            return res.json();
          })
          .then((recipe: MassagedRecipeEntry) => {
            setSelectedRecipe(recipe);
            setLoadFailed(false);
          })
          .catch((err) => {
            console.error("Failed to fetch recipe", value, err);
            setLoadFailed(true);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
  }, [defaultValue, selectedSlug, isLoading]);

  const handleSelectRecipe = (recipe: MassagedRecipeEntry) => {
    setSelectedSlug(recipe.slug);
    setSelectedRecipe(recipe);
    setLoadFailed(false);
  };

  const handleClear = () => {
    setSelectedSlug(null);
    setSelectedRecipe(null);
    setLoadFailed(false);
  };

  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <input
        type="hidden"
        name={name}
        id={id}
        value={selectedSlug || ""}
        required={required}
      />
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm">Loading recipe...</p>
        ) : selectedRecipe ? (
          <div className="flex items-center gap-2">
            <p className="text-sm">Selected: {selectedRecipe.name}</p>
            <Button type="button" onClick={handleClear}>
              Clear
            </Button>
          </div>
        ) : loadFailed && selectedSlug ? (
          <div className="flex items-center gap-2">
            <p className="text-sm" data-testid="recipe-select-missing">
              Selected: {selectedSlug} (recipe not found)
            </p>
            <Button type="button" onClick={handleClear}>
              Clear
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setIsModalOpen(true)}>
            Select Recipe
          </Button>
        )}
      </div>
      <SearchFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectRecipe={handleSelectRecipe}
      />
    </FieldWrapper>
  );
}
