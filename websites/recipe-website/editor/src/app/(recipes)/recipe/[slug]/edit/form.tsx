"use client";

import UpdateRecipeFields from "recipe-website-common/components/Form/Update";
import { RecipeFormShell } from "recipe-website-common/components/Form/RecipeFormShell";
import {
  RecipeFormFrame,
  RecipeFormRail,
} from "recipe-website-common/components/Form/RecipeFormFrame";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { withSlugConflict } from "recipe-website-common/components/Form/sections";
import {
  recipeToFormValues,
  useRecipeForm,
  type RecipeFormValues,
} from "recipe-website-common/components/Form/formContext";
import type { FillMarks } from "recipe-website-common/components/Form/fillMarks";
import { Recipe } from "recipe-website-common/controller/types";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { StaticImageProps } from "@discontent/next-static-image/src";
import type { TagPickerData } from "recipe-website-common/components/Form/Tags/tagPicker";
import {
  applyEstimate,
  fillGaps,
} from "recipe-editor/controller/curation/fillGaps";
import type { FillResult } from "recipe-editor/controller/curation/fillRecipe";
import {
  updateRecipe,
  overwriteUpdateRecipe,
} from "../../../../../../controller/actions";
import FillFromSource, { type FillOutcome } from "./FillFromSource";

/** A fill the form holds (45b): what it was remounted with, and its marks. */
interface AppliedFill {
  key: string;
  recipe: Partial<ImportedRecipe>;
  marks: FillMarks;
  /** A picture or video waiting as an import URL: changes the values miss. */
  extraChanges: number;
}

/**
 * Hands the parent a way to read the form's current values: the fill
 * strip sits outside the form (its state outlives a remount), and fills
 * over what the person has typed, not over the stored recipe (F1).
 */
function ValuesProbe({
  valuesRef,
}: {
  valuesRef: RefObject<(() => RecipeFormValues) | undefined>;
}) {
  const form = useRecipeForm();
  useEffect(() => {
    valuesRef.current = () => form.state.values;
  }, [form, valuesRef]);
  return null;
}

/** The form's values as a recipe, over the stored one (its picture, video…). */
function valuesAsRecipe(
  stored: Recipe,
  values: RecipeFormValues | undefined,
): Partial<ImportedRecipe> {
  if (!values) return stored;
  const { drink, source, ...rest } = values;
  const hasDrink = Object.values(drink).some((part) => part.trim());
  const hasSource = Object.values(source).some((part) => part.trim());
  return {
    ...stored,
    ...Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ),
    drink: hasDrink
      ? (Object.fromEntries(
          Object.entries(drink).filter(([, part]) => part.trim()),
        ) as Recipe["drink"])
      : undefined,
    source: hasSource ? source : undefined,
  };
}

/**
 * `/recipe/<slug>/edit` in edit form B (43e1): the same rail and sections as
 * a new recipe, without Start from — Save and Cancel in the rail (a sticky
 * bar on a phone), with the count of fields changed since the page loaded.
 *
 * 45b: with a source link (or a video) the form starts with "Fill gaps from
 * the source": the fill job's result fills the form's empty fields — a
 * remount with the merged values, while the rail's baseline stays the
 * stored recipe, so "N changes · not saved" counts the fills — each marked,
 * until Save writes them or Undo puts the stored recipe back.
 */
