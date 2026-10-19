"use client";

import { useState } from "react";
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "../../../controller/types";

import { cn } from "@discontent/component-library/lib/utils";
import { Multiplyable } from "../Multiplier/Multiplyable";
import { VideoTime } from "./VideoTime";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { INSTRUCTIONS_ID } from "../JumpLinks";
import { IngredientLineText } from "../Ingredients";
import { stepNumbers } from "../../../util/stepNumbers";
import type { StepLines } from "../../../util/stepIngredients";
import { stepId } from "./stepId";
import { StepText } from "../Timers";
import { stepPlainText } from "../../../util/stepPlainText";

const stepComponents = {
  Multiplyable: { component: Multiplyable },
  VideoTime: { component: VideoTime },
};

/**
 * A step's "Uses" list (42c1, canvas B): the ingredient lines it confidently
 * names (`matchStepIngredients`, D3), each rendered as the ingredient list
 * renders it — scaled, in the reader's unit. Smaller on a phone, where the
 * list sits a scroll away rather than beside the step.
 */
function StepUses({
  lines,
  ingredients,
}: {
  lines: number[];
  ingredients: Ingredient[];
}) {
  const shown = lines.filter((index) => ingredients[index]);
  if (shown.length === 0) return null;
  return (
    <div
      data-testid="step-uses"
      className="flex flex-row flex-wrap items-baseline gap-x-2 gap-y-1 print:hidden"
    >
      <span
        aria-hidden="true"
        className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
      >
        Uses
      </span>
      <ul aria-label="Uses" className="flex min-w-0 flex-row flex-wrap gap-1.5">
        {shown.map((index) => (
          <li
            key={index}
            data-testid="step-uses-line"
            className="inline-flex min-h-6 items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs sm:text-sm"
          >
            <IngredientLineText ingredient={ingredients[index].ingredient} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One step as a panel (canvas B): its page number, the checkbox and text, and
 * what it uses. The number sits outside the label so the checkbox's
 * accessible name stays the step text alone.
 */
function StepItem({
  step,
  number,
  uses,
  ingredients,
  inGroup = false,
}: {
  step: Instruction;
  number: number;
  uses?: number[];
  ingredients: Ingredient[];
  /** Under a group's h3, a step's own title is an h4; otherwise an h3. */
  inGroup?: boolean;
}) {
  const { name, text } = step;
  const StepHeading = inGroup ? "h4" : "h3";
  return (
    <li
      id={stepId(number)}
      className="flex scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] flex-row flex-nowrap gap-3 rounded-lg border border-border bg-card px-3 py-3 sm:px-4 print:border-0 print:px-0 print:py-1"
    >
      <span className="mt-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-input font-mono text-sm font-semibold tabular-nums print:border-0">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {name && (
          <StepHeading className="border-b border-border text-base font-bold">
            {name}
          </StepHeading>
        )}
        <label className="flex flex-row flex-nowrap items-center gap-2 print:h-auto">
          {/* Named by the words alone (42c2): the label also holds the
              step's timer buttons, whose countdowns change twice a second. */}
          <Checkbox className="m-2 shrink-0" aria-label={stepPlainText(text)} />
          <StepText text={text} step={number} components={stepComponents} />
        </label>
        {uses && <StepUses lines={uses} ingredients={ingredients} />}
      </div>
    </li>
  );
}

const stepListStyle = "flex flex-col gap-2.5";

export function Instructions({
  instructions,
  ingredients = [],
  uses,
  className,
}: {
  instructions: InstructionEntry[] | undefined;
  /** The recipe's ingredient lines, for each step's "Uses" list (42c1). */
  ingredients?: Ingredient[];
  /** `matchStepIngredients`' answer, computed on the server. */
  uses?: StepLines;
  /** Placement in the recipe page's grid (42c1). */
  className?: string;
}) {
  // Reset clears the checklist by remounting the list (see Ingredients).
  const [resetKey, setResetKey] = useState(0);

  if (!instructions) return null;
  const numbers = stepNumbers(instructions);

  return (
    <section
      className={cn(
        "mx-auto mb-2 w-full max-w-xl lg:mx-0 lg:mb-0 lg:max-w-none print:w-full print:max-w-full",
        className,
      )}
    >
      {/* 39c: the jump row's target; the margin clears the masthead. */}
      <h2
        id={INSTRUCTIONS_ID}
        className="mb-2 flex scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] flex-row flex-nowrap items-center text-xl font-bold"
      >
        Instructions
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="ml-2 print:hidden"
          onClick={() => setResetKey((k) => k + 1)}
        >
          Reset
        </Button>
      </h2>
      <ol key={resetKey} className={stepListStyle}>
        {instructions.map((entry, i) => {
          if ("instructions" in entry) {
            const steps = entry.instructions ?? [];
            const first = numbers[i][0];
            const last = numbers[i][steps.length - 1];
            return (
              <li key={i} className="flex flex-col gap-2 pt-1">
                {entry.name && (
                  <h3 className="flex flex-row flex-wrap items-baseline gap-x-2.5 text-lg font-bold">
                    {entry.name}
                    {steps.length > 0 && (
                      <span className="font-mono text-xs font-medium text-muted-foreground">
                        {steps.length === 1
                          ? `step ${first}`
                          : `steps ${first}–${last}`}
                      </span>
                    )}
                  </h3>
                )}
                <ol className={stepListStyle}>
                  {steps.map((step, j) => (
                    <StepItem
                      key={j}
                      step={step}
                      number={numbers[i][j]}
                      uses={uses?.[i]?.[j]}
                      ingredients={ingredients}
                      inGroup={Boolean(entry.name)}
                    />
                  ))}
                </ol>
              </li>
            );
          }
          return (
            <StepItem
              key={i}
              step={entry}
              number={numbers[i][0]}
              uses={uses?.[i]?.[0]}
              ingredients={ingredients}
            />
          );
        })}
      </ol>
    </section>
  );
}
