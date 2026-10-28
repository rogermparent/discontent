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
import {
  pictureCarry,
  pictureTouched,
  readPictureInputs,
  type PictureInputs,
} from "recipe-website-common/components/Form/pictureCarry";
import { Recipe } from "recipe-website-common/controller/types";
import { RecipeFormState } from "recipe-website-common/controller/formState";
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import { suggestChoices } from "recipe-website-common/util/suggestChoices";
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
import {
  ModelChoicesProvider,
  type ModelChoices,
} from "recipe-website-common/components/Form/Instructions/modelChoices";
import { choicesResultAction, choicesStartAction } from "./choicesActions";

/** A fill the form holds (45b): what it was remounted with, and its marks. */
interface AppliedFill {
  key: string;
  recipe: Partial<ImportedRecipe>;
  marks: FillMarks;
  /**
   * Changes the form's values miss: a picture or video waiting as an import
   * URL, and the picture inputs carried over the remount.
   */
  extraChanges: number;
  /** The picture and video inputs the person had set, carried (F1). */
  pictures?: PictureInputs;
}

/** What the form holds now: its values, and its uncontrolled picture inputs. */
interface FormReading {
  values: RecipeFormValues;
  pictures: PictureInputs;
}

/**
 * Hands the parent a way to read the form's current values: the fill
 * strip sits outside the form (its state outlives a remount), and fills
 * over what the person has typed, not over the stored recipe (F1) — the
 * picture and video inputs included, which the form instance does not hold.
 */
