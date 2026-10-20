"use client";

import {
  createContext,
  useContext,
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
import type { FacetRow } from "../../../util/facets";
import { useRecipeForm } from "../formContext";
import {
  COLLAPSED_GROUPS,
  addTag,
  buildTagPicker,
  exactOption,
  looseTags,
  pickerGroups,
  searchPickerTerms,
  tagSelection,
  tagSuggestions,
  tagsSayDrink,
  toggleTerm,
  type TagPicker,
  type TagPickerData,
  type TagSelection,
} from "./tagPicker";

/*
 * Tags by facet (43e2, canvas B): the chosen tags as chips in the section's
 * heading ("Remove tag X"), a row of chips per facet with corpus counts, the
 * import's suggestions dashed until accepted, and "Anything else" — a
 * combobox over the whole vocabulary that also adds a new tag ("Add a tag").
 * The tags submit as they always have: one hidden `tags[i]` per tag (D4).
 */

const PickerContext = createContext<TagPicker | null>(null);

/** The picker's model and counts, shared by the heading chips and the rows. */
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

/** Does the form's recipe read as a drink right now (its tags)? */
export function useTagsSayDrink(): boolean {
  const { model } = useTagPicker();
  const tags = useFormTags();
  return useMemo(() => tagsSayDrink(model, tags), [model, tags]);
}

const CHIP =
  "inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[0.8125rem] leading-[1.125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9 max-sm:px-3 max-sm:text-sm";
const CHIP_OUT =
  "border-input bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground";
const CHIP_ON =
  "border-transparent bg-primary text-primary-foreground hover:bg-primary/90";
/** Reached through a chosen child: outlined in the primary colour. */
const CHIP_REACHED =
  "border-primary bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground";
const CHIP_SUGGESTED = "border-dashed border-[1.5px]";
/** Full ink: an opacity would take the count under 4.5:1 on a filled chip. */
const COUNT = "font-mono text-[0.6875rem] leading-none";

/**
 * The chosen tags, for the section heading: each as carried, with its
 * remove button, and the hidden inputs that submit them.
 */
export function ChosenTags() {
  const form = useRecipeForm();
  const tags = useFormTags();
  return (
    <div
      role="group"
      className="flex flex-wrap items-center gap-1.5"
      aria-label="Selected tags"
      data-testid="recipe-form-chosen-tags"
    >
      {tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex min-h-7 items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2.5 text-[0.8125rem] leading-[1.125rem] font-medium text-secondary-foreground"
        >
          <input type="hidden" name={`tags[${index}]`} value={tag} />
          {tag}
          <button
            type="button"
            onClick={() =>
              form.setFieldValue(
                "tags",
                tags.filter((_, i) => i !== index),
              )
            }
            aria-label={`Remove tag ${tag}`}
            className="inline-flex size-6 items-center justify-center rounded-sm outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span aria-hidden>×</span>
          </button>
        </span>
      ))}
    </div>
  );
}

/** One facet chip, and — once it is chosen or reached — its children after it. */
function RowChips({
  row,
  selection,
  suggested,
  onToggle,
  only,
}: {
  row: FacetRow;
  selection: TagSelection;
  suggested: ReadonlySet<string>;
  onToggle: (slug: string) => void;
  /** Families: only the rows this drink has, reaches or was suggested. */
  only?: (row: FacetRow) => boolean;
}) {
  const chosen = selection.chosen.has(row.slug);
  const through = selection.implied.get(row.slug);
  const open = chosen || Boolean(through);
  const shown = !only || only(row);
  const through0 = through?.[0];
  return (
    <>
      {shown ? (
        <button
          type="button"
          aria-pressed={chosen}
          onClick={() => onToggle(row.slug)}
          title={
            through0 && !chosen
              ? `Reached through ${through0} — a child brings its parent`
              : undefined
          }
          className={cn(
            CHIP,
            chosen ? CHIP_ON : through ? CHIP_REACHED : CHIP_OUT,
            !chosen && suggested.has(row.slug) && CHIP_SUGGESTED,
          )}
          data-facet-row={row.slug}
        >
          {row.depth > 0 ? (
            <span aria-hidden className="-mr-0.5">
              ›
            </span>
          ) : null}
          {row.label}
          <span className={COUNT}>{row.count}</span>
          {through && !chosen ? (
            <span className="sr-only"> (through a chosen tag)</span>
          ) : null}
          {!chosen && suggested.has(row.slug) ? (
            <span className="sr-only"> (suggested by the import)</span>
          ) : null}
        </button>
      ) : null}
      {open || only
        ? row.children.map((child) => (
            <RowChips
              key={child.slug}
              row={child}
              selection={selection}
              suggested={suggested}
              onToggle={onToggle}
              only={only}
            />
          ))
        : null}
    </>
  );
}

