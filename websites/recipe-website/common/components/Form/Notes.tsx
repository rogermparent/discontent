"use client";

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
  return (
    <FormSection id="notes" title="Notes" from={from} errors={errors}>
      <form.Field name="notes" mode="array">
        {(arrayField) => {
          const notes = (arrayField.state.value as string[] | undefined) ?? [];
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
                    <li key={index} className="flex flex-col">
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
                          onInsert={() => arrayField.insertValue(index, "")}
                          onMoveUp={() => {
                            if (index > 0)
                              arrayField.moveValue(index, index - 1);
                          }}
                          onMoveDown={() => {
                            if (index < notes.length - 1) {
                              arrayField.moveValue(index, index + 1);
                            }
                          }}
                          onRemove={() => arrayField.removeValue(index)}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Button
                variant="outline"
                className="mx-0.5 my-1 w-full"
                onClick={() => arrayField.pushValue("")}
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
