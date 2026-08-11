"use client";

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import { useSearch } from "./SearchContext";
import {
  FILTER_FIELDS,
  completionsAt,
  fold,
  quoteQueryValue,
  replaceSpan,
  type FilterField,
  type QueryCompletion,
} from "./queryLanguage";

/**
 * How many operand rows to offer at once.
 *
 * A corpus can carry any number of tags and the list sits over the results, so
 * it is bounded rather than scrolled — eight is about as many as read as a
 * glanceable menu. Typing one more character is the way to see the rest, which
 * is what a prefix list is for.
 */
const MAX_OPTIONS = 8;

/** One line of prose per field, so the list teaches the language as it offers it. */
const FIELD_HINTS: Record<FilterField, string> = {
  tag: "recipes carrying a tag",
  ingredient: "recipes using an ingredient",
  name: "match the recipe name only",
  description: "match the description",
  time: "total minutes — time:<30",
  before: "added before a date — before:2026-01-01",
  after: "added on or after a date",
};

export interface CompletionOption {
  /** Stable across renders for the same suggestion; also the React key. */
  key: string;
  /** What the row shows as its subject. */
  label: string;
  /** The second line: what accepting it would mean. */
  hint?: string;
  /** What replaces `completion.span` when it is accepted. */
  replacement: string;
}

function fieldOptions(prefix: string): CompletionOption[] {
  const folded = fold(prefix);
  return FILTER_FIELDS.filter((field) => field.startsWith(folded)).map(
    (field) => ({
      key: `field:${field}`,
      label: `${field}:`,
      hint: FIELD_HINTS[field],
      replacement: `${field}:`,
    }),
  );
}

/**
 * Corpus tags matching what has been typed after `tag:`.
 *
 * Folded on both sides so `tag:cre` offers `Crème`, for the same reason
 * `matchesFilter` folds — and quoted on the way out, so a multi-word tag comes
 * back as one atom rather than two.
 *
 * A tag that folds to exactly the prefix is dropped: it is already typed, and a
 * row offering to replace `dessert` with `dessert` is a list that will not go
 * away.
 */
function tagOptions(prefix: string, allTags: string[]): CompletionOption[] {
  const folded = fold(prefix);
  return allTags
    .filter((tag) => {
      const value = fold(tag);
      return value.startsWith(folded) && value !== folded;
    })
    .slice(0, MAX_OPTIONS)
    .map((tag) => ({
      key: `tag:${tag}`,
      label: tag,
      replacement: `tag:${quoteQueryValue(tag)}`,
    }));
}

function optionsFor(
  completion: QueryCompletion | undefined,
  allTags: string[],
): CompletionOption[] {
  if (!completion) return [];
  if (completion.kind === "field") return fieldOptions(completion.prefix);
  /*
   * Only `tag:` has values to offer, and that is a scope decision rather than a
   * gap. `allTags` is already on the context, so tags cost nothing; ingredients
   * are a *conditional* fetch (F4a) that is often not in memory, so completing
   * them would mean a loading state and a request inside a keystroke. The other
   * fields take free text or a date, which no list can shorten.
   */
  if (completion.field !== "tag") return [];
  return tagOptions(completion.prefix, allTags);
}

export interface QueryAutocomplete {
  enabled: boolean;
  open: boolean;
  listId: string;
  options: CompletionOption[];
  /** -1 when nothing is active, which is the resting state. See `onKeyDown`. */
  activeIndex: number;
  activeOptionId?: string;
  optionId: (index: number) => string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** Wired to both `onChange` and `onSelect`: any caret move re-reads the atom. */
  onCaretChange: (event: SyntheticEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onOpenChange: (next: boolean) => void;
  accept: (option: CompletionOption) => void;
  setActiveIndex: (index: number) => void;
}

/**
 * The state behind in-field syntax completion, kept out of `SearchInput` so the
 * field itself stays a field.
 *
 * **Everything reads `inputValue`, never `query`.** `query` lags the field by
 * `SEARCH_DEBOUNCE_MS`, and a completion computed against a 180 ms-old string
 * would carry offsets into text that has already moved — accepting it would
 * splice at the wrong place. The chips can key off `query` because they are
 * drawn *from* it; this is keyed off the caret, which lives in the present.
 */
export function useQueryAutocomplete({
  enabled,
  inputRef,
  clearPendingSearch,
}: {
  enabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Cancels the debounce, so the keystroke it was going to commit cannot land
   * on top of the rewrite — 21b's `insertTerm` opens the same way. */
  clearPendingSearch: () => void;
}): QueryAutocomplete {
  const { inputValue, setInputValue, submitSearch, allTags } = useSearch();
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndexState] = useState(-1);

  const raw = inputValue || "";
  const completion = useMemo(
    () =>
      enabled ? completionsAt(raw, Math.min(caret, raw.length)) : undefined,
    [enabled, raw, caret],
  );
  const options = useMemo(
    () => optionsFor(completion, allTags),
    [completion, allTags],
  );

  const open = enabled && focused && !dismissed && options.length > 0;
  /*
   * Clamped on read rather than reset in an effect: the option list is derived
   * from the query and the caret, so it can shrink under a stored index at any
   * keystroke. `set-state-in-effect` is a lint error in this repo, and an
   * `aria-activedescendant` pointing at a row that no longer exists is an axe
   * violation — deriving avoids both.
   */
  const active = activeIndex < options.length ? activeIndex : -1;

  const optionId = useCallback(
    (index: number) => `${listId}-option-${index}`,
    [listId],
  );