/** A facet's line: its name, then its chips. */
function FacetLine({
  label,
  children,
  last,
}: {
  label: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn(
        "grid gap-2 py-2.5 sm:grid-cols-[8.75rem_minmax(0,1fr)] sm:gap-3",
        !last && "border-b border-dashed border-border",
      )}
    >
      <span id={id} className="text-sm leading-7 font-semibold">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * "Anything else": the ARIA 1.2 combobox `/make`'s `TagSearch` uses — the
 * input owns a listbox, arrows move the highlight, Enter picks it, Escape
 * closes. With nothing highlighted, Enter (or a comma) adds the text as
 * typed: a new tag. An exact spelling of a term is highlighted as you type,
 * so Enter takes the term rather than a near-duplicate string.
 *
 * Leaving the field adds nothing half-typed: only text that exactly names a
 * term or one of its aliases is taken on blur. Escape closes the list and
 * clears the text; Backspace in an empty field does nothing (a chip is
 * removed with its own button, never by a stray key — De2-10).
 */
function AnythingElse({
  inputRef,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const picker = useTagPicker();
  const form = useRecipeForm();
  const tags = useFormTags();
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = useMemo(
    () => searchPickerTerms(picker, text, tags),
    [picker, text, tags],
  );
  const expanded = open && options.length > 0;

  const commit = (value: string) => {
    form.setFieldValue("tags", addTag(picker.model, tags, value));
    setText("");
    setActive(-1);
    setOpen(false);
  };
  const pick = (slug: string) => {
    form.setFieldValue("tags", toggleTerm(picker.model, tags, slug));
    setText("");
    setActive(-1);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? options.length - 1 : current - 1));
    } else if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (expanded && active >= 0 && options[active]) {
        pick(options[active].slug);
      } else if (text.trim()) {
        commit(text);
      }
    } else if (event.key === "Escape" && (expanded || text)) {
      event.preventDefault();
      setOpen(false);
      setText("");
      setActive(-1);
    }
  };

  return (
    <div className="relative w-full max-w-[22.5rem]">
      <Input
        ref={inputRef}
        id="recipe-form-tags"
        role="combobox"
        aria-label="Add a tag"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-${active}` : undefined
        }
        placeholder="Find a tag — Fall Favorites, house, a drink name…"
        autoComplete="off"
        spellCheck={false}
        className="h-9 max-sm:h-11"
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setOpen(true);
          setActive(
            exactOption(searchPickerTerms(picker, next, tags), next) ?? -1,
          );
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          /* Only an exact name of a term is taken; half-typed text is not
           * a tag. */
          const exact = exactOption(options, text);
          if (exact >= 0) pick(options[exact].slug);
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Tags"
        hidden={!expanded}
        className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
      >
        {options.map((option, position) => (
          <li
            key={option.slug}
            id={`${id}-${position}`}
            role="option"
            aria-selected={position === active}
            className={cn(
              "flex min-h-8 cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
              position === active && "bg-accent text-accent-foreground",
            )}
            /* mousedown, so the pick lands before the input's blur. */
            onMouseDown={(event) => {
              event.preventDefault();
              pick(option.slug);
            }}
            onMouseEnter={() => setActive(position)}
          >
            <span>
              {option.trail.length ? (
                <span className="text-muted-foreground">
                  {option.trail.join(" › ")}
                  {" › "}
                </span>
              ) : null}
              <span className="font-medium">{option.label}</span>
              {option.alias ? (
                <span className="text-muted-foreground">
                  {" "}
                  (“{option.alias}”)
                </span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {option.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The section's body: the facet rows for the recipe's kind (food, or a
 * drink once a tag says so), the import's suggestions, any loose tags the
 * corpus carries, and "Anything else".
 */
export function TagFacets({
  allTags = [],
  suggestedTags,
}: {
  /** Without picker data (a test, an old caller): the loose tag list. */
  allTags?: string[];
  /** The import's `suggestedTags` (36d). */
  suggestedTags?: string[];
}) {
  const picker = useTagPicker();
  const form = useRecipeForm();
  const tags = useFormTags();
  const anythingElse = useRef<HTMLInputElement>(null);
  const drink = tagsSayDrink(picker.model, tags);
  const kind = drink ? "drinks" : "food";
  const groups = useMemo(() => pickerGroups(picker, kind), [picker, kind]);
  const selection = useMemo(
    () => tagSelection(picker.model, tags),
    [picker, tags],
  );
  const suggestions = useMemo(
    () => tagSuggestions(picker.model, suggestedTags, tags),
    [picker, suggestedTags, tags],
  );
  const suggested = useMemo(
    () => new Set(suggestions.map((suggestion) => suggestion.slug)),
    [suggestions],
  );
  const loose = useMemo(
    () => looseTags(picker, tags, allTags),
    [picker, tags, allTags],
  );
  const toggle = (slug: string) =>
    form.setFieldValue("tags", toggleTerm(picker.model, tags, slug));

  return (
    <div className="flex flex-col">
      {groups.length ? (
        <p className="text-sm text-muted-foreground">
          Pick by group; a child brings its parent
          {drink ? "" : " (Cookies is under Desserts)"}. Counts are recipes and
          groups that carry each tag.
        </p>
      ) : null}
      {suggestions.length ? (
        <FacetLine label="From the import">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.slug}
              type="button"
              onClick={() => toggle(suggestion.slug)}
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
        </FacetLine>
      ) : null}
      {groups.map((group) => {
        const collapsed = COLLAPSED_GROUPS.has(group.id);
        const keepRow = (row: FacetRow): boolean =>
          selection.chosen.has(row.slug) ||
          selection.implied.has(row.slug) ||
          suggested.has(row.slug);
        return (
          <FacetLine key={group.id} label={group.label}>
            {group.rows.map((row) => (
              <RowChips
                key={row.slug}
                row={row}
                selection={selection}
                suggested={suggested}
                onToggle={toggle}
                only={collapsed ? keepRow : undefined}
              />
            ))}
            {collapsed ? (
              <button
                type="button"
                className="min-h-7 self-center px-1 text-sm text-primary underline-offset-2 hover:underline max-sm:min-h-9"
                onClick={() => anythingElse.current?.focus()}
              >
                {group.rows.some(keepRow)
                  ? "another drink name…"
                  : "find a drink name…"}
              </button>
            ) : null}
          </FacetLine>
        );
      })}
      {loose.length ? (
        <FacetLine label="Other tags">
          {loose.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                form.setFieldValue("tags", addTag(picker.model, tags, value))
              }
              aria-label={`Add tag ${value}`}
              className={cn(CHIP, CHIP_OUT)}
            >
              <span aria-hidden>+</span>
              {value}
            </button>
          ))}
        </FacetLine>
      ) : null}
      <FacetLine label="Anything else" last>
        <AnythingElse inputRef={anythingElse} />
      </FacetLine>
    </div>
  );
}
