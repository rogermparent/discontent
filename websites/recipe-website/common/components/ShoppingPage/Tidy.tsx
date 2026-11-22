"use client";

/**
 * 50b: "Tidy with the model" in Plan — the minimal surface (50c builds the
 * one-card walkthrough on the same runs): a model, "the current list" or
 * "the original", the run's pending suggestions as a plain list with
 * Accept and Skip. Accept writes the suggestion as one change of this list
 * (it shows in Changes, where it can be turned off); nothing changes before
 * a person presses it.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  TIDY_KIND_LABELS,
  type ShoppingTidyResult,
  type TidyModels,
  type TidyOn,
  type TidyRunView,
  type TidyStart,
} from "../../util/shoppingTidy";
import { panelClass } from "./parts";
import type { ShoppingList } from "./useShoppingList";

/** What the editor hands the page where it has a model (50b). */
export interface ShoppingTidySurface {
  models: TidyModels;
  /** The latest run when the page was read. */
  initial?: TidyRunView;
  start(input: TidyStart): Promise<{ job?: string; message?: string }>;
  /** A started run's outcome: `pending` until it ends (a bounded long-poll). */
  follow(job: string): Promise<{
    pending?: true;
    result?: ShoppingTidyResult;
    message?: string;
  }>;
  latest(): Promise<{ run?: TidyRunView; message?: string }>;
  decide(
    id: string,
    action: "accept" | "skip",
  ): Promise<{ run?: TidyRunView; message?: string }>;
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

export function TidyPanel({
  tidy,
  list,
}: {
  tidy: ShoppingTidySurface;
  list: ShoppingList;
}) {
  const headingId = useId();
  const modelId = useId();
  const offered = tidy.models.models;
  const [model, setModel] = useState(
    offered.find((each) => each.default)?.id ?? offered[0]?.id ?? "",
  );
  const [on, setOn] = useState<TidyOn>("current");
  const [run, setRun] = useState<TidyRunView | undefined>(tidy.initial);
  const [running, setRunning] = useState<{ job: string; model: string }>();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");
  const stopped = useRef(false);
  useEffect(
    () => () => {
      stopped.current = true;
    },
    [],
  );

  const words = (id: string) =>
    offered.find((each) => each.id === id)?.name ?? id;

  async function start() {
    setMessage("");
    let started: Awaited<ReturnType<ShoppingTidySurface["start"]>>;
    try {
      started = await tidy.start({ model, on });
    } catch (error) {
      started = { message: `The run did not start: ${String(error)}` };
    }
    if (!started.job) {
      setMessage(started.message ?? "The run did not start.");
      return;
    }
    setRunning({ job: started.job, model: words(model) });
    for (;;) {
      let outcome: Awaited<ReturnType<ShoppingTidySurface["follow"]>>;
      try {
        outcome = await tidy.follow(started.job);
      } catch (error) {
        outcome = { message: String(error) };
      }
      if (stopped.current) return;
      if (outcome.pending) continue;
      setRunning(undefined);
      if (outcome.result?.status === "done") {
        const latest = await tidy.latest();
        if (latest.run) setRun(latest.run);
        const n = latest.run?.counts.pending ?? 0;
        setMessage(
          `${outcome.result.model ?? "The model"} made ${n === 1 ? "1 suggestion" : `${n} suggestions`}.`,
        );
      } else {
        setMessage(
          outcome.result?.status === "failed"
            ? `Nothing was suggested: ${outcome.result.problem}.`
            : (outcome.message ?? "The run did not finish."),
        );
      }
      return;
    }
  }

  async function decide(id: string, action: "accept" | "skip") {
    setBusy(id);
    setMessage("");
    const answer = await tidy
      .decide(id, action)
      .catch((error: unknown) => ({ message: String(error), run: undefined }));
    setBusy(undefined);
    if (answer.run) setRun(answer.run);
    if (answer.message) setMessage(answer.message);
    else if (action === "accept") {
      setMessage("Accepted: it is in Changes, where you can turn it off.");
      void list.reload();
    } else setMessage("Skipped.");
  }

  const pending = run?.suggestions.filter((each) => each.status === "pending");

  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-tidy"
    >
      <h2 id={headingId} className="font-semibold">
        Tidy with the model
      </h2>
      <p className="mb-2 text-xs text-muted-foreground">
        The model reads the whole list and its recipes’ steps and suggests what
        to leave off, combine or buy in store sizes. Nothing changes until you
        accept a suggestion.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor={modelId} className="text-xs font-semibold">
          Model
        </label>
        <select
          id={modelId}
          className={selectClass}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={!!running}
        >
          {offered.map((each) => (
            <option key={each.id} value={each.id}>
              {each.words}
            </option>
          ))}
          {tidy.models.unavailable.map((each) => (
            <option key={each.id} value={each.id} disabled>
              {each.words} — {each.why}
            </option>
          ))}
        </select>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-semibold">Read</legend>
          {(
            [
              ["current", "the current list (with your changes)"],
              ["original", "the original (as written, with the rules)"],
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 self-start"
          onClick={() => void start()}
          disabled={!!running || !model}
        >
          Tidy with the model
        </Button>
      </div>
      <p
        role="status"
        className="mt-2 text-sm"
        data-testid="shopping-tidy-status"
      >
        {running
          ? `Tidying with ${running.model}… a local model takes a minute or two.`
          : message}
      </p>
      {run && pending && (
        <div className="mt-2 border-t border-border pt-2">
          <h3 className="text-sm font-semibold">
            Suggestions ({pending.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            From {run.model}, on the{" "}
            {run.on === "original" ? "original" : "current"} list.
          </p>
          {pending.length === 0 && (
            <p className="py-2 text-sm">Nothing pending from this run.</p>
          )}
          <ol className="flex flex-col divide-y divide-border">
            {pending.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-col gap-1 py-2"
                data-testid="shopping-tidy-suggestion"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  {TIDY_KIND_LABELS[suggestion.kind]}
                </span>
                <span className="text-sm font-medium break-words">
                  {suggestion.title}
                </span>
                {suggestion.reason && (
                  <span className="text-sm break-words">
                    {suggestion.reason}
                  </span>
                )}
                <ul className="text-xs text-muted-foreground">
                  {suggestion.text.map((line, index) => (
                    <li key={index} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
                {suggestion.warnings.length > 0 && (
                  <ul className="text-xs">
                    {suggestion.warnings.map((warning) => (
                      <li key={warning} className="break-words">
                        Note: {warning}
                      </li>
                    ))}
                  </ul>
                )}
                <span className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    disabled={busy !== undefined}
                    onClick={() => void decide(suggestion.id, "accept")}
                    aria-label={`Accept: ${suggestion.title}`}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    disabled={busy !== undefined}
                    onClick={() => void decide(suggestion.id, "skip")}
                    aria-label={`Skip: ${suggestion.title}`}
                  >
                    Skip
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          {run.leftOut.length > 0 && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer">
                Left out by the check ({run.leftOut.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-1">
                {run.leftOut.map((why) => (
                  <li key={why} className="break-words">
                    {why}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
