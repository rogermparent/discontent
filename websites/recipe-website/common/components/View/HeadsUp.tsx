"use client";

import { CalendarClockIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  selectHeadsUps,
  type HeadsUp,
  type HeadsUpCandidate,
} from "../../util/headsUpSelect";
import {
  hasChoices,
  plainChoices,
  shownPath,
  type Choices,
  type ShownPath,
} from "../../util/alternatives";
import { stepId } from "./Instructions/stepId";
import { useChoices } from "./Choices";

/**
 * Heads-up notes above the steps (42c1, canvas B): the sentences that say the
 * recipe starts a day or hours early, quoted with the step they came from and
 * a link to it. `findHeadsUps` decides on the server; nothing renders when it
 * finds nothing (D3).
 */
export function HeadsUpNotes({
  notes,
  emptyNote,
  className,
}: {
  notes: HeadsUp[];
  /**
   * What the box says when the reader's path has no notes but another path
   * does (45e): the box stays, so nothing above the steps moves.
   */
  emptyNote?: string;
  className?: string;
}) {
  if (notes.length === 0 && !emptyNote) return null;
  return (
    <section
      aria-label="Heads-up"
      data-testid="recipe-heads-up"
      className={cn(
        "flex items-start gap-3 rounded-lg bg-accent px-4 py-3 text-accent-foreground",
        className,
      )}
    >
      <CalendarClockIcon
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0"
      />
      <div className="min-w-0">
        <p className="font-semibold">Plan ahead</p>
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {notes.map(({ sentence, step, anchor, source }) => (
              <li
                key={`${step ?? source}-${sentence}`}
                data-testid="heads-up-note"
              >
                {step !== undefined ? (
                  <a
                    href={`#${anchor ?? stepId(step)}`}
                    className="font-medium underline underline-offset-2 hover:text-primary"
                  >
                    Step {step}
                  </a>
                ) : (
                  <span className="font-medium">The cook schedule</span>
                )}{" "}
                says “{sentence}”
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="heads-up-empty" className="italic">
            {emptyNote}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The notes on the reader's path (45e): the server finds every heads-up
 * sentence (`headsUpCandidates`), and the ones in steps of an option not
 * chosen drop out here, the rest numbered as the path numbers them. For a
 * recipe without alternatives that is `findHeadsUps`' answer exactly.
 *
 * The box itself does not come and go with the pick (U1): when any option
 * has a note, it renders on the server and stays, saying "Nothing to plan
 * ahead for Pretzels" while the chosen path has none.
 */
export function PathHeadsUpNotes({
  candidates,
  entrySteps,
  className,
}: {
  candidates: HeadsUpCandidate[];
  /** Steps per instruction entry, for the path outside a recipe view. */
  entrySteps: number[];
  className?: string;
}) {
  const context = useChoices();
  const path =
    context?.path ??
    shownPath({ ...plainChoices(), entrySteps, ingredientCount: 0 });
  const notes = selectHeadsUps(candidates, (entry, index) => {
    const step = path.steps[entry]?.[index];
    if (!step || !step.shown) return undefined;
    return {
      number: step.number,
      ...(step.id !== stepId(step.number) ? { anchor: step.id } : {}),
    };
  });
  const emptyNote =
    notes.length === 0 && context && hasChoices(context.choices)
      ? nothingToPlanFor(context.choices, path, candidates)
      : undefined;
  return (
    <HeadsUpNotes notes={notes} emptyNote={emptyNote} className={className} />
  );
}

/**
 * "Nothing to plan ahead for Pretzels": the chosen options of the sets
 * whose other options hold a note, or `undefined` when no path has one.
 */
function nothingToPlanFor(
  choices: Choices,
  path: ShownPath,
  candidates: readonly HeadsUpCandidate[],
): string | undefined {
  const setKeys = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.source !== "step") continue;
    const step = path.steps[candidate.entry ?? 0]?.[candidate.step ?? 0];
    if (step?.option) setKeys.add(step.option.set);
  }
  const labels = choices.sets.flatMap((set) => {
    if (!setKeys.has(set.key)) return [];
    const option = set.options.find(
      (each) => each.slug === path.picks[set.key],
    );
    return option ? [option.label] : [];
  });
  if (labels.length === 0) return undefined;
  return `Nothing to plan ahead for ${labels.join(" and ")}`;
}
