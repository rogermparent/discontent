"use client";

import { FieldWrapper } from "@discontent/component-library/components/Form";
import { ChipsInput } from "@discontent/component-library/components/Form/ChipsInput";
import { normalizeTag } from "../../../controller/normalizeTags";
import { useRecipeForm } from "../formContext";

/**
 * Free-form tag chips.
 *
 * The chips mechanism itself was promoted to
 * `component-library/components/Form/ChipsInput` when portfolio's project form
 * became its second real consumer. What stays here is only what is recipe's:
 * the form instance, the field name, and `normalizeTag`.
 *
 * `itemLabel` defaults to "tag", which is what keeps the accessible names
 * ("Add a tag", "Remove tag spicy", "Add tag dessert") byte-identical — several
 * specs locate these controls by those exact names.
 */
export function TagsInput({
  label = "Tags",
  id = "recipe-form-tags",
  allTags = [],
}: {
  label?: string;
  id?: string;
  allTags?: string[];
}) {
  const form = useRecipeForm();

  return (
    <FieldWrapper label={label} id={id}>
      <form.Field name="tags" mode="array">
        {(arrayField) => (
          <ChipsInput
            field={arrayField}
            name="tags"
            id={id}
            normalize={normalizeTag}
            suggestions={allTags}
          />
        )}
      </form.Field>
    </FieldWrapper>
  );
}
