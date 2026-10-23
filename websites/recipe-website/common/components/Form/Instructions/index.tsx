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
import { createContext, useContext, useMemo } from "react";
import { useStore } from "@tanstack/react-form";
import { Check } from "lucide-react";
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
}: {
  namePrefix: TopLevelPrefix;
  entry: number;
}) {
  const form = useRecipeForm();
  return (
    <div>
      <form.Field name={`${namePrefix}.name`}>
        {(field) => (
          <TextInput
            label="Name"
            name={`${namePrefix}.name`}
            value={(field.state.value as string) ?? ""}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
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

/** A group's `choice` and `recipeYield` (45e) as hidden inputs, when set. */
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
  onInsert,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  index: number;
  onInsert: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
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
          <li className="flex flex-col my-1">
            {isGroup ? (
              <>
                <InstructionGroupFields
                  namePrefix={`instructions[${index}]`}
                  entry={index}
                />
                {/* 45e: an option's set and yield ride along unedited, so a
                    save with no changes keeps them; 45e2 gives them controls. */}
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

export function InstructionsListInput({
  id,
  label,
}: {
  name?: string;
  id: string;
  label: string;
  defaultValue?: InstructionEntry[];
  placeholder?: string;
  errors?: unknown;
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

  return (
    <StepInfoContext.Provider value={info}>
      <FieldWrapper label={label} id={id}>
        <form.Field name="instructions" mode="array">
          {(arrayField) => {
            const items =
              (arrayField.state.value as InstructionEntry[] | undefined) ?? [];
            return (
              <>
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
                <ul>
                  {items.map((_, index) => (
                    <InstructionEntryFields
                      key={index}
                      index={index}
                      onInsert={() =>
                        arrayField.insertValue(index, { text: "" })
                      }
                      onMoveUp={() =>
                        index > 0 && arrayField.moveValue(index, index - 1)
                      }
                      onMoveDown={() =>
                        index < items.length - 1 &&
                        arrayField.moveValue(index, index + 1)
                      }
                      onRemove={() => arrayField.removeValue(index)}
                    />
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
