import { CalendarClockIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import type { HeadsUp } from "../../util/headsUp";
import { stepId } from "./Instructions/stepId";

/**
 * Heads-up notes above the steps (42c1, canvas B): the sentences that say the
 * recipe starts a day or hours early, quoted with the step they came from and
 * a link to it. `findHeadsUps` decides on the server; nothing renders when it
 * finds nothing (D3).
 */
export function HeadsUpNotes({
  notes,
  className,
}: {
  notes: HeadsUp[];
  className?: string;
}) {
  if (notes.length === 0) return null;
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
        <ul className="flex flex-col gap-1">
          {notes.map(({ sentence, step, source }) => (
            <li
              key={`${step ?? source}-${sentence}`}
              data-testid="heads-up-note"
            >
              {step !== undefined ? (
                <a
                  href={`#${stepId(step)}`}
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
      </div>
    </section>
  );
}
