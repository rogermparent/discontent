"use client";

import React, { useState } from "react";

import Fraction from "fraction.js";
import { DrinkSpec, Ingredient } from "../../../controller/types";
import { Multiplyable } from "../Multiplier/Multiplyable";
import { useMultiplier } from "../Multiplier/Provider";
import { useUnits } from "../Units";
import {
  dilutionOunces,
  formatOunces,
  markOunces,
  ouncesToMl,
  sumOunces,
} from "../../../util/barUnits";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { MultiplierInput } from "../Multiplier";
import { INGREDIENTS_ID } from "../JumpLinks";
import { cn } from "@discontent/component-library/lib/utils";
import { hasChoices, optionOfLine } from "../../../util/alternatives";
import { choiceSetId, offPath, useChoices } from "../Choices";

export function IngredientItem({
  ingredient,
  type,
  shown = true,
  option,
}: Ingredient & {
  /** On the reader's path (45e): false for an option not chosen. */
  shown?: boolean;
  /** The option a heading starts, and its set's picker anchor (45e). */
  option?: { label: string; href: string };
}) {
  // If the ingredient is a heading, render it as such
  if (type === "heading") {
    return (
      <li {...offPath(shown)}>
        <h3 className="my-2 text-lg font-semibold">
          <StyledMarkdown components={{ Multiplyable }}>
            {ingredient}
          </StyledMarkdown>
        </h3>
        {/* An option's extras say so, with the way back to the picker. */}
        {option && (
          <p
            data-testid="choice-extras-note"
            className="-mt-1.5 mb-1 text-xs text-muted-foreground print:hidden"
          >
            Only for {option.label} ·{" "}
            <a
              href={option.href}
              className="underline underline-offset-2 hover:text-foreground"
            >
              choose another
            </a>
          </p>
        )}
      </li>
    );
  }

  // Otherwise, render the standard ingredient item. The Checkbox is a labelable
  // control, so clicking anywhere in the wrapping label toggles it.
  return (
    <li {...offPath(shown)}>
      <label className="my-2 flex flex-row flex-nowrap items-center gap-2 print:h-auto">
        <Checkbox className="m-2 shrink-0" />
        <IngredientLineText ingredient={ingredient} />
      </label>
    </li>
  );
}

/**
 * One ingredient line as the reader sees it: scaled by the multiplier, in the
 * reader's unit. `markOunces` moves an amount's `oz` into its tag so the unit
 * toggle can rewrite both (27c); the stored line is untouched. Shared with a
 * step's "Uses" list (42c1), so a line reads the same in both places.
 */
export function IngredientLineText({ ingredient }: { ingredient: string }) {
  return (
    <StyledMarkdown components={{ Multiplyable }}>
      {markOunces(ingredient)}
    </StyledMarkdown>
  );
}

/**
 * "Batching? Stir in about N oz water…" (27c) — shown when a shaken or stirred
 * drink is scaled up, because a batch made ahead gets no dilution from the
 * shaker. N is the scaled volume of the oz lines times ~20% (stirred) or ~25%
 * (shaken), in the reader's unit (ml stays ml; parts, which do not scale,
 * never get here because the multiplier is off).
 */
export function BatchingNote({
  ingredients,
  drink,
}: {
  ingredients: Ingredient[];
  drink?: DrinkSpec;
}) {
  const [{ multiplier }] = useMultiplier();
  const { mode } = useUnits();
  const method = drink?.method;
  if (method !== "shake" && method !== "stir") return null;
  if (!multiplier || multiplier.compare(1) <= 0 || mode === "parts") {
    return null;
  }
  const total = sumOunces(ingredients.map(({ ingredient }) => ingredient));
  if (total.compare(0) <= 0) return null;
  const water = dilutionOunces(total.mul(multiplier), method);
  if (water <= 0) return null;
  const amount =
    mode === "ml"
      ? `${ouncesToMl(water)} ml`
      : `${formatOunces(new Fraction(water))} oz`;
  return (
    <p
      data-testid="batching-note"
      className="my-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground print:hidden"
    >
      Batching? Stir in about {amount} water (~20% dilution stirred / ~25%
      shaken), chill, and pour over ice or serve up.
    </p>
  );
}

