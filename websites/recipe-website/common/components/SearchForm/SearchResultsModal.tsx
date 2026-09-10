"use client";

import { useSearch } from "./SearchContext";
import SearchList from "../SearchList";
import { MassagedRecipeEntry } from "../../controller/data/read";
import { EmptyState } from "../EmptyState";
import { SearchSkeleton } from "./SearchSkeleton";
import { Button } from "@discontent/component-library/components/ui/button";

interface SearchResultsModalProps {
  onRecipeSelect: (recipe: MassagedRecipeEntry) => void;
}

export function SearchResultsModal({
  onRecipeSelect,
}: SearchResultsModalProps) {
  const {
    query,
    parsedQuery,
    displayedRecipes,
    isSearching,
    status,
    error,
    retry,
  } = useSearch();

  if (status === "error") {
    return (
      <EmptyState
        title="Search is unavailable"
        message={error?.message || "Something went wrong loading recipes."}
        action={
          <Button type="button" onClick={retry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (isSearching) {
    return <SearchSkeleton />;
  }

  if (query && (!displayedRecipes || displayedRecipes.length === 0)) {
    return <EmptyState message={`No recipes match “${query}”.`} />;
  }

  return (
    <SearchList
      recipeResults={displayedRecipes}
      highlightQuery={parsedQuery.text}
      renderItemWrapper={(recipe, content) => (
        <button
          type="button"
          onClick={() => onRecipeSelect(recipe)}
          className="text-left w-full h-full block"
        >
          {content}
        </button>
      )}
    />
  );
}
