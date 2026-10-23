"use client";

import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { useStore } from "@tanstack/react-form";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@discontent/component-library/components/Button";
import { Input } from "@discontent/component-library/components/ui/input";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { Toggle } from "@discontent/component-library/components/ui/toggle";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import { detectHeading } from "../../../util/detectHeading";
import type { Ingredient } from "../../../controller/types";
import { useRecipeForm } from "../formContext";
import { FormSection } from "../RecipeFormFrame";
import {
  ingredientFlags,
  inlineRuns,
  lineSegments,
  linesAsText,
  linesFromText,
  plainLine,
  remarkLine,
  splitLine,
} from "./ingredientRows";

/*
 * Ingredients as rows (43e2, canvas B): index · the amount in a mono column
 * · the line as plain text, its asides muted · a menu. Headings are tape
 * rows. "Edit as text" shows the whole list as one text — the paste path,
 * live — and a row says when it needs a look ("The * points at a note…").
 *
 * Every line submits as it always has, a hidden `ingredients[i].ingredient`
 * holding the stored string (and `ingredients[i].type` for a heading): a row
 * nobody edits posts its markup back unchanged; an edited one is re-marked
 * by `createIngredient` (D4, `ingredientRows.ts`).
 */

/** The inline markdown of a line, as the recipe page would show it. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((run, index) => {
        switch (run.type) {
          case "strong":
            return <strong key={index}>{run.text}</strong>;
          case "em":
            return <em key={index}>{run.text}</em>;
          case "link":
            return (
              <span
                key={index}
                className="underline decoration-primary/60 underline-offset-2"
                title={run.href}
              >
                {run.text}
              </span>
            );
          default:
            return <Fragment key={index}>{run.text}</Fragment>;
        }
      })}
    </>
  );
}

/** The rest of a line, its asides muted. */
function LineText({ rest }: { rest: string }) {
  return (
    <>
      {lineSegments(rest).map((segment, index) =>
        segment.aside ? (
          <span key={index} className="text-xs text-muted-foreground">
            <Inline text={segment.text} />
          </span>
        ) : (
          <Inline key={index} text={segment.text} />
        ),
      )}
    </>
  );
}

const MENU_ITEM =
  "flex min-h-9 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

/**
 * A row open for typing: the line as plain text. Mounted fresh each time a
 * row opens, so its draft starts from the line and `before` holds what the
 * row stored when it opened — typing back to that restores it exactly.
 */
function RowField({
  number,
  index,
  stored,
  heading,
  onChange,
  onDone,
}: {
  number: number;
  index: number;
  stored: string;
  /** A heading row stores its text as typed, never marked (De2-9). */
  heading: boolean;
  onChange: (stored: string) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => plainLine(stored));
  const [before] = useState(stored);
  return (
    <Input
      autoFocus
      aria-label={`Ingredient ${number}`}
      id={`recipe-form-ingredients[${index}].ingredient`}
      className="h-9 w-full max-sm:h-11"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(remarkLine(before, event.target.value, heading));
      }}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          onDone();
        }
      }}
    />
  );
}

