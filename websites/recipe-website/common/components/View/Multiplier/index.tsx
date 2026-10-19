"use client";

import React, { ChangeEvent, useId, useState } from "react";
import Fraction from "fraction.js";

import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { cn } from "@discontent/component-library/lib/utils";
import { Recipe } from "../../../controller/types";
import { useDrinkBase, useMultiplier } from "./Provider";
import { Multiplyable } from "./Multiplyable";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { UnitToggle, useUnits } from "../Units";
import {
  DRINK_PRESETS,
  drinkCount,
  drinkCountLabel,
  multiplierForDrinks,
} from "../../../util/drinkCount";

/**
 * Quick-scale presets. Clicking one writes its value straight into the custom
 * field (the multiplier `input` is the single source of truth), so the segmented
 * control and the number box never disagree. `fraction.js` parses `1/2`.
 */
const PRESETS = [
  { value: "1/2", label: "½×", name: "Half batch" },
  { value: "1", label: "1×", name: "Single batch" },
  { value: "2", label: "2×", name: "Double batch" },
] as const;

const presetClassName = (pressed: boolean) =>
  cn(
    "rounded-sm px-2.5 py-1 font-mono text-sm tabular-nums transition-colors disabled:cursor-not-allowed",
    pressed
      ? "bg-card text-foreground shadow-xs"
      : "text-muted-foreground hover:text-foreground",
  );

const fieldClassName = (parts: boolean) =>
  cn(
    "flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground [&_input]:w-16 [&_input]:text-center [&_input]:tabular-nums",
    parts && "opacity-50",
  );

/**
 * The recipe scaler, living in the Ingredients header (where every recipe site
 * puts servings/scale). A segmented ½× · 1× · 2× preset group plus a custom
 * numeric field — the field keeps the accessible name "Multiply" so existing
 * flows (and specs) that scale by typing still work. Default is 1×.
 *
 * On a drink (42c2) the same multiplier counts drinks instead: "1 drink · 2
 * drinks · 4 drinks" and a "Drinks" field (`DrinkScaler`).
 */
export function MultiplierInput() {
  const [{ input }, setMultiplier] = useMultiplier();
  const drinkBase = useDrinkBase();
  /*
   * The page and the cook view each render a scaler; a fixed id would be
   * duplicated while the view is open and both labels would name the first
   * field (42c2).
   */
  const fieldId = useId();
  // Empty / "1" both mean the default single batch; that's the selected preset.
  const current = input && input.trim() !== "" ? input : "1";
  /*
   * Parts are a ratio, and a ratio does not scale (27c): the scaler stays
   * where it was, greyed, so switching back to oz or ml finds it unchanged.
   */
  const { mode } = useUnits();
  const parts = mode === "parts";

  return (
    <div className="flex flex-row flex-wrap items-center gap-2 print:hidden">
      {drinkBase !== undefined ? (
        <DrinkScaler base={drinkBase} parts={parts} />
      ) : (
        <>
          <div
            role="group"
            aria-label="Scale"
            aria-disabled={parts || undefined}
            className={cn(
              "inline-flex rounded-md bg-muted p-0.5",
              parts && "opacity-50",
            )}
          >
            {PRESETS.map(({ value, label, name }) => (
              <button
                key={value}
                type="button"
                /*
                 * The visible "½×" leads the name (41f, WCAG 2.5.3 label in
                 * name): a speech user says what they see. "Half batch"
                 * follows for a screen reader, and still matches as a
                 * substring.
                 */
                aria-label={`${label} (${name})`}
                aria-pressed={current === value}
                disabled={parts}
                onClick={() => setMultiplier(value)}
                className={presetClassName(current === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label htmlFor={fieldId} className={fieldClassName(parts)}>
            Multiply
            <TextInput
              id={fieldId}
              name="multiplier"
              value={input ?? ""}
              disabled={parts}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setMultiplier(e.target.value);
              }}
            />
          </label>
        </>
      )}
      <UnitToggle />
      {parts && (
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          parts don&apos;t scale
        </span>
      )}
    </div>
  );
}

/**
 * The scaler on a drink (42c2, canvas B): presets by count and a "Drinks"
 * field, over the multiplier. With a yield of one drink (nearly every drink)
 * the count *is* the multiplier, and the field edits the multiplier's text
 * directly, as "Multiply" does; with a yield of two, "1 drink" is ½× and the
 * field holds the count while it is being typed in.
 */
function DrinkScaler({ base, parts }: { base: number; parts: boolean }) {
  const [{ input, multiplier }, setMultiplier] = useMultiplier();
  const count = drinkCount(base, multiplier);
  const [draft, setDraft] = useState<string | null>(null);
  const fieldId = useId();
  const fieldValue =
    base === 1
      ? (input ?? "")
      : (draft ?? (input && input.trim() !== "" ? count.toFraction(true) : ""));

  return (
    <>
      <div
        role="group"
        aria-label="Drinks"
        aria-disabled={parts || undefined}
        className={cn(
          "inline-flex rounded-md bg-muted p-0.5",
          parts && "opacity-50",
        )}
      >
        {DRINK_PRESETS.map((presetCount) => {
          const pressed = count.equals(presetCount);
          return (
            <button
              key={presetCount}
              type="button"
              aria-pressed={pressed}
              disabled={parts}
              onClick={() =>
                setMultiplier(multiplierForDrinks(base, presetCount))
              }
              className={presetClassName(pressed)}
            >
              {drinkCountLabel(presetCount)}
            </button>
          );
        })}
      </div>
      <label htmlFor={fieldId} className={fieldClassName(parts)}>
        Drinks
        <TextInput
          id={fieldId}
          name="multiplier"
          value={fieldValue}
          disabled={parts}
          onBlur={() => setDraft(null)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const typed = e.target.value;
            if (base === 1) {
              setMultiplier(typed);
              return;
            }
            setDraft(typed);
            if (typed.trim() === "") {
              setMultiplier("");
              return;
            }
            try {
              const wanted = new Fraction(typed);
              if (wanted.compare(0) > 0) {
                setMultiplier(wanted.div(base).toFraction(true));
              }
            } catch {
              /* Mid-typing ("1 1/"): keep the draft, change nothing yet. */
            }
          }}
        />
      </label>
    </>
  );
}

/**
 * The recipe's yield, scaled in place by the current multiplier. Returns just the
 * value node (mono/tabular styling comes from its host — the hero meta bar), so
 * the yield reads in the same instrument language as the durations beside it.
 */
export function ScaledYield({ recipe }: { recipe: Recipe }) {
  const { recipeYield } = recipe;
  const [{ multiplier }] = useMultiplier();
  const drinkBase = useDrinkBase();
  if (!recipeYield) return null;
  /* A drink's yield counts drinks (42c2): "2 servings" at 2× is "4 drinks". */
  if (drinkBase !== undefined) {
    return <>{drinkCountLabel(drinkCount(drinkBase, multiplier))}</>;
  }
  return (
    <StyledMarkdown forceInline className="" components={{ Multiplyable }}>
      {recipeYield}
    </StyledMarkdown>
  );
}
