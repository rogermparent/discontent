"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Checkbox } from "@discontent/component-library/components/ui/checkbox";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { cn } from "@discontent/component-library/lib/utils";
import {
  EDIT_FIELD_LABELS,
  EDIT_REQUEST_MAX,
  editFieldList,
  fieldDiff,
  type EditField,
  type EditValues,
} from "recipe-website-common/util/editRequest";
import { numberList } from "recipe-website-common/util/usesSuggestions";
import type { FillMarks } from "recipe-website-common/components/Form/fillMarks";
import {
  isEditResult,
  type EditResult,
} from "recipe-editor/controller/llm/editResult";
import { UNSTORED_KEEP_MS } from "recipe-editor/controller/jobs/unstored";
import type { JobRecord } from "recipe-editor/controller/jobs/views";
import ImportProgress, {
  type ProgressWords,
  type UnfollowedImport,
} from "../../../new-recipe/ImportProgress";
import { editResultAction, editStartAction } from "./editActions";

/** Who answers a request here, by label ("local model qwen3:8b"). */
export interface EditModelsShown {
  local?: string;
  claude?: string;
}

/** What the form did with a result: the fields changed, and skipped. */
export interface EditApplied {
  applied: EditField[];
  skipped: EditField[];
  /** "Suggest step uses": the steps with an offer. */
  offered?: number[];
}

/** The examples beside the field (Roger's own, 2026-11-17, first). */
export const EDIT_EXAMPLES = [
  "Remove the parentheses from the ingredients",
  "Split step 3 in two",
  "Convert to metric",
] as const;

/** What the box's render prop hands the fill strip. */
export interface FillSlot {
  /** Whether the fill's panel and summary are the box's to show. */
  fill: boolean;
  /** A request is running: the fill waits. */
  busy: boolean;
  startedFill(): void;
  fillRunning(running: boolean): void;
}

/** The latest request's outcome, for the panel's words. */
interface Last {
  result: EditResult;
  applied?: EditApplied;
}

function words(
  model: string | undefined,
  task: "request" | "uses",
): ProgressWords {
  return {
    noun: task === "uses" ? "Step uses" : "Request",
    running: `Asking ${model ?? "the model"}…`,
    done:
      task === "uses"
        ? "Done: any suggestion is under its step."
        : "Done: review the marked fields, then save.",
  };
}

/**
 * "Edit with AI" (47i) at the head of the edit form, where 45b's "Fill gaps
 * from the source" strip was: a request in the person's words, sent with
 * the form's values as they are, answered by the local model (or Claude, if
 * asked or the only one), and shown marked in the form — each changed field
 * with its before → after, Accept and Undo, and Undo all. Beside it the
 * canned actions: the fill (unchanged, when there is a source) and
 * "Suggest step uses". One job at a time; the latest one's panel and words
 * are the box's. Nothing is saved until Save.
 */