function ValuesProbe({
  readRef,
}: {
  readRef: RefObject<(() => FormReading) | undefined>;
}) {
  const form = useRecipeForm();
  useEffect(() => {
    readRef.current = () => {
      const element = document.getElementById("recipe-form");
      return {
        values: form.state.values,
        pictures: element ? readPictureInputs(element) : {},
      };
    };
  }, [form, readRef]);
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
  tagPicker,
  fillSource,
  llmModel,
  initialFillJob,
  choicesModel,
  choicesUnavailable,
}: {
  slug: string;
  recipe: Recipe;
  defaultImage?: StaticImageProps | undefined;
  /** The tag picker's vocabulary and counts (43e2). */
  tagPicker?: TagPickerData;
  /** The link "Fill gaps from the source" reads (45b); none, no fill. */
  fillSource?: string;
  /** The editor's model, for the fill's estimate (45b). */
  llmModel?: string;
  /** `?fill=<job>`: a fill to follow, or to apply again (45b). */
  initialFillJob?: string;
  /** Who "Look for alternatives with the model" asks (46f). */
  choicesModel?: string;
  /** Why it is off, when no model is set up (46f). */
  choicesUnavailable?: string;
}) {
  /* 46f: the Steps section's model action, bound to this recipe. */
  const modelChoices = useMemo<ModelChoices>(
    () => ({
      model: choicesModel,
      unavailable: choicesUnavailable,
      start: (name, outline) => choicesStartAction(slug, name, outline),
      result: (job) => choicesResultAction(job),
    }),
    [slug, choicesModel, choicesUnavailable],
  );
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
  const readForm = useRef<(() => FormReading) | undefined>(undefined);
  /*
   * The save state a fill or an Undo came after (45b review): a failed
   * save remounts the form with what was sent, but a fill or Undo after it
   * wins — until the next save answers a new state.
   */
  const [passedState, setPassedState] = useState<RecipeFormState>();
  const stateNow = useRef(state);
  useEffect(() => {
    stateNow.current = state;
  }, [state]);
  const passed = passedState !== undefined && state === passedState;
  const failed = state.formData && !passed ? state : undefined;
  /* What the save said, unless a fill or Undo came after it. */
  const shown = passed ? initialState : state;
  /* After a failed save the form holds what was sent: no fill marks then. */
  const fill = failed ? undefined : applied;
  const effectiveRecipe = failed
    ? { ...recipe, ...failed.formData }
    : (fill?.recipe ?? recipe);
  /* A fill keeps a slug typed before it (the form's values carry it). */
  const effectiveSlug =
    failed?.formData?.slug ||
    (typeof fill?.recipe.slug === "string" ? fill.recipe.slug : "") ||
    slug;
  const baseline = useMemo(
    () => recipeToFormValues(recipe, slug),
    [recipe, slug],
  );

  const onApply = useCallback(
    (result: FillResult): FillOutcome => {
      const reading = readForm.current?.();
      const current = valuesAsRecipe(recipe, reading?.values);
      /* A picture or video the person set is theirs: not filled, carried. */
      const inputs = reading?.pictures ?? {};
      const touched = pictureTouched(inputs, recipe);
      const { recipe: filled, filled: fields } = fillGaps(
        current,
        result.source,
        {
          keep: [
            ...(touched.image ? (["image"] as const) : []),
            ...(touched.video ? (["video"] as const) : []),
          ],
        },
      );
      const {
        recipe: merged,
        estimated,
        warnings,
      } = applyEstimate(filled, result.estimated?.values);
      if (fields.length === 0 && estimated.length === 0) {
        return { nothing: true, warnings };
      }
      const pictures = pictureCarry(inputs, touched);
      const marks: FillMarks = {
        filled: fields,
        estimated,
        ...(estimated.length && result.estimated
          ? { basis: result.estimated.basis, model: result.estimated.model }
          : {}),
      };
      remounts.current += 1;
      /* 45e2: groups that look like alternatives — filled from the source
       * or already stored — offered as a marked suggestion, never set. */
      const suggestedChoices = suggestChoices(merged.instructions);
      setApplied({
        key: `fill-${remounts.current}`,
        recipe: suggestedChoices.length
          ? { ...merged, suggestedChoices }
          : merged,
        marks,
        extraChanges:
          (fields.includes("image") ? 1 : 0) +
          (fields.includes("video") ? 1 : 0) +
          (pictures ? 1 : 0),
        ...(pictures ? { pictures } : {}),
      });
      setPassedState(stateNow.current);
      return { marks, warnings };
    },
    [recipe],
  );

  const onUndo = useCallback(() => {
    remounts.current += 1;
    setApplied(null);
    setUndoKey(`undo-${remounts.current}`);
    setPassedState(stateNow.current);
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
      <ModelChoicesProvider value={modelChoices}>
        <RecipeFormShell
          key={failed ? failed.message : (fill?.key ?? undoKey)}
          action={dispatch}
          recipe={effectiveRecipe}
          slug={effectiveSlug}
          tagPicker={tagPicker}
          className="flex w-full flex-col gap-7"
        >
          <ValuesProbe readRef={readForm} />
          <UpdateRecipeFields
            recipe={effectiveRecipe}
            slug={effectiveSlug}
            state={withSlugConflict(shown)}
            defaultImage={defaultImage}
            fill={fill?.marks}
            pictures={fill?.pictures}
          />
          {/* Last: on a phone its save bar ends the form, sticky above the tab bar. */}
          <RecipeFormRail
            mode="edit"
            eyebrow="Editing"
            picture={
              fill?.pictures
                ? "new"
                : fill?.recipe.imageImportUrl &&
                    fill.marks.filled.includes("image")
                  ? "page"
                  : defaultImage
                    ? "saved"
                    : "none"
            }
            errors={withSlugConflict(shown).errors}
            saveLabel="Save"
            cancelHref={`/recipe/${slug}`}
            message={shown.message || undefined}
            overwrite={shown.slugConflict ? overwriteDispatch : undefined}
            baseline={baseline}
            fill={fill?.marks}
            extraChanges={fill?.extraChanges}
          />
        </RecipeFormShell>
      </ModelChoicesProvider>
    </RecipeFormFrame>
  );
}