export function Ingredients({
  ingredients,
  drink,
  actions,
  className,
}: {
  ingredients?: Ingredient[];
  drink?: DrinkSpec;
  /** Placement in the recipe page's grid (42c1). */
  className?: string;
  /**
   * Extra controls beside the scaler — the editor's "Add to list" (35d).
   * Rendered inside the recipe's `MultiplierProvider`, so they can read the
   * scale the reader set. The export passes none.
   */
  actions?: React.ReactNode;
}) {
  // Reset clears the checklist by remounting the list (the checkboxes are
  // uncontrolled, so remounting returns them to their default unchecked state).
  const [resetKey, setResetKey] = useState(0);
  /* 45e: the lines on the reader's path; the others stay, hidden on screen. */
  const context = useChoices();
  const shownLines = context?.path.lines;
  const optionAt = (line: number) => {
    if (!context || !hasChoices(context.choices)) return undefined;
    const owner = optionOfLine(context.choices, line);
    if (!owner || owner.option.ingredientLines[0] !== line) return undefined;
    return {
      label: owner.option.label,
      href: `#${choiceSetId(owner.set.key)}`,
    };
  };
  const shownIngredients = shownLines
    ? (ingredients ?? []).filter((_, i) => shownLines[i] !== false)
    : ingredients;

  return (
    ingredients && (
      <section
        className={cn(
          "mx-auto mb-2 w-full max-w-xl rounded-lg border border-border bg-card px-4 py-1 print:w-96 print:border-0 print:text-sm",
          /*
           * 42c1: from `lg` the whole column is the side rail beside the
           * steps, pinned while they scroll — the same rail as /make's shelf
           * (`MakePage/InventoryPanel.tsx`). Plain `sticky`, not
           * `.sticky-chrome`: like portfolio's index plate it stays pinned
           * when the masthead releases, and offsets by
           * `--sticky-chrome-offset` — the masthead's height while it pins,
           * 0 once it releases (a short viewport, or Sticky headers off). A
           * rail taller than the viewport scrolls inside itself, or its last
           * lines could not be reached until the steps ran out.
           */
          "lg:sticky lg:top-[calc(var(--sticky-chrome-offset)+1rem)] lg:mx-0 lg:mb-0 lg:max-h-[calc(100vh-var(--sticky-chrome-offset)-2rem)] lg:max-w-none lg:overflow-y-auto print:static print:max-h-none print:overflow-visible",
          className,
        )}
      >
        {/* Heading + scaler pin just below the masthead while the column is in
            view, so the scaler stays reachable without the old full-width bar.
            Contained (not page-wide). `sticky-chrome` (never `sticky` — see
            theme.css) means it follows the reader's sticky-header policy and
            releases in lockstep with the masthead on a short viewport; `top` is
            then inert, which is why it can keep reading `--header-height`
            rather than the offset var. `print:static` still wins, and now it is
            what makes print beat the components layer. From `lg` the rail
            scrolls itself, so the header pins to the rail's top (`lg:top-0`). */}
        <div className="sticky-chrome top-[var(--header-height)] z-10 -mx-4 mb-2 border-b border-border bg-card px-4 pt-2 pb-2 lg:top-0 print:static print:mx-0 print:border-0 print:px-0 print:pb-0">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            {/* 39c: the jump row's target; the margin clears the masthead. */}
            <h2
              id={INGREDIENTS_ID}
              className="scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] text-xl font-bold"
            >
              Ingredients
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="print:hidden"
              onClick={() => setResetKey((k) => k + 1)}
            >
              Reset
            </Button>
          </div>
          <div className="mt-2">
            <MultiplierInput />
          </div>
        </div>
        <ul
          key={resetKey}
          aria-label="Ingredients"
          className="text-lg print:text-sm"
        >
          {ingredients.map(({ ingredient, type }, i) => (
            <IngredientItem
              key={i}
              ingredient={ingredient}
              type={type}
              shown={shownLines?.[i] !== false}
              option={type === "heading" ? optionAt(i) : undefined}
            />
          ))}
        </ul>
        <BatchingNote ingredients={shownIngredients ?? []} drink={drink} />
        {/* Below the list, not in the sticky header: a result line there
            would ride along over the recipe. */}
        {actions && <div className="my-2 print:hidden">{actions}</div>}
      </section>
    )
  );
}
