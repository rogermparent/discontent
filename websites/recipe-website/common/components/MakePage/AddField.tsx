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

/** One suggestion: a name the scope's recipes use, and what adding it does. */
export interface AddCandidate {
  name: string;
  /** One-away recipes it would finish now. */
  unlocks: number;
  /** Two-away recipes it would bring a step closer. */
  helps: number;
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

  const candidates = useMemo(
    () => (typed.trim() ? suggest(typed) : []),
    [suggest, typed],
  );
  const shown = open && candidates.length > 0 && draft.trim() !== "";

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
            commit(picked ? [picked.name] : parseInventoryText(draft).items);
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
            <span>{candidate.name}</span>
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
      <p className="mt-1.5 text-xs text-muted-foreground">
        Tap a label to feature it in the question.
      </p>
    </div>
  );
}
