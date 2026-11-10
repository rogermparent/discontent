"use client";

import {
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { parseInventoryText } from "../../util/inventoryText";
import { looksLikePattern, matcherOf, patternError } from "../../util/matchers";

/** One suggestion: a name the scope's recipes use, and what adding it does. */
export interface AddCandidate {
  name: string;
  /** One-away recipes it would finish now. */
  unlocks: number;
  /** Two-away recipes it would bring a step closer. */
  helps: number;
  /**
   * Set for a matcher (42m2): `any bean`, and how many specific kinds of the
   * family the scope's recipes use.
   */
  matcher?: { kinds: number };
  /**
   * Set for a pattern (43m): `bean*` or `/may(o|onnaise)/`, and how many
   * names it matches in these recipes. `every`: it is the "Match every line
   * with 'bean'" row for plain text.
   */
  pattern?: { names: number; every?: boolean };
}

/**
 * The add field is Buy next as search (41h): a combobox whose suggestions
 * are the ingredient names the current scope uses that match what's typed
 * at a word start, each saying what adding it would do — "+2 now · 3
 * closer" — ranked by that (`suggest`, from the page's analysis).
 *
 * Keyboard: the arrows move through the suggestions (`aria-activedescendant`,
 * focus stays in the field), Enter adds the one picked — or, with none
 * picked, what was typed, read as a list ("vodka, lime"), so pasting a
 * comma list still works — and Escape closes the list, then clears.
 *
 * Patterns (43m): `bean*` or `/may(o|onnaise)/` typed is offered as itself
 * and added whole by Enter; one that can't be used says why under the field
 * (`aria-invalid`) and Enter keeps it there to fix. Plain text ends the list
 * with "Match every line with 'X'", which adds `X*`.
 */
export function AddField({
  suggest,
  onAdd,
  inputRef,
}: {
  suggest: (typed: string) => AddCandidate[];
  onAdd: (items: string[]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const typed = useDeferredValue(draft);
  const inputId = useId();
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  const errorId = useId();
  const hintId = useId();
  const candidates = useMemo(
    () => (typed.trim() ? suggest(typed) : []),
    [suggest, typed],
  );
  const shown = open && candidates.length > 0 && draft.trim() !== "";
  /* A pattern that can't be used says why, as it is typed (43m). */
  const isPattern = looksLikePattern(draft);
  const error = isPattern ? patternError(draft) : undefined;

  const commit = (items: string[]) => {
    if (items.length > 0) onAdd(items);
    setDraft("");
    setActive(-1);
  };

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Add or look up an ingredient
      </label>
      <Input
        id={inputId}
        ref={inputRef}
        data-testid="inventory-input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        aria-activedescendant={
          shown && active >= 0 ? optionId(active) : undefined
        }
        value={draft}
        placeholder="Add or look up an ingredient"
        autoComplete="off"
        spellCheck={false}
        className="h-10 bg-card"
        onChange={(event) => {
          setDraft(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!candidates.length) return;
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((at) =>
              at < 0 && step < 0
                ? candidates.length - 1
                : (at + step + candidates.length) % candidates.length,
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            const picked = shown && active >= 0 ? candidates[active] : null;
            if (picked) commit([picked.name]);
            /* A pattern is one item, commas and all; a broken one stays. */
            else if (isPattern) {
              if (!error) commit([draft.trim()]);
            } else commit(parseInventoryText(draft).items);
          } else if (event.key === "Escape") {
            if (shown) {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (draft) {
              event.preventDefault();
              setDraft("");
            }
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="What each would add"
        data-testid="add-suggestions"
        hidden={!shown}
        className="absolute inset-x-0 top-[calc(100%+0.3rem)] z-20 m-0 grid list-none gap-0.5 rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-lg"
      >
        {candidates.map((candidate, i) => (
          <li
            key={candidate.name}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className={cn(
              "flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 text-sm",
              i === active
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
            /* Keep the field focused: a click picks, it doesn't blur. */
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit([candidate.name])}
          >
            {candidate.pattern ? (
              <span className="flex min-w-0 flex-col">
                <span>
                  <span aria-hidden>✱ </span>
                  {candidate.pattern.every ? (
                    <>
                      Match every line with “{candidate.name.replace(/\*$/, "")}
                      ”
                    </>
                  ) : (
                    <span className="font-mono">{candidate.name}</span>
                  )}
                  <span className="sr-only"> — </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {candidate.pattern.every && (
                    <span className="font-mono">{candidate.name} · </span>
                  )}
                  matches {candidate.pattern.names}{" "}
                  {candidate.pattern.names === 1 ? "name" : "names"} in these
                  recipes{" "}
                </span>
              </span>
            ) : candidate.matcher ? (
              <span className="flex min-w-0 flex-col">
                <span>
                  <span aria-hidden>✱ </span>
                  {matcherOf(candidate.name)?.label ??
                    candidate.name.replace(/^any\b/, "Any")}
                  <span className="sr-only"> — </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  matches {candidate.matcher.kinds}{" "}
                  {candidate.matcher.kinds === 1 ? "kind" : "kinds"} in these
                  recipes{" "}
                </span>
              </span>
            ) : (
              <span>{candidate.name}</span>
            )}
            <span className="font-mono text-xs whitespace-nowrap">
              {candidate.unlocks > 0 && (
                <>
                  <b className="font-medium">+{candidate.unlocks} now</b> ·{" "}
                </>
              )}
              {candidate.helps} closer
            </span>
          </li>
        ))}
      </ul>
      {/*
       * --destructive is 4.49:1 on the page background (it clears 4.5:1 on a
       * card): a little of --foreground in it clears AA in either mode.
       */}
      <p
        id={errorId}
        aria-live="polite"
        data-testid="inventory-input-error"
        className="mt-1.5 text-xs text-[color-mix(in_oklch,var(--color-destructive)_85%,var(--color-foreground))] empty:hidden"
      >
        {error}
      </p>
      {/* Only the pattern sentence describes the field (41h's Dh13). */}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Tap a label to feature it in the question.{" "}
        <span id={hintId}>
          A word with a star — <code className="font-mono">bean*</code> — or a{" "}
          <code className="font-mono">/pattern/</code> matches many lines at
          once.
        </span>
      </p>
    </div>
  );
}
