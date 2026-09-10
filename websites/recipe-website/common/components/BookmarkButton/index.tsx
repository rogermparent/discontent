"use client";

import { Button } from "@discontent/component-library/components/ui/button";
import { useBookmarks } from "../../context/BookmarksContext";
import { MassagedRecipeEntry } from "../../controller/data/read";
import clsx from "clsx";

export default function BookmarkButton({
  recipe,
  className,
}: {
  recipe: MassagedRecipeEntry;
  className?: string;
}) {
  // Hydration safety: we only want to show the active state on client
  const context = useBookmarks();
  // If context is missing (e.g. server rendering without provider up tree, or before hydration), handle gracefully
  if (!context) return null;

  const [_bookmarksContext, { toggleBookmark, isBookmarked }] = context;
  const bookmarked = isBookmarked(recipe.slug);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={clsx(
        "bg-background/80 backdrop-blur-sm hover:bg-background",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleBookmark(recipe);
      }}
      title={bookmarked ? "Remove Bookmark" : "Bookmark"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={clsx(
          "size-5 transition-colors duration-200",
          bookmarked
            ? "text-primary"
            : "text-muted-foreground hover:text-primary",
        )}
      >
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
    </Button>
  );
}
