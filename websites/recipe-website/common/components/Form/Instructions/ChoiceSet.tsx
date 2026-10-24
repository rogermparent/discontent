"use client";

/*
 * Alternatives in the Steps section (45e2): a set of step groups the reader
 * picks one of (45e, G1) is one block — its label, the note that the first
 * option is the default (G2), what is wrong with it, and each option a card
 * with its name, its yield and its steps — plus the "Make these a choice"
 * panel and an import's marked suggestion (G5: a suggestion is form state
 * only, marked until Save, with Undo).
 */
import { useId, type ReactNode } from "react";
import { useStore } from "@tanstack/react-form";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/Button";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import type {
  InstructionEntry,
  InstructionGroup,
} from "../../../controller/types";
import type { ChoiceProblem, ChoiceRun } from "../../../util/choiceChecks";
import type { SuggestedChoice } from "../../../util/suggestChoices";
import { useRecipeForm } from "../formContext";
import {
  addOption,
  moveOption,
  notChoice,
  relabel,
  retieHeadings,
  sharesLabel,
} from "./choiceEdits";

/** The dashed tape a suggestion wears until Save (45b's estimated tape). */
export function SuggestedTape({ children }: { children: ReactNode }) {
  return (
    <span
      data-kind="missing"
      data-testid="choice-suggested-mark"
      className="make-tape px-2 py-1 font-mono text-[0.75rem] leading-none"
    >
      {children}
    </span>
  );
}

const LABEL = "text-sm font-medium";

/** One option of a set: a card with its place, name, yield and steps. */
function ChoiceOption({
  index,
  position,
  count,
  run,
  group,
  renderGroup,
}: {
  index: number;
  position: number;
  count: number;
  run: ChoiceRun;
  group: InstructionGroup;
  renderGroup: (index: number) => ReactNode;
}) {
  const form = useRecipeForm();
  const yieldId = useId();
  const name = group.name?.trim() || `Option ${position + 1}`;
  const setInstructions = (next: InstructionEntry[]) =>
    form.setFieldValue("instructions", next);
  const instructions = () => form.state.values.instructions;
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-background p-3 max-sm:p-2.5"
      data-testid="choice-option"
    >
      <input
        type="hidden"
        name={`instructions[${index}].choice`}
        value={run.label}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="grow font-mono text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          Option {position + 1}
          {position === 0 ? " · default" : ""}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-11"
          aria-label={`Move option “${name}” up`}
          title="Move up"
          disabled={position === 0}
          onClick={() =>
            setInstructions(moveOption(instructions(), run, index, index - 1))
          }
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-11"
          aria-label={`Move option “${name}” down`}
          title="Move down"
          disabled={position === count - 1}
          onClick={() =>
            setInstructions(moveOption(instructions(), run, index, index + 1))
          }
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-11"
          aria-label={`Remove option “${name}”`}
          title="Remove"
          onClick={() =>
            setInstructions(instructions().filter((_, i) => i !== index))
          }
        >
          <X aria-hidden />
        </Button>
      </div>
      {renderGroup(index)}
      <div className="flex flex-col gap-1">
        <label htmlFor={yieldId} className={LABEL}>
          Option yield
        </label>
        <Input
          id={yieldId}
          name={`instructions[${index}].recipeYield`}
          value={group.recipeYield ?? ""}
          placeholder="Optional — 8 bagels"
          onChange={(event) => {
            const list = instructions();
            const current = list[index] as InstructionGroup;
            const value = event.target.value;
            const { recipeYield: _old, ...rest } = current;
            void _old;
            setInstructions(
              list.map((entry, i) =>
                i === index
                  ? value
                    ? { ...rest, recipeYield: value }
                    : rest
                  : entry,
              ),
            );
          }}
        />
      </div>
    </li>
  );
}

/**
 * A set of alternatives as one block: the label (the reader's question —
 * "Then make", "Frosting"), "Not a choice", the default note, the set's
 * problems, its options as cards and "Add an option".
 */
