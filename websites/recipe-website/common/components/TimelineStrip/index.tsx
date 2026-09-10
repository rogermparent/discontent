import { Timeline } from "../../controller/types";
import { formatDurationCompact } from "../../util/formatDuration";

/**
 * A read-only schedule strip for a single timeline. Each event becomes a segment
 * sized proportionally to its `defaultLength`; active (hands-on) events read in
 * the ember accent, rests stay quiet. Durations are set in mono tabular figures
 * — the recipe's timing treated as material (the Working Bench signature move).
 *
 * This is the shared primitive behind both the homepage hero's `CompactTimeline`
 * and the detail page's collapsed `RecipeSchedule`. The figure's accessible name
 * is supplied by the caller (`label`) so each surface can name it in its own
 * vocabulary while the visible strip stays identical.
 *
 * `size="lg"` + `legend` promote it to the homepage hero's centerpiece: a taller
 * bar with a hands-on/rest key. `size="sm"` (default) keeps the compact strip the
 * detail page and hero preview already ship, so those baselines don't move.
 */
export function TimelineStrip({
  timeline,
  label,
  showNote = false,
  size = "sm",
  legend = false,
  className = "m-0",
}: {
  timeline: Timeline;
  label: string;
  showNote?: boolean;
  size?: "sm" | "lg";
  legend?: boolean;
  className?: string;
}) {
  const events = timeline?.events ?? [];
  if (events.length === 0) return null;

  const total = events.reduce((sum, e) => sum + (e.defaultLength || 0), 0) || 1;
  const isLg = size === "lg";

  return (
    <figure className={className} aria-label={label}>
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          {timeline.name || "Schedule"}
        </span>
        <span className="font-mono tabular-nums text-[0.65rem] text-muted-foreground">
          {formatDurationCompact(total)}
        </span>
      </figcaption>
      {showNote && timeline.note && (
        <p className="mb-1.5 text-xs text-muted-foreground">{timeline.note}</p>
      )}
      <div
        className={`flex w-full overflow-hidden rounded-md border border-border ${
          isLg ? "h-16" : "h-11"
        }`}
        role="presentation"
      >
        {events.map((event, i) => {
          const pct = ((event.defaultLength || 0) / total) * 100;
          return (
            <div
              key={i}
              className={`flex min-w-0 flex-col justify-center overflow-hidden px-2 ${
                i > 0 ? "border-l border-border" : ""
              } ${
                event.activeTime
                  ? "bg-primary/20 text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              style={{ flexBasis: `${pct}%` }}
            >
              <span
                className={`truncate font-medium leading-tight ${
                  isLg ? "text-xs" : "text-[0.7rem]"
                }`}
              >
                {event.name || "Step"}
              </span>
              <span
                className={`truncate font-mono tabular-nums leading-tight ${
                  isLg ? "text-[0.7rem]" : "text-[0.65rem]"
                }`}
              >
                {formatDurationCompact(event.defaultLength)}
              </span>
            </div>
          );
        })}
      </div>
      {legend && (
        <div className="mt-2 flex flex-row flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-[0.15rem] bg-primary/60"
            />
            Hands-on
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-[0.15rem] bg-muted"
            />
            Rest
          </span>
        </div>
      )}
    </figure>
  );
}

export default TimelineStrip;
