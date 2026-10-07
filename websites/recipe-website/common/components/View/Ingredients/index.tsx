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

export function IngredientItem({ ingredient, type }: Ingredient) {
  // If the ingredient is a heading, render it as such
  if (type === "heading") {
    return (
      <li>
        <h3 className="my-2 text-lg font-semibold">
          <StyledMarkdown components={{ Multiplyable }}>
            {ingredient}
          </StyledMarkdown>
        </h3>
      </li>
    );
  }

  // Otherwise, render the standard ingredient item. The Checkbox is a labelable
  // control, so clicking anywhere in the wrapping label toggles it.
  // `markOunces` moves an amount's `oz` into its tag so the unit toggle can
  // rewrite both (27c); the stored line is untouched.
  return (
    <li>
      <label className="my-2 flex flex-row flex-nowrap items-center gap-2 print:h-auto">
        <Checkbox className="m-2 shrink-0" />
        <StyledMarkdown components={{ Multiplyable }}>
          {markOunces(ingredient)}
        </StyledMarkdown>
      </label>
    </li>
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
}: {
  ingredients?: Ingredient[];
  drink?: DrinkSpec;
}) {
  // Reset clears the checklist by remounting the list (the checkboxes are
  // uncontrolled, so remounting returns them to their default unchecked state).
  const [resetKey, setResetKey] = useState(0);

  return (
    ingredients && (
      <section className="w-full max-w-xl mx-auto lg:max-w-96 lg:mr-4 lg:ml-0 print:text-sm print:w-96 bg-card rounded-md px-4 py-1 mb-2">
        {/* Heading + scaler pin just below the masthead while the column is in
            view, so the scaler stays reachable without the old full-width bar.
            Contained (not page-wide). `sticky-chrome` (never `sticky` — see
            theme.css) means it follows the reader's sticky-header policy and
            releases in lockstep with the masthead on a short viewport; `top` is
            then inert, which is why it can keep reading `--header-height`
            rather than the offset var. `print:static` still wins, and now it is
            what makes print beat the components layer. */}
        <div className="sticky-chrome top-[var(--header-height)] z-10 -mx-4 mb-2 border-b border-border bg-card px-4 pt-2 pb-2 print:static print:mx-0 print:border-0 print:px-0 print:pb-0">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Ingredients</h2>
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
        <ul key={resetKey} className="text-lg print:text-sm">
          {ingredients.map(({ ingredient, type }, i) => (
            <IngredientItem key={i} ingredient={ingredient} type={type} />
          ))}
        </ul>
        <BatchingNote ingredients={ingredients} drink={drink} />
      </section>
    )
  );
}
