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

/**
 * Field-name prefixes that exist in the form's typed key space: a top-level
 * entry or a child instruction nested inside a group. Used to keep TanStack
 * Form's DeepKeys typing happy for the dynamic nested field names.
 */
type TopLevelPrefix = `instructions[${number}]`;
type InstructionPrefix =
  | TopLevelPrefix
  | `instructions[${number}].instructions[${number}]`;

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
function InstructionFields({ namePrefix }: { namePrefix: InstructionPrefix }) {
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
      <form.Field name={`${namePrefix}.text`}>
        {(field) => (
          <InstructionTextInput
            label="Text"
            name={`${namePrefix}.text`}
            value={(field.state.value as string) ?? ""}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
    </div>
  );
}

/** Name + nested child-instruction array for an instruction group. */
function InstructionGroupFields({
  namePrefix,
}: {
  namePrefix: TopLevelPrefix;
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
              <InstructionGroupFields namePrefix={`instructions[${index}]`} />
            ) : (
              <InstructionFields namePrefix={`instructions[${index}]`} />
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

  return (
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
                    onInsert={() => arrayField.insertValue(index, { text: "" })}
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
  );
}
