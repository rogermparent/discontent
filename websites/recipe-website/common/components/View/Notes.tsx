import Markdown from "@discontent/component-library/components/Markdown";
import { cn } from "@discontent/component-library/lib/utils";
import { NOTES_ID, noteAnchor } from "../../util/recipeNotes";

/**
 * The recipe's own notes (47j), after the steps: numbered, as the recipe
 * numbers them, so a step's "(Note 2)" (linked by `linkNoteRefs`) lands on
 * its note. Not steps — no checkbox, no timers, no "Uses". Nothing when the
 * recipe has none.
 */
export function RecipeNotes({
  notes,
  className,
}: {
  notes: readonly string[] | undefined;
  className?: string;
}) {
  if (!notes || notes.length === 0) return null;
  return (
    <section
      aria-labelledby={NOTES_ID}
      data-testid="recipe-notes"
      className={cn(
        "mx-auto mt-6 w-full max-w-xl lg:mx-0 lg:max-w-none print:w-full print:max-w-full",
        className,
      )}
    >
      <h2
        id={NOTES_ID}
        className="mb-2 scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] text-xl font-bold"
      >
        Notes
      </h2>
      <ol className="flex flex-col gap-2.5">
        {notes.map((note, index) => (
          <li
            key={index}
            id={noteAnchor(index + 1)}
            data-testid="recipe-note"
            className="flex scroll-mt-[calc(var(--sticky-chrome-offset)+1rem)] flex-row flex-nowrap gap-3 rounded-lg border border-border bg-card px-3 py-3 target:border-primary sm:px-4 print:border-0 print:px-0 print:py-1"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold tabular-nums text-muted-foreground print:bg-transparent"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <Markdown>{note}</Markdown>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
