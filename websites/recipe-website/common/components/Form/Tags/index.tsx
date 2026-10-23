"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useStore } from "@tanstack/react-form";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { useRecipeForm } from "../formContext";
import {
  addTag,
  buildTagPicker,
  tagFieldOptions,
  tagSuggestions,
  toggleTerm,
  type TagOptionMatch,
  type TagPicker,
  type TagPickerData,
} from "./tagPicker";

/*
 * The tag picker (43e2, made quiet in 45a): the chosen tags as chips
 * ("Remove tag X"), one field ("Add a tag"), and a Suggestions area under
 * it. At rest the area holds only the import's suggestions, dashed until
 * accepted ("Accept suggested tag X"), or a hint; as you type it lists the
 * matching terms ("Add tag X") with their counts and facets, and "New tag"
 * for text no term spells. The tags submit as they always have: one hidden
 * `tags[i]` per tag (D4).
 */

const PickerContext = createContext<TagPicker | null>(null);

/** The picker's model and counts, shared by the heading chips and the field. */
export function TagPickerProvider({
  data,
  children,
}: {
  data?: TagPickerData;
  children: ReactNode;
}) {
  const picker = useMemo(() => buildTagPicker(data), [data]);
  return (
    <PickerContext.Provider value={picker}>{children}</PickerContext.Provider>
  );
}

export function useTagPicker(): TagPicker {
  const picker = useContext(PickerContext);
  return picker ?? EMPTY;
}

const EMPTY = buildTagPicker(undefined);

/** The form's tags, live. */
export function useFormTags(): string[] {
  const form = useRecipeForm();
  return useStore(form.store, (state) => state.values.tags);
}

const CHIP =
  "inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[0.8125rem] leading-[1.125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9 max-sm:px-3 max-sm:text-sm";
const CHIP_OUT =
  "border-input bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground";
/** The import's suggestions: dashed until accepted (36d, 43e2). */
const CHIP_SUGGESTED = "border-dashed border-[1.5px]";

/**
 * Chosen tags as chips, each with its remove button and the hidden input
 * that submits it (`tags[i]`). Chips wrap; the remove target is 24 px.
 * After a removal, focus moves to the chip that took its place (or the one
 * before it), or to the field (`fieldId`) when none are left — never to the
 * page.
 */
