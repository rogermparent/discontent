"use client";

/*
 * Alternatives in the Steps section (45e2): a set of step groups the reader
 * picks one of (45e, G1) is one block — its label, the note that the first
 * option is the default (G2), what is wrong with it, and each option a card
 * with its name, its yield, its times (46f) and its steps — plus the "Make these a choice"
 * panel and an import's marked suggestion (G5: a suggestion is form state
 * only, marked until Save, with Undo).
 *
 * The blocks only draw and report: every edit, and where focus goes after
 * it, is the Steps section's (`InstructionsListInput`), which knows each
 * row's stable key and which sets the person has worked on.
 */
import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/Button";
import { Input } from "@discontent/component-library/components/ui/input";
import { DurationInput } from "@discontent/component-library/components/Form/inputs/Duration";
import { cn } from "@discontent/component-library/lib/utils";
import type { InstructionGroup } from "../../../controller/types";
import type { ChoiceProblem, ChoiceRun } from "../../../util/choiceChecks";
import type { SuggestedChoice } from "../../../util/suggestChoices";

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

/** What an option's name field is told about its problems. */
export interface FieldProblems {
  /** The problems' element ids (`aria-describedby`). */
  describedBy?: string;
  invalid: boolean;
}

/** One option of a set: a card with its place, name, yield and steps. */
function ChoiceOption({
  index,
  rowKey,
  position,
  count,
  run,
  group,
  nameProblems,
  totalProblems,
  renderGroup,
  onMove,
  onRemove,
  onYield,
  onTime,
}: {
  index: number;
  /** The option's stable key (its card's React key and focus name). */
  rowKey: string;
  position: number;
  count: number;
  run: ChoiceRun;
  group: InstructionGroup;
  nameProblems: FieldProblems;
  /** 46f: the option's total-time problem, tied to its total input. */
  totalProblems: FieldProblems;
  renderGroup: (index: number, problems: FieldProblems) => ReactNode;
  onMove: (to: number, direction: "up" | "down") => void;
  onRemove: () => void;
  onYield: (value: string) => void;
  /** 46f: an option time typed, in minutes (0 clears it). */
  onTime: (field: OptionTimeField, minutes: number) => void;
}) {
  const yieldId = useId();
  const timesNoteId = useId();
  const name = group.name?.trim() || `Option ${position + 1}`;
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-background p-3 max-sm:p-2.5"
      data-testid="choice-option"
      data-focus={`card:${rowKey}`}
    >
      {/* Its own label, as stored or typed; a worked-on set's id too, so
          the server judges it and keeps it apart from a neighbour. */}
      <input
        type="hidden"
        name={`instructions[${index}].choice`}
        value={group.choice ?? ""}
      />
      {run.set !== undefined ? (
        <input
          type="hidden"
          name={`instructions[${index}].choiceSet`}
          value={run.set}
        />
      ) : null}
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
          data-focus={`card:${rowKey}:up`}
          disabled={position === 0}
          onClick={() => onMove(index - 1, "up")}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-11"
          aria-label={`Move option “${name}” down`}
          title="Move down"
          data-focus={`card:${rowKey}:down`}
          disabled={position === count - 1}
          onClick={() => onMove(index + 1, "down")}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-11"
          aria-label={`Remove option “${name}”`}
          title="Remove"
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div data-focus={`card:${rowKey}:name`}>
        {renderGroup(index, nameProblems)}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={yieldId} className={LABEL}>
          Option yield
        </label>
        <Input
          id={yieldId}
          name={`instructions[${index}].recipeYield`}
          value={group.recipeYield ?? ""}
          placeholder="Optional — 8 bagels"
          onChange={(event) => onYield(event.target.value)}
        />
      </div>
      {/* 46f: the option's own times, the recipe Times section's inputs. */}
      <div
        role="group"
        aria-label={`Times for ${name}`}
        aria-describedby={timesNoteId}
        className="flex flex-col gap-1"
        data-testid="choice-option-times"
      >
        <div className="flex flex-row flex-wrap items-end gap-x-4 gap-y-1">
          {OPTION_TIMES.map(({ field, label }) => (
            <div key={field} className="min-w-36 flex-1">
              <DurationInput
                label={label}
                name={`instructions[${index}].${field}`}
                valueMinutes={group[field] ?? 0}
                onValueChange={(minutes) => onTime(field, minutes)}
                {...(field === "totalTime"
                  ? {
                      describedBy: totalProblems.describedBy,
                      invalid: totalProblems.invalid,
                    }
                  : {})}
              />
            </div>
          ))}
        </div>
        <p id={timesNoteId} className="text-xs text-muted-foreground">
          Times here replace the recipe&rsquo;s for this option; a total is prep
          + cook if you leave it blank.
        </p>
      </div>
    </li>
  );
}

/** An option card's time inputs (46f), labelled as its other fields are. */
const OPTION_TIMES = [
  { field: "prepTime", label: "Option prep time" },
  { field: "cookTime", label: "Option cook time" },
  { field: "totalTime", label: "Option total time" },
] as const;

export type OptionTimeField = (typeof OPTION_TIMES)[number]["field"];

