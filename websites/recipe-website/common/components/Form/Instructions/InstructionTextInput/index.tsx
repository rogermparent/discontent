"use client";

import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { MarkdownInputProps } from "@discontent/component-library/components/Form/inputs/Markdown/common";
import { recipeToolbarItems } from "../../RecipeMarkdown/lexicalToolbar";

export default function InstructionTextInput({
  name,
  id,
  label,
  defaultValue,
  value,
  onChange,
  errors,
}: MarkdownInputProps) {
  return (
    <LexicalMarkdownInput
      dialect={RECIPE_MARKDOWN}
      name={name}
      id={id}
      label={label}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      errors={errors}
      toolbarItems={recipeToolbarItems}
    />
  );
}