/** One row: display, or the field while it is being edited. */
function IngredientRow({
  index,
  count,
  line,
  sourceUrl,
  editing,
  onEdit,
  onEdited,
  onChange,
  onType,
  onInsert,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  line: Ingredient;
  sourceUrl?: string;
  /** This row is open for typing (one at a time, the section says which). */
  editing: boolean;
  onEdit: () => void;
  onEdited: () => void;
  onChange: (stored: string) => void;
  onType: (heading: boolean) => void;
  onInsert: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const number = index + 1;
  const heading = line.type === "heading";
  const stored = line.ingredient ?? "";
  const plain = plainLine(stored);
  const [menuOpen, setMenuOpen] = useState(false);
  /* The menu's choice opens this row's field (Edit, Insert a line above):
   * the closing popover must not hand focus back to its trigger, or the
   * field it just opened blurs and closes. */
  const opensField = useRef(false);
  const startEditing = onEdit;
  const { amount, rest } = heading
    ? { amount: "", rest: plain }
    : splitLine(plain);
  const flags = heading ? [] : ingredientFlags(plain);
  /* The row's name is its visible text (WCAG 2.5.3, axe's
   * label-content-name-mismatch): the amount column as shown ("2 cups ·
   * 250g"), then the rest as read, markdown undone. */
  const asRead = (text: string) =>
    inlineRuns(text)
      .map((run) => run.text)
      .join("")
      .trim();
  const readable = [amount, asRead(rest)].filter(Boolean).join(" ");
  const id = useId();

  const field = (
    <RowField
      number={number}
      index={index}
      stored={stored}
      heading={heading}
      onChange={onChange}
      onDone={onEdited}
    />
  );

  const menu = (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Ingredient ${number} actions`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-11"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-52 p-1"
        onCloseAutoFocus={(event) => {
          if (!opensField.current) return;
          opensField.current = false;
          event.preventDefault();
          document
            .getElementById(`recipe-form-ingredients[${index}].ingredient`)
            ?.focus();
        }}
      >
        <div role="group" aria-label={`Ingredient ${number} actions`}>
          {[
            { label: "Edit", act: startEditing, opens: true },
            {
              label: heading ? "Make it an ingredient" : "Make it a heading",
              act: () => onType(!heading),
            },
            { label: "Insert a line above", act: onInsert, opens: true },
            {
              label: "Move up",
              act: () => onMove(index - 1),
              disabled: index === 0,
            },
            {
              label: "Move down",
              act: () => onMove(index + 1),
              disabled: index === count - 1,
            },
            { label: "Remove", act: onRemove },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className={MENU_ITEM}
              disabled={item.disabled}
              onClick={() => {
                opensField.current = Boolean(item.opens);
                setMenuOpen(false);
                item.act();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <li
      className={cn(
        "border-b border-border",
        heading ? "pt-3 pb-1.5" : "",
        flags.length ? "pb-2.5" : "",
      )}
      data-testid="ingredient-row"
      data-heading={heading ? "true" : undefined}
    >
      <input
        type="hidden"
        name={`ingredients[${index}].ingredient`}
        value={stored}
      />
      {heading ? (
        <input
          type="hidden"
          name={`ingredients[${index}].type`}
          value="heading"
        />
      ) : null}
      {/* 45e: a heading's option rides along unedited (45e2 edits it). */}
      {heading && line.choice ? (
        <input
          type="hidden"
          name={`ingredients[${index}].choice`}
          value={line.choice}
        />
      ) : null}
      <div className="grid min-h-10 grid-cols-[1.25rem_minmax(0,1fr)_2rem] items-center gap-x-2.5 text-[0.9375rem] leading-[1.375rem] max-sm:min-h-[3.25rem] max-sm:grid-cols-[minmax(0,1fr)_2.75rem] sm:grid-cols-[1.25rem_9.375rem_minmax(0,1fr)_2rem]">
        <span
          className="font-mono text-xs text-muted-foreground tabular-nums max-sm:hidden"
          aria-hidden
        >
          {number}
        </span>
        {editing ? (
          <div className="col-span-1 sm:col-span-2">{field}</div>
        ) : heading ? (
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={startEditing}
              className="make-tape cursor-text text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`Ingredient ${number}, a heading: ${asRead(plain)}. Edit`}
            >
              <span className="px-2.5 py-1 font-mono text-xs font-semibold tracking-[0.06em] uppercase">
                <Inline text={plain} />
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            aria-describedby={flags.length ? `${id}-flag` : undefined}
            /* Named with its number and the line as read: the columns'
             * text runs together in an accessible name otherwise. */
            aria-label={`Ingredient ${number}: ${readable || "empty"}`}
            className="col-span-1 grid cursor-text grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2.5 rounded-sm py-2 text-left outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:col-span-2 sm:grid-cols-[9.375rem_minmax(0,1fr)]"
          >
            <span className="font-mono text-[0.8125rem] leading-5 font-medium tabular-nums max-sm:text-[0.9375rem] max-sm:font-semibold max-sm:text-primary">
              {/* The trailing space keeps the visible text "2 oz white
               * rum", as the name says, not "2 ozwhite rum". */}
              {amount ? `${amount} ` : null}
            </span>
            <span className="min-w-0 break-words">
              {rest ? (
                <LineText rest={rest} />
              ) : (
                <span className="text-muted-foreground">
                  (empty — type the line)
                </span>
              )}
            </span>
          </button>
        )}
        {menu}
      </div>
      {flags.includes("note-mark") ? (
        <p
          id={`${id}-flag`}
          className="mt-1 border-l-2 border-warning pl-2 text-sm sm:ml-[1.875rem]"
        >
          The <b>*</b> points at a note on the page that did not come in. Add it
          to the step, or drop the mark.
          {sourceUrl ? (
            <>
              {" "}
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                Open the page
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "Edit as text": the list as one text, live — every edit is the list (a
 * line that reads as before keeps its markup) — with the paste path's Find /
 * Replace and its review of which lines are headings.
 */
function IngredientsText({
  lines,
  onLines,
}: {
  lines: Ingredient[];
  onLines: (lines: Ingredient[]) => void;
}) {
  const [text, setText] = useState(() => linesAsText(lines));
  /* The list as it was when the text opened: a line cut and pasted back
   * matches it and keeps its markup (the current list comes first, so a
   * heading toggled since is kept). */
  const [opened] = useState(lines);
  const find = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLInputElement>(null);
  const update = (next: string) => {
    setText(next);
    onLines(linesFromText(next, [...lines, ...opened]));
  };
  return (
    <div className="flex flex-col gap-2" data-testid="ingredients-text">
      <Textarea
        title="Ingredients Paste Area"
        id="ingredients-paste-area"
        className="min-h-48 w-full font-mono text-sm"
        value={text}
        onChange={(event) => update(event.target.value)}
      />
      <div className="flex flex-row flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Find:</span>
          <Input
            ref={find}
            type="text"
            title="Find text"
            className="h-8 w-32 py-0.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Replace with:</span>
          <Input
            ref={replace}
            type="text"
            title="Replace with"
            className="h-8 w-32 py-0.5 text-sm"
          />
        </label>
        <Button
          variant="outline"
          className="h-8 px-2 text-sm"
          onClick={() => {
            const search = find.current?.value;
            if (!search) return;
            update(
              text.replace(
                new RegExp(escapeRegExp(search), "gi"),
                replace.current?.value ?? "",
              ),
            );
          }}
        >
          Replace All
        </Button>
      </div>
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-0.5" aria-label="Ingredients Review">
          {lines.map((line, index) => {
            const heading = line.type === "heading";
            return (
              <li
                key={index}
                className={cn(
                  "flex flex-row items-center gap-2 rounded-xs border px-2 py-1",
                  heading
                    ? "border-border bg-card font-semibold"
                    : "border-transparent bg-background",
                )}
              >
                <span
                  title={`Ingredients Review Line ${index + 1}`}
                  className="grow text-sm break-words"
                >
                  {plainLine(line.ingredient)}
                </span>
                <Toggle
                  size="sm"
                  pressed={heading}
                  onPressedChange={() =>
                    onLines(
                      lines.map((other, i) =>
                        i === index
                          ? {
                              ingredient: other.ingredient,
                              ...(heading ? {} : { type: "heading" as const }),
                            }
                          : other,
                      ),
                    )
                  }
                  aria-label={`Toggle Heading Line ${index + 1}`}
                  title={`Toggle Heading Line ${index + 1}`}
                  className="shrink-0 text-xs"
                >
                  {heading ? "Heading" : "Item"}
                </Toggle>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** The section's heading toggle: one list, two ways to look at it. */
function ModeSwitch({
  mode,
  onMode,
}: {
  mode: "rows" | "text";
  onMode: (mode: "rows" | "text") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Ingredients view"
      className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]"
    >
      {(
        [
          ["rows", "Rows"],
          ["text", "Edit as text"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onMode(value)}
          className={cn(
            "inline-flex min-h-7 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9",
            mode === value && "bg-background text-foreground shadow-sm",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The Ingredients section: its heading (the count, the view switch), the
 * rows or the text, and the add buttons.
 */
export function IngredientsSection({
  from,
  sourceUrl,
  errors,
}: {
  /** "from the page", after an import. */
  from?: string;
  /** The recipe's source link, for a flag's "Open the page". */
  sourceUrl?: string;
  /** A refused save's problems with the list (45d). */
  errors?: string[];
}) {
  const form = useRecipeForm();
  const lines = useStore(form.store, (state) => state.values.ingredients);
  const [mode, setMode] = useState<"rows" | "text">("rows");
  /* The row open for typing — one at a time; a row just added opens. */
  const [editing, setEditing] = useState<number>();
  const count = lines.filter(
    (line) =>
      line.type !== "heading" &&
      line.ingredient?.trim() &&
      !detectHeading(plainLine(line.ingredient)),
  ).length;
  const setLines = (next: Ingredient[]) =>
    form.setFieldValue("ingredients", next);
  const setLine = (index: number, patch: (line: Ingredient) => Ingredient) =>
    setLines(lines.map((line, i) => (i === index ? patch(line) : line)));

  const aside: ReactNode = (
    <>
      {count ? (
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
      <ModeSwitch mode={mode} onMode={setMode} />
    </>
  );

  return (
    <FormSection
      id="ingredients"
      title="Ingredients"
      from={from}
      aside={aside}
      errors={errors}
    >
      {mode === "text" ? (
        <>
          <IngredientsText lines={lines} onLines={setLines} />
          {/* The list still submits from here while it is text. */}
          {lines.map((line, index) => (
            <Fragment key={index}>
              <input
                type="hidden"
                name={`ingredients[${index}].ingredient`}
                value={line.ingredient}
              />
              {line.type === "heading" ? (
                <input
                  type="hidden"
                  name={`ingredients[${index}].type`}
                  value="heading"
                />
              ) : null}
              {line.type === "heading" && line.choice ? (
                <input
                  type="hidden"
                  name={`ingredients[${index}].choice`}
                  value={line.choice}
                />
              ) : null}
            </Fragment>
          ))}
        </>
      ) : (
        <>
          {lines.length ? (
            <ul aria-label="Ingredients" id="recipe-form-ingredients">
              {lines.map((line, index) => (
                <IngredientRow
                  /* By place: a row's own state is only its draft while it is
                     being typed in, and editing starts from the line itself. */
                  key={index}
                  index={index}
                  count={lines.length}
                  line={line}
                  sourceUrl={sourceUrl}
                  editing={editing === index}
                  onEdit={() => setEditing(index)}
                  onEdited={() => setEditing(undefined)}
                  onChange={(stored) =>
                    setLine(index, (old) => ({ ...old, ingredient: stored }))
                  }
                  onType={(heading) =>
                    setLine(index, (old) =>
                      heading
                        ? { ingredient: old.ingredient, type: "heading" }
                        : { ingredient: old.ingredient },
                    )
                  }
                  onInsert={() => {
                    setLines([
                      ...lines.slice(0, index),
                      { ingredient: "" },
                      ...lines.slice(index),
                    ]);
                    setEditing(index);
                  }}
                  onMove={(to) => {
                    if (to < 0 || to >= lines.length) return;
                    const next = [...lines];
                    const [moved] = next.splice(index, 1);
                    next.splice(to, 0, moved);
                    setLines(next);
                  }}
                  onRemove={() => setLines(lines.filter((_, i) => i !== index))}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No ingredients yet. Add them a line at a time, or paste the list
              with Edit as text.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Amounts are read from the line as you type: “3/4 cup (170g) butter”
            scales without any markup. Click a row to edit it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="max-sm:h-11"
              onClick={() => {
                setEditing(lines.length);
                setLines([...lines, { ingredient: "" }]);
              }}
            >
              Add ingredient
            </Button>
            <Button
              variant="ghost"
              className="max-sm:h-11"
              onClick={() => {
                setEditing(lines.length);
                setLines([...lines, { ingredient: "", type: "heading" }]);
              }}
            >
              Add a heading
            </Button>
          </div>
        </>
      )}
    </FormSection>
  );
}
