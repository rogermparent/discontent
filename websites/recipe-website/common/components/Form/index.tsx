"use client";

import { useEffect } from "react";
import { useStore } from "@tanstack/react-form";
import { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { resolveRecipeVideoSrc } from "recipe-website-common/controller/recipeVideo";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import createDefaultSlug from "recipe-website-common/controller/createSlug";
import { useRecipeForm } from "./formContext";
import { mergeFieldErrors } from "./fieldErrors";
import {
  ChosenTags,
  RecipeTagField,
} from "recipe-website-common/components/Form/Tags";
import { IngredientsSection } from "recipe-website-common/components/Form/Ingredients";
import { InstructionsListInput } from "recipe-website-common/components/Form/Instructions";
import { TimelinesInput } from "recipe-website-common/components/Form/Timeline";
import { DateTimeInput } from "@discontent/component-library/components/Form/inputs/DateTime";
import { TextInput } from "@discontent/component-library/components/Form/inputs/Text";
import { LexicalMarkdownInput } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown";
import { RECIPE_MARKDOWN } from "@discontent/component-library/components/Form/inputs/LexicalMarkdown/transformers";
import { ImageInput, fileKey } from "./Image";
import { VideoInput } from "@discontent/component-library/components/Form/inputs/Video";
import { StaticImageProps } from "@discontent/next-static-image/src";
import { VideoPlayerProvider } from "@discontent/component-library/components/VideoPlayer/Provider";
import { DurationInput } from "@discontent/component-library/components/Form/inputs/Duration";
import { useCurrentTimezone } from "@discontent/cms/hooks/useCurrentTimezone";

import { yieldToolbarItems } from "./RecipeMarkdown/lexicalToolbar";
import { FormSection } from "./RecipeFormFrame";
import { stepCount } from "./sections";
import { DrinkSpecSection } from "./Drink";
import { useDrinkShown, useRevealDrink } from "./drinkShown";
import { timesHint } from "./Instructions/stepChecks";

/** A list section's count beside its heading, read live from the form. */
function StepsCount() {
  const form = useRecipeForm();
  const count = useStore(form.store, (state) =>
    stepCount(state.values.instructions),
  );
  return count ? (
    <span className="font-mono text-sm text-muted-foreground tabular-nums">
      {count}
    </span>
  ) : null;
}

/** "Prep + cook is 1h 28m; the rest is the chill in step 3." */
function TimesHint() {
  const form = useRecipeForm();
  const values = useStore(form.store, (state) => state.values);
  const hint = timesHint(values);
  if (!hint) return null;
  return (
    <p className="pb-2 text-sm text-muted-foreground" data-testid="times-hint">
      Prep + cook is <span className="font-mono">{hint.sum}</span>
      {hint.rest ? `; ${hint.rest}` : ""}.
    </p>
  );
}

/**
 * "Drink spec and timelines appear here when …" — the way to either when
 * the recipe has neither (canvas B's Source section).
 */
function AddAnyway() {
  const form = useRecipeForm();
  const drinkShown = useDrinkShown();
  const revealDrink = useRevealDrink();
  const timelines = useStore(
    form.store,
    (state) => state.values.timelines.length,
  );
  if (drinkShown && timelines) return null;
  const link =
    "inline-flex min-h-6 items-center text-primary underline underline-offset-2 hover:no-underline";
  const drinkButton = (
    <button type="button" className={link} onClick={revealDrink}>
      add a drink spec
    </button>
  );
  const timelineButton = (
    <button
      type="button"
      className={link}
      onClick={() =>
        form.setFieldValue("timelines", [
          ...form.state.values.timelines,
          { events: [] },
        ])
      }
    >
      add a timeline
    </button>
  );
  return (
    <p className="text-sm text-muted-foreground" data-testid="add-anyway">
      {!drinkShown && !timelines ? (
        <>
          A drink spec and timelines appear when the recipe is tagged a drink or
          has a timeline — {drinkButton} · {timelineButton}.
        </>
      ) : !drinkShown ? (
        <>
          A drink spec appears when the recipe is tagged a drink — {drinkButton}
          .
        </>
      ) : (
        <>
          Timelines appear under the steps once there is one — {timelineButton}.
        </>
      )}
    </p>
  );
}

/** Timelines (under the steps) once the recipe has one. */
function Timelines() {
  const form = useRecipeForm();
  const count = useStore(form.store, (state) => state.values.timelines.length);
  return count ? (
    <TimelinesInput label="Timelines" id="recipe-form-timelines" />
  ) : null;
}

/**
 * The drink spec, first, when the recipe is a drink (or asked for one). Once
 * on the page it stays for the visit: clearing the method (and with it the
 * style tag it set) must not pull the section out from under the cursor.
 */
function DrinkFirst({ from, errors }: { from?: string; errors?: string[] }) {
  const shown = useDrinkShown();
  const reveal = useRevealDrink();
  useEffect(() => {
    if (shown) reveal();
  }, [shown, reveal]);
  return shown ? <DrinkSpecSection from={from} errors={errors} /> : null;
}

/** The section's source link, for an ingredient flag's "Open the page". */
function IngredientsWithSource({
  from,
  errors,
}: {
  from?: string;
  errors?: string[];
}) {
  const form = useRecipeForm();
  const url = useStore(form.store, (state) => state.values.source.url.trim());
  return (
    <IngredientsSection
      from={from}
      sourceUrl={/^https?:\/\//i.test(url) ? url : undefined}
      errors={errors}
    />
  );
}

/* A refused save's problems that no field shows by itself (45d). */
const VIDEO_ERRORS = ["video", "videoUrl", "videoImportUrl", "imageImportUrl"];
const STEP_ERRORS = ["instructions", "timelines"];

function sectionErrors(
  state: RecipeFormState | undefined,
  keys: readonly string[],
): string[] | undefined {
  const errors = keys.flatMap((key) => state?.errors?.[key] ?? []);
  return errors.length ? errors : undefined;
}

/**
 * The recipe's fields, in edit form B's sections (43e1, 43e2): on a drink the
 * Drink spec first, then Recipe, Tags, Picture and video,
 * Ingredients (rows), Steps (what each uses), Times, Source and address.
 * Every field's name and submit shape is the one the form always had (D4).
 */
export default function RecipeFields({
  recipe,
  slug,
  state,
  defaultImage,
  imageFile,
  fromLabel,
}: {
  recipe?: Partial<ImportedRecipe>;
  slug?: string;
  state?: RecipeFormState;
  defaultImage?: StaticImageProps;
  /** A file the image field starts with (38e: the photo a recipe was read from). */
  imageFile?: File;
  /**
   * After an import (43e1): "from the page", "from the text", "from the
   * photo" — said on the sections the import filled.
   */
  fromLabel?: string;
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
  const { imageImportUrl, videoImportUrl, video, images } = recipe || {};

  const currentTimezone = useCurrentTimezone();
  const imported = (has: unknown) => (fromLabel && has ? fromLabel : undefined);

  return (
    <VideoPlayerProvider>
      <DrinkFirst
        from={imported(recipe?.drink)}
        errors={state?.errors?.drink}
      />
      <FormSection
        id="recipe"
        title="Recipe"
        from={imported(recipe?.name || recipe?.description)}
      >
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
      </FormSection>
      <FormSection id="tags" title="Tags" aside={<ChosenTags />}>
        <RecipeTagField suggestedTags={recipe?.suggestedTags} />
      </FormSection>
      <FormSection
        id="picture"
        title="Picture and video"
        from={imported(imageImportUrl)}
        errors={sectionErrors(state, VIDEO_ERRORS)}
      >
        {/*
          Image and video are file uploads: browsers don't allow setting a file
          input's value programmatically, so these stay uncontrolled and submit
          via FormData (with their own clear/import flags) rather than through
          TanStack Form state.
        */}
        <ImageInput
          /* 38e review: the photo arriving or going (the "use the first
           * photo" box ticked or unticked after an import) starts the field
           * over — holding it, with its preview, or empty — since a file
           * input cannot be told to drop just the file a script gave it. */
          key={fileKey(imageFile)}
          defaultImage={defaultImage}
          errors={state?.errors?.image}
          imageToImport={imageImportUrl}
          candidates={images}
          allowUrl
          initialFile={imageFile}
        />
        <VideoInput
          label="Video"
          name="video"
          defaultVideo={resolveRecipeVideoSrc(slug, video)}
          videoToImport={videoImportUrl}
        />
      </FormSection>
      <IngredientsWithSource
        from={imported(recipe?.ingredients?.length)}
        errors={state?.errors?.ingredients}
      />
      <FormSection
        id="steps"
        title="Steps"
        from={imported(recipe?.instructions?.length)}
        aside={<StepsCount />}
        errors={sectionErrors(state, STEP_ERRORS)}
      >
        <InstructionsListInput label="" id="recipe-form-instructions" />
        <Timelines />
      </FormSection>
      <FormSection
        id="times"
        title="Times"
        from={imported(
          recipe?.prepTime || recipe?.cookTime || recipe?.totalTime,
        )}
      >
        <div className="flex flex-row flex-wrap items-end gap-x-6 gap-y-2">
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
          <TimesHint />
        </div>
      </FormSection>
      <FormSection
        id="source"
        title="Source and address"
        from={imported(recipe?.source?.url)}
      >
        {/*
          Provenance (D6/22a). An import fills these in; typing a URL here by
          hand is the manual path to the same citation. The three inputs are
          always mounted and submit as `source.url` / `source.name` /
          `source.author` — `parseFormData`'s lodash `set` nests them, and
          the schema collapses an all-blank block back to no `source`.
        */}
        <div className="grid gap-x-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <form.Field name="source.url">
            {(field) => (
              <TextInput
                label="Source link"
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
                label="Site"
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
                label="Author"
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
        <div className="grid gap-x-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
        </div>
        <AddAnyway />
      </FormSection>
    </VideoPlayerProvider>
  );
}
