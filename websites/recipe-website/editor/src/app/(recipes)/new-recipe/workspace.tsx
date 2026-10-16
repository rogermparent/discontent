"use client";

import { useState } from "react";
import CreateForm from "./form";
import RoundupImport from "./RoundupImport";
import type { RecipeActionState } from "./common";

/**
 * `/new-recipe`'s two ways in (35r): the roundup picker and the recipe form
 * with its single-URL import. They share one flag — while a roundup run is
 * in flight, the form's Import and Submit wait, so a hand-made recipe does
 * not race the run's commits for a slug.
 */
export default function NewRecipeWorkspace({
  initialState,
  initialJob,
  initialImportUrl,
  allTags,
  terms,
  llmModel,
}: {
  initialState: RecipeActionState | null;
  /** `/new-recipe?job=<id>` (37c): the form import to reopen or follow. */
  initialJob?: string;
  /** `/new-recipe?import=<url>` (38b, D3): the URL to fill in, not fetch. */
  initialImportUrl?: string;
  allTags: string[];
  terms: { slug: string; label: string }[];
  /** The local model's name, or nothing when none is configured (36b). */
  llmModel?: string;
}) {
  const [roundupRunning, setRoundupRunning] = useState(false);
  return (
    <>
      <RoundupImport terms={terms} onRunningChange={setRoundupRunning} />
      <CreateForm
        initialState={initialState}
        initialJob={initialJob}
        initialImportUrl={initialImportUrl}
        allTags={allTags}
        busy={roundupRunning}
        llmModel={llmModel}
      />
    </>
  );
}
