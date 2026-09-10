"use client";

import { X } from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import { useSearch } from "./SearchContext";

/**
 * The RECENT row: ember-outlined chips for the last few *committed* queries.
 * Only rendered on the idle `/search` view (no query, no tags) — it is a
 * standing-start affordance, so it vanishes the moment the user types.
 *
 * Each chip is a **pair of sibling buttons** (re-run + remove) sharing one
 * border, never a button nested inside a button: `nested-interactive` is a
 * `wcag2a` rule, and this page's axe case asserts `wcag2a` is clean.
 */
export function RecentSearches() {
  const {
    recentSearches,
    submitSearch,
    removeRecentSearch,
    clearRecentSearches,
  } = useSearch();

  if (recentSearches.length === 0) return null;

  return (
    <div className="my-3 flex flex-row flex-wrap items-center gap-2">
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        Recent
      </span>
      {recentSearches.map((entry) => (
        <span key={entry} className="inline-flex items-stretch">
          <button
            type="button"
            onClick={() => submitSearch(entry)}
            aria-label={`Search again for ${entry}`}
            className="rounded-l-md focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <Badge
              variant="outline"
              className="h-full cursor-pointer rounded-r-none border-r-0 border-primary/50 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {entry}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => removeRecentSearch(entry)}
            aria-label={`Remove ${entry} from recent searches`}
            className="flex items-center rounded-r-md border border-primary/50 px-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={clearRecentSearches}
      >
        Clear
      </Button>
    </div>
  );
}
