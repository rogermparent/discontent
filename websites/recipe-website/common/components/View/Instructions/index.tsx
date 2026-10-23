"use client";

import { useState, type ReactNode } from "react";
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
  InstructionGroup,
} from "../../../controller/types";

import { cn } from "@discontent/component-library/lib/utils";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import {
  plainChoices,
  setStartingAt,
  shownPath,
  type PathStep,
} from "../../../util/alternatives";
import {
  ChoicePicker,
  choiceSetId,
  offPath,
  pickOf,
  useChoices,
} from "../Choices";
import { Multiplyable } from "../Multiplier/Multiplyable";
import { VideoTime } from "./VideoTime";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { INSTRUCTIONS_ID } from "../JumpLinks";
import { IngredientLineText } from "../Ingredients";
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
  id = stepId(number),
  timerKey = number,
  uses,
  ingredients,
  inGroup = false,
}: {
  step: Instruction;
  number: number;
  /** Its anchor: `stepId(number)`, or an option's (45e, G4). */
  id?: string;
  /** What its timers are keyed by (45e): the number, or an option's key. */
  timerKey?: number | string;
  uses?: number[];
  ingredients: Ingredient[];
  /** Under a group's h3, a step's own title is an h4; otherwise an h3. */
  inGroup?: boolean;
}) {
  const { name, text } = step;
  const StepHeading = inGroup ? "h4" : "h3";
  return (
    <li
      id={id}
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
          {/* One flex item: the timer rule splits the text into pieces,
              and markdown-to-jsx returns them unwrapped, so each would be
              its own item of this no-wrap row (sideways scroll on a phone). */}
          <span>
            <StepText
              text={text}
              step={number}
              timerKey={timerKey}
              components={stepComponents}
            />
          </span>
        </label>
        {uses && <StepUses lines={uses} ingredients={ingredients} />}
      </div>
    </li>
  );
}

const stepListStyle = "flex flex-col gap-2.5";

/** A step group: its h3 with the steps it covers, and its steps. */
function GroupItem({
  entry,
  steps,
  uses,
  ingredients,
  shownLines,
  shown,
  option = false,
}: {
  entry: InstructionGroup;
  /** Each step's place on the path (45e). */
  steps: PathStep[];
  /** On the path: false for an option not chosen (hidden on screen). */
  shown: boolean;
  /** An option of a set (45e): its yield shows beside its steps. */
  option?: boolean;
  uses?: number[][];
  ingredients: Ingredient[];
  shownLines: boolean[];
}) {
  const items = entry.instructions ?? [];
  const first = steps[0]?.number;
  const last = steps[items.length - 1]?.number;
  const optionYield = option ? entry.recipeYield?.trim() : undefined;
  return (
    <li className="flex flex-col gap-2 pt-1" {...offPath(shown)}>
      {entry.name && (
        <h3 className="flex flex-row flex-wrap items-baseline gap-x-2.5 text-lg font-bold">
          {entry.name}
          {items.length > 0 && (
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {items.length === 1 ? `step ${first}` : `steps ${first}–${last}`}
            </span>
          )}
          {/* An option's yield (45e): "makes 8 bagels". */}
          {optionYield && (
            <span
              data-testid="choice-yield"
              className="font-mono text-xs font-medium text-muted-foreground"
            >
              makes{" "}
              <StyledMarkdown forceInline className="" components={yieldParts}>
                {optionYield}
              </StyledMarkdown>
            </span>
          )}
        </h3>
      )}
      <ol className={stepListStyle}>
        {items.map((step, j) => (
          <StepItem
            key={j}
            step={step}
            number={steps[j].number}
            id={steps[j].id}
            timerKey={steps[j].timerKey}
            uses={shownUses(uses?.[j], shownLines)}
            ingredients={ingredients}
            inGroup={Boolean(entry.name)}
          />
        ))}
      </ol>
    </li>
  );
}

const yieldParts = { Multiplyable };

/** A step's "Uses", less the lines off the reader's path (45e). */
function shownUses(
  lines: number[] | undefined,
  shown: boolean[],
): number[] | undefined {
  if (!lines) return lines;
  return lines.some((line) => shown[line] === false)
    ? lines.filter((line) => shown[line] !== false)
    : lines;
}

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
  const context = useChoices();

  if (!instructions) return null;
  /* 45e (G4): the numbers, anchors and timer keys of the reader's path —
     for a recipe without alternatives, `stepNumbers`' own. */
  const choices =
    context?.choices ?? plainChoices(instructions, ingredients.length);
  const path = context?.path ?? shownPath(choices);
  const shownLines = path.lines;

  const items: ReactNode[] = [];
  for (let i = 0; i < instructions.length; i++) {
    const entry = instructions[i];
    const set = setStartingAt(choices, i);
    if (set) {
      /* A set of alternatives: its picker, then its options' groups. */
      const end = Math.max(...set.options.flatMap((o) => o.groupIndexes));
      const groups: ReactNode[] = [];
      for (let g = i; g <= end; g++) {
        groups.push(
          <GroupItem
            key={g}
            entry={instructions[g] as InstructionGroup}
            steps={path.steps[g]}
            shown={path.entries[g]}
            option
            uses={uses?.[g]}
            ingredients={ingredients}
            shownLines={shownLines}
          />,
        );
      }
      items.push(
        <li
          key={`set-${set.key}`}
          id={choiceSetId(set.key)}
          data-testid="choice-set"
          className="flex scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] flex-col gap-2.5 pt-1"
        >
          {context && (
            <ChoicePicker
              set={set}
              value={pickOf(path, set)}
              onChange={(option) => context.choose(set.key, option)}
            />
          )}
          <ol className={stepListStyle}>{groups}</ol>
        </li>,
      );
      i = end;
      continue;
    }
    if ("instructions" in entry) {
      items.push(
        <GroupItem
          key={i}
          entry={entry}
          steps={path.steps[i]}
          shown={path.entries[i]}
          uses={uses?.[i]}
          ingredients={ingredients}
          shownLines={shownLines}
        />,
      );
      continue;
    }
    const [step] = path.steps[i];
    items.push(
      <StepItem
        key={i}
        step={entry}
        number={step.number}
        id={step.id}
        timerKey={step.timerKey}
        uses={shownUses(uses?.[i]?.[0], shownLines)}
        ingredients={ingredients}
      />,
    );
  }

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
        {items}
      </ol>
    </section>
  );
}
