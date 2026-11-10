"use client";

import {
  Instruction,
  InstructionEntry,
  InstructionGroup,
} from "../../../controller/types";
import { Button } from "@discontent/component-library/components/Button";
import { Toggle } from "@discontent/component-library/components/ui/toggle";
import { FieldWrapper } from "@discontent/component-library/components/Form";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import InstructionTextInput from "./InstructionTextInput";
import { Group, Ungroup } from "lucide-react";
import { PasteField, ParsedLine } from "../PasteField";
import { detectHeading } from "../../../util/detectHeading";
import { useRecipeForm } from "../formContext";
import { ArrayItemControls } from "@discontent/component-library/components/Form/ArrayItemControls";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "@tanstack/react-form";
import { Check } from "lucide-react";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import type { Ingredient } from "../../../controller/types";
import {
  choiceProblems,
  choiceRuns,
  runOf,
  type ChoiceRun,
} from "../../../util/choiceChecks";
import {
  freeLabel,
  labelKey,
  type SuggestedChoice,
} from "../../../util/suggestChoices";
import { useStableKeys } from "../stableKeys";
import { choiceOutline, setsAsSent } from "../../../util/choiceOutline";
import {
  LookForChoices,
  SUGGESTED_BY_MODEL,
  useModelChoices,
  type LookState,
  type ModelChoicesOutcome,
} from "./modelChoices";

/** How long a look waits for the model, all asks together. */
const LOOK_WAIT_MS = 10 * 60 * 1000;

/** "Local model qwen3:8b", "The Claude API (…)": a reader's label to start a sentence. */
function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
import {
  labelProblem,
  labelTaken,
  makeChoice,
  moveOption,
  moveTarget,
  notChoice,
  relabel,
  retieHeadings,
  selectionProblem,
  setOptionTime,
  settleLabel,
  suggestionFits,
} from "./choiceEdits";
import {
  ChoiceSetBlock,
  ChoiceSuggestionCard,
  MakeChoicePanel,
  type FieldProblems,
} from "./ChoiceSet";
import {
  flatSteps,
  ingredientChipLabel,
  stepLines,
  stepWaits,
  unnamedLines,
} from "./stepChecks";
import type { StepLines } from "../../../util/stepIngredients";

/**
 * What the Steps section knows about every step (43e2): the ingredient
 * lines each uses, their chip labels, and each step's number in reading
 * order — computed once for the list, read by each step.
 */
interface StepInfo {
  lines: StepLines;
  labels: string[];
  numbers: number[][];
}

const StepInfoContext = createContext<StepInfo | null>(null);

function useStepInfo(): StepInfo | null {
  return useContext(StepInfoContext);
}

const NOTE_CHIP =
  "rounded-sm border border-border px-1.5 py-1 font-mono text-xs leading-none text-muted-foreground";

