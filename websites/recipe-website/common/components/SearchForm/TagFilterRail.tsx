"use client";

import clsx from "clsx";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Button } from "@discontent/component-library/components/ui/button";
import { useSearch } from "./SearchContext";
import { fold, positiveTagValues, removeFilterTerms } from "./queryLanguage";

/**
 * A horizontal rail of tag chips for the whole corpus. Each chip writes a
 * `tag:` term into the query — the rail has no state of its own, it just reads
 * back what the query says. Rendered above the results so it works as a browse
 * affordance even with no text query.
 *
 * The AND/OR toggle is gone: combining is something you *type* now
 * (`tag:a OR tag:b`), which is both visible and shareable, unlike a mode flag
 * that only this one rail ever displayed.
 */
export function TagFilterRail() {
  const { allTags, parsedQuery, toggleTagTerm, query, submitSearch } =
    useSearch();

  if (allTags.length === 0) return null;

  // Folded, so a chip reads as pressed when the query names it in any casing or
  // accenting the engine would consider equivalent.
  const selected = new Set(positiveTagValues(parsedQuery.filter));
  const hasTagTerms = selected.size > 0;

  return (
    <div className="my-2 flex flex-col gap-2" aria-label="Tag filters">
      <div className="flex flex-row flex-wrap items-center gap-1.5">
        {allTags.map((tag) => {
          const isSelected = selected.has(fold(tag).trim());
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTagTerm(tag)}
              aria-pressed={isSelected}
              aria-label={`Filter by tag ${tag}`}
              className="rounded-md focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <Badge
                variant={isSelected ? "secondary" : "outline"}
                className={clsx(
                  "cursor-pointer",
                  isSelected
                    ? "ring-2 ring-inset ring-primary font-semibold"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {tag}
              </Badge>
            </button>
          );
        })}
      </div>
      {hasTagTerms && (
        <div className="flex flex-row flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {/* Strips `tag:` terms only — free text and any other filter the user
              typed survive, which is what makes this safe beside a live field. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => submitSearch(removeFilterTerms(query, "tag"))}
          >
            Clear tags
          </Button>
        </div>
      )}
    </div>
  );
}
