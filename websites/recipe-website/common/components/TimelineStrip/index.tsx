import { Timeline } from "../../controller/types";
import { formatDurationCompact } from "../../util/formatDuration";

/**
 * A read-only schedule strip for a single timeline. Each event becomes a segment
 * sized proportionally to its `defaultLength`; active (hands-on) events read in
 * the ember accent, rests stay quiet. Durations are set in mono tabular figures
 * — the recipe's timing treated as material (the Working Bench signature move).
 *
 * The detail page's collapsed `RecipeSchedule` draws one per timeline. The
 * figure's accessible name is supplied by the caller (`label`), so a surface
 * names it in its own vocabulary while the visible strip stays identical.
 *
 * It had a second caller until the homepage redesign (2026-10-15): the hero's
 * `CompactTimeline`, which asked for a taller `size="lg"` bar with a
 * hands-on/rest legend. The hero went, and the two options with it; what is
 * left is the compact strip the detail page always drew.
 */
export function TimelineStrip({
  timeline,
  label,
  showNote = false,
  className = "m-0",
}: {
  timeline: Timeline;
  label: string;
  showNote?: boolean;
  className?: string;
}) {
  const events = timeline?.events ?? [];
  if (events.length === 0) return null;

  const total = events.reduce((sum, e) => sum + (e.defaultLength || 0), 0) || 1;

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
        className="flex h-11 w-full overflow-hidden rounded-md border border-border"
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
              <span className="truncate font-medium leading-tight text-[0.7rem]">
                {event.name || "Step"}
              </span>
              <span className="truncate font-mono tabular-nums leading-tight text-[0.65rem]">
                {formatDurationCompact(event.defaultLength)}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export default TimelineStrip;
