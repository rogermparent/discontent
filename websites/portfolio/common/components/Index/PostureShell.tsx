"use client";

import { Input } from "@discontent/component-library/components/ui/input";
import type { Posture } from "../../config/site";
import { useIndexSearch } from "./SearchContext";
import { IndexPosture } from "./index";
import { ResumePosture, StudioPosture } from "./postures";

/**
 * Picks a posture and owns everything the three share: the page frame, the
 * count line, and the filter field.
 *
 * The filter lives here rather than inside each posture on purpose — the search
 * surface is the same promise in all three, and duplicating the control is how
 * two of them would quietly drift apart (recipe had exactly that happen with two
 * copies of a debounce constant).
 */
export function PostureShell({
  posture,
  statement,
}: {
  posture: Posture;
  statement?: string;
}) {
  const { query, setQuery, all, results } = useIndexSearch();

  const years = all
    .map((p) => String(new Date(p.date).getUTCFullYear()))
    .sort();
  const span =
    years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0];

  return (
    <main
      data-posture={posture}
      className="mx-auto w-full max-w-5xl grow px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-4">
        <p
          // The list changes under the reader as they type; announce it.
          aria-live="polite"
          aria-atomic="true"
          className="order-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          {results.length} {results.length === 1 ? "work" : "works"}
          {span ? ` · ${span}` : ""}
        </p>
        <Input
          type="search"
          aria-label="Filter works"
          placeholder="Filter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="order-3 h-8 w-full max-w-56 font-mono text-xs"
        />
      </div>

      {posture === "studio" ? (
        <StudioPosture statement={statement} />
      ) : posture === "resume" ? (
        <ResumePosture statement={statement} />
      ) : (
        <IndexPosture statement={statement} />
      )}
    </main>
  );
}
