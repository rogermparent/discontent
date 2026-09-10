import { Timeline } from "../../controller/types";
import { formatDurationCompact } from "../../util/formatDuration";
import { TimelineStrip } from "../TimelineStrip";

/**
 * The homepage hero's timeline preview: the recipe's first timeline as one
 * read-only proportional strip. A thin wrapper over the shared `TimelineStrip`
 * that supplies a spoken summary as the figure's accessible name (so the bar
 * isn't the only way to read the plan). The full interactive schedule editor
 * lives on the detail page (`RecipeSchedule`, PR 6).
 *
 * `size`/`legend` pass through so the timeline-led hero (PR 10) can promote it to
 * a taller strip with a hands-on/rest key.
 */
export function CompactTimeline({
  timelines,
  size = "sm",
  legend = false,
}: {
  timelines: Timeline[];
  size?: "sm" | "lg";
  legend?: boolean;
}) {
  const timeline = timelines[0];
  const events = timeline?.events ?? [];
  if (events.length === 0) return null;

  // A spoken summary so the proportional bar isn't the only way to read the plan.
  const summary = events
    .map(
      (e) =>
        `${e.name || "Step"} ${formatDurationCompact(e.defaultLength)}${
          e.activeTime ? " active" : ""
        }`,
    )
    .join(", ");

  return (
    <TimelineStrip
      timeline={timeline}
      label={`Schedule: ${summary}`}
      size={size}
      legend={legend}
    />
  );
}

export default CompactTimeline;
