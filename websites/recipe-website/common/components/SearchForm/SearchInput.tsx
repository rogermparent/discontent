"use client";

import { useCallback, useEffect, useRef, type SyntheticEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import { SEARCH_DEBOUNCE_MS, useSearch } from "./SearchContext";
import {
  QueryAutocompleteList,
  useQueryAutocomplete,
} from "./QueryAutocomplete";

export interface SearchInputProps {
  /** Overrides the mono placeholder (the picker modal wants a shorter one). */
  placeholder?: string;
  className?: string;
  /**
   * Offer field and tag completions for what is under the caret (PR 21c).
   *
   * **Opt-in, and off by default, because this component is shared verbatim.**
   * The featured-recipe picker modal renders the same field, so anything added
   * unconditionally is live in a dialog whose job is picking one recipe, not
   * composing a filter — and the palette, the other surface that could host
   * this, already owns ArrowDown/ArrowUp/Enter for its own list. One surface,
   * one keyboard contract: `/search` passes this, nothing else does.
   */
  autocomplete?: boolean;
}

/**
 * The live search field — the same command surface as the ⌘K palette, at rest
 * on the page: leading magnifier, generous height, ember focus ring, no Submit
 * button. Typing filters as you go (debounced into the shared query); Enter
 * flushes the debounce immediately and commits the query to recent searches.
 *
 * Shared by `/search` and the featured-recipe picker modal, so both surfaces
 * behave identically — apart from the opt-in suggestion list above.
 */
export function SearchInput({
  placeholder = "Search recipes by name, ingredient, or tag…",
  className,
  autocomplete = false,
}: SearchInputProps = {}) {
  const { inputValue, setInputValue, submitSearch, recordSearch } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Only *registers* the cleanup; no state is set in the effect body, so this
  // satisfies eslint-plugin-react-hooks@7's `set-state-in-effect` rule.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearPendingSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const suggestions = useQueryAutocomplete({
    enabled: autocomplete,
    inputRef,
    clearPendingSearch,
  });

  const onChange = useCallback(
    (value: string) => {
      // The field itself updates immediately; the (expensive) engine query lags.
      setInputValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        submitSearch(value.trim());
      }, SEARCH_DEBOUNCE_MS);
    },
    [setInputValue, submitSearch],
  );

  // A real <form> is kept so Enter has its usual meaning: flush the pending
  // debounce and record the query. The submit control is sr-only — implicit
  // form submission needs a submit button to exist, but the design has none.
  //
  // The suggestion list never reaches this handler except by falling through:
  // it only calls `preventDefault` on Enter when one of its rows is active, so
  // an Enter with nothing highlighted submits exactly as it always did.
  const onSubmit = useCallback(
    (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const value = (inputValue || "").trim();
      submitSearch(value);
      recordSearch(value);
    },
    [inputValue, submitSearch, recordSearch],
  );

  /*
   * The combobox attributes are added only when the list exists. The picker
   * modal renders the same markup it rendered before this PR — no ARIA naming a
   * listbox that is never mounted, and no handlers on a field that has no
   * suggestions to navigate.
   */
  const comboboxProps = autocomplete
    ? {
        role: "combobox" as const,
        "aria-expanded": suggestions.open,
        "aria-controls": suggestions.listId,
        "aria-activedescendant": suggestions.activeOptionId,
        "aria-autocomplete": "list" as const,
        onKeyDown: suggestions.onKeyDown,
        onSelect: suggestions.onCaretChange,
        onFocus: suggestions.onFocus,
        onBlur: suggestions.onBlur,
      }
    : {};

  const field = (
    <div
      className={cn(
        "flex flex-row items-center gap-3 rounded-lg border border-input bg-card px-4",
        "transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
      )}
    >
      <Search
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        name="query"
        aria-label="Search recipes"
        autoComplete="off"
        value={inputValue || ""}
        onChange={(e) => {
          onChange(e.target.value);
          if (autocomplete) suggestions.onCaretChange(e);
        }}
        placeholder={placeholder}
        className={cn(
          "h-12 w-full min-w-0 bg-transparent text-base text-foreground outline-none",
          "placeholder:font-mono placeholder:text-sm placeholder:text-muted-foreground",
          // Safari's native search decorations fight the flanking icon.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
        {...comboboxProps}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} role="search" className={className}>
      {autocomplete ? (
        <QueryAutocompleteList autocomplete={suggestions}>
          {field}
        </QueryAutocompleteList>
      ) : (
        field
      )}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}
