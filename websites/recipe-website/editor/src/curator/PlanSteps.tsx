"use client";

import { Check, CircleSlash, LoaderCircle, X } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import {
  PLAN_STEP_WHO_WORDS,
  type PlanStepView,
} from "recipe-editor/controller/agent/planSteps";

const STATE_WORDS: Record<PlanStepView["state"], string> = {
  todo: "to do",
  current: "now",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

function StateMark({ step, index }: { step: PlanStepView; index: number }) {
  const common =
    "inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold";
  switch (step.state) {
    case "done":
      return (
        <span
          aria-hidden
          className={cn(common, "bg-secondary text-secondary-foreground")}
        >
          <Check className="size-3.5" />
        </span>
      );
    case "current":
      return (
        <span
          aria-hidden
          className={cn(common, "bg-primary text-primary-foreground")}
        >
          <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span
          aria-hidden
          className={cn(common, "border border-destructive text-foreground")}
        >
          <X className="size-3.5" />
        </span>
      );
    case "skipped":
      return (
        <span aria-hidden className={cn(common, "text-muted-foreground")}>
          <CircleSlash className="size-4" />
        </span>
      );
    default:
      return (
        <span
          aria-hidden
          className={cn(common, "bg-muted text-muted-foreground")}
        >
          {index + 1}
        </span>
      );
  }
}

/**
 * An intent's plan as a list (51d, the mock-up's "What it will do"): each
 * step, who does it (code, the model, web search) and — while it runs —
 * where it is, from the job's steps. The step running now is
 * `aria-current="step"`; the run's status line (the page's one polite live
 * region) says it, so nothing here is announced on its own.
 */
export function PlanSteps({
  steps,
  heading,
  headingLevel = 3,
  preview = false,
}: {
  steps: PlanStepView[];
  heading: string;
  headingLevel?: 2 | 3;
  /** Before an ask: what it will do, no states. */
  preview?: boolean;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-label={heading}
      data-testid="curator-plan"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <Heading className="font-display text-base font-bold">{heading}</Heading>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-testid="curator-plan-step"
            data-step={step.key}
            data-state={preview ? "todo" : step.state}
            aria-current={
              !preview && step.state === "current" ? "step" : undefined
            }
            className={cn(
              "grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-2.5 text-sm",
              step.state === "skipped" && "text-muted-foreground",
            )}
          >
            {preview ? (
              <span
                aria-hidden
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground"
              >
                {index + 1}
              </span>
            ) : (
              <StateMark step={step} index={index} />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">
                {step.title}
                {!preview && (
                  <span className="sr-only">: {STATE_WORDS[step.state]}</span>
                )}
                {!preview && step.detail ? (
                  <span
                    data-testid="curator-plan-detail"
                    className="font-normal text-muted-foreground"
                  >
                    {" "}
                    · {step.detail}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {!preview && step.note ? `${step.note} · ` : ""}
                {preview || step.state === "todo" ? `${step.about} · ` : ""}
                {PLAN_STEP_WHO_WORDS[step.who]}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