/**
 * A set of alternatives as one block: the label (the reader's question —
 * "Then make", "Frosting"), "Not a choice", the default note, the set's
 * problems, its options as cards and "Add an option".
 */
export function ChoiceSetBlock({
  run,
  blockKey,
  groups,
  optionKeys,
  problems,
  suggestedBy,
  onUndo,
  renderGroup,
  onLabel,
  onSettle,
  onNotChoice,
  onMove,
  onRemove,
  onYield,
  onTime,
  onAdd,
}: {
  run: ChoiceRun;
  /** The set's stable key: its label field's focus name. */
  blockKey: string;
  /** The set's options, in order. */
  groups: readonly InstructionGroup[];
  /** Each option's stable key, in order. */
  optionKeys: readonly string[];
  /** The set's own problems (a set as stored has none). */
  problems: readonly ChoiceProblem[];
  /** Accepted from a suggestion and not saved yet: its mark. */
  suggestedBy?: string;
  onUndo?: () => void;
  renderGroup: (index: number, problems: FieldProblems) => ReactNode;
  /** A keystroke in the label. */
  onLabel: (value: string) => void;
  /** The label settled (the field left, or Enter): its headings follow. */
  onSettle: () => void;
  onNotChoice: () => void;
  onMove: (from: number, to: number, direction: "up" | "down") => void;
  onRemove: (index: number) => void;
  onYield: (index: number, value: string) => void;
  /** 46f: an option's time, in minutes (0 clears it). */
  onTime: (index: number, field: OptionTimeField, minutes: number) => void;
  onAdd: () => void;
}) {
  const labelId = useId();
  const problemsId = useId();
  const label = run.label.trim();
  const problemId = (at: number) => `${problemsId}-${at}`;
  const idsOf = (match: (problem: ChoiceProblem) => boolean) =>
    problems
      .map((problem, at) => (match(problem) ? problemId(at) : ""))
      .filter(Boolean)
      .join(" ");
  const labelProblems = idsOf((problem) => problem.field === "choice");
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
            data-focus={`label:${blockKey}`}
            aria-describedby={labelProblems || undefined}
            aria-invalid={labelProblems ? true : undefined}
            onChange={(event) => onLabel(event.target.value)}
            onBlur={onSettle}
            onKeyDown={(event) => {
              /* Enter settles the label rather than saving the recipe. */
              if (event.key === "Enter") {
                event.preventDefault();
                onSettle();
              }
            }}
          />
        </div>
        <Button variant="outline" className="max-sm:h-11" onClick={onNotChoice}>
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
      {problems.length ? (
        <ul
          data-testid="choice-problems"
          className="flex flex-col gap-1 text-sm text-destructive"
        >
          {problems.map((problem, at) => (
            <li key={`${problem.index}-${problem.message}`} id={problemId(at)}>
              {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
      <ol className="flex flex-col gap-2">
        {groups.map((group, position) => {
          const index = run.start + position;
          const described = idsOf(
            (problem) => problem.field === "name" && problem.index === index,
          );
          const totalDescribed = idsOf(
            (problem) =>
              problem.field === "totalTime" && problem.index === index,
          );
          return (
            <ChoiceOption
              key={optionKeys[position]}
              rowKey={optionKeys[position]}
              index={index}
              position={position}
              count={groups.length}
              run={run}
              group={group}
              nameProblems={{
                describedBy: described || undefined,
                invalid: Boolean(described),
              }}
              totalProblems={{
                describedBy: totalDescribed || undefined,
                invalid: Boolean(totalDescribed),
              }}
              renderGroup={renderGroup}
              onMove={(to, direction) => onMove(index, to, direction)}
              onRemove={() => onRemove(index)}
              onYield={(value) => onYield(index, value)}
              onTime={(field, minutes) => onTime(index, field, minutes)}
            />
          );
        })}
      </ol>
      <Button
        variant="outline"
        className="self-start max-sm:h-11"
        onClick={onAdd}
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
  focusKey,
  names,
  suggestedBy,
  onAccept,
  onDismiss,
}: {
  suggestion: SuggestedChoice;
  /** Its accept button's focus name. */
  focusKey: string;
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
        <Button
          className="max-sm:h-11"
          data-focus={focusKey}
          onClick={onAccept}
        >
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
 * ticked — the label, why it cannot be made yet, and the action. It takes
 * focus when it opens (`data-focus="panel"`), so its instructions are read.
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
  const textId = useId();
  return (
    <div
      role="group"
      aria-label="Make a choice"
      aria-describedby={textId}
      tabIndex={-1}
      data-focus="panel"
      data-testid="make-choice-panel"
      className="my-2 flex flex-col gap-2.5 rounded-lg border-2 border-dashed border-border p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <p className="text-sm" id={textId}>
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
          aria-invalid={problem ? true : undefined}
          onChange={(event) => onLabel(event.target.value)}
          onKeyDown={(event) => {
            /* Enter makes the choice rather than saving the recipe. */
            if (event.key === "Enter") {
              event.preventDefault();
              onMake();
            }
          }}
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
