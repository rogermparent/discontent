"use client";

import { useState } from "react";
import { Timeline } from "../../../controller/types";
import { TimelineStrip } from "../../TimelineStrip";
import { TimelineView } from "../Timeline";
import { Button } from "@discontent/component-library/components/ui/button";

/**
 * The recipe's cook schedule, as a disclosure. Collapsed (the default) it shows
 * a read-only proportional strip per timeline — the plan at a glance, and what
 * prints. "Adjust schedule" swaps those strips in place for the interactive
 * editor, so a cook can stretch a rise or a bake and see whether the recipe
 * still fits their afternoon. Summary and tool are the same object in two states,
 * not two widgets stacked — only one is ever in the a11y tree on screen.
 */
export function RecipeSchedule({ timelines }: { timelines: Timeline[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!timelines || timelines.length === 0) return null;

  return (
    <section
      aria-label="Cook schedule"
      className="container mx-auto mt-4 mb-2 max-w-5xl px-2"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Cook schedule</h2>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="print:hidden"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          Adjust schedule
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={`ml-1 h-3 w-3 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </Button>
      </div>

      {/* Collapsed summary: the strips. Hidden on screen while editing, but always
          restored for print so a printout carries the schedule. */}
      <div
        className={`flex flex-col gap-3 ${expanded ? "hidden print:flex" : "flex"}`}
      >
        {timelines.map((timeline, i) => (
          <TimelineStrip
            key={i}
            timeline={timeline}
            label={`Timeline: ${timeline.name || "Schedule"}`}
            showNote
          />
        ))}
      </div>

      {/* The interactive editor — screen-only; the strips above are what prints. */}
      <div className={`print:hidden ${expanded ? "block" : "hidden"}`}>
        <TimelineView timelines={timelines} />
      </div>
    </section>
  );
}

export default RecipeSchedule;
