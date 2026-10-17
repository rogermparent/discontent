"use client";

import { useState } from "react";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { SelectInput } from "@discontent/component-library/components/Form/inputs/Select";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import {
  Errors,
  FieldWrapper,
} from "@discontent/component-library/components/Form";
import { ChipsInput } from "@discontent/component-library/components/Form/ChipsInput";
import type { StaticImageProps } from "@discontent/next-static-image/src";
import { ImageInput } from "recipe-website-common/components/Form/Image";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import type { TermParentOption } from "recipe-website-common/controller/tagVocabulary";
import type {
  TermFormState,
  TermFormValues,
} from "recipe-website-common/controller/termFormState";

/** What the form starts from: the record on disk, or the fold's label. */
export interface TermFieldsInitial {
  label?: string;
  description?: string;
  parent?: string;
  pinned?: string[];
  aliases?: string[];
}

/**
 * The term record form's fields (31e) — label, description, picture, parent and
 * the pinned front — for `/tags/new` and `/tags/<slug>/edit`.
 *
 * Uncontrolled `FormData`, like the group form, parsed on the server by
 * `editor/controller/termForm.ts` and validated by the term seat itself. A
 * refusal echoes what was submitted (`state.formData`); the page remounts these
 * fields on each new state so the echo becomes the defaults.
 *
 * - **Slug** only on `/tags/new`. An existing term's slug is its carriers' tag
 *   string, so moving it is `term_rename` — the edit page's own Rename tool
 *   (35p), the CLI or MCP — never a field of this form.
 * - **Picture** as a recipe's is (32c, D2): a file, an Image URL, or "Remove
 *   Image". The file goes to the seat beside the input (`imageFile`), and a
 *   chosen file beats a typed URL.
 * - **Parent** is a native select over the term **records** (the seat refuses
 *   a parent without one), with this term and everything under it left out —
 *   the choices the seat would refuse as `term_cycle`. The seat still checks.
 * - **Pinned** is `ChipsInput` through the six-line adapter (`24-T13`): recipe
 *   slugs, in order, each of which must carry the term or a narrower one
 *   (35-D12) — the recipes its page lists.
 * - **Aliases** (32i, D5), the same chips: other names that search,
 *   autocomplete and `/tags/<alias>` send to this term. The seat refuses one
 *   that names another term or another term's alias.
 */
export default function TermFields({
  state,
  initial,
  slug,
  parentOptions,
  pinnedSuggestions = [],
  defaultImage,
}: {
  state?: TermFormState;
  initial?: TermFieldsInitial;
  /** The term's slug, fixed by the page; absent on `/tags/new`. */
  slug?: string;
  parentOptions: TermParentOption[];
  /** Recipes carrying the term, offered as one-click pins. */
  pinnedSuggestions?: string[];
  /** The record's current picture, transformed by the page (server-side). */
  defaultImage?: StaticImageProps;
}) {
  const values: TermFormValues & TermFieldsInitial = {
    ...initial,
    ...state?.formData,
  };

  const [labelValue, setLabelValue] = useState<string>(values.label ?? "");

  /* T13: a `useState` list and the structural field `ChipsInput` takes. */
  const [pinnedValues, setPinnedValues] = useState<string[]>(
    () => values.pinned ?? [],
  );
  const pinnedField = {
    state: { value: pinnedValues },
    pushValue: (value: string) =>
      setPinnedValues((current) => [...current, value]),
    removeValue: (index: number) =>
      setPinnedValues((current) => current.filter((_, i) => i !== index)),
  };
  const [aliasValues, setAliasValues] = useState<string[]>(
    () => values.aliases ?? [],
  );
  const aliasField = {
    state: { value: aliasValues },
    pushValue: (value: string) =>
      setAliasValues((current) => [...current, value]),
    removeValue: (index: number) =>
      setAliasValues((current) => current.filter((_, i) => i !== index)),
  };

  /*
   * A current parent the options do not hold — a hand-edited cycle, or a
   * parent whose record is gone — is still offered, marked, so that saving an
   * unrelated field never clears the parent behind the person's back. The seat
   * then says what is wrong with it.
   */
  const currentParent = values.parent;
  const options =
    currentParent &&
    !parentOptions.some((option) => option.slug === currentParent)
      ? [
          ...parentOptions,
          {
            slug: currentParent,
            label: `${currentParent} (current)`,
            depth: 0,
          },
        ]
      : parentOptions;

  return (
    <>
      <TextInput
        label="Label"
        name="label"
        id="term-form-label"
        defaultValue={values.label}
        onChange={(event) => setLabelValue(event.target.value)}
        errors={state?.errors?.label}
      />
      {slug === undefined ? (
        <TextInput
          label="Slug"
          name="slug"
          id="term-form-slug"
          defaultValue={values.slug}
          placeholder={tagSlug(labelValue)}
          errors={state?.errors?.slug}
        />
      ) : (
        <Errors errors={state?.errors?.slug} />
      )}
      <LexicalMarkdownInput
        dialect={RECIPE_MARKDOWN}
        label="Description"
        name="description"
        id="term-form-description"
        defaultValue={values.description}
        errors={state?.errors?.description}
      />
      <ImageInput
        id="term-form-image"
        existingAlt="Existing term image"
        defaultImage={defaultImage}
        allowUrl
        imageToImport={state?.formData?.imageImportUrl}
        errors={state?.errors?.image}
      />
      <SelectInput
        label="Parent"
        name="parent"
        id="term-form-parent"
        defaultValue={currentParent ?? ""}
        errors={state?.errors?.parent}
        options={[
          { value: "", label: "None (a top-level term)" },
          ...options.map((option) => ({
            value: option.slug,
            label: option.label,
            depth: option.depth,
          })),
        ]}
      />
      <FieldWrapper label="Pinned recipes" id="term-form-pinned">
        <p className="text-sm text-muted-foreground">
          Recipe slugs shown first on the term&apos;s page, in this order. Each
          must already carry the term or a narrower one.
        </p>
        <Errors errors={state?.errors?.pinned} />
        <ChipsInput
          field={pinnedField}
          name="pinned"
          id="term-form-pinned"
          itemLabel="pinned recipe"
          suggestions={pinnedSuggestions}
        />
      </FieldWrapper>
      <FieldWrapper label="Aliases" id="term-form-aliases">
        <p className="text-sm text-muted-foreground">
          Other names for this term. Searching <code>tag:</code> one of them, or
          visiting <code>/tags/</code> it, finds this term. Recipes keep the
          tags they have.
        </p>
        <Errors errors={state?.errors?.aliases} />
        <ChipsInput
          field={aliasField}
          name="aliases"
          id="term-form-aliases"
          itemLabel="synonym"
        />
      </FieldWrapper>
    </>
  );
}