export function TagChips({
  tags,
  onRemove,
  testId,
  fieldId,
}: {
  tags: readonly string[];
  onRemove: (index: number) => void;
  testId?: string;
  /** The tag field's id: where focus goes once the last chip is removed. */
  fieldId?: string;
}) {
  const group = useRef<HTMLDivElement>(null);
  const refocus = useRef<number | null>(null);
  useEffect(() => {
    const at = refocus.current;
    if (at === null) return;
    refocus.current = null;
    const buttons = group.current?.querySelectorAll("button");
    const next = buttons?.[Math.min(at, buttons.length - 1)];
    if (next) next.focus();
    else if (fieldId) document.getElementById(fieldId)?.focus();
  }, [tags, fieldId]);
  return (
    <div
      ref={group}
      role="group"
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label="Selected tags"
      data-testid={testId}
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2.5 text-[0.8125rem] leading-[1.125rem] font-medium break-words text-secondary-foreground"
        >
          <input type="hidden" name={`tags[${index}]`} value={tag} />
          {tag}
          <button
            type="button"
            onClick={() => {
              refocus.current = index;
              onRemove(index);
            }}
            aria-label={`Remove tag ${tag}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span aria-hidden>×</span>
          </button>
        </span>
      ))}
    </div>
  );
}

/** The recipe form's tag field's id. */
const RECIPE_TAG_FIELD = "recipe-form-tags";

/** The recipe form's chosen tags, for the section heading. */
export function ChosenTags() {
  const form = useRecipeForm();
  const tags = useFormTags();
  return (
    <TagChips
      tags={tags}
      testId="recipe-form-chosen-tags"
      fieldId={RECIPE_TAG_FIELD}
      onRemove={(index) =>
        form.setFieldValue(
          "tags",
          tags.filter((_, i) => i !== index),
        )
      }
    />
  );
}

/** One row of the listbox: a term, or the text as a new tag. */
type FieldOption =
  | { kind: "term"; match: TagOptionMatch; suggested: boolean }
  | { kind: "new"; value: string };

/**
 * The field and its Suggestions area (45a) — an ARIA 1.2 combobox over a
 * listbox drawn inline, under the field, rather than as a popup. Arrows
 * move the highlight (`aria-activedescendant`; focus stays in the field),
 * Enter adds the highlighted option, or else the exact match, or else the
 * text as a new tag; a comma does the same. After an add the field clears
 * and keeps focus, and a polite live region says "Added X".
 *
 * Leaving the field adds nothing half-typed: only text that exactly names a
 * term or one of its aliases is taken on blur. Escape clears the text;
 * Backspace in an empty field does nothing (a chip is removed with its own
 * button, never by a stray key — 43-De2-10).
 */
export function TagField({
  tags,
  onChange,
  suggestedTags,
  id,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** The import's `suggestedTags` (36d): shown at rest, dashed. */
  suggestedTags?: readonly string[];
  id?: string;
}) {
  const picker = useTagPicker();
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (position: number) => `${baseId}-${position}`;
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  /* What the live region says; `n` remounts it, so a repeated "Added X"
   * is announced again. */
  const [said, setSaid] = useState({ text: "", n: 0 });

  const suggestions = useMemo(
    () => tagSuggestions(picker.model, suggestedTags, tags),
    [picker, suggestedTags, tags],
  );
  const field = useMemo(
    () => tagFieldOptions(picker, text, tags),
    [picker, text, tags],
  );
  const options = useMemo((): FieldOption[] => {
    const suggested = new Set(suggestions.map((entry) => entry.slug));
    const out: FieldOption[] = field.matches.map((match) => ({
      kind: "term",
      match,
      suggested: suggested.has(match.slug),
    }));
    if (field.newTag !== undefined)
      out.push({ kind: "new", value: field.newTag });
    return out;
  }, [field, suggestions]);
  const typing = text.trim() !== "";
  const expanded = typing && options.length > 0;

  /* After an add the field clears and keeps focus — except on blur, where
   * focus is leaving on purpose. */
  const done = (next: string[], label: string, refocus = true) => {
    onChange(next);
    setText("");
    setActive(-1);
    setSaid((current) => ({ text: `Added ${label}`, n: current.n + 1 }));
    if (refocus) inputRef.current?.focus();
  };
  const pickTerm = (slug: string, refocus = true) => {
    const label = picker.model.terms.get(slug)?.label ?? slug;
    done(toggleTerm(picker.model, tags, slug), label, refocus);
  };
  const choose = (option: FieldOption) => {
    if (option.kind === "term") pickTerm(option.match.slug);
    else done(addTag(picker.model, tags, option.value), option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && expanded) {
      event.preventDefault();
      setActive((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? options.length - 1 : current - 1));
    } else if (
      (event.key === "Enter" || event.key === ",") &&
      /* An IME's Enter confirms a composition; it adds nothing. */
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      const highlighted = expanded && active >= 0 ? options[active] : undefined;
      const exact = field.exact >= 0 ? options[field.exact] : undefined;
      const newTag = options.find((option) => option.kind === "new");
      const chosen = highlighted ?? exact ?? newTag;
      if (chosen) choose(chosen);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      setText("");
      setActive(-1);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-label="Add a tag"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? optionId(active) : undefined
        }
        placeholder="Find or add a tag"
        autoComplete="off"
        spellCheck={false}
        className="h-9 max-w-[28rem] max-sm:h-11"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          /* An exact spelling of a term is highlighted as you type, so
           * Enter takes the term rather than a near-duplicate string. */
          setActive(tagFieldOptions(picker, next, tags).exact);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          /* Only an exact name of a term is taken; half-typed text is not
           * a tag. */
          const exact = field.matches[field.exact];
          if (exact) pickTerm(exact.slug, false);
        }}
      />
      <div
        className="flex min-w-0 flex-col gap-1.5"
        data-testid="tag-suggestions"
      >
        <span className="font-mono text-[0.6875rem] leading-none font-medium tracking-[0.05em] text-muted-foreground uppercase">
          Suggestions
        </span>
        <ul
          id={listId}
          role="listbox"
          aria-label="Tag suggestions"
          hidden={!expanded}
          className="m-0 grid list-none gap-1 p-0 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]"
        >
          {options.map((option, position) => {
            const selected = position === active;
            const key =
              option.kind === "term"
                ? option.match.slug
                : `new:${option.value}`;
            return (
              <li
                key={key}
                id={optionId(position)}
                role="option"
                aria-selected={selected}
                /* The name comes from the content ("Add tag Gin", "New tag
                 * x" — sr-only verbs), never an aria-label: the visible
                 * text must stay part of the name (WCAG 2.5.3). The facet,
                 * count, alias and "through" are the description. */
                aria-describedby={
                  option.kind === "term"
                    ? `${optionId(position)}-about`
                    : undefined
                }
                className={cn(
                  "flex min-h-8 min-w-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-transparent px-2.5 py-1 text-sm max-sm:min-h-11",
                  option.kind === "term" &&
                    option.suggested &&
                    "border-dashed border-input",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
                /* Keep the field focused: a click picks, it doesn't blur. */
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(position)}
              >
                {option.kind === "term" ? (
                  <TermOption
                    match={option.match}
                    suggested={option.suggested}
                    aboutId={`${optionId(position)}-about`}
                  />
                ) : (
                  <span className="min-w-0">
                    <span className="sr-only">New tag {option.value}</span>
                    <span aria-hidden>
                      + New tag{" "}
                      <span className="font-medium">“{option.value}”</span>
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {typing ? (
          field.already !== undefined ? (
            <p className="text-sm text-muted-foreground">
              “{field.already}” is already chosen.
            </p>
          ) : null
        ) : suggestions.length ? (
          <div
            role="group"
            aria-label="From the import"
            className="flex flex-wrap items-center gap-1.5"
          >
            <span className="text-sm text-muted-foreground">
              From the import:
            </span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.slug}
                type="button"
                onClick={() => pickTerm(suggestion.slug)}
                aria-label={`Accept suggested tag ${suggestion.label}`}
                className={cn(CHIP, CHIP_OUT, CHIP_SUGGESTED)}
                title={
                  suggestion.tag === suggestion.label
                    ? undefined
                    : `The page said “${suggestion.tag}”`
                }
              >
                <span aria-hidden>+</span>
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Type to find a tag, or to add a new one.
          </p>
        )}
      </div>
      <div aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </div>
    </div>
  );
}

/** A matching term: its label (and the alias typed), facet, and count. */
function TermOption({
  match,
  suggested,
  aboutId,
}: {
  match: TagOptionMatch;
  suggested: boolean;
  aboutId: string;
}) {
  const where = match.facet ?? match.trail[0];
  return (
    <>
      <span className="min-w-0">
        {/* One text node for the name, so every accname reads it alike. */}
        <span className="sr-only">Add tag {match.label}</span>
        <span aria-hidden>+ </span>
        <span aria-hidden className="font-medium">
          {match.label}
        </span>
        {match.alias ? (
          <span aria-hidden className="text-muted-foreground">
            {" "}
            (“{match.alias}”)
          </span>
        ) : null}
        {match.through ? (
          /* F1: the recipe reaches it already, through a chosen child. */
          <span
            aria-hidden
            className="text-muted-foreground"
            title="Already reached: a child brings its parent"
          >
            {" "}
            · through {match.through.join(", ")}
          </span>
        ) : null}
      </span>
      {/* Hidden from the name, read as the option's description. */}
      <span
        id={aboutId}
        aria-hidden
        className="flex shrink-0 items-baseline gap-1.5 text-xs whitespace-nowrap text-muted-foreground"
      >
        {match.alias ? (
          <span className="sr-only">Matched “{match.alias}”, </span>
        ) : null}
        {match.through ? (
          <span className="sr-only">
            Already reached through {match.through.join(", ")} (a child brings
            its parent),{" "}
          </span>
        ) : null}
        {where ? <span>{where}</span> : null}
        <span className="font-mono">
          <span className="sr-only">, </span>
          {match.count}
          <span className="sr-only"> tagged</span>
        </span>
        {suggested ? (
          <span className="sr-only">, suggested by the import</span>
        ) : null}
      </span>
    </>
  );
}

/** The recipe form's Tags section body: the field over the form's tags. */
export function RecipeTagField({
  suggestedTags,
}: {
  /** The import's `suggestedTags` (36d). */
  suggestedTags?: string[];
}) {
  const form = useRecipeForm();
  const tags = useFormTags();
  return (
    <TagField
      id={RECIPE_TAG_FIELD}
      tags={tags}
      onChange={(next) => form.setFieldValue("tags", next)}
      suggestedTags={suggestedTags}
    />
  );
}
