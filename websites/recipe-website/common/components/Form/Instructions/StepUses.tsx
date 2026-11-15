"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/Button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import type { Ingredient } from "../../../controller/types";
import { stripMarkup } from "../../../util/ingredientNames";
import {
  USES_MAX_NAME_LENGTH,
  usesLine,
  usesName,
  type LineNames,
} from "../../../util/stepIngredients";

const CHIP =
  "inline-flex items-center gap-0.5 rounded-sm border border-border py-0 pr-0 pl-1.5 font-mono text-xs leading-none text-muted-foreground";

/** A line in the picker's list (the ingredient rows' menu items). */
const PICK =
  "flex min-h-9 w-full items-center rounded-sm px-2 py-1 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:text-muted-foreground";

/** One chip: a stored name with the line it means, or a guessed line. */
interface UsesItem {
  /** The name as stored, or as it would be. */
  name: string;
  /** The ingredient line; `undefined` for a name no line goes by. */
  line?: number;
}

/**
 * What a step uses, editable (47f): each line a chip with a remove button, a
 * picker of the recipe's other lines, and — once the list is the person's —
 * "Back to automatic". The list is the guess until the first edit, which
 * stores it as names (`Instruction.uses`); an untouched step stores nothing
 * and posts nothing.
 *
 * The picker is a popover of buttons, as the ingredient rows' menu is, and
 * not a `Select`: Radix puts a hidden native `<select>` with every option's
 * text into a form, once per step.
 */
