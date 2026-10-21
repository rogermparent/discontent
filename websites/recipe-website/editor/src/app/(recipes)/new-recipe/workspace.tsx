"use client";

import { RecipeFormFrame } from "recipe-website-common/components/Form/RecipeFormFrame";
import CreateForm from "./form";
import type { RecipeActionState } from "./common";
import type { TagPickerData } from "recipe-website-common/components/Form/Tags/tagPicker";

/**
 * `/new-recipe` in edit form B, "Review, then save" (43e1): the frame — the
 * heading, the section rail with the save card, the column — around Start
 * from (a link, text, a photo, a roundup or a blank form; 35r's roundup
 * picker is one of the five) and the recipe form. While a roundup run is in
 * flight the form's Import and Create wait, so a hand-made recipe does not
 * race the run's commits for a slug.
 */
export default function NewRecipeWorkspace({
  initialState,
  initialJob,
  initialImportUrl,
  allTags,
  tagPicker,
  terms,
  llmModel,
  visionModel,
}: {
  initialState: RecipeActionState | null;
  /** `/new-recipe?job=<id>` (37c): the form import to reopen or follow. */
  initialJob?: string;
  /** `/new-recipe?import=<url>` (38b, D3): the URL to fill in, not fetch. */
  initialImportUrl?: string;
  allTags: string[];
  /** The tag picker's vocabulary and counts (43e2). */
  tagPicker?: TagPickerData;
  terms: { slug: string; label: string }[];
  /** The local model's name, or nothing when none is configured (36b). */
  llmModel?: string;
  /** The vision model's name, or nothing: no Photo mode (38e). */
  visionModel?: string;
}) {
  return (
    <RecipeFormFrame title="New recipe">
      <CreateForm
        initialState={initialState}
        initialJob={initialJob}
        initialImportUrl={initialImportUrl}
        allTags={allTags}
        tagPicker={tagPicker}
        terms={terms}
        llmModel={llmModel}
        visionModel={visionModel}
      />
    </RecipeFormFrame>
  );
}
