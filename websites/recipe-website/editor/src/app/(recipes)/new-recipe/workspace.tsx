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
  allTags,
  terms,
}: {
  initialState: RecipeActionState | null;
  allTags: string[];
  terms: { slug: string; label: string }[];
}) {
  const [roundupRunning, setRoundupRunning] = useState(false);
  return (
    <>
      <RoundupImport terms={terms} onRunningChange={setRoundupRunning} />
      <CreateForm
        initialState={initialState}
        allTags={allTags}
        busy={roundupRunning}
      />
    </>
  );
}