export default function EditWithAi({
  slug,
  models,
  usesAsk,
  marks,
  readValues,
  onEdit,
  onUses,
  onAccept,
  onUndo,
  fill,
}: {
  slug: string;
  models: EditModelsShown;
  usesAsk?: { model: string } | { unavailable: string };
  /** The marks the form holds now (a fill's, the requests'). */
  marks?: FillMarks;
  /** The form's values as they are now. */
  readValues(): EditValues | undefined;
  onEdit(result: EditResult, sent: EditValues): EditApplied;
  onUses(result: EditResult, sent: EditValues): EditApplied;
  onAccept(field: EditField): void;
  onUndo(fields: readonly EditField[]): void;
  /** The fill strip, when the recipe has a source (45b). */
  fill?: (slot: FillSlot) => ReactNode;
}) {
  const titleId = useId();
  const requestId = useId();
  const claudeId = useId();
  const requestField = useRef<HTMLTextAreaElement>(null);
  const [request, setRequest] = useState("");
  const [useClaude, setUseClaude] = useState(false);
  const [job, setJob] = useState<string>();
  const [task, setTask] = useState<"request" | "uses">("request");
  const [asking, setAsking] = useState<string>();
  const [settled, setSettled] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [last, setLast] = useState<Last>();
  const [said, setSaid] = useState("");
  const [latest, setLatest] = useState<"fill" | "edit">();
  const [fillRunning, setFillRunning] = useState(false);
  const [unfollowed, setUnfollowed] = useState<
    (UnfollowedImport & { job: string }) | undefined
  >();
  const sent = useRef<EditValues | undefined>(undefined);
  const running = !!job && settled !== job;
  const busy = running || starting || fillRunning;
  const both = !!models.local && !!models.claude;
  const asked =
    useClaude && models.claude
      ? models.claude
      : (models.local ?? models.claude);

  const settle = useCallback(
    (id: string, result: EditResult | undefined, why?: string) => {
      setSettled(id);
      if (result && (!isEditResult(result) || result.slug !== slug)) {
        setMessage("That job isn't a request for this recipe.");
        return;
      }
      if (!result) {
        if (why) setMessage(why);
        return;
      }
      const values = sent.current;
      const applied = values
        ? result.task === "uses"
          ? onUses(result, values)
          : onEdit(result, values)
        : undefined;
      setLast({ result, ...(applied ? { applied } : {}) });
    },
    [onEdit, onUses, slug],
  );

  const onSettled = useCallback(
    (meta: JobRecord) => {
      if (meta.kind !== "edit") {
        setSettled(meta.id);
        setMessage("That job isn't a request for this recipe.");
        return;
      }
      settle(
        meta.id,
        meta.status === "done" && meta.result && typeof meta.result === "object"
          ? (meta.result as EditResult)
          : undefined,
        meta.status === "cancelled"
          ? undefined
          : meta.status === "done"
            ? undefined
            : (meta.error?.message ?? "The request did not finish."),
      );
    },
    [settle],
  );

  /* A request with no job record (38-Tb5): its outcome by a long-poll. */
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
        const at = Date.now();
        let answer: Awaited<ReturnType<typeof editResultAction>>;
        try {
          answer = await editResultAction(id);
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
          if (Date.now() - at < 1_000) await pause(1_000);
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
            : (answer.message ?? "Stopped waiting for this request."),
        );
        return;
      }
    })();
    return () => {
      stopped = true;
    };
  }, [unfollowedJob, settle]);

  const start = async (
    what: "request" | "uses",
    { claude = useClaude }: { claude?: boolean } = {},
  ) => {
    const values = readValues();
    if (!values) return;
    if (what === "request" && !request.trim()) {
      setMessage("Type what should change first.");
      requestField.current?.focus();
      return;
    }
    setStarting(true);
    setMessage(undefined);
    setLast(undefined);
    setSaid("");
    setLatest("edit");
    setTask(what);
    sent.current = values;
    try {
      const started = await editStartAction(slug, {
        task: what,
        ...(what === "request" ? { request: request.trim() } : {}),
        values,
        ...(claude ? { claude: true } : {}),
      });
      if (!started.job) {
        setMessage(started.message ?? "The request did not start.");
        return;
      }
      setAsking(
        what === "uses" && usesAsk && "model" in usesAsk
          ? usesAsk.model
          : claude && models.claude
            ? models.claude
            : asked,
      );
      setUnfollowed(
        started.stored === false ? { job: started.job } : undefined,
      );
      setJob(started.job);
    } finally {
      setStarting(false);
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    void start("request");
  };

  const edited = marks?.edited;
  const changedFields = edited?.fields ?? [];
  const result = latest === "edit" ? last?.result : undefined;
  const tryClaude =
    result &&
    result.claudeAvailable &&
    result.backend !== "claude" &&
    result.task === "request" &&
    (result.status === "refused" || result.status === "failed");

  const accept = (field: EditField) => {
    onAccept(field);
    setSaid(
      `Accepted the change to the ${EDIT_FIELD_LABELS[field]}. Not saved yet.`,
    );
  };
  const undo = (fields: readonly EditField[]) => {
    onUndo(fields);
    setSaid(
      `Undone: the ${editFieldList(fields)} ${fields.length === 1 && !EDIT_FIELD_LABELS[fields[0]].endsWith("s") ? "is" : "are"} back to what ${fields.length === 1 ? "it" : "they"} held before the request.`,
    );
  };

  /* No model here: nothing to ask — the fill strip alone, as before 47i
   * (a source is still read; nothing is estimated), or nothing at all. */
  if (!asked) {
    return fill
      ? fill({
          fill: true,
          busy: false,
          startedFill: () => undefined,
          fillRunning: setFillRunning,
        })
      : null;
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:px-5"
      data-testid="edit-with-ai"
    >
      <div>
        <h2
          id={titleId}
          className="font-display text-base leading-6 font-semibold tracking-[-0.01em]"
        >
          Edit with AI
        </h2>
        <p className="text-sm text-muted-foreground">
          Ask for a change in your own words: {asked} reads the form as it is
          now and proposes it, marked for you to accept or undo. Nothing is
          saved until you press Save.
        </p>
      </div>

      <form className="flex flex-col gap-2" onSubmit={send}>
        <label htmlFor={requestId} className="text-sm font-medium">
          What should change?
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <Textarea
            ref={requestField}
            id={requestId}
            name="request"
            rows={2}
            maxLength={EDIT_REQUEST_MAX}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                !busy
              ) {
                event.preventDefault();
                void start("request");
              }
            }}
            placeholder="e.g. remove the parentheses from the ingredients"
            className="min-h-11 min-w-0 flex-1 basis-64"
          />
          <Button
            type="submit"
            className="h-11 shrink-0 px-5 sm:h-9"
            disabled={busy}
          >
            Send
          </Button>
        </div>
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm"
          role="group"
          aria-label="Example requests"
        >
          <span className="text-muted-foreground">Try:</span>
          {EDIT_EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              variant="outline"
              size="sm"
              className="min-h-8 rounded-full px-3 font-normal"
              onClick={() => {
                setRequest(example);
                requestField.current?.focus();
              }}
            >
              {example}
            </Button>
          ))}
        </div>
        {both ? (
          <div className="flex items-start gap-2 text-sm">
            <Checkbox
              id={claudeId}
              className="mt-0.5"
              checked={useClaude}
              onCheckedChange={(value) => setUseClaude(value === true)}
            />
            <label htmlFor={claudeId}>
              Use Claude ({models.claude}) instead of {models.local}
            </label>
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {usesAsk && "model" in usesAsk ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 px-4 sm:h-9"
              disabled={busy}
              onClick={() => void start("uses")}
            >
              Suggest step uses
            </Button>
            <span className="text-muted-foreground">
              {usesAsk.model} suggests what each step brings in; nothing is
              stored unless you accept it.
            </span>
          </>
        ) : usesAsk ? (
          <p className="text-muted-foreground" data-testid="edit-uses-off">
            Suggest step uses is off here: {usesAsk.unavailable}.
          </p>
        ) : null}
      </div>

      {fill?.({
        fill: latest !== "edit",
        busy: running || starting,
        startedFill: () => {
          setLatest("fill");
          setSaid("");
        },
        fillRunning: setFillRunning,
      })}

      {latest === "edit" && job ? (
        <ImportProgress
          key={job}
          job={job}
          words={words(asking, task)}
          onSettled={settled === job ? undefined : onSettled}
          unfollowed={
            unfollowed?.job === job
              ? { ...(unfollowed.status ? { status: unfollowed.status } : {}) }
              : undefined
          }
        />
      ) : null}

      {latest === "edit" && message ? (
        <p
          role="alert"
          className="border-l-2 border-destructive pl-2 text-sm"
          data-testid="edit-message"
        >
          {message}
        </p>
      ) : null}

      {result ? <ResultLine result={result} applied={last?.applied} /> : null}

      {tryClaude ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4 sm:h-9"
            disabled={busy}
            onClick={() => void start("request", { claude: true })}
          >
            Try with Claude
          </Button>
        </div>
      ) : null}

      {changedFields.length > 0 && edited ? (
        <div
          className="flex flex-col gap-2 rounded-r-md border-l-2 border-primary bg-muted px-3 py-2.5"
          data-testid="edit-changes"
        >
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-64 text-sm">
              <h3 className="font-semibold">Changed by AI — not saved yet</h3>
              <ul className="text-muted-foreground">
                {edited.requests.map((one, index) => (
                  <li key={index}>
                    “{one.request}” — {one.model}
                    {one.note ? `: ${one.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            {changedFields.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                onClick={() => undo(changedFields)}
              >
                Undo all
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">
            {changedFields.map((field) => (
              <FieldChange
                key={field}
                field={field}
                accepted={edited.accepted.includes(field)}
                before={edited.before[field]}
                after={edited.after[field]}
                onAccept={() => accept(field)}
                onUndo={() => undo([field])}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <p role="status" className="text-sm empty:hidden" data-testid="edit-said">
        {said}
      </p>
    </section>
  );
}

/** What the latest request came to, in one or two lines. */
function ResultLine({
  result,
  applied,
}: {
  result: EditResult;
  applied?: EditApplied;
}) {
  const model = result.model ?? "the model";
  /* "Local model qwen3:8b's answer…": a sentence starts with a capital. */
  const Model = model.charAt(0).toUpperCase() + model.slice(1);
  const note =
    result.task === "request" ? result.note.replace(/[.\s]+$/, "") : "";
  const notes = result.warnings ?? [];
  let line: ReactNode;
  let alert = false;
  if (result.task === "uses") {
    if (result.status === "failed") {
      alert = true;
      line = `What each step uses was not suggested: ${result.problem ?? "nothing came back"}.`;
    } else if (applied?.skipped.length) {
      line =
        "The steps changed while the model read them: nothing is suggested. Ask again.";
    } else if (applied?.offered?.length) {
      line = (
        <>
          <b className="font-semibold">Suggested by {model}:</b> what step
          {applied.offered.length === 1 ? "" : "s"}{" "}
          {numberList(applied.offered)} use
          {applied.offered.length === 1 ? "s" : ""} — not applied: accept or
          dismiss each in{" "}
          <a href="#recipe-section-steps" className="underline">
            Steps
          </a>
          .
        </>
      );
    } else {
      line = `${Model} read what each step uses: no change to suggest.`;
    }
  } else if (result.status === "changed") {
    const done = applied?.applied ?? [];
    const skipped = applied?.skipped ?? [];
    line = (
      <>
        {done.length ? (
          <>
            <b className="font-semibold">Changed by {model}:</b>{" "}
            {editFieldList(done)}
            {note ? ` — ${note}` : ""}. Review each below, then Save.
          </>
        ) : null}
        {skipped.length ? (
          <>
            {done.length ? " " : ""}Not applied to the {editFieldList(skipped)}:
            you changed {skipped.length === 1 ? "it" : "them"} while the model
            was reading. Ask again to include{" "}
            {skipped.length === 1 ? "it" : "them"}.
          </>
        ) : null}
      </>
    );
  } else if (result.status === "no-change") {
    line = `No change from ${model}${note ? `: ${note}.` : "."}`;
  } else {
    alert = true;
    line =
      result.status === "refused"
        ? `${Model}'s answer was not applied: ${result.problem}.`
        : `Nothing was changed: ${result.problem}.`;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p
        role={alert ? "alert" : "status"}
        data-testid="edit-summary"
        className={cn(alert && "border-l-2 border-destructive pl-2")}
      >
        {line}
      </p>
      {notes.length ? (
        <ul
          className="flex flex-col gap-1 text-muted-foreground"
          data-testid="edit-notes"
        >
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One changed field: its before → after, Accept and Undo. */
function FieldChange({
  field,
  accepted,
  before,
  after,
  onAccept,
  onUndo,
}: {
  field: EditField;
  accepted: boolean;
  before: unknown;
  after: unknown;
  onAccept(): void;
  onUndo(): void;
}) {
  const label = EDIT_FIELD_LABELS[field];
  const rows = fieldDiff(field, before, after);
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      data-testid={`edit-field-${field}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-sm font-semibold">{name}</span>
        <span
          className="make-tape px-2 py-1 font-mono text-[0.75rem] leading-none"
          data-kind={accepted ? undefined : "missing"}
        >
          {accepted ? "accepted · not saved yet" : "edited"}
        </span>
        <span className="ml-auto flex gap-2">
          {accepted ? null : (
            <Button
              type="button"
              size="sm"
              className="min-h-9"
              aria-label={`Accept the change to the ${label}`}
              onClick={onAccept}
            >
              Accept
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-9"
            aria-label={`Undo the change to the ${label}`}
            onClick={onUndo}
          >
            Undo
          </Button>
        </span>
      </div>
      <details open={rows.length <= 12}>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Before → after
        </summary>
        <ol className="mt-1 flex flex-col gap-0.5 font-mono text-[0.8125rem] leading-5">
          {rows.map((row, index) => (
            <li
              key={index}
              className={cn(
                "flex gap-2 rounded-sm px-1.5",
                row.kind === "removed" && "bg-destructive/10 line-through",
                row.kind === "added" && "bg-primary/10",
                row.kind === "same" && "text-muted-foreground",
              )}
            >
              <span aria-hidden className="w-3 shrink-0">
                {row.kind === "removed" ? "−" : row.kind === "added" ? "+" : ""}
              </span>
              <span className="sr-only">
                {row.kind === "removed"
                  ? "Before: "
                  : row.kind === "added"
                    ? "After: "
                    : "Unchanged: "}
              </span>
              <span className="min-w-0 break-words">
                {row.text || "(empty)"}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
