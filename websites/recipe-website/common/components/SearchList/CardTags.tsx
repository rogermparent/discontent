"use client";

import clsx from "clsx";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { useSearch } from "../SearchForm/SearchContext";
import { fold, positiveTagValues } from "../SearchForm/queryLanguage";

/** Max tag chips shown on a card before collapsing to "+N". */
const MAX_CARD_TAGS = 3;

/**
 * Compact, single clamped row of tag chips on a search card. Each chip writes a
 * `tag:` term into the shared query (the field and the rail on the search page
 * both reflect it). Kept to one non-wrapping row so card heights stay uniform.
 */
export function CardTags({ tags }: { tags: string[] }) {
  const { toggleTagTerm, parsedQuery } = useSearch();
  const selected = new Set(positiveTagValues(parsedQuery.filter));
  const shown = tags.slice(0, MAX_CARD_TAGS);
  const extra = tags.length - shown.length;
  return (
    <div className="flex flex-row flex-nowrap items-center gap-1 overflow-hidden px-2 pb-2">
      {shown.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => toggleTagTerm(tag)}
          aria-label={`Filter by tag ${tag}`}
          className="min-w-0"
        >
          <Badge
            variant="secondary"
            className={clsx(
              "cursor-pointer max-w-full",
              selected.has(fold(tag).trim()) &&
                "ring-2 ring-inset ring-primary font-semibold",
            )}
          >
            {tag}
          </Badge>
        </button>
      ))}
      {extra > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">+{extra}</span>
      )}
    </div>
  );
}
