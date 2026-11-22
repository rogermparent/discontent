"use client";

/**
 * 50c: starting a "Tidy with the model" run (50b's runs) — the model, as
 * /curator picks one (48-close #12: one this editor can't run stays in
 * view, disabled, saying what to set), "the current list" or "the
 * original", the run's progress with its steps a click away, and the
 * earlier runs, one of which the walkthrough's cards come from.
 */
import { useId, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cloud, Cpu } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import type {
  ShoppingTidyResult,
  TidyAskStart,
  TidyModels,
  TidyOn,
  TidyRunView,
  TidyStart,
} from "../../util/shoppingTidy";
import type { ShoppingLayerOp } from "../../util/shoppingLayers";
import { runHistory } from "../../util/shoppingWalk";

/** What the editor hands the page where it has a model (50b, 50c). */
export interface ShoppingTidySurface {
  models: TidyModels;
  /** The kept runs when the page was read, newest first. */
  runs?: TidyRunView[];
  start(input: TidyStart): Promise<{ job?: string; message?: string }>;
  /** A started job's outcome: `pending` until it ends (a bounded long-poll). */
  follow(job: string): Promise<{
    pending?: true;
    result?: ShoppingTidyResult;
    message?: string;
  }>;
  /** Every kept run, as the list reads them now. */
  runsNow(): Promise<{ runs?: TidyRunView[]; message?: string }>;
  decide(
    id: string,
    action: "accept" | "skip",
    /** 50c: Accept as the person edited it. */
    ops?: ShoppingLayerOp[],
  ): Promise<{ run?: TidyRunView; message?: string }>;
  /** 50c: "Tell the model…": the card asked again with a note (a job). */
  ask(input: TidyAskStart): Promise<{ job?: string; message?: string }>;
}

/** A job running for the panel: a run, or one card's ask. */
export interface TidyRunning {
  job: string;
  model: string;
  task: "tidy" | "revise";
}

const noSubscription = () => () => {};

/** False on the server and through hydration: times are written after. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/** "21 Nov, 14:05" in this browser's time; the date alone before hydration. */
export function RunTime({ at }: { at: string }) {
  const hydrated = useHydrated();
  const date = new Date(at);
  if (!at || Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={at}>
      {hydrated
        ? date.toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : at.slice(0, 10)}
    </time>
  );
}

/** The model a run takes, as /curator's "Who answers". */
function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: TidyModels;
  value: string;
  onChange(id: string): void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      data-testid="shopping-tidy-models"
    >
      <legend className="mb-1 text-xs font-semibold">Model</legend>
      {models.models.map((option) => {
        const checked = value === option.id;
        const Icon = option.api === "anthropic" ? Cloud : Cpu;
        return (
          <label
            key={option.id}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border bg-background px-3 py-2 text-left",
              checked
                ? "border-primary ring-1 ring-primary"
                : "border-input hover:border-foreground/40",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold break-words">
              <Icon aria-hidden className="size-3.5 shrink-0" />
              {option.words}
            </span>
          </label>
        );
      })}
      {models.unavailable.map((option) => (
        <label
          key={option.id}
          className="flex min-h-11 cursor-not-allowed items-start gap-2.5 rounded-md border border-dashed border-input bg-muted/40 px-3 py-2 text-left"
          data-testid={`shopping-tidy-model-unavailable-${option.id}`}
        >
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={false}
            disabled
            readOnly
            className="mt-1 size-4 shrink-0"
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-muted-foreground break-words">
              {option.words}
            </span>
            <span className="text-xs break-words text-muted-foreground">
              {option.why.replace(/\.?$/, ".")}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * "Tidy with the model": the model, what it reads, Start; the job while it
 * runs (its steps on /jobs); then "Earlier runs", each with its counts,
 * one of them picked for the cards.
 */
export function TidyControls({
  models,
  model,
  setModel,
  on,
  setOn,
  running,
  start,
  runs,
  picked,
  pick,
}: {
  models: TidyModels;
  model: string;
  setModel(id: string): void;
  on: TidyOn;
  setOn(on: TidyOn): void;
  running?: TidyRunning;
  start(): void;
  runs: readonly TidyRunView[];
  /** The run the cards come from. */
  picked?: string;
  pick(id: string): void;
}) {
  const headingId = useId();
  const history = runHistory(runs);
  return (
    <section
      className="flex flex-col gap-2 border-t border-border pt-3"
      aria-labelledby={headingId}
      data-testid="shopping-tidy"
    >
      <h3 id={headingId} className="text-sm font-semibold">
        Tidy with the model
      </h3>
      <p className="text-xs text-muted-foreground">
        The model reads the whole list and its recipes’ steps and suggests what
        to leave off, combine or buy in store sizes. Nothing changes until you
        accept a card.
      </p>
      <ModelPicker
        models={models}
        value={model}
        onChange={setModel}
        disabled={!!running}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-semibold">Read</legend>
        {(
          [
            ["current", "the current list (with your changes)"],
            ["original", "the original list (as written, with the rules)"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex min-h-8 items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name={`${headingId}-on`}
              className="size-4 accent-primary"
              checked={on === value}
              onChange={() => setOn(value)}
              disabled={!!running}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        To iterate, run it again on the current list: it is told what you
        accepted and skipped.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 self-start"
        onClick={start}
        disabled={!!running || !model}
      >
        Tidy with the model
      </Button>
      {running && (
        <p className="text-sm" data-testid="shopping-tidy-running">
          {running.task === "tidy"
            ? `Tidying with ${running.model}… a local model takes a minute or two.`
            : `Asking ${running.model} again with your note…`}{" "}
          <Link
            href={`/jobs/${running.job}`}
            className="underline underline-offset-4 hover:text-primary"
          >
            Steps
            <span className="sr-only"> of this run</span>
          </Link>
        </p>
      )}
      {history.length > 0 && (
        <details className="text-sm" data-testid="shopping-tidy-runs">
          <summary className="min-h-10 cursor-pointer py-2 font-semibold">
            Earlier runs ({history.length})
          </summary>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {history.map((entry) => (
              <li key={entry.id} className="py-1">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-10 w-full flex-col items-start rounded-md px-2 py-1 text-left hover:bg-muted",
                    picked === entry.id && "bg-muted",
                  )}
                  aria-pressed={picked === entry.id}
                  onClick={() => pick(entry.id)}
                  data-testid="shopping-tidy-run"
                >
                  <span className="font-medium break-words">
                    {entry.model} ·{" "}
                    {entry.on === "original" ? "original" : "current"} ·{" "}
                    <RunTime at={entry.at} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.accepted} accepted · {entry.skipped} skipped ·{" "}
                    {entry.pending} to go
                    {entry.stale > 0 && ` · ${entry.stale} no longer fit`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
