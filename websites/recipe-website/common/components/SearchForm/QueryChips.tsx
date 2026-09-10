"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { useSearch } from "./SearchContext";
import {
  cycleTermAt,
  filterTerms,
  removeTermAt,
  termText,
  type FilterTerm,
} from "./queryLanguage";

/**
 * The chip preview line: one chip per typed term in the query, above the tag
 * rail and below the ticker.
 *
 * **It renders nothing for an ordinary search.** The gate is
 * `parsedQuery.hasAdvancedSyntax`, which 21a landed for exactly this — a plain
 * `chocolate cake` gets no chips, no label and no box, so the default `/search`
 * view is byte-identical to what it was.
 *
 * Each chip is a **pair of sibling buttons** sharing one border, never a button
 * inside a button: `nested-interactive` is a `wcag2a` rule and this page's axe
 * case asserts `wcag2a` is clean. Same shape as the RECENT row, for the same
 * reason. The body cycles the term's operator; the `×` removes it.
 *
 * **The chip face is `raw.slice(start, end)` — the atom exactly as typed.** Not
 * built from the leaf's payload, because `value` is pre-folded: a chip drawn
 * from the AST's `value` would show `tag:creme` to someone who typed
 * `tag:Crème`. The span is the only source that can't lie about what is in the
 * field.
 *
 * No `aria-live` here. `SearchTicker` already owns a polite region reporting the
 * same change ("42 RESULTS · 2 FILTERS"), and two regions describing one edit
 * announce it twice.
 *
 * No clear-all button either. `TagFilterRail` renders "Clear tags" a few pixels
 * below whenever there is a tag term, and two near-identical clear controls
 * stacked reads worse than one — the per-chip `×` is the finer-grained path and
 * the rail's button is the coarse one.
 */
export function QueryChips() {
  const { query, parsedQuery, submitSearch } = useSearch();

  if (!parsedQuery.hasAdvancedSyntax) return null;

  // Advanced syntax with no *terms* — a lone `(`, or `a OR b` over bare words —
  // has nothing to preview. Render nothing rather than an empty labelled row.
  const terms = filterTerms(parsedQuery.filter);
  if (terms.length === 0) return null;

  // Both handlers are keyed on `query`, the same string `parsedQuery` — and so
  // every span below — was parsed from. That makes the offsets consistent by
  // construction within a render; the helpers revalidate anyway, and no-op
  // rather than mis-edit if they are handed a string that moved.
  const cycle = (term: FilterTerm) => submitSearch(cycleTermAt(query, term));
  const remove = (term: FilterTerm) => submitSearch(removeTermAt(query, term));

  return (
    <div
      role="group"
      aria-label="Active filters"
      data-testid="query-chips"
      className="my-2 flex flex-row flex-wrap items-center gap-2"
    >
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        Filters
      </span>
      {terms.map((term) => {
        const label = termText(query, term);
        // Naming the *destination* where that costs nothing — negation has two
        // states and `term.negated` is one of them. For `time:` and the dates it
        // would mean restating the cycle table here, so those say what the
        // button does instead of duplicating the rule it follows.
        const cycleLabel =
          term.node.type === "text"
            ? `${term.negated ? "Include" : "Exclude"} ${label}`
            : `Cycle the operator on ${label}`;
        return (
          <span
            // Position, not text: a query may name the same term twice, and each
            // copy edits independently.
            key={`${term.start}-${term.end}`}
            className="inline-flex items-stretch"
          >
            <button
              type="button"
              onClick={() => cycle(term)}
              aria-label={cycleLabel}
              className="rounded-l-md focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <Badge
                data-testid="query-chip-face"
                variant={term.negated ? "outline" : "secondary"}
                className={clsx(
                  "h-full cursor-pointer rounded-r-none border-r-0 font-mono",
                  term.negated
                    ? "border-primary/50 text-muted-foreground line-through decoration-1"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {label}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => remove(term)}
              aria-label={`Remove ${label}`}
              className="flex items-center rounded-r-md border border-primary/50 px-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
