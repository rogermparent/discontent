"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import {
  FILL_FIELDS,
  fieldList,
  type FillMarks,
} from "recipe-website-common/components/Form/fillMarks";
import type { Recipe } from "recipe-website-common/controller/types";
import { isEmptyField } from "recipe-editor/controller/curation/fillGaps";
import type { FillResult } from "recipe-editor/controller/curation/fillRecipe";
import { UNSTORED_KEEP_MS } from "recipe-editor/controller/jobs/unstored";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import ImportProgress, {
  type ProgressWords,
  type UnfollowedImport,
} from "../../../new-recipe/ImportProgress";
import { fillResultAction, fillStartAction } from "./fillActions";

const FILL_WORDS: ProgressWords = {
  noun: "Fill",
  running: "Reading the source…",
  done: "Fill done: review the marked fields, then save.",
};

/** What applying a fill did to the form: the marks, or nothing new. */
export type FillOutcome = { marks: FillMarks } | { nothing: true };

/** The fields the hint names as empty: not the optional video or drink spec. */
const HINT_FIELDS = FILL_FIELDS.filter(
  (field) => field !== "video" && field !== "drink",
);

/**
 * "Fill gaps from the source" (45b), at the head of the edit form: the
 * recipe's source read as an import would read it — a `fill` job, followed
 * by 43e1's live panel (`ImportProgress`, its estimate a named step) — and
 * the form filled where it is empty, each fill marked, nothing saved until
 * Save. Its summary says what was filled and estimated, with Undo (F2).
 *
 * The strip lives above the sections, where /new-recipe's Start from does:
 * the live panel needs the column's width (the rail is 13.75 rem), and it
 * reads the same on a phone, where the rail's save card is the sticky bar.
 */
