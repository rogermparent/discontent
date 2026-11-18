"use client";

import { useRef } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { ArrayItemControls } from "@discontent/component-library/components/Form/ArrayItemControls";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { useRecipeForm } from "./formContext";
import { FormSection } from "./RecipeFormFrame";

/**
 * The recipe's own notes (47j), after the steps: one markdown field a row,
 * posted `notes[0]`, `notes[1]`… with each row's + ↑ ↓ × and an "Add a
 * note" at the end. Numbered as the recipe page numbers them, so "Note 2"
 * here is the note a step's "(Note 2)" links to. Blank rows are dropped on
 * Save (`parseFormData`).
 */
export function NotesSection({
  from,
  errors,
}: {
  from?: string;
  errors?: string[];
}) {
  const form = useRecipeForm();
  /*
   * A stable key a row (47j review): the markdown field reads its value
   * when it mounts, so rows keyed by index kept a moved or removed note's
   * text on screen. The handlers below keep the keys in step; a list
   * changed from outside (a fill, an edit request remounts the form; a
   * length that differs) starts over.
   */
  const keys = useRef<number[]>([]);
  const next = useRef(0);
  const fresh = () => (next.current += 1);
  const keysFor = (count: number) => {
    if (keys.current.length !== count) {
      keys.current = Array.from({ length: count }, fresh);
    }
    return keys.current;
  };
  return (
    <FormSection id="notes" title="Notes" from={from} errors={errors}>
      <form.Field name="notes" mode="array">
        {(arrayField) => {
          const notes = (arrayField.state.value as string[] | undefined) ?? [];
          const rowKeys = keysFor(notes.length);
          const move = (from: number, to: number) => {
            const [key] = rowKeys.splice(from, 1);
            rowKeys.splice(to, 0, key);
            arrayField.moveValue(from, to);
          };
          return (
            <>
              {notes.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="notes-empty"
                >
                  No notes. Tips, substitutions, storage and make-ahead go here,
                  not in the steps.
                </p>
              ) : (
                <ol className="flex flex-col gap-2" data-testid="notes-rows">
                  {notes.map((_, index) => (
                    <li key={rowKeys[index]} className="flex flex-col">
                      <form.Field name={`notes[${index}]`}>
                        {(field) => (
                          <LexicalMarkdownInput
                            dialect={RECIPE_MARKDOWN}
                            label={`Note ${index + 1}`}
                            name={`notes[${index}]`}
                            id={`recipe-form-note-${index}`}
                            value={(field.state.value as string) ?? ""}
                            onChange={field.handleChange}
                            compact
                          />
                        )}
                      </form.Field>
                      <div className="flex flex-row flex-nowrap justify-center">
                        <ArrayItemControls
                          itemLabel={`note ${index + 1}`}
                          onInsert={() => {
                            rowKeys.splice(index, 0, fresh());
                            arrayField.insertValue(index, "");
                          }}
                          onMoveUp={() => {
                            if (index > 0) move(index, index - 1);
                          }}
                          onMoveDown={() => {
                            if (index < notes.length - 1) {
                              move(index, index + 1);
                            }
                          }}
                          onRemove={() => {
                            rowKeys.splice(index, 1);
                            arrayField.removeValue(index);
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Button
                variant="outline"
                className="mx-0.5 my-1 w-full"
                onClick={() => {
                  rowKeys.push(fresh());
                  arrayField.pushValue("");
                }}
              >
                Add a note
              </Button>
            </>
          );
        }}
      </form.Field>
    </FormSection>
  );
}
