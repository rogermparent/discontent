"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";

/**
 * The tick-what-to-import list and its results (35r's roundup picker,
 * shared since 36e with the several-recipes picker): numbered rows with a
 * checkbox each, Select all / none, and one line per outcome linking the
 * recipe it made (in a new tab, so a run can be watched without leaving).
 */

export interface PickRow {
  n: number;
  /** The row's label, after its number: "3. Green Bean Casserole". */
  name: string;
  image?: string;
  /** Can't be ticked (already imported, no term chosen). */
  locked?: boolean;
  /** Shown after the label: the host, counts, a chapter, a button. */
  extra?: ReactNode;
}

export function PickList({
  idPrefix,
  testId,
  rows,
  selected,
  disabled = false,
  onToggle,
}: {
  /** Each checkbox is `${idPrefix}-${n}`. */
  idPrefix: string;
  testId: string;
  rows: readonly PickRow[];
  selected: ReadonlySet<number>;
  disabled?: boolean;
  onToggle: (n: number) => void;
}) {
  return (
    <ul className="flex flex-col gap-1" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.n} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            id={`${idPrefix}-${row.n}`}
            checked={selected.has(row.n) && !row.locked}
            disabled={row.locked || disabled}
            onChange={() => onToggle(row.n)}
          />
          {row.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.image}
              alt=""
              className="h-10 w-10 rounded object-cover"
              loading="lazy"
            />
          )}
          <label htmlFor={`${idPrefix}-${row.n}`}>
            {row.n}. {row.name}
          </label>
          {row.extra}
        </li>
      ))}
    </ul>
  );
}

export function SelectAllNone({
  disabled = false,
  onAll,
  onNone,
}: {
  disabled?: boolean;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={onAll}
      >
        Select all
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={onNone}
      >
        Select none
      </Button>
    </div>
  );
}

export interface OutcomeRow {
  n: number;
  /** Several rows may share an `n` across runs: the key adds this. */
  key: string;
  name: string;
  status: string;
  slug?: string;
  message?: string;
}

export function OutcomeList({
  testId,
  outcomes,
}: {
  testId: string;
  outcomes: readonly OutcomeRow[];
}) {
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid={testId}>
      {outcomes.map((outcome) => (
        <li key={outcome.key}>
          {outcome.n}. {outcome.name} — {outcome.status}
          {outcome.slug && (
            <>
              {" "}
              <Link
                className="underline"
                href={`/recipe/${outcome.slug}`}
                target="_blank"
                rel="noopener"
              >
                {outcome.slug}
              </Link>
            </>
          )}
          {outcome.message && (
            <span className="text-muted-foreground"> ({outcome.message})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
