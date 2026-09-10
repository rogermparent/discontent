"use client";

import { useStore } from "@tanstack/react-form";
import { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { resolveRecipeVideoSrc } from "recipe-website-common/controller/recipeVideo";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import createDefaultSlug from "recipe-website-common/controller/createSlug";
import { useRecipeForm } from "./formContext";
import { mergeFieldErrors } from "./fieldErrors";
import { TagsInput } from "recipe-website-common/components/Form/Tags";
import { IngredientsListInput } from "recipe-website-common/components/Form/Ingredients";
import { InstructionsListInput } from "recipe-website-common/components/Form/Instructions";
import { TimelinesInput } from "recipe-website-common/components/Form/Timeline";
import { DateTimeInput } from "@discontent/component-library/components/Form/inputs/DateTime";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { ImageInput } from "./Image";
import { VideoInput } from "@discontent/component-library/components/Form/inputs/Video";
import { StaticImageProps } from "@discontent/next-static-image/src";
import { VideoPlayerProvider } from "@discontent/component-library/components/VideoPlayer/Provider";
import { DurationInput } from "@discontent/component-library/components/Form/inputs/Duration";
import { useCurrentTimezone } from "@discontent/cms/hooks/useCurrentTimezone";

import { yieldToolbarItems } from "./RecipeMarkdown/lexicalToolbar";

export default function RecipeFields({
  recipe,
  slug,
  state,
  defaultImage,
  allTags = [],
}: {
  recipe?: Partial<ImportedRecipe>;
  slug?: string;
  state?: RecipeFormState;
  defaultImage?: StaticImageProps;
  allTags?: string[];
}) {
  const form = useRecipeForm();
  // Read the live name reactively (drives the slug placeholder) without nesting
  // the slug field inside a form.Subscribe, which broke the slug field's
  // controlled value at submit time.
  const currentName = useStore(form.store, (s) => s.values.name);
  // The total-time placeholder previews prep + cook, read reactively from form
  // state (replacing the old local useState mirrors of the duration inputs).
  const totalTimePreview = useStore(
    form.store,
    (s) => (s.values.prepTime || 0) + (s.values.cookTime || 0),
  );
  const { imageImportUrl, videoImportUrl, video } = recipe || {};

  const currentTimezone = useCurrentTimezone();

  return (
    <VideoPlayerProvider>
      <form.Field
        name="name"
        validators={{
          onBlur: ({ value }) =>
            !value?.trim() ? "Name is required" : undefined,
        }}
      >
        {(field) => (
          <TextInput
            label="Name"
            name="name"
            id="recipe-form-name"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            errors={mergeFieldErrors(
              state?.errors?.name,
              field.state.meta.errors,
            )}
          />
        )}
      </form.Field>
      <form.Field name="description">
        {(field) => (
          <LexicalMarkdownInput
            dialect={RECIPE_MARKDOWN}
            label="Description"
            name="description"
            id="recipe-form-description"
            value={field.state.value}
            onChange={field.handleChange}
            errors={mergeFieldErrors(
              state?.errors?.description,
              field.state.meta.errors,
            )}
          />
        )}
      </form.Field>
      <TagsInput allTags={allTags} />
      {/*
        Image and video are file uploads: browsers don't allow setting a file
        input's value programmatically, so these stay uncontrolled and submit
        via FormData (with their own clear/import flags) rather than through
        TanStack Form state.
      */}
      <ImageInput
        defaultImage={defaultImage}
        errors={state?.errors?.image}
        imageToImport={imageImportUrl}
      />
      <VideoInput
        label="Video"
        name="video"
        defaultVideo={resolveRecipeVideoSrc(slug, video)}
        videoToImport={videoImportUrl}
      />
      <form.Field name="recipeYield">
        {(field) => (
          <LexicalMarkdownInput
            dialect={RECIPE_MARKDOWN}
            label="Yield"
            name="recipeYield"
            id="recipe-form-yield"
            value={field.state.value}
            onChange={field.handleChange}
            errors={mergeFieldErrors(
              state?.errors?.recipeYield,
              field.state.meta.errors,
            )}
            toolbarItems={yieldToolbarItems}
            compact
          />
        )}
      </form.Field>
      <IngredientsListInput label="Ingredients" id="recipe-form-ingredients" />
      <InstructionsListInput
        label="Instructions"
        id="recipe-form-instructions"
      />
      <TimelinesInput label="Timelines" id="recipe-form-timelines" />
      <div className="flex flex-row flex-wrap gap-2 justify-around items-center">
        <form.Field name="prepTime">
          {(field) => (
            <DurationInput
              label="Prep Time"
              name="prepTime"
              id="recipe-form-prep-time"
              valueMinutes={field.state.value ?? 0}
              onValueChange={field.handleChange}
              errors={state?.errors?.prepTime}
            />
          )}
        </form.Field>
        <form.Field name="cookTime">
          {(field) => (
            <DurationInput
              label="Cook Time"
              name="cookTime"
              id="recipe-form-cook-time"
              valueMinutes={field.state.value ?? 0}
              onValueChange={field.handleChange}
              errors={state?.errors?.cookTime}
            />
          )}
        </form.Field>
        <form.Field name="totalTime">
          {(field) => (
            <DurationInput
              label="Total Time"
              name="totalTime"
              id="recipe-form-total-time"
              valueMinutes={field.state.value ?? 0}
              onValueChange={field.handleChange}
              errors={state?.errors?.totalTime}
              placeholder={totalTimePreview}
            />
          )}
        </form.Field>
      </div>
      <details className="py-1 my-1" open>
        <summary className="text-sm font-semibold">Advanced</summary>
        <div className="flex flex-col flex-nowrap">
          <form.Field name="slug">
            {(field) => (
              <TextInput
                label="Slug"
                name="slug"
                id="recipe-form-slug"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder={
                  currentName ? createDefaultSlug({ name: currentName }) : ""
                }
                errors={mergeFieldErrors(
                  state?.errors?.slug,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
          <form.Field name="date">
            {(field) => (
              <DateTimeInput
                label="Date (UTC)"
                name="date"
                id="recipe-form-date"
                date={field.state.value}
                onValueChange={field.handleChange}
                currentTimezone={currentTimezone}
                errors={state?.errors?.date}
              />
            )}
          </form.Field>
          {/*
            Provenance (D6/22a). An import fills these in; typing a URL here by
            hand is the manual path to the same citation. The three inputs are
            always mounted and submit as `source.url` / `source.name` /
            `source.author` — `parseFormData`'s lodash `set` nests them, and
            the schema collapses an all-blank block back to no `source`.
          */}
          <form.Field name="source.url">
            {(field) => (
              <TextInput
                label="Source URL"
                name="source.url"
                id="recipe-form-source-url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="https://example.com/the-original-recipe"
                errors={mergeFieldErrors(
                  state?.errors?.source,
                  field.state.meta.errors,
                )}
              />
            )}
          </form.Field>
          <form.Field name="source.name">
            {(field) => (
              // "Site" rather than "Name": `getByLabel` matches substrings, so
              // a "Source Name" label made every `getByLabel("Name")` in the
              // suite ambiguous with the recipe's own name field.
              <TextInput
                label="Source Site"
                name="source.name"
                id="recipe-form-source-name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                errors={mergeFieldErrors(undefined, field.state.meta.errors)}
              />
            )}
          </form.Field>
          <form.Field name="source.author">
            {(field) => (
              <TextInput
                label="Source Author"
                name="source.author"
                id="recipe-form-source-author"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                errors={mergeFieldErrors(undefined, field.state.meta.errors)}
              />
            )}
          </form.Field>
        </div>
      </details>
    </VideoPlayerProvider>
  );
}
