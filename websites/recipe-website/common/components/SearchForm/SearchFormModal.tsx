"use client";

import { Suspense } from "react";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@discontent/component-library/components/ui/dialog";
import { SearchInput } from "./SearchInput";
import { SearchResultsModal } from "./SearchResultsModal";
import { useSearchURLSync } from "./useSearchURLSync";
import { MassagedRecipeEntry } from "../../controller/data/read";

interface SearchFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipe: (recipe: MassagedRecipeEntry) => void;
}

function SearchModalContent({
  onRecipeSelect,
}: {
  onRecipeSelect: (recipe: MassagedRecipeEntry) => void;
}) {
  useSearchURLSync(false); // Disable URL sync for modal

  return (
    <>
      <SearchInput placeholder="Search recipes…" />
      <SearchResultsModal onRecipeSelect={onRecipeSelect} />
    </>
  );
}

export default function SearchFormModal({
  isOpen,
  onClose,
  onSelectRecipe,
}: SearchFormModalProps) {
  const handleSelectRecipe = (recipe: MassagedRecipeEntry) => {
    onSelectRecipe(recipe);
    onClose();
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-background-light dark:bg-background-dark">
        <DialogHeader>
          <DialogTitle>Select a Recipe</DialogTitle>
        </DialogHeader>
        <Suspense fallback={<div>Loading...</div>}>
          <SearchModalContent onRecipeSelect={handleSelectRecipe} />
        </Suspense>
      </DialogContent>
    </DialogRoot>
  );
}
