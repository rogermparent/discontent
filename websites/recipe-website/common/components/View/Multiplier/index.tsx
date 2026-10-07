"use client";

import React, { ChangeEvent } from "react";

import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { cn } from "@discontent/component-library/lib/utils";
import { Recipe } from "../../../controller/types";
import { useMultiplier } from "./Provider";
import { Multiplyable } from "./Multiplyable";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { UnitToggle, useUnits } from "../Units";

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

/**
 * The recipe scaler, living in the Ingredients header (where every recipe site
 * puts servings/scale). A segmented ½× · 1× · 2× preset group plus a custom
 * numeric field — the field keeps the accessible name "Multiply" so existing
 * flows (and specs) that scale by typing still work. Default is 1×.
 */
export function MultiplierInput() {
  const [{ input }, setMultiplier] = useMultiplier();
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
            aria-label={name}
            aria-pressed={current === value}
            disabled={parts}
            onClick={() => setMultiplier(value)}
            className={cn(
              "rounded-sm px-2.5 py-1 font-mono text-sm tabular-nums transition-colors disabled:cursor-not-allowed",
              current === value
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <label
        htmlFor="multiplier"
        className={cn(
          "flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground [&_input]:w-16 [&_input]:text-center [&_input]:tabular-nums",
          parts && "opacity-50",
        )}
      >
        Multiply
        <TextInput
          id="multiplier"
          name="multiplier"
          value={input ?? ""}
          disabled={parts}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setMultiplier(e.target.value);
          }}
        />
      </label>
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
 * The recipe's yield, scaled in place by the current multiplier. Returns just the
 * value node (mono/tabular styling comes from its host — the hero meta bar), so
 * the yield reads in the same instrument language as the durations beside it.
 */
export function ScaledYield({ recipe }: { recipe: Recipe }) {
  const { recipeYield } = recipe;
  if (!recipeYield) return null;
  return (
    <StyledMarkdown forceInline className="" components={{ Multiplyable }}>
      {recipeYield}
    </StyledMarkdown>
  );
}
