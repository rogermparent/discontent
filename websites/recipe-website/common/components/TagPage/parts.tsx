"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { buildTagExpansion } from "../../controller/tagExpansion";
import { matchesFilter, parseQuery } from "../SearchForm/queryLanguage";
import { useSearch } from "../SearchForm/SearchContext";

/**
 * Small pieces the `/tags` board and the term pages share (43t, canvas B).
 */

/**
 * One dot-leader line (the `/drinks` index's look, 42d): the label, a run of
 * dots, the count in mono. `depth` indents a narrower term under its parent.
 */
export function Leader({
  href,
  label,
  count,
  className,
  testId,
}: {
  href: string;
  label: ReactNode;
  count: number;
  className?: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        "group/leader flex min-h-7 min-w-0 flex-1 items-baseline gap-1.5 rounded-sm py-0.5 text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="min-w-0">{label}</span>
      <i
        aria-hidden
        className="min-w-3 flex-1 -translate-y-1 border-b border-dotted border-muted-foreground/70 group-hover/leader:border-primary"
      />
      <b className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
        {count}
      </b>
    </Link>
  );
}

/** A two-or-more-way switch: buttons with `aria-pressed` in a muted well. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className={cn(
        "flex shrink-0 gap-0.5 rounded-lg bg-muted p-[3px]",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "min-h-8 rounded-md px-3 text-sm",
            value === option.id
              ? "bg-background font-semibold text-foreground shadow-sm"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * How many recipes `/search?q=<query>` finds, from the browser's search
 * corpus (`useSearch`): the same `matchesFilter` and `tag:` expansion
 * search runs (D3), so "Show 38 recipes" opens exactly 38. `undefined`
 * until the corpus and the terms have landed.
 */
export function useQueryCount(query: string): number | undefined {
  const { allRecipes, allTerms, status } = useSearch();
  const resolver = useMemo(() => buildTagExpansion(allTerms), [allTerms]);
  return useMemo(() => {
    if (!query || status !== "success" || allTerms.length === 0) {
      return undefined;
    }
    const { filter } = parseQuery(query);
    return allRecipes.filter((recipe) =>
      matchesFilter(recipe, filter, resolver),
    ).length;
  }, [query, status, allRecipes, allTerms, resolver]);
}
