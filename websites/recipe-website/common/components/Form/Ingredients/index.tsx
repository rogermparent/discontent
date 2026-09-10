"use client";

import clsx from "clsx";
import { useState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { Toggle } from "@discontent/component-library/components/ui/toggle";
import { FieldWrapper } from "@discontent/component-library/components/Form";
import { Input } from "@discontent/component-library/components/ui/input";
import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { DummyMultiplyable, RecipeCustomControls } from "../RecipeMarkdown";
import { PasteField, ParsedLine } from "../PasteField";
import { createIngredient } from "../../../util/parseIngredients";
import { Ingredient } from "../../../controller/types";
import { useRecipeForm } from "../formContext";
import { ArrayItemControls } from "@discontent/component-library/components/Form/ArrayItemControls";

/**
 * Reorder / insert / delete controls for an array item, driven by TanStack
 * Form array-field helpers (replacing the old useKeyList dispatch).
 */
function IngredientInput({
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
  const [input, setInput] = useState<HTMLInputElement | null>(null);

  return (
    <form.Field name={`ingredients[${index}].type`}>
      {(typeField) => {
        const isHeading = typeField.state.value === "heading";
        return (
          <div
            className={clsx(
              "transition p-2 rounded-xs border mb-2",
              isHeading
                ? "bg-card border-border"
                : "bg-background border-border",
            )}
            aria-label={`Ingredient ${index + 1} Container`}
          >
            <div className="flex flex-col border rounded-xs">
              <div className="flex gap-2 border-b p-2">
                <RecipeCustomControls textArea={input} />
              </div>
              <form.Field name={`ingredients[${index}].ingredient`}>
                {(field) => {
                  const value = field.state.value || "";
                  return (
                    <>
                      <Input
                        name={`ingredients[${index}].ingredient`}
                        id={`recipe-form-ingredients[${index}].ingredient`}
                        aria-label={`Ingredient ${index + 1}`}
                        ref={(el) => setInput(el)}
                        className="h-8 w-full grow py-1"
                        value={value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                      />
                      <div
                        className="py-1 px-2 markdown-body min-h-8 border-t"
                        aria-label={`Ingredient ${index + 1} Preview`}
                      >
                        <StyledMarkdown
                          components={{ Multiplyable: DummyMultiplyable }}
                        >
                          {value}
                        </StyledMarkdown>
                      </div>
                    </>
                  );
                }}
              </form.Field>
            </div>
            <div className="flex flex-row flex-nowrap justify-center">
              <ArrayItemControls
                onInsert={onInsert}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                onRemove={onRemove}
              />
              <Toggle
                size="sm"
                pressed={isHeading}
                onPressedChange={(pressed) =>
                  typeField.handleChange(pressed ? "heading" : undefined)
                }
                aria-label={`Toggle Ingredient ${index + 1} Type`}
                className="text-xs"
              >
                {isHeading ? "Heading" : "Ingredient"}
              </Toggle>
            </div>
            {isHeading && (
              <input
                type="hidden"
                name={`ingredients[${index}].type`}
                value="heading"
              />
            )}
          </div>
        );
      }}
    </form.Field>
  );
}

/**
 * Derive the reviewable line model from a raw ingredient paste, reusing
 * `createIngredient` for the number/fraction cleanup and heading detection.
 * Blank lines are dropped (createIngredient returns undefined for them).
 */
function parseIngredientLines(value: string): ParsedLine[] {
  return value
    .split(/\n+/)
    .map(createIngredient)
    .filter((ing): ing is Ingredient => Boolean(ing))
    .map((ing) => ({
      text: ing.ingredient,
      isHeading: ing.type === "heading",
    }));
}

/**
 * Fold reviewed lines back into flat ingredients. Ingredient headings stay flat
 * (`type: "heading"`) — no group nesting — matching the current model and view.
 * With no toggles this reproduces `createIngredients` exactly.
 */
function assembleIngredients(lines: ParsedLine[]): Ingredient[] {
  return lines.map((line) => ({
    ingredient: line.text,
    ...(line.isHeading && { type: "heading" as const }),
  }));
}

export function IngredientsListInput({
  label,
  id = "recipe-form-ingredients",
}: {
  name?: string;
  id?: string;
  label: string;
  defaultValue?: Ingredient[];
  placeholder?: string;
  errors?: unknown;
}) {
  const form = useRecipeForm();

  return (
    <FieldWrapper label={label} id={id}>
      <form.Field name="ingredients" mode="array">
        {(arrayField) => {
          const items = arrayField.state.value ?? [];
          return (
            <>
              <PasteField
                itemName="Ingredients"
                pasteAreaId="ingredients-paste-area"
                parseToLines={parseIngredientLines}
                assemble={assembleIngredients}
                onImport={(values) =>
                  form.setFieldValue("ingredients", values as Ingredient[])
                }
              />
              <ul>
                {items.map((_, index) => (
                  <li key={index} className="flex flex-col my-1">
                    <IngredientInput
                      index={index}
                      onInsert={() =>
                        arrayField.insertValue(index, { ingredient: "" })
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
                  </li>
                ))}
              </ul>
              <div className="flex flex-row">
                <Button
                  onClick={() => arrayField.pushValue({ ingredient: "" })}
                >
                  Add Ingredient
                </Button>
              </div>
            </>
          );
        }}
      </form.Field>
    </FieldWrapper>
  );
}
