"use client";

import { useState } from "react";
import slugify from "@sindresorhus/slugify";
import { Plus, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { DateTimeInput } from "@discontent/component-library/components/Form/inputs/DateTime";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { SelectInput } from "@discontent/component-library/components/Form/inputs/Select";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { Errors } from "@discontent/component-library/components/Form";
import { useCurrentTimezone } from "@discontent/cms/hooks/useCurrentTimezone";
import { RecipeSelectInput } from "recipe-website-common/components/Form/inputs/RecipeSelect";
import createDefaultGroupSlug from "recipe-website-common/controller/createGroupSlug";
import type { GroupFormState } from "recipe-website-common/controller/groupFormState";
import type { Group, GroupItem } from "recipe-website-common/controller/types";

/**
 * A row, plus the identity React needs to keep it in place.
 *
 * The key cannot be the index — removing row 1 of three would renumber rows 2
 * and 3 onto keys 1 and 2, and React would treat that as "row 3 disappeared and
 * rows 1-2 changed content", remounting the `RecipeSelectInput`s and throwing
 * away their fetched recipe names. It cannot be the recipe slug either: a meal
 * plan may list the same recipe twice, and a fresh row has no slug at all.
 */
interface ItemRow extends GroupItem {
  id: number;
}

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "meal-plan", label: "Meal plan" },
  { value: "collection", label: "Collection" },
];

export default function GroupFields({
  group,
  state,
  slug,
}: {
  group?: Partial<Group>;
  state?: GroupFormState;
  slug?: string;
}) {
  const { name, kind, description, date, items } = group || {};
  const currentTimezone = useCurrentTimezone();

  const [rows, setRows] = useState<ItemRow[]>(() =>
    (items && items.length > 0 ? items : [{ recipe: "" }]).map(
      (item, index) => ({ ...item, id: index }),
    ),
  );

  const [defaultDate] = useState<number>(() => Date.now());
  const [nameValue, setNameValue] = useState<string>(name ?? "");
  /*
   * The slug placeholder tracks the name as it is typed, which is what makes
   * the Advanced block honest: it shows the slug the server would derive, and
   * the server derives it with the same function.
   */
  const slugPlaceholder = slugify(
    slug ||
      createDefaultGroupSlug({ name: nameValue, date: date ?? defaultDate }),
  );

  /*
   * The next id is one past the largest one live, derived from the rows
   * themselves. A `useRef` counter would be the obvious way to write this and
   * is the wrong one twice over: `react-hooks/refs` rejects reading a ref
   * during render, and a ref would have to be seeded during render to match the
   * initial rows. Deriving it inside the updater keeps the whole thing a pure
   * function of state — and it still only ever goes up, so an id can never
   * collide with a live key.
   */
  const addRow = () =>
    setRows((current) => [
      ...current,
      {
        recipe: "",
        id: current.reduce((max, row) => Math.max(max, row.id), -1) + 1,
      },
    ]);
  const removeRow = (id: number) =>
    setRows((current) => current.filter((row) => row.id !== id));

  return (
    <>
      <TextInput
        label="Name"
        name="name"
        id="group-form-name"
        defaultValue={name}
        onChange={(event) => setNameValue(event.target.value)}
        errors={state?.errors?.name}
      />
      <SelectInput
        label="Kind"
        name="kind"
        id="group-form-kind"
        defaultValue={kind ?? "collection"}
        errors={state?.errors?.kind}
      >
        {KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
      <LexicalMarkdownInput
        dialect={RECIPE_MARKDOWN}
        label="Description"
        name="description"
        id="group-form-description"
        defaultValue={description}
        errors={state?.errors?.description}
      />

      <fieldset className="my-2 flex flex-col flex-nowrap gap-3">
        <legend className="text-sm font-semibold">Recipes</legend>
        <Errors errors={state?.errors?.items} />
        {rows.map((row, index) => (
          <div
            key={row.id}
            data-testid="group-item-row"
            className="rounded-lg border border-border p-2"
          >
            <div className="flex flex-row flex-nowrap items-start justify-between gap-2">
              <div className="grow">
                <RecipeSelectInput
                  label={`Recipe ${index + 1}`}
                  name={`items[${index}].recipe`}
                  id={`group-form-item-${row.id}-recipe`}
                  defaultValue={row.recipe || undefined}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove recipe ${index + 1}`}
                onClick={() => removeRow(row.id)}
              >
                <X />
              </Button>
            </div>
            <TextInput
              label="Label"
              name={`items[${index}].label`}
              id={`group-form-item-${row.id}-label`}
              defaultValue={row.label}
              placeholder="Mon · Dinner"
            />
            <TextInput
              label="Note"
              name={`items[${index}].note`}
              id={`group-form-item-${row.id}-note`}
              defaultValue={row.note}
            />
          </div>
        ))}
        <div>
          <Button type="button" size="sm" onClick={addRow}>
            <Plus />
            Add recipe
          </Button>
        </div>
      </fieldset>

      <details className="my-1 py-1" open>
        <summary className="text-sm font-semibold">Advanced</summary>
        <div className="flex flex-col flex-nowrap">
          <TextInput
            label="Slug"
            name="slug"
            id="group-form-slug"
            defaultValue={slug}
            placeholder={slugPlaceholder}
            errors={state?.errors?.slug}
          />
          <DateTimeInput
            label="Date (UTC)"
            name="date"
            id="group-form-date"
            date={date}
            currentTimezone={currentTimezone}
            errors={state?.errors?.date}
          />
        </div>
      </details>
    </>
  );
}
