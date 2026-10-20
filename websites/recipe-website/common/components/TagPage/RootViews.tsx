"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "./parts";

/**
 * A root page's two views (43t): by narrower term (the sections, first) and
 * Newest (the list the page used to be). Both are rendered on the server and
 * in the HTML; the switch only shows one.
 */
export function RootViews({
  first,
  sections,
  newest,
  controls,
}: {
  /** "By course". */
  first: string;
  sections: ReactNode;
  newest: ReactNode;
  /** Beside the switch: the almanac, What can I make. */
  controls?: ReactNode;
}) {
  const [view, setView] = useState<"sections" | "newest">("sections");
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Show"
          value={view}
          options={[
            { id: "sections", label: first },
            { id: "newest", label: "Newest" },
          ]}
          onChange={setView}
          testId="root-view"
          className="[&>button]:min-h-[38px]"
        />
        {controls}
      </div>
      <div hidden={view !== "sections"}>{sections}</div>
      <div hidden={view !== "newest"}>{newest}</div>
    </div>
  );
}