export function StepUsesEditor({
  namePrefix,
  number,
  section,
  ingredients,
  lines,
  labels,
  pickable,
  guess,
  stored,
  onChange,
}: {
  /** The step's field name: `instructions[2]`, `instructions[1].instructions[0]`. */
  namePrefix: string;
  /** The step's number, in reading order. */
  number: number | undefined;
  /** The step's group as a `sectionKey` ("" outside one). */
  section: string;
  ingredients: readonly Ingredient[];
  /** `lineNames(ingredients)`, parsed once for the whole list of steps. */
  lines: readonly LineNames[];
  /** Each ingredient line's chip label. */
  labels: readonly string[];
  /** The lines a step could use (no headings, no blanks). */
  pickable: readonly number[];
  /** The lines the step's text names, when nothing is stored. */
  guess: readonly number[];
  /** The step's stored list; `undefined` for the guess. */
  stored: string[] | undefined;
  onChange: (uses: string[] | undefined) => void;
}) {
  const noteId = useId();
  const [picking, setPicking] = useState(false);
  const isStored = stored !== undefined;
  const step = number === undefined ? "this step" : `step ${number}`;
  const nameOf = (line: number) =>
    usesName(ingredients, line, labels[line] ?? "", section, lines);
  const lineOf = (name: string) => usesLine(ingredients, name, section, lines);
  /* The chips: the stored names, one per line (a second name for a line
   * already listed shows nothing, as on the recipe page), else the guess. */
  const items = useMemo<UsesItem[]>(() => {
    if (!stored) return guess.map((line) => ({ name: "", line }));
    const seen = new Set<number>();
    const out: UsesItem[] = [];
    for (const name of stored) {
      if (typeof name !== "string" || !name.trim()) continue;
      const line = usesLine(ingredients, name, section, lines);
      if (line !== undefined) {
        if (seen.has(line)) continue;
        seen.add(line);
      }
      out.push({ name, line });
    }
    return out;
  }, [stored, guess, ingredients, section, lines]);
  const listed = new Set(items.map((item) => item.line));
  const options = pickable.filter((line) => !listed.has(line));
  const unresolved = items.filter((item) => item.line === undefined);

  /* After an edit, focus stays in the list: the chip that took the removed
   * one's place, else the one before, else the picker. */
  const container = useRef<HTMLDivElement>(null);
  const focusNext = useRef<number | "add" | undefined>(undefined);
  useEffect(() => {
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    const root = container.current;
    if (!root) return;
    const removes = root.querySelectorAll<HTMLElement>("[data-uses-remove]");
    const add = root.querySelector<HTMLElement>("[data-uses-add]");
    const back = root.querySelector<HTMLElement>("[data-uses-back]");
    if (target === "add") (add ?? back ?? removes[0])?.focus();
    else
      (removes[Math.min(target, removes.length - 1)] ?? add ?? back)?.focus();
  });

  /** The list as names to store: as stored, or the guess named. */
  const names = () =>
    items.map((item) =>
      isStored || item.line === undefined ? item.name : nameOf(item.line),
    );

  if (!isStored && items.length === 0 && options.length === 0) return null;
  return (
    <div
      ref={container}
      role="group"
      aria-label={`What ${step} uses`}
      aria-describedby={unresolved.length ? noteId : undefined}
      className="flex flex-col gap-1"
      data-testid="step-uses-editor"
      data-stored={isStored ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-muted-foreground">uses</span>
        {items.length ? (
          <ul role="list" className="contents">
            {items.map((item, index) => {
              const label =
                item.line === undefined ? item.name : labels[item.line];
              return (
                <li
                  key={item.line ?? `name:${index}`}
                  className={`${CHIP} ${
                    item.line === undefined ? "border-dashed" : ""
                  }`}
                  data-testid="step-uses-chip"
                  data-unresolved={item.line === undefined ? "true" : undefined}
                >
                  <span>{label}</span>
                  <button
                    type="button"
                    data-uses-remove
                    aria-label={`Remove ${label} from ${step}`}
                    title={`Remove ${label}`}
                    className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-8"
                    onClick={() => {
                      focusNext.current = index;
                      onChange(names().filter((_, i) => i !== index));
                    }}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : isStored ? (
          <span className="text-xs text-muted-foreground">nothing</span>
        ) : null}
        {options.length ? (
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-uses-add
                aria-label={`Add an ingredient to ${step}`}
                className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground max-sm:h-9"
              >
                Add an ingredient…
                <ChevronDown className="size-3.5" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label={`Ingredients to add to ${step}`}
              className="max-h-72 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-1"
            >
              {options.map((line) => {
                /* A line is offered only when a name finds it again: two
                 * lines written the same cannot be told apart, and a name
                 * over the limit could not be saved. */
                const name = nameOf(line);
                const found = lineOf(name);
                const reason =
                  name.length > USES_MAX_NAME_LENGTH
                    ? "too long to name"
                    : found !== line
                      ? "written the same as another line"
                      : undefined;
                return (
                  <button
                    key={line}
                    type="button"
                    className={PICK}
                    disabled={reason !== undefined}
                    onClick={() => {
                      setPicking(false);
                      focusNext.current = "add";
                      if (reason !== undefined || listed.has(found)) return;
                      onChange([...names(), name]);
                    }}
                  >
                    <span>
                      {stripMarkup(ingredients[line]?.ingredient ?? "").trim()}
                      {reason ? (
                        <span className="block text-xs">
                          Can’t be added: {reason}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        ) : null}
        {isStored ? (
          <Button
            variant="ghost"
            size="sm"
            data-uses-back
            className="h-7 px-2 text-xs max-sm:h-9"
            aria-label={`Back to automatic for ${step}`}
            onClick={() => {
              focusNext.current = "add";
              onChange(undefined);
            }}
          >
            Back to automatic
          </Button>
        ) : items.length ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="step-uses-guess"
          >
            guessed from the text
          </span>
        ) : null}
      </div>
      {unresolved.length ? (
        <p
          id={noteId}
          className="text-xs text-muted-foreground"
          data-testid="step-uses-unresolved"
        >
          {unresolved
            .map((item) => `No ingredient called “${item.name}”.`)
            .join(" ")}{" "}
          It is kept as written and shown nowhere else; remove it, or add the
          line it meant.
        </p>
      ) : null}
      {isStored ? (
        <>
          {/* FormData cannot say "an empty list": the marker says a list
           * was posted, the names say what is in it. */}
          <input type="hidden" name={`${namePrefix}.usesSet`} value="1" />
          {stored.map((name, index) => (
            <input
              key={index}
              type="hidden"
              name={`${namePrefix}.uses[${index}]`}
              value={name}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
