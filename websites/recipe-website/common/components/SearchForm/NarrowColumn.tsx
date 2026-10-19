"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { Button } from "@discontent/component-library/components/ui/button";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import {
  activeFacetSlugs,
  facetGroups,
  queryKind,
  setQueryKind,
  toggleFacet,
  type FacetCounts,
  type FacetKind,
  type FacetModel,
} from "../../util/facets";
import { DRINK_ROOT } from "../../controller/drinksPage";
import { useSearch } from "./SearchContext";
import { fold, positiveTagValues, removeFilterTerms } from "./queryLanguage";

/** Rows a group shows before its "N more" (canvas B: two to four). */
const ROWS_SHOWN = 4;

/**
 * One row: a box, the label, the count within these results. A toggle
 * (`aria-pressed`), so the query is still the one state (D3) — the row reads
 * back what the field says.
 */
function NarrowRow({
  label,
  count,
  pressed,
  focusKey,
  onToggle,
}: {
  label: string;
  count: number;
  pressed: boolean;
  /** Where focus goes back to after the press (`useFocusAfter`). */
  focusKey: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      data-testid="narrow-row"
      data-focus-key={focusKey}
      className={cn(
        "flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 py-[3px] text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        pressed
          ? "bg-primary text-primary-foreground"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 rounded-sm border",
          pressed ? "border-current bg-current" : "border-input",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>{" "}
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          pressed ? "text-inherit" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

interface GroupShape {
  id: string;
  label: string;
  rows: { key: string; label: string; count: number; pressed: boolean }[];
  toggle: (key: string) => void;
}

/**
 * One group. Its "N more" stays opened while the rows toggle — keyed on the
 * group alone, so the row a keyboard just pressed keeps focus as the query
 * changes under it — and closes again when the free text changes
 * (`resetKey`): a new search starts every group at its top four.
 */
function NarrowGroup({
  group,
  resetKey,
  focusAfter,
}: {
  group: GroupShape;
  resetKey: string;
  focusAfter: (focusKey: string, rewrites?: boolean) => void;
}) {
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  /* The row last pressed stays listed (a pressed row past the cut that was
     just turned off would otherwise vanish from under the keyboard). */
  const [held, setHeld] = useState<{ key: string; for: string } | null>(null);
  const expanded = expandedFor === resetKey;
  const keep = group.rows.filter((row) => row.pressed).map((r) => r.key);
  if (held && held.for === resetKey) keep.push(held.key);
  const { rows, hidden } = expanded
    ? { rows: group.rows, hidden: 0 }
    : limitByKey(group.rows, ROWS_SHOWN, keep);
  const focusKey = (key: string) => `${group.id}:${key}`;
  return (
    <div
      role="group"
      aria-label={group.label}
      className="flex flex-col gap-0.5"
    >
      <h3 className="mb-1 font-mono text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {group.label}
      </h3>
      {rows.map((row) => (
        <NarrowRow
          key={row.key}
          label={row.label}
          count={row.count}
          pressed={row.pressed}
          focusKey={focusKey(row.key)}
          onToggle={() => {
            setHeld({ key: row.key, for: resetKey });
            focusAfter(focusKey(row.key));
            group.toggle(row.key);
          }}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => {
            // Focus moves to the first row the press revealed.
            const next = group.rows.find((row) => !rows.includes(row));
            if (next) focusAfter(focusKey(next.key), false);
            setExpandedFor(resetKey);
          }}
          aria-label={`${hidden} more in ${group.label}`}
          className="flex min-h-[30px] w-full items-center rounded-md px-2 text-left text-[0.8125rem] text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {hidden} more
        </button>
      )}
    </div>
  );
}

/** `limitRows`' rule (43f) over these plain rows: the first `limit`, plus
 * any pressed one past the cut, so a chosen row never hides. */
function limitByKey<T extends { key: string }>(
  rows: T[],
  limit: number,
  keep: string[],
): { rows: T[]; hidden: number } {
  const shown = rows.filter(
    (row, index) => index < limit || keep.includes(row.key),
  );
  return { rows: shown, hidden: rows.length - shown.length };
}

/**
 * Whether the column would show a row at all — the Kind, a facet group or a
 * tag — so the page can leave its column (and the phone's Narrow button) out
 * rather than hold an empty 232 px beside the results.
 */
export function hasNarrowRows(
  model: FacetModel,
  counts: FacetCounts,
  query: string,
): boolean {
  const kind = queryKind(model, query);
  if (
    model.terms.has(DRINK_ROOT) &&
    (kind !== undefined || (counts.kinds.drinks > 0 && counts.kinds.food > 0))
  )
    return true;
  if (counts.other.length > 0) return true;
  return (
    facetGroups(model, counts, {
      keep: activeFacetSlugs(model, query),
      order: "total",
    }).length > 0
  );
}

/**
 * Put focus back after a press re-renders the column (43s review): the
 * groups reorder by their totals and the rows by their counts as the query
 * narrows, and a keyed node React moves loses focus. So the pressed control
 * names itself (`data-focus-key`) and is focused again after the render,
 * when focus has fallen off it.
 */
function useFocusAfter(query: string) {
  const ref = useRef<HTMLDivElement>(null);
  /* `from`: the query at the press. A press that rewrites the query waits
     for the render that shows the new one, not an earlier one. */
  const pending = useRef<{ key: string; from?: string } | null>(null);
  useEffect(() => {
    const press = pending.current;
    if (!press || press.from === query) return;
    pending.current = null;
    const target = ref.current?.querySelector<HTMLElement>(
      `[data-focus-key="${CSS.escape(press.key)}"]`,
    );
    if (target && document.activeElement !== target) target.focus();
  });
  return {
    ref,
    /** `rewrites`: the press changes the query (a row, Clear tags). */
    focusAfter: (key: string, rewrites = true) => {
      pending.current = { key, from: rewrites ? query : undefined };
    },
  };
}

/**
 * `/search`'s left column (43s, canvas B): narrow these results by what
 * they are. Kind first (Drinks · Food, D3's `tag:drink` / `-tag:drink`),
 * then the facet groups (43f) biggest first, counted inside the results,
 * each its top four rows and "N more"; then the tags no facet places. Every
 * row toggles one `tag:` term in the field — the column holds no state of
 * its own but which groups are opened up.
 *
 * On a phone it is the body of the Narrow sheet; the same component.
 */
export function NarrowColumn({
  model,
  counts,
  recipes,
}: {
  model: FacetModel;
  /** `countFacets` over the displayed results. */
  counts: FacetCounts;
  recipes: MassagedRecipeEntry[];
}) {
  const { query, parsedQuery, submitSearch, toggleTagTerm } = useSearch();
  const { ref, focusAfter } = useFocusAfter(query);
  const active = activeFacetSlugs(model, query);
  const kind = queryKind(model, query);

  const groups: GroupShape[] = [];

  /* Kind: only on a site with drinks, and only when it would say something. */
  if (
    model.terms.has(DRINK_ROOT) &&
    (kind !== undefined || (counts.kinds.drinks > 0 && counts.kinds.food > 0))
  ) {
    const rows: GroupShape["rows"] = [
      {
        key: "drinks",
        label: "Drinks",
        count: counts.kinds.drinks,
        pressed: kind === "drinks",
      },
      {
        key: "food",
        label: "Food",
        count: counts.kinds.food,
        pressed: kind === "food",
      },
    ];
    groups.push({
      id: "kind",
      label: "Kind",
      rows,
      toggle: (key) =>
        submitSearch(
          setQueryKind(
            model,
            query,
            kind === key ? undefined : (key as FacetKind),
          ),
        ),
    });
  }

  for (const group of facetGroups(model, counts, {
    keep: active,
    order: "total",
  })) {
    groups.push({
      id: group.id,
      label: group.label,
      rows: group.rows.map((row) => ({
        key: row.slug,
        label: row.label,
        count: row.count,
        pressed: active.has(row.slug),
      })),
      toggle: (slug) =>
        /*
         * Off: every spelling of the term goes (`toggleFacet`). On: through
         * the context's toggle, so a half-typed word the term was heading
         * for is replaced rather than left beside it (`insertTagTerm`).
         */
        active.has(slug)
          ? submitSearch(toggleFacet(model, query, slug))
          : toggleTagTerm(slug),
    });
  }

  /* The tags no facet places — every tag, on a site with no vocabulary. */
  if (counts.other.length > 0) {
    const pressedTags = new Set(positiveTagValues(parsedQuery.filter));
    groups.push({
      id: "other",
      label: groups.some((group) => group.id !== "kind")
        ? "Other tags"
        : "Tags",
      rows: counts.other.map((tag) => ({
        key: tag.label,
        label: tag.label,
        count: tag.count,
        pressed: pressedTags.has(fold(tag.label).trim()),
      })),
      toggle: (label) => toggleTagTerm(label),
    });
  }

  if (groups.length === 0 || recipes.length === 0) return null;
  const hasTagTerms = positiveTagValues(parsedQuery.filter).length > 0;

  return (
    <div ref={ref} data-testid="narrow" className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h2
          tabIndex={-1}
          data-focus-key="narrow-heading"
          className="font-display text-base font-semibold focus-visible:outline-none"
        >
          Narrow
        </h2>
        {hasTagTerms && (
          /* Strips `tag:` terms only — free text and other filters stay. */
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              // The button goes with the last tag: focus the column's head.
              focusAfter("narrow-heading");
              submitSearch(removeFilterTerms(query, "tag"));
            }}
          >
            Clear tags
          </Button>
        )}
      </div>
      {groups.map((group) => (
        <NarrowGroup
          key={group.id}
          group={group}
          resetKey={parsedQuery.text}
          focusAfter={focusAfter}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        Each adds its <span className="font-mono">tag:</span> to the search.
      </p>
    </div>
  );
}