export default function FillFromSource({
  slug,
  sourceUrl,
  stored,
  llmModel,
  initialJob,
  applied,
  onApply,
  onUndo,
}: {
  slug: string;
  /** The link the fill reads: the source, or the video. */
  sourceUrl: string;
  /** The stored recipe: what "empty now" is said of. */
  stored: Recipe;
  /** The editor's model, or none (then nothing is estimated). */
  llmModel?: string;
  /** `?fill=<job>`: a fill to follow (or whose result to apply) at once. */
  initialJob?: string;
  /** The marks of the fill the form holds now, if any. */
  applied?: FillMarks;
  /** Apply a finished fill to the form; answers what it did. */
  onApply(result: FillResult): FillOutcome;
  /** Put the form back to the stored recipe. */
  onUndo(): void;
}) {
  const titleId = useId();
  const [job, setJob] = useState<string | undefined>(initialJob);
  const [settled, setSettled] = useState<string | undefined>();
  const [message, setMessage] = useState<string>();
  const [result, setResult] = useState<FillResult>();
  const [outcome, setOutcome] = useState<FillOutcome>();
  const [undone, setUndone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [unfollowed, setUnfollowed] = useState<
    (UnfollowedImport & { job: string }) | undefined
  >();
  const running = !!job && settled !== job;

  const host = hostnameLabel(sourceUrl) ?? sourceUrl;
  const empty = HINT_FIELDS.filter((field) => isEmptyField(stored, field));

  const settle = useCallback(
    (id: string, filled: FillResult | undefined, why?: string) => {
      setSettled(id);
      if (filled && filled.slug !== slug) {
        /* `?fill=` naming another recipe's fill: never applied here. */
        setMessage(`That fill was for "${filled.slug}", not this recipe.`);
      } else if (filled) {
        setResult(filled);
        setOutcome(onApply(filled));
      } else if (why) {
        setMessage(why);
      }
    },
    [onApply, slug],
  );

  const onSettled = useCallback(
    (meta: JobRecord) => {
      const filled =
        meta.status === "done" && meta.result && typeof meta.result === "object"
          ? (meta.result as FillResult)
          : undefined;
      settle(meta.id, filled);
    },
    [settle],
  );

  /* A fill with no job record (38-Tb5): its outcome by a bounded long-poll. */
  const unfollowedJob =
    unfollowed && !unfollowed.status ? unfollowed.job : undefined;
  useEffect(() => {
    if (!unfollowedJob) return;
    const id = unfollowedJob;
    let stopped = false;
    const deadline = Date.now() + UNSTORED_KEEP_MS;
    const pause = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    void (async () => {
      let failures = 0;
      while (!stopped) {
        const asked = Date.now();
        let answer: Awaited<ReturnType<typeof fillResultAction>>;
        try {
          answer = await fillResultAction(id);
          failures = 0;
        } catch (error) {
          failures += 1;
          if (failures >= 3 || Date.now() > deadline) {
            if (stopped) return;
            setUnfollowed({ job: id, status: "failed" });
            settle(id, undefined, String(error));
            return;
          }
          await pause(2_000);
          continue;
        }
        if (stopped) return;
        if (answer.pending && Date.now() < deadline) {
          if (Date.now() - asked < 1_000) await pause(1_000);
          continue;
        }
        const status = answer.result
          ? "done"
          : answer.cancelled
            ? "cancelled"
            : "failed";
        setUnfollowed({ job: id, status });
        settle(
          id,
          answer.result,
          answer.cancelled
            ? undefined
            : (answer.message ?? "Stopped waiting for this fill."),
        );
        return;
      }
    })();
    return () => {
      stopped = true;
    };
  }, [unfollowedJob, settle]);

  const start = async () => {
    setStarting(true);
    setMessage(undefined);
    setResult(undefined);
    setOutcome(undefined);
    setUndone(false);
    try {
      const started = await fillStartAction(slug);
      if (!started.job) {
        setMessage(started.message ?? "The fill did not start.");
        return;
      }
      setUnfollowed(
        started.stored === false ? { job: started.job } : undefined,
      );
      setJob(started.job);
      if (started.stored !== false) {
        /* Leaving the page loses nothing: back here reopens the fill. */
        window.history.replaceState(
          window.history.state,
          "",
          `/recipe/${encodeURIComponent(slug)}/edit?fill=${encodeURIComponent(started.job)}`,
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const undo = () => {
    onUndo();
    setUndone(true);
    setOutcome(undefined);
    window.history.replaceState(
      window.history.state,
      "",
      `/recipe/${encodeURIComponent(slug)}/edit`,
    );
  };

  const marks = outcome && "marks" in outcome ? outcome.marks : undefined;
  const showButton = !running && !applied;
  const estimated = marks?.estimated ?? [];

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 sm:px-5"
      data-testid="fill-from-source"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2
            id={titleId}
            className="font-display text-base leading-6 font-semibold tracking-[-0.01em]"
          >
            Fill gaps from the source
          </h2>
          <p className="text-sm text-muted-foreground">
            Reads{" "}
            <a
              href={sourceUrl}
              className="underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {host}
            </a>{" "}
            and fills only what is empty
            {empty.length ? (
              <>
                {" "}
                — now <span data-testid="fill-empty">{fieldList(empty)}</span>
              </>
            ) : null}
            .{" "}
            {llmModel
              ? `Times and yield it doesn't state are estimated by ${llmModel}.`
              : "No model is configured, so nothing is estimated."}{" "}
            Nothing is saved until you press Save.
          </p>
        </div>
        {showButton ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0 px-4 sm:h-9"
            disabled={starting}
            onClick={start}
          >
            Fill gaps from the source
          </Button>
        ) : null}
      </div>

      {job ? (
        <ImportProgress
          key={job}
          job={job}
          words={FILL_WORDS}
          onSettled={settled === job ? undefined : onSettled}
          unfollowed={
            unfollowed?.job === job
              ? { ...(unfollowed.status ? { status: unfollowed.status } : {}) }
              : undefined
          }
        />
      ) : null}

      {message ? (
        <p
          role="alert"
          className="border-l-2 border-destructive pl-2 text-sm"
          data-testid="fill-message"
        >
          {message}
        </p>
      ) : null}

      {outcome && "nothing" in outcome ? (
        <p role="status" className="text-sm" data-testid="fill-summary">
          Nothing new from the source: every field it has is already filled.
        </p>
      ) : null}

      {marks ? (
        <div
          role="status"
          className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-r-md border-l-2 border-primary bg-muted px-3 py-2.5"
          data-testid="fill-summary"
        >
          <div className="min-w-0 flex-1 basis-64 text-sm">
            {marks.filled.length ? (
              <p>
                <b className="font-semibold">Filled from the source:</b>{" "}
                {fieldList(marks.filled)}.
              </p>
            ) : null}
            {estimated.length ? (
              <p>
                <b className="font-semibold">
                  Estimated{marks.model ? ` by ${marks.model}` : ""}:
                </b>{" "}
                {fieldList(estimated)}
                {marks.basis ? ` — ${marks.basis}` : ""}.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              Review the marked sections, then Save.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            onClick={undo}
          >
            Undo
          </Button>
        </div>
      ) : null}

      {undone ? (
        <p role="status" className="text-sm" data-testid="fill-undone">
          Undone: the form is back to the stored recipe.
        </p>
      ) : null}

      {result?.warnings?.length && !undone ? (
        <ul
          className="flex flex-col gap-1 text-sm text-muted-foreground"
          data-testid="fill-notes"
        >
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
