"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  DRINK_ROOT,
  type DrinksPageData,
  type DrinkTerm,
} from "../../controller/drinksPage";

const termHref = (slug: string) => `/tags/${slug}`;

/** One dot-leader line: the term, the dots, how many drinks. */
function Leader({ term }: { term: DrinkTerm }) {
  return (
    <li className="break-inside-avoid">
      <Link
        href={termHref(term.slug)}
        className="group flex min-h-10 items-baseline gap-2 rounded-sm py-1 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:min-h-8"
      >
        <span>{term.label}</span>{" "}
        <i
          aria-hidden
          className="flex-1 -translate-y-[5px] border-b-2 border-dotted border-muted-foreground/55 group-hover:border-primary"
        />
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {term.count}
        </span>
      </Link>
    </li>
  );
}

/**
 * A column of the index. Wide, a heading over the list; on a phone a
 * disclosure (canvas B's accordion) — only the first open to begin with.
 * The list is in the page either way, hidden by CSS while folded on a
 * phone, so every line is a link a crawler and the export's HTML carry.
 */
function IndexGroup({
  title,
  detail,
  count,
  defaultOpen,
  action,
  wide,
  children,
}: {
  title: string;
  /** Wide only, after the title: "56 families". */
  detail?: string;
  /** Lines in the group, for the phone's folded heading. */
  count: number;
  defaultOpen: boolean;
  action?: ReactNode;
  /** Two columns from `sm` up (Classics). */
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  return (
    <div
      className="flex min-w-0 flex-col border-t border-border lg:gap-2 lg:border-t-0"
      data-testid="drinks-index-group"
    >
      <div className="flex items-center justify-between gap-4">
        <h3 className="m-0 grow">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="flex min-h-13 w-full items-center gap-2 text-left font-display text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
          >
            {title}
            <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">
              {count}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
          <span className="hidden font-mono text-xs tracking-[0.1em] text-muted-foreground uppercase lg:inline">
            {title}
            {detail && ` · ${detail}`}
          </span>
        </h3>
        {action}
      </div>
      <ul
        id={listId}
        className={cn(
          "m-0 list-none p-0 pb-3 lg:block lg:pb-0",
          wide ? "block sm:columns-2 sm:gap-8" : "flex flex-col lg:flex",
          !open && "hidden",
        )}
      >
        {children}
      </ul>
    </div>
  );
}

/** One group of the index: a heading over its lines. */
interface Group {
  title: string;
  detail?: string;
  terms: DrinkTerm[];
  count: number;
  wide?: boolean;
  action?: ReactNode;
}

/**
 * "Browse the bar" (42d, canvas B): spirit & base, style and the classics
 * as one dot-leader index instead of three walls of tiles and pills — real
 * terms with their drink counts, each to its term page. Since 46h (43-Df2)
 * strength & method (shaken, stirred, built, low-ABV, zero-proof) sits
 * under Style in the same column, as the facet model files them apart.
 */
export function BarIndex({
  data,
}: {
  data: Pick<
    DrinksPageData,
    "count" | "spirits" | "styles" | "methods" | "classics" | "classicsCount"
  >;
}) {
  const headingId = useId();
  if (
    data.spirits.length === 0 &&
    data.styles.length === 0 &&
    data.methods.length === 0 &&
    data.classics.length === 0
  ) {
    return null;
  }
  /* Columns of groups, wide; on a phone every group is one disclosure. */
  const columns: Group[][] = [];
  if (data.spirits.length > 0) {
    columns.push([
      {
        title: "Spirit & base",
        terms: data.spirits,
        count: data.spirits.length,
      },
    ]);
  }
  const middle: Group[] = [];
  if (data.styles.length > 0) {
    middle.push({
      title: "Style",
      terms: data.styles,
      count: data.styles.length,
    });
  }
  if (data.methods.length > 0) {
    middle.push({
      title: "Strength & method",
      terms: data.methods,
      count: data.methods.length,
    });
  }
  if (middle.length > 0) columns.push(middle);
  if (data.classics.length > 0) {
    const families = data.classicsCount;
    columns.push([
      {
        title: "Classics",
        detail: `${families} ${families === 1 ? "family" : "families"}`,
        terms: data.classics,
        count: families,
        wide: true,
        action:
          families > data.classics.length ? (
            <Link
              href={termHref(DRINK_ROOT)}
              className="inline-block shrink-0 py-0.5 text-sm leading-5 text-primary underline-offset-4 hover:underline"
            >
              All <span className="font-mono">{families}</span>
              <span className="sr-only"> classics</span>
            </Link>
          ) : undefined,
      },
    ]);
  }
  const first = columns[0]?.[0];
  const indexGroup = (group: Group) => (
    <IndexGroup
      key={group.title}
      title={group.title}
      detail={group.detail}
      count={group.count}
      defaultOpen={group === first}
      action={group.action}
      wide={group.wide}
    >
      {group.terms.map((term) => (
        <Leader key={term.slug} term={term} />
      ))}
    </IndexGroup>
  );
  return (
    <section
      aria-labelledby={headingId}
      data-testid="drinks-index"
      className="flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={headingId}
          className="m-0 font-display text-2xl font-semibold tracking-tight"
        >
          Browse the bar
        </h2>
        <Link
          href={termHref(DRINK_ROOT)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          All <span className="font-mono">{data.count}</span>{" "}
          {data.count === 1 ? "drink" : "drinks"}
        </Link>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] lg:gap-10 lg:border-t lg:border-border lg:pt-4 [&>*:last-child]:border-b lg:[&>*:last-child]:border-b-0">
        {columns.map((column) =>
          column.length === 1 ? (
            indexGroup(column[0])
          ) : (
            <div
              key={column[0].title}
              className="flex min-w-0 flex-col lg:gap-6"
            >
              {column.map(indexGroup)}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