export function ChoiceSetBlock({
  run,
  problems,
  suggestedBy,
  onUndo,
  renderGroup,
}: {
  run: ChoiceRun;
  problems: readonly ChoiceProblem[];
  /** Accepted from a suggestion and not saved yet: its mark. */
  suggestedBy?: string;
  onUndo?: () => void;
  renderGroup: (index: number) => ReactNode;
}) {
  const form = useRecipeForm();
  const labelId = useId();
  const problemsId = useId();
  const instructions = useStore(
    form.store,
    (state) => state.values.instructions,
  );
  const groups = instructions.slice(run.start, run.end) as InstructionGroup[];
  const label = run.label.trim();
  const mine = problems.filter(
    (problem) => problem.index >= run.start && problem.index < run.end,
  );
  return (
    <li
      className="my-2 flex flex-col gap-2.5 rounded-lg border-2 border-border bg-card p-3 max-sm:p-2.5"
      data-testid="choice-set"
      aria-label={label ? `Choice “${label}”` : "Choice"}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 grow flex-col gap-1">
          <label htmlFor={labelId} className={LABEL}>
            Choice label
          </label>
          <Input
            id={labelId}
            value={run.label}
            placeholder="Then make"
            aria-describedby={mine.length ? problemsId : undefined}
            onChange={(event) => {
              const value = event.target.value;
              const list = form.state.values.instructions;
              form.setFieldValue("instructions", relabel(list, run, value));
              /* Its tied headings follow — unless another set has the old
               * label too (a clash being fixed): theirs would move. */
              if (!sharesLabel(list, run)) {
                form.setFieldValue(
                  "ingredients",
                  retieHeadings(
                    form.state.values.ingredients,
                    run.label,
                    value,
                  ),
                );
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          className="max-sm:h-11"
          onClick={() => {
            const list = form.state.values.instructions;
            form.setFieldValue("instructions", notChoice(list, run));
            if (!sharesLabel(list, run)) {
              form.setFieldValue(
                "ingredients",
                retieHeadings(
                  form.state.values.ingredients,
                  run.label,
                  undefined,
                ),
              );
            }
          }}
        >
          Not a choice
        </Button>
      </div>
      {suggestedBy ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <SuggestedTape>{suggestedBy}</SuggestedTape>
          <span className="text-muted-foreground">Not saved yet.</span>
          <Button variant="ghost" size="sm" onClick={onUndo}>
            Undo
          </Button>
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        A reader picks one option. The first is the default: the recipe page
        shows it until they pick another.
      </p>
      {mine.length ? (
        <ul
          id={problemsId}
          data-testid="choice-problems"
          className="flex flex-col gap-1 text-sm text-destructive"
        >
          {mine.map((problem) => (
            <li key={`${problem.index}-${problem.message}`}>
              {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
      <ol className="flex flex-col gap-2">
        {groups.map((group, position) => (
          <ChoiceOption
            key={run.start + position}
            index={run.start + position}
            position={position}
            count={groups.length}
            run={run}
            group={group}
            renderGroup={renderGroup}
          />
        ))}
      </ol>
      <Button
        variant="outline"
        className="self-start max-sm:h-11"
        onClick={() =>
          form.setFieldValue(
            "instructions",
            addOption(form.state.values.instructions, run),
          )
        }
      >
        Add an option
      </Button>
    </li>
  );
}

/** "Large Loaf, Baguettes and Pizza". */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * An import's suggestion (G5), marked: "These 5 groups look like
 * alternatives: … Make them a choice, “Then make”?" — accepted into the
 * form's state only, or put away.
 */
export function ChoiceSuggestionCard({
  suggestion,
  names,
  suggestedBy,
  onAccept,
  onDismiss,
}: {
  suggestion: SuggestedChoice;
  names: readonly string[];
  suggestedBy: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const textId = useId();
  return (
    <div
      role="group"
      aria-labelledby={textId}
      data-testid="choice-suggestion"
      className="mb-2 flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <SuggestedTape>{suggestedBy}</SuggestedTape>
      </p>
      <p id={textId} className="text-sm">
        These {names.length} groups look like alternatives: {nameList(names)}.
        Make them a choice, “{suggestion.label}”?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button className="max-sm:h-11" onClick={onAccept}>
          Make it a choice
        </Button>
        <Button variant="ghost" className="max-sm:h-11" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/**
 * "Make these a choice": the panel under the list while groups are being
 * ticked — the label, why it cannot be made yet, and the action.
 */
export function MakeChoicePanel({
  label,
  onLabel,
  problem,
  count,
  onMake,
  onCancel,
}: {
  label: string;
  onLabel: (label: string) => void;
  /** Why the ticked groups or the label cannot be made a choice, once tried. */
  problem?: string;
  count: number;
  onMake: () => void;
  onCancel: () => void;
}) {
  const labelId = useId();
  const problemId = useId();
  return (
    <div
      role="group"
      aria-label="Make a choice"
      data-testid="make-choice-panel"
      className="my-2 flex flex-col gap-2.5 rounded-lg border-2 border-dashed border-border p-3"
    >
      <p className="text-sm">
        Tick two or more groups that sit next to each other: a reader will pick
        one, and the first is the default.{" "}
        <span className="text-muted-foreground">
          {count === 1 ? "1 group ticked." : `${count} groups ticked.`}
        </span>
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={labelId} className={LABEL}>
          Choice label
        </label>
        <Input
          id={labelId}
          value={label}
          placeholder="Then make"
          aria-describedby={problem ? problemId : undefined}
          onChange={(event) => onLabel(event.target.value)}
        />
      </div>
      {problem ? (
        <p id={problemId} className={cn("text-sm text-destructive")}>
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button className="max-sm:h-11" onClick={onMake}>
          Make these a choice
        </Button>
        <Button variant="ghost" className="max-sm:h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
