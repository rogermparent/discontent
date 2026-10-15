"use client";

import { useBookmarks } from "recipe-website-common/context/BookmarksContext";
import ClientRecipeList from "recipe-website-common/components/ClientList";
import Link from "next/link";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { EmptyState } from "recipe-website-common/components/EmptyState";
import { Button } from "@discontent/component-library/components/ui/button";
import { useState } from "react";
import {
  RecipeSort,
  RecipeSortControl,
  useSortedRecipes,
} from "recipe-website-common/components/RecipeSort";

/**
 * `/bookmarks`, labelled "Saved" since the usability pass (U2): the verb
 * people use. The URL, the storage key and the bookmark button keep their
 * names.
 */
export default function BookmarksPage() {
  const [{ bookmarks }] = useBookmarks();
  const [sort, setSort] = useState<RecipeSort>("newest");
  const sortedBookmarks = useSortedRecipes(bookmarks, sort) ?? [];

  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>Saved</PageHeading>
        {bookmarks && bookmarks.length > 0 ? (
          <>
            <div className="mb-2 flex justify-end">
              <RecipeSortControl
                value={sort}
                onChange={setSort}
                includeRelevance={false}
              />
            </div>
            <ClientRecipeList recipes={sortedBookmarks} />
          </>
        ) : (
          <EmptyState
            title="Nothing saved yet"
            message="Save a recipe with its bookmark button and it shows up here."
            action={
              <Button asChild>
                <Link href="/recipes">Browse recipes</Link>
              </Button>
            }
          />
        )}
      </PageSection>
    </PageMain>
  );
}
