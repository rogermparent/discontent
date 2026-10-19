"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";

/**
 * What a label stands for (41h): on hand in this browser (`have`, tape), on
 * the second list (`saved`, outlined), or missing (`missing`, dashed).
 * Featured is a separate flag: any of them can be, and turns accent.
 */
export type TapeKind = "have" | "saved" | "missing";

export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A tape label (41h, `make.css`): tapping its body features the ingredient
 * in the page's question (`aria-pressed`); its × (when `onRemove` is given)
 * takes it off the list. The body's name is the ingredient alone — the pull
 * count beside it is decoration (`aria-hidden`), so `getByRole("button", {
 * name: "vodka" })` finds it, and nothing named differently is visible.
 * Both targets are at least 24 px (WCAG 2.5.8).
 */
export function TapeLabel({
  item,
  kind = "have",
  counted = true,
  featured,
  pull,
  landed,
  matcher,
  onFeature,
  onRemove,
  removeLabel,
  as: Tag = "li",
  className,
}: {
  item: string;
  kind?: TapeKind;
  /**
   * False for this browser's labels while Count from is on the saved list
   * alone: still on the shelf, not counted — untaped, in muted ink.
   */
  counted?: boolean;
  featured: boolean;
  /** Recipes it is used in among those you can make now. */
  pull?: number;
  /** Just added: it lands (reduced motion: it doesn't). */
  landed?: boolean;
  /** A matcher item (42m2, `any bean`): marked ✱, its look from the theme. */
  matcher?: boolean;
  onFeature: () => void;
  onRemove?: () => void;
  /** The ×'s name; "Remove <item>" by default. */
  removeLabel?: string;
  as?: "li" | "span";
  className?: string;
}) {
  return (
    <Tag
      className={cn("make-tape", className)}
      data-kind={kind}
      data-counted={counted ? undefined : "false"}
      data-featured={featured ? "true" : undefined}
      data-landed={landed ? "true" : undefined}
      data-matcher={matcher ? "true" : undefined}
    >
      <button
        type="button"
        aria-pressed={featured}
        onClick={onFeature}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 py-1 pl-2.5 font-mono text-[0.8rem] leading-none",
          onRemove ? "pr-1" : "pr-2.5",
          FOCUS,
        )}
      >
        {matcher && <MatcherMark />}
        {item}
        {pull ? (
          <span aria-hidden className="text-[0.68rem] opacity-75">
            {pull}
          </span>
        ) : null}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel ?? `Remove ${item}`}
          onClick={onRemove}
          className={cn(
            "inline-flex min-h-7 min-w-6 items-center justify-center pr-2 pl-0.5 opacity-70 hover:opacity-100",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </Tag>
  );
}

/** A matcher's mark (42m2): decoration, so a tape's name stays its words. */
export function MatcherMark() {
  return (
    <span aria-hidden className="-mr-0.5">
      ✱
    </span>
  );
}

/**
 * A missing ingredient a tap adds to the list (42m2): a card's "Needs" tape
 * as a button, named "Add <item> to what I have" — the visible word inside
 * the name (WCAG 2.5.3) — at least 24 px tall (2.5.8).
 */
export function AddTape({
  item,
  onAdd,
}: {
  /** What a tap adds, and what it says: the line's name, `chickpea`. */
  item: string;
  onAdd: (item: string) => void;
}) {
  return (
    <button
      type="button"
      data-kind="missing"
      data-testid="make-add-missing"
      aria-label={`Add ${item} to what I have`}
      onClick={() => onAdd(item)}
      className={cn(
        "make-tape make-tape-add min-h-6 max-w-full cursor-pointer items-center px-2 py-1 text-left font-mono text-[0.75rem] leading-tight",
        FOCUS,
      )}
    >
      {item}
    </button>
  );
}

/** A tape that is only a word: a card's "Needs" line. */
export function StaticTape({
  children,
  kind = "missing",
  className,
}: {
  children: ReactNode;
  kind?: TapeKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "make-tape px-2 py-1 font-mono text-[0.75rem] leading-none",
        className,
      )}
      data-kind={kind}
    >
      {children}
    </span>
  );
}