/** "uses flour · baking soda", "a wait in it: chill 1 hour" under a step. */
function StepNotes({
  entry,
  step,
  text,
}: {
  entry: number;
  step: number;
  text: string;
}) {
  const info = useStepInfo();
  const used = info?.lines[entry]?.[step] ?? [];
  const waits = useMemo(() => stepWaits(text), [text]);
  if (!used.length && !waits.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="step-notes">
      {used.length ? (
        <p className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">uses</span>
          {used.map((line) => (
            <span key={line} className={NOTE_CHIP}>
              {info?.labels[line]}
            </span>
          ))}
        </p>
      ) : null}
      {waits.length ? (
        <p className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {waits.length === 1 ? "a wait in it:" : "waits in it:"}
          </span>
          {waits.map((wait, index) => (
            <span key={index} className={NOTE_CHIP}>
              {wait.label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** The step's number, in reading order across groups. */
function StepNumber({ entry, step }: { entry: number; step: number }) {
  const info = useStepInfo();
  const number = info?.numbers[entry]?.[step];
  return (
    <span
      className="font-mono text-[0.9375rem] leading-10 font-semibold text-primary tabular-nums"
      aria-hidden
    >
      {number ?? ""}
    </span>
  );
}

/**
 * Field-name prefixes that exist in the form's typed key space: a top-level
 * entry or a child instruction nested inside a group. Used to keep TanStack
 * Form's DeepKeys typing happy for the dynamic nested field names.
 */
type TopLevelPrefix = `instructions[${number}]`;
type InstructionPrefix =
  TopLevelPrefix | `instructions[${number}].instructions[${number}]`;

/**
 * Reorder / insert / delete controls for an array item, driven by TanStack
 * Form array-field helpers (mirrors the ingredients list; replaces useKeyList).
 */
/**
 * Name + markdown text inputs for a single instruction, controlled by TanStack
 * Form so reordering reflects the moved data (uncontrolled DOM inputs would
 * keep stale values when React reuses nodes across index changes). The `name`
 * attributes are preserved so submission stays FormData (parsed via lodash.set).
 */
function InstructionFields({
  namePrefix,
  entry,
  step,
}: {
  namePrefix: InstructionPrefix;
  entry: number;
  step: number;
}) {
  const form = useRecipeForm();
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2.5 max-sm:grid-cols-[1.375rem_minmax(0,1fr)] max-sm:gap-x-2">
      <StepNumber entry={entry} step={step} />
      <div className="min-w-0">
        <form.Field name={`${namePrefix}.name`}>
          {(field) => (
            <TextInput
              label="Name"
              name={`${namePrefix}.name`}
              value={(field.state.value as string) ?? ""}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder="Optional — most steps have none"
            />
          )}
        </form.Field>
        <form.Field name={`${namePrefix}.text`}>
          {(field) => (
            <>
              <InstructionTextInput
                label="Text"
                name={`${namePrefix}.text`}
                value={(field.state.value as string) ?? ""}
                onChange={field.handleChange}
              />
              <StepNotes
                entry={entry}
                step={step}
                text={(field.state.value as string) ?? ""}
              />
            </>
          )}
        </form.Field>
      </div>
    </div>
  );
}

/** Name + nested child-instruction array for an instruction group. */
function InstructionGroupFields({
  namePrefix,
  entry,
  nameLabel = "Name",
  nameProblems,
  onNameEdit,
}: {
  namePrefix: TopLevelPrefix;
  entry: number;
  /** "Option name" on an option of a set (45e2). */
  nameLabel?: string;
  /** An option's name problems, linked to its field (45e2). */
  nameProblems?: FieldProblems;
  /** The name was typed in (an option's set is worked on). */
  onNameEdit?: () => void;
}) {
  const form = useRecipeForm();
  return (
    <div>
      <form.Field name={`${namePrefix}.name`}>
        {(field) => (
          <TextInput
            label={nameLabel}
            name={`${namePrefix}.name`}
            value={(field.state.value as string) ?? ""}
            onChange={(e) => {
              onNameEdit?.();
              field.handleChange(e.target.value);
            }}
            onBlur={field.handleBlur}
            describedBy={nameProblems?.describedBy}
            invalid={nameProblems?.invalid}
          />
        )}
      </form.Field>
      <FieldWrapper label="Children">
        <div className="pl-2 ml-0.5 border-l-2 border-border">
          <form.Field name={`${namePrefix}.instructions`} mode="array">
            {(arrayField) => {
              const items =
                (arrayField.state.value as Instruction[] | undefined) ?? [];
              return (
                <>
                  <ul>
                    {items.map((_, index) => (
                      <li key={index}>
                        <InstructionFields
                          namePrefix={`${namePrefix}.instructions[${index}]`}
                          entry={entry}
                          step={index}
                        />
                        <div className="flex flex-row flex-nowrap justify-center">
                          <ArrayItemControls
                            onInsert={() =>
                              arrayField.insertValue(index, { text: "" })
                            }
                            onMoveUp={() =>
                              index > 0 &&
                              arrayField.moveValue(index, index - 1)
                            }
                            onMoveDown={() =>
                              index < items.length - 1 &&
                              arrayField.moveValue(index, index + 1)
                            }
                            onRemove={() => arrayField.removeValue(index)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="outline"
                    className="mx-0.5 my-1 w-full"
                    onClick={() => arrayField.pushValue({ text: "" })}
                  >
                    Add Instruction
                  </Button>
                </>
              );
            }}
          </form.Field>
        </div>
      </FieldWrapper>
    </div>
  );
}

/**
 * A plain group's leftover `choice` / `recipeYield` (45e) and times (46f) as hidden inputs,
 * so an unchanged save keeps them (43-D4). A group in a set posts its own
 * from its option card (`ChoiceSet`).
 */
function GroupChoiceInputs({
  index,
  group,
}: {
  index: number;
  group: InstructionGroup | undefined;
}) {
  return (
    <>
      {group?.choice && (
        <input
          type="hidden"
          name={`instructions[${index}].choice`}
          value={group.choice}
        />
      )}
      {group?.recipeYield && (
        <input
          type="hidden"
          name={`instructions[${index}].recipeYield`}
          value={group.recipeYield}
        />
      )}
      {/* 46f: its leftover option times, as minutes. */}
      {(["prepTime", "cookTime", "totalTime"] as const).map((field) =>
        group?.[field] ? (
          <input
            key={field}
            type="hidden"
            name={`instructions[${index}].${field}.minutes`}
            value={String(group[field])}
          />
        ) : null,
      )}
    </>
  );
}

function entryIsGroup(entry: InstructionEntry | undefined): boolean {
  return Boolean(entry && "instructions" in entry && entry.instructions);
}

/**
 * A single top-level entry: renders as a single instruction or a group, with a
 * toggle that rewrites the entry's shape (matching the old behaviour, which
 * dropped the inactive variant's content). isGroup is derived from the data so
 * it survives reordering.
 */
function InstructionEntryFields({
  index,
  focusKey,
  onInsert,
  onMoveUp,
  onMoveDown,
  onRemove,
  select,
}: {
  index: number;
  /** The entry's focus name (45e2: focus lands here after "Not a choice"). */
  focusKey?: string;
  onInsert: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  /** A group's "Include in the choice" box while groups are ticked (45e2). */
  select?: ReactNode;
}) {
  const form = useRecipeForm();
  return (
    <form.Field name={`instructions[${index}]`}>
      {(entryField) => {
        const entry = entryField.state.value as InstructionEntry | undefined;
        const isGroup = entryIsGroup(entry);
        const toggleIsGroup = () => {
          if (isGroup) {
            entryField.handleChange({
              name: (entry as InstructionGroup)?.name ?? "",
              text: "",
            } as InstructionEntry);
          } else {
            entryField.handleChange({
              name: (entry as Instruction)?.name ?? "",
              instructions: [],
            } as InstructionEntry);
          }
        };
        return (
          <li className="flex flex-col my-1" data-focus={focusKey}>
            {isGroup ? (
              <>
                {select}
                <InstructionGroupFields
                  namePrefix={`instructions[${index}]`}
                  entry={index}
                />
                <GroupChoiceInputs
                  index={index}
                  group={entry as InstructionGroup}
                />
              </>
            ) : (
              <InstructionFields
                namePrefix={`instructions[${index}]`}
                entry={index}
                step={0}
              />
            )}
            <div className="flex flex-row flex-nowrap justify-center">
              <ArrayItemControls
                onInsert={onInsert}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                onRemove={onRemove}
              />
              <Toggle
                variant="outline"
                pressed={isGroup}
                onPressedChange={toggleIsGroup}
                aria-label={
                  isGroup
                    ? "Convert to single instruction"
                    : "Convert to instruction group"
                }
                title={
                  isGroup
                    ? "Convert to single instruction"
                    : "Convert to instruction group"
                }
                className="ml-0.5 size-10 sm:size-8"
              >
                {isGroup ? <Ungroup /> : <Group />}
              </Toggle>
            </div>
          </li>
        );
      }}
    </form.Field>
  );
}

const trimInstructionRegex = /^\s*(?:\d+[.:]?\s*)?(.*)/;

/**
 * Split a raw paste into the flat, reviewable line model. Blank lines are
 * dropped; each surviving line is classified with `detectHeading`, then its
 * text is normalized for its role — a heading loses a trailing colon, a step
 * loses its leading step-number (reusing `trimInstructionRegex`).
 */
function parseInstructionLines(value: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of value.split(/\n+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const isHeading = detectHeading(trimmed);
    const text = isHeading
      ? trimmed.replace(/:\s*$/, "").trim()
      : (trimInstructionRegex.exec(trimmed)?.[1] || trimmed).trim();
    if (!text) continue;
    lines.push({ text, isHeading });
  }
  return lines;
}

/**
 * Single-pass fold of reviewed lines into grouped instruction entries. A
 * heading opens a new `InstructionGroup` (pushed once by reference, then
 * mutated as later steps nest into it); steps before the first heading stay
 * flat top-level entries. With no headings this is byte-identical to the
 * historical flat parser, which guards the existing regression specs.
 */
function assembleInstructions(lines: ParsedLine[]): InstructionEntry[] {
  const entries: InstructionEntry[] = [];
  let currentGroup: InstructionGroup | null = null;
  for (const line of lines) {
    if (line.isHeading) {
      currentGroup = { name: line.text, instructions: [] };
      entries.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.instructions.push({ text: line.text });
    } else {
      entries.push({ text: line.text });
    }
  }
  return entries;
}

/** A suggestion's state in the form: offered, taken (until Save) or put away. */
type SuggestionStatus = "offered" | "accepted" | "dismissed";

interface SuggestionState {
  status: SuggestionStatus;
  /** The set it became, while accepted: its mark follows the set, not its label. */
  set?: string;
}

/** `[start, end)` as a list. */
function span(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, offset) => start + offset);
}

/**
 * Whether focus is still where a look for alternatives left it (46f): on
 * the look button, or nowhere (`body`, as a disabled button drops it).
 */
export function focusStillAtLook(
  active: Element | null = typeof document === "undefined"
    ? null
    : document.activeElement,
): boolean {
  if (!active || active === active.ownerDocument?.body) return true;
  return Boolean(active.closest('[data-focus="look"]'));
}

/**
 * The element a focus name points at, or the first control inside it: an
 * input that isn't hidden, a button, a textarea or anything focusable.
 */
function focusable(element: Element | null): HTMLElement | undefined {
  if (!(element instanceof HTMLElement)) return undefined;
  const usable = (node: HTMLElement) =>
    !(node as HTMLButtonElement).disabled &&
    !(node instanceof HTMLInputElement && node.type === "hidden");
  if (
    element.matches("input, button, textarea, select, [tabindex]") &&
    usable(element)
  ) {
    return element;
  }
  const inner = element.querySelectorAll<HTMLElement>(
    "input, button, textarea, select, [contenteditable='true'], [tabindex]",
  );
  return Array.from(inner).find(usable);
}

export function InstructionsListInput({
  id,
  label,
  suggestedChoices,
  suggestedBy = "suggested by the import",
}: {
  name?: string;
  id: string;
  label: string;
  defaultValue?: InstructionEntry[];
  placeholder?: string;
  errors?: unknown;
  /**
   * Sets an import (or a fill) proposes (45e2, G5): offered as marked cards,
   * applied to the form only when the person accepts, stored only on Save.
   */
  suggestedChoices?: readonly SuggestedChoice[];
  /** The mark's words: "suggested by the import". */
  suggestedBy?: string;
}) {
  const form = useRecipeForm();
  const ingredients = useStore(form.store, (state) => state.values.ingredients);
  const instructions = useStore(
    form.store,
    (state) => state.values.instructions,
  );
  const info = useMemo<StepInfo>(() => {
    const lines = stepLines(ingredients, instructions);
    const numbers: number[][] = [];
    for (const entry of instructions) {
      const start = numbers.flat().length;
      const size = "instructions" in entry ? entry.instructions.length : 1;
      numbers.push(Array.from({ length: size }, (_, i) => start + i + 1));
    }
    return {
      lines,
      labels: ingredients.map((line) => ingredientChipLabel(line)),
      numbers,
    };
  }, [ingredients, instructions]);
  const unnamed = useMemo(
    () => unnamedLines(ingredients, info.lines),
    [ingredients, info],
  );
  const hasSteps = flatSteps(instructions).some((step) => step.text.trim());

  /*
   * 45e2: each entry's stable key, the sets the person has worked on (entry
   * key → set id: their bounds and their rules, `choiceChecks`), the sets as
   * the form holds them, and what the worked-on ones break.
   */
  const { keys, claim } = useStableKeys(instructions, "step");
  const [worked, setWorked] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const sets = useMemo(
    () => keys.map((key) => worked.get(key)),
    [keys, worked],
  );
  const runs = useMemo(
    () => choiceRuns(instructions, sets),
    [instructions, sets],
  );
  const problems = useMemo(
    () => choiceProblems(instructions, sets),
    [instructions, sets],
  );
  const setCount = useRef(0);
  /* The label each set's headings are tied under, from before its label
   * was typed in (by the set's key): they move once it settles. */
  const tiedAs = useRef(new Map<string, string>());
  /** A set's stable key: its id once worked on, else its first entry's. */
  const blockKey = (run: ChoiceRun) => run.set ?? `set:${keys[run.start]}`;
  const assign = (indexes: readonly number[], set: string | undefined) => {
    const entryKeys = indexes.map((index) => keys[index]);
    setWorked((old) => {
      const next = new Map(old);
      for (const key of entryKeys) {
        if (set === undefined) next.delete(key);
        else next.set(key, set);
      }
      return next;
    });
  };
  /** The set worked on from now: its rules apply, its bounds are its own. */
  const work = (run: ChoiceRun): string => {
    if (run.set !== undefined) return run.set;
    const set = blockKey(run);
    assign(span(run.start, run.end), set);
    return set;
  };
  const newSet = () => `new-${++setCount.current}`;

  /* Where focus goes after an edit (45e2): a `data-focus` name, tried in
   * order, once the edit has rendered. */
  const container = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string[]>([]);
  const requestFocus = (...targets: string[]) => {
    focusNext.current = targets;
  };
  useEffect(() => {
    const targets = focusNext.current;
    if (!targets.length) return;
    focusNext.current = [];
    for (const target of targets) {
      const element = focusable(
        container.current?.querySelector(
          `[data-focus="${CSS.escape(target)}"]`,
        ) ?? null,
      );
      if (element) {
        element.focus();
        return;
      }
    }
  });

  const setInstructions = (next: InstructionEntry[]) =>
    form.setFieldValue("instructions", next);
  const setIngredients = (next: Ingredient[]) => {
    const old = form.state.values.ingredients;
    if (next.length === old.length && next.every((line, i) => line === old[i]))
      return;
    form.setFieldValue("ingredients", next);
  };
  /** A set's headings untied, by its label and the one they wait under. */
  const untie = (run: ChoiceRun) => {
    let lines = form.state.values.ingredients;
    for (const from of new Set([
      run.label,
      tiedAs.current.get(blockKey(run)),
    ])) {
      if (from === undefined || labelTaken(runs, from, run)) continue;
      lines = retieHeadings(lines, from, undefined);
    }
    tiedAs.current.delete(blockKey(run));
    setIngredients(lines);
  };

  /* "Make these a choice": groups ticked (by key), the label typed. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [tried, setTried] = useState(false);
  const eligible = (index: number) =>
    entryIsGroup(instructions[index]) && !runOf(runs, index);
  const canSelect = instructions.some(
    (_, index) => eligible(index) && eligible(index + 1),
  );
  const selectedIndexes = selected
    .map((key) => keys.indexOf(key))
    .filter((index) => index >= 0);
  const selectProblem =
    selectionProblem(instructions, selectedIndexes, runs) ??
    labelProblem(runs, newLabel);
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
    setNewLabel("");
    setTried(false);
  };

  /* An import's suggestions, each offered, accepted or put away. */
  /* 46f: and the model's, each look's sets after the import's, each with
   * its own mark; a status per suggestion, by its place in `suggestions`. */
  const [modelSuggestions, setModelSuggestions] = useState<SuggestedChoice[]>(
    [],
  );
  const imported = suggestedChoices ?? [];
  const suggestions = useMemo(
    () => [...(suggestedChoices ?? []), ...modelSuggestions],
    [suggestedChoices, modelSuggestions],
  );
  const markOf = (index: number) =>
    index < imported.length ? suggestedBy : SUGGESTED_BY_MODEL;
  const [statuses, setStatuses] = useState<SuggestionState[]>(() =>
    (suggestedChoices ?? []).map(() => ({ status: "offered" })),
  );
  const setStatus = (index: number, state: SuggestionState) =>
    setStatuses((list) => list.map((old, i) => (i === index ? state : old)));

  /* 46f: "Look for alternatives with the model" — the edit page's only. */
  const modelChoices = useModelChoices();
  const [look, setLook] = useState<LookState>({ status: "idle" });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const lookForChoices = async () => {
    if (!modelChoices) return;
    const values = form.state.values;
    const outline = choiceOutline(values.instructions);
    setLook({ status: "asking" });
    let started: { job?: string; message?: string } = {};
    let outcome: ModelChoicesOutcome = { pending: true };
    try {
      started = await modelChoices.start(values.name, outline);
      if (!mounted.current) return;
      if (!started.job) {
        setLook({
          status: "done",
          message: started.message ?? "The model could not be asked.",
        });
        return;
      }
      setLook({ status: "asking", job: started.job });
      const until = Date.now() + LOOK_WAIT_MS;
      while (outcome.pending && Date.now() < until) {
        outcome = await modelChoices.result(started.job);
        if (!mounted.current) return;
      }
    } catch (error) {
      if (!mounted.current) return;
      setLook({
        status: "done",
        message: `The model could not be asked: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }
    if (!started.job) return;
    if (outcome.pending) {
      setLook({
        status: "done",
        job: started.job,
        message: "The model took too long to answer — ask again.",
      });
      return;
    }
    /* Only what still fits the steps, and not offered already. The model
     * answered by position: a set whose groups no longer carry the names
     * they were sent with (moved, renamed, removed while it looked) is
     * dropped and said (46f review). */
    const now = form.state.values.instructions;
    const { kept, changed } = setsAsSent(outline, now, outcome.sets ?? []);
    const stale = changed
      ? " The steps changed while the model looked; try again."
      : "";
    const known = new Set(
      suggestions.map((suggestion, index) =>
        statuses[index]?.status === "offered"
          ? suggestion.groups.join(",")
          : "",
      ),
    );
    const found = kept.filter(
      (set) => suggestionFits(now, set) && !known.has(set.groups.join(",")),
    );
    const notes = (outcome.warnings ?? []).join(" ");
    if (outcome.message) {
      setLook({ status: "done", job: started.job, message: outcome.message });
      return;
    }
    if (found.length === 0) {
      setLook({
        status: "done",
        job: started.job,
        message: stale
          ? stale.trim()
          : `Nothing found: ${outcome.model ?? "the model"} saw no alternatives here.${notes ? ` ${notes}` : ""}`,
      });
      return;
    }
    const first = suggestions.length;
    setModelSuggestions((list) => [...list, ...found]);
    setStatuses((list) => [
      ...list,
      ...found.map((): SuggestionState => ({ status: "offered" })),
    ]);
    setLook({
      status: "done",
      job: started.job,
      message: `${capitalized(outcome.model ?? "the model")} suggested ${
        found.length === 1 ? "a choice" : `${found.length} choices`
      }: see the marked ${found.length === 1 ? "card" : "cards"} above the steps.${notes ? ` ${notes}` : ""}${stale}`,
    });
    /* Focus moves to the card only from where the person left it: the look
     * button (disabled while it asked, so often `body`). Anywhere else they
     * have moved on, and the status line announces the cards (46f review). */
    if (focusStillAtLook()) requestFocus(`suggestion:${first}`);
  };
  /** The accepted suggestion a set is: by the set's id, whatever its label. */
  const acceptedAs = (run: ChoiceRun) =>
    run.set === undefined
      ? -1
      : statuses.findIndex(
          (state) => state.status === "accepted" && state.set === run.set,
        );
  const offered = (index: number) =>
    statuses[index]?.status === "offered" &&
    suggestionFits(instructions, suggestions[index]);
  /** A label for an accepted suggestion no set has yet: "Then make 2". */
  const suggestionLabel = (suggestion: SuggestedChoice) => {
    const taken = new Set<string>();
    for (const entry of instructions) {
      const choice = entryIsGroup(entry)
        ? (entry as InstructionGroup).choice?.trim()
        : undefined;
      if (choice) taken.add(labelKey(choice));
    }
    return freeLabel(suggestion.label, taken);
  };

  /** An option's fields; typing its name works its set. */
  const renderGroup = (run: ChoiceRun) =>
    function renderOption(index: number, nameProblems: FieldProblems) {
      return (
        <InstructionGroupFields
          namePrefix={`instructions[${index}]`}
          entry={index}
          nameLabel="Option name"
          nameProblems={nameProblems}
          onNameEdit={() => {
            work(run);
          }}
        />
      );
    };

  const setBlock = (run: ChoiceRun) => {
    const key = blockKey(run);
    const accepted = acceptedAs(run);
    const firstKey = keys[run.start];
    return (
      <ChoiceSetBlock
        key={key}
        run={run}
        blockKey={key}
        groups={instructions.slice(run.start, run.end) as InstructionGroup[]}
        optionKeys={keys.slice(run.start, run.end)}
        problems={problems.filter(
          (problem) => problem.index >= run.start && problem.index < run.end,
        )}
        suggestedBy={accepted >= 0 ? markOf(accepted) : undefined}
        onUndo={() => {
          setInstructions(notChoice(form.state.values.instructions, run));
          untie(run);
          assign(span(run.start, run.end), undefined);
          setStatus(accepted, { status: "offered" });
          requestFocus(`suggestion:${accepted}`, `entry:${firstKey}`);
        }}
        renderGroup={renderGroup(run)}
        onLabel={(value) => {
          if (!tiedAs.current.has(key)) tiedAs.current.set(key, run.label);
          work(run);
          setInstructions(relabel(form.state.values.instructions, run, value));
        }}
        onSettle={() => {
          const from = tiedAs.current.get(key);
          if (from === undefined) return;
          const settled = settleLabel(
            form.state.values.ingredients,
            runs,
            run,
            from,
          );
          tiedAs.current.set(key, settled.tiedAs);
          setIngredients(settled.ingredients);
        }}
        onNotChoice={() => {
          setInstructions(notChoice(form.state.values.instructions, run));
          untie(run);
          assign(span(run.start, run.end), undefined);
          if (accepted >= 0) setStatus(accepted, { status: "dismissed" });
          requestFocus(`entry:${firstKey}`);
        }}
        onMove={(from, to, direction) => {
          work(run);
          setInstructions(
            moveOption(form.state.values.instructions, run, from, to),
          );
          const moved = keys[from];
          requestFocus(
            `card:${moved}:${direction}`,
            `card:${moved}:${direction === "up" ? "down" : "up"}`,
          );
        }}
        onRemove={(index) => {
          work(run);
          setInstructions(
            form.state.values.instructions.filter((_, i) => i !== index),
          );
          /* The card that takes its place, else the one before, else the
           * entry after the set. */
          const after = index + 1 < run.end ? keys[index + 1] : undefined;
          const before = index - 1 >= run.start ? keys[index - 1] : undefined;
          requestFocus(
            ...(after ? [`card:${after}:name`] : []),
            ...(before ? [`card:${before}:name`] : []),
            ...(keys[run.end] ? [`entry:${keys[run.end]}`] : []),
            "add-step",
          );
        }}
        onYield={(index, value) => {
          work(run);
          const list = form.state.values.instructions;
          const { recipeYield: _old, ...rest } = list[
            index
          ] as InstructionGroup;
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
        onTime={(index, field, minutes) => {
          work(run);
          setInstructions(
            setOptionTime(
              form.state.values.instructions,
              index,
              field,
              minutes,
            ),
          );
        }}
        onAdd={() => {
          const set = work(run);
          const option: InstructionGroup = {
            name: "",
            choice: run.label,
            instructions: [{ text: "" }],
          };
          const optionKey = claim(option);
          setWorked((old) => new Map(old).set(optionKey, set));
          const next = [...form.state.values.instructions];
          next.splice(run.end, 0, option);
          setInstructions(next);
          requestFocus(`card:${optionKey}:name`);
        }}
      />
    );
  };

  return (
    <StepInfoContext.Provider value={info}>
      <FieldWrapper label={label} id={id}>
        <div ref={container}>
          <form.Field name="instructions" mode="array">
            {(arrayField) => {
              const items =
                (arrayField.state.value as InstructionEntry[] | undefined) ??
                [];
              /* Each row: an ordinary entry, or a set from its first option. */
              const starts: number[] = [];
              for (let at = 0; at < items.length;) {
                starts.push(at);
                at = runOf(runs, at)?.end ?? at + 1;
              }
              const rows = starts.map((index) => {
                const run = runOf(runs, index);
                if (run) return setBlock(run);
                const entry = items[index];
                const key = keys[index];
                const groupName = entryIsGroup(entry)
                  ? (entry as InstructionGroup).name?.trim() || "this group"
                  : "";
                return (
                  <InstructionEntryFields
                    key={index}
                    index={index}
                    focusKey={key ? `entry:${key}` : undefined}
                    select={
                      selecting && eligible(index) ? (
                        <label className="mb-1 flex min-h-6 items-center gap-2 text-sm font-medium">
                          <Checkbox
                            checked={selected.includes(key)}
                            onCheckedChange={(checked) =>
                              setSelected((list) =>
                                checked
                                  ? [...list, key]
                                  : list.filter((other) => other !== key),
                              )
                            }
                          />
                          Include “{groupName}” in the choice
                        </label>
                      ) : undefined
                    }
                    onInsert={() => arrayField.insertValue(index, { text: "" })}
                    onMoveUp={() => {
                      const to = moveTarget(items, index, true, runs);
                      if (to !== undefined) arrayField.moveValue(index, to);
                    }}
                    onMoveDown={() => {
                      const to = moveTarget(items, index, false, runs);
                      if (to !== undefined) arrayField.moveValue(index, to);
                    }}
                    onRemove={() => arrayField.removeValue(index)}
                  />
                );
              });
              return (
                <>
                  {suggestions.map((suggestion, index) =>
                    offered(index) ? (
                      <ChoiceSuggestionCard
                        key={`suggestion-${index}`}
                        suggestion={suggestion}
                        focusKey={`suggestion:${index}`}
                        names={suggestion.groups.map(
                          (group) => (items[group] as InstructionGroup).name,
                        )}
                        suggestedBy={markOf(index)}
                        onAccept={() => {
                          const set = newSet();
                          setInstructions(
                            makeChoice(
                              form.state.values.instructions,
                              suggestion.groups,
                              suggestionLabel(suggestion),
                            ),
                          );
                          assign(suggestion.groups, set);
                          setStatus(index, { status: "accepted", set });
                          requestFocus(`label:${set}`);
                        }}
                        onDismiss={() => {
                          setStatus(index, { status: "dismissed" });
                          /* The next card still offered, else the first of
                           * its groups. */
                          const next = suggestions.findIndex(
                            (_, other) => other !== index && offered(other),
                          );
                          requestFocus(
                            ...(next >= 0 ? [`suggestion:${next}`] : []),
                            `entry:${keys[suggestion.groups[0]]}`,
                          );
                        }}
                      />
                    ) : null,
                  )}
                  <PasteField
                    itemName="Instructions"
                    pasteAreaId="instructions-paste-area"
                    parseToLines={parseInstructionLines}
                    assemble={assembleInstructions}
                    onImport={(values) =>
                      form.setFieldValue(
                        "instructions",
                        values as InstructionEntry[],
                      )
                    }
                  />
                  <ul>{rows}</ul>
                  {selecting ? (
                    <MakeChoicePanel
                      label={newLabel}
                      onLabel={setNewLabel}
                      problem={tried ? selectProblem : undefined}
                      count={selectedIndexes.length}
                      onMake={() => {
                        if (selectProblem) {
                          setTried(true);
                          return;
                        }
                        const set = newSet();
                        setInstructions(
                          makeChoice(items, selectedIndexes, newLabel),
                        );
                        assign(selectedIndexes, set);
                        stopSelecting();
                        requestFocus(`label:${set}`);
                      }}
                      onCancel={() => {
                        stopSelecting();
                        requestFocus("start", "add-step");
                      }}
                    />
                  ) : null}
                  <Button
                    variant="outline"
                    className="mx-0.5 my-1 w-full"
                    data-focus="add-step"
                    onClick={() => arrayField.pushValue({ text: "" })}
                  >
                    Add Instruction
                  </Button>
                  {canSelect && !selecting ? (
                    <Button
                      variant="ghost"
                      className="mx-0.5 my-1 self-start max-sm:h-11"
                      data-focus="start"
                      onClick={() => {
                        setSelecting(true);
                        requestFocus("panel");
                      }}
                    >
                      Make a choice of groups…
                    </Button>
                  ) : null}
                  {modelChoices &&
                  !selecting &&
                  (canSelect || look.status !== "idle") ? (
                    <LookForChoices
                      modelChoices={modelChoices}
                      look={look}
                      onLook={() => {
                        void lookForChoices();
                      }}
                    />
                  ) : null}
                </>
              );
            }}
          </form.Field>
        </div>
      </FieldWrapper>
      {hasSteps && ingredients.some((line) => line.ingredient?.trim()) ? (
        <p
          className="flex items-center gap-2 text-sm"
          data-testid="steps-coverage"
        >
          {unnamed.length === 0 ? (
            <>
              <Check className="size-4 text-success" aria-hidden />
              Every ingredient is named in a step.
            </>
          ) : (
            <span className="text-muted-foreground">
              Not named in a step:{" "}
              {unnamed.map((line) => info.labels[line]).join(", ")}.
            </span>
          )}
        </p>
      ) : null}
    </StepInfoContext.Provider>
  );
}