  const onCaretChange = useCallback(
    (event: SyntheticEvent<HTMLInputElement>) => {
      setCaret(event.currentTarget.selectionStart ?? 0);
      // Typing or moving the caret revives a list Escape put away: the dismissal
      // was about *this* suggestion, not about the feature.
      setDismissed(false);
      setActiveIndexState(-1);
    },
    [],
  );

  const accept = useCallback(
    (option: CompletionOption) => {
      if (!completion) return;
      clearPendingSearch();
      const next = replaceSpan(raw, completion.span, option.replacement);
      setInputValue(next);
      submitSearch(next);
      setActiveIndexState(-1);

      /*
       * Put the caret after what was just written, and put focus back in the
       * field — 21b found by a failing assertion that clicking a suggestion
       * takes focus off the input, and a bare `tag:` is only "ready for the
       * operand" if the caret is actually there.
       *
       * Clamped because `replaceSpan` tidies, which can shorten the string
       * ahead of the splice; the arithmetic is exact for every query that is
       * not already carrying doubled whitespace.
       */
      const at = Math.min(
        completion.span.start + option.replacement.length,
        next.length,
      );
      requestAnimationFrame(() => {
        const element = inputRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(at, at);
        setCaret(at);
      });
    },
    [
      completion,
      raw,
      clearPendingSearch,
      setInputValue,
      submitSearch,
      inputRef,
    ],
  );

  /**
   * The three keys that already meant something in this field, and what each
   * one had to concede.
   *
   * - **Enter stays submission unless a row is active**, and no row is active
   *   until an arrow key makes one. Auto-highlighting the first suggestion
   *   would mean typing `tag` and pressing Enter inserts `tag:` instead of
   *   searching for the word — a hijack of the field's primary key, and one
   *   every existing spec would trip over, since `searchFor()` fills and then
   *   presses Enter. So the resting `activeIndex` is -1 and Enter falls through
   *   untouched, which keeps "Enter flushes the debounce and records the query"
   *   exactly true.
   * - **Escape must `preventDefault`.** `type="search"` clears the field
   *   natively on Escape in some engines, so dismissing the list without
   *   stopping the event would take the query with it.
   * - **A composing keystroke is not navigation.** An IME sends Enter and the
   *   arrows to commit and move through its own candidate list; `isComposing`
   *   is the guard cmdk applies at its root, for this.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!enabled || event.nativeEvent.isComposing) return;

      if (event.key === "Escape") {
        if (!open) return;
        event.preventDefault();
        setDismissed(true);
        setActiveIndexState(-1);
        return;
      }

      if (!open) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndexState((index) =>
          index + 1 >= options.length ? 0 : index + 1,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndexState((index) =>
          index <= 0 ? options.length - 1 : index - 1,
        );
        return;
      }
      if (event.key === "Enter" && active >= 0) {
        event.preventDefault();
        accept(options[active]);
      }
    },
    [enabled, open, options, active, accept],
  );

  return {
    enabled,
    open,
    listId,
    options,
    activeIndex: active,
    activeOptionId: active >= 0 ? optionId(active) : undefined,
    optionId,
    onKeyDown,
    onCaretChange,
    onFocus: useCallback(() => setFocused(true), []),
    onBlur: useCallback(() => setFocused(false), []),
    onOpenChange: useCallback((next: boolean) => {
      // Radix reports its own dismissals — an outside pointer-down, and the
      // Escape its layer stack also sees. Both mean the same thing here.
      if (!next) setDismissed(true);
    }, []),
    accept,
    setActiveIndex: setActiveIndexState,
  };
}

/**
 * The suggestion list itself: a listbox anchored under the field, portaled out
 * of it.
 *
 * **Radix, not a hand-rolled `absolute` div.** `PopoverContent` portals, and the
 * picker modal that shares this field is `max-h-[80vh] overflow-y-auto` — an
 * in-flow dropdown would be clipped by that scroll container. It also brings a
 * correct layer stack, so an Escape aimed at the list is not also an Escape
 * aimed at the dialog behind it.
 *
 * Three overrides are required and none is cosmetic: `align="start"` puts it
 * under the caret's edge rather than centred; the width follows the anchor
 * instead of the default `w-72`; and **both auto-focus events are prevented**,
 * because Radix moves focus into an opening popover by default and the caret has
 * to stay in the input for the next keystroke to land there.
 *
 * **No `<button>` in a row.** `nested-interactive` is a wcag2a rule the axe
 * specs assert, and a `role="option"` carrying a button violates it — the same
 * constraint that shaped the palette's recents and 21b's sibling-button chips.
 * Rows are plain elements; the pointer path is a `mousedown` that
 * `preventDefault`s so focus never leaves the field, then a click.
 */
export function QueryAutocompleteList({
  autocomplete,
  children,
}: {
  autocomplete: QueryAutocomplete;
  /** The field itself, which the list anchors to. */
  children: ReactNode;
}) {
  const { open, options, activeIndex, listId, optionId, accept, onOpenChange } =
    autocomplete;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ul
          id={listId}
          role="listbox"
          aria-label="Query suggestions"
          data-testid="query-autocomplete"
          className="max-h-72 overflow-y-auto py-1"
        >
          {options.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              data-testid="query-autocomplete-option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => accept(option)}
              className={cn(
                "flex cursor-pointer flex-row items-baseline gap-2 px-3 py-2 text-sm",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
            >
              <span
                data-testid="query-autocomplete-label"
                className="font-mono text-foreground"
              >
                {option.label}
              </span>
              {option.hint ? (
                <span className="truncate text-xs text-muted-foreground">
                  {option.hint}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