export default function EditRecipeForm({
  recipe,
  slug,
  defaultImage,
  allTags = [],
  tagPicker,
  fillSource,
  llmModel,
  initialFillJob,
}: {
  slug: string;
  recipe: Recipe;
  defaultImage?: StaticImageProps | undefined;
  allTags?: string[];
  /** The tag picker's vocabulary and counts (43e2). */
  tagPicker?: TagPickerData;
  /** The link "Fill gaps from the source" reads (45b); none, no fill. */
  fillSource?: string;
  /** The editor's model, for the fill's estimate (45b). */
  llmModel?: string;
  /** `?fill=<job>`: a fill to follow, or to apply again (45b). */
  initialFillJob?: string;
}) {
  const { date } = recipe;
  const initialState = { message: "", errors: {} } as RecipeFormState;
  const updateThisRecipe = updateRecipe.bind(null, date, slug);
  const [state, dispatch] = useActionState(updateThisRecipe, initialState);
  const overwriteThisRecipe = overwriteUpdateRecipe.bind(null, date, slug);
  const [, overwriteDispatch] = useActionState(overwriteThisRecipe, null);
  const [applied, setApplied] = useState<AppliedFill | null>(null);
  /* Remounts the form: a fill, then an Undo, each a fresh instance. */
  const [undoKey, setUndoKey] = useState<string>();
  const remounts = useRef(0);
  const readValues = useRef<(() => RecipeFormValues) | undefined>(undefined);
  /* After a failed save the form holds what was sent: no fill marks then. */
  const fill = state.formData ? undefined : applied;
  const effectiveRecipe = state.formData
    ? { ...recipe, ...state.formData }
    : (fill?.recipe ?? recipe);
  /* A fill keeps a slug typed before it (the form's values carry it). */
  const effectiveSlug =
    state.formData?.slug ||
    (typeof fill?.recipe.slug === "string" ? fill.recipe.slug : "") ||
    slug;
  const baseline = useMemo(
    () => recipeToFormValues(recipe, slug),
    [recipe, slug],
  );

  const onApply = useCallback(
    (result: FillResult): FillOutcome => {
      const current = valuesAsRecipe(recipe, readValues.current?.());
      const { recipe: filled, filled: fields } = fillGaps(
        current,
        result.source,
      );
      const { recipe: merged, estimated } = applyEstimate(
        filled,
        result.estimated?.values,
      );
      if (fields.length === 0 && estimated.length === 0) {
        return { nothing: true };
      }
      const marks: FillMarks = {
        filled: fields,
        estimated,
        ...(estimated.length && result.estimated
          ? { basis: result.estimated.basis, model: result.estimated.model }
          : {}),
      };
      remounts.current += 1;
      setApplied({
        key: `fill-${remounts.current}`,
        recipe: merged,
        marks,
        extraChanges:
          (fields.includes("image") ? 1 : 0) +
          (fields.includes("video") ? 1 : 0),
      });
      return { marks };
    },
    [recipe],
  );

  const onUndo = useCallback(() => {
    remounts.current += 1;
    setApplied(null);
    setUndoKey(`undo-${remounts.current}`);
  }, []);

  return (
    <RecipeFormFrame
      eyebrow={
        <>
          Editing recipe<span className="sr-only">:</span>
        </>
      }
      title={recipe.name}
    >
      {fillSource ? (
        <FillFromSource
          slug={slug}
          sourceUrl={fillSource}
          stored={recipe}
          llmModel={llmModel}
          initialJob={initialFillJob}
          applied={fill?.marks}
          onApply={onApply}
          onUndo={onUndo}
        />
      ) : null}
      <RecipeFormShell
        key={state.formData ? state.message : (fill?.key ?? undoKey)}
        action={dispatch}
        recipe={effectiveRecipe}
        slug={effectiveSlug}
        tagPicker={tagPicker}
        className="flex w-full flex-col gap-7"
      >
        <ValuesProbe valuesRef={readValues} />
        <UpdateRecipeFields
          recipe={effectiveRecipe}
          slug={effectiveSlug}
          state={withSlugConflict(state)}
          defaultImage={defaultImage}
          allTags={allTags}
          fill={fill?.marks}
        />
        {/* Last: on a phone its save bar ends the form, sticky above the tab bar. */}
        <RecipeFormRail
          mode="edit"
          eyebrow="Editing"
          picture={
            fill?.recipe.imageImportUrl && fill.marks.filled.includes("image")
              ? "page"
              : defaultImage
                ? "saved"
                : "none"
          }
          errors={withSlugConflict(state).errors}
          saveLabel="Save"
          cancelHref={`/recipe/${slug}`}
          message={state.message || undefined}
          overwrite={state.slugConflict ? overwriteDispatch : undefined}
          baseline={baseline}
          fill={fill?.marks}
          extraChanges={fill?.extraChanges}
        />
      </RecipeFormShell>
    </RecipeFormFrame>
  );
}
