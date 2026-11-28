"use client";

import { useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import {
  REVIEW_NOTE_AUTHOR_LABELS,
  REVIEW_NOTE_TEXT_MAX,
  REVIEW_NOTE_VERDICTS,
  REVIEW_NOTE_VERDICT_LABELS,
  ReviewNoteInputSchema,
  type ReviewNote,
  type ReviewNoteVerdict,
} from "recipe-editor/controller/agent/reviewNotes";
import { When } from "./time";

/** Newest first (a note with an unreadable date counts as oldest). */
export function newestFirst(notes: readonly ReviewNote[]): ReviewNote[] {
  const stamp = (note: ReviewNote) => {
    const time = Date.parse(note.at);
    return Number.isNaN(time) ? 0 : time;
  };
  return notes
    .map((note, index) => ({ note, index }))
    .sort((a, b) => stamp(b.note) - stamp(a.note) || b.index - a.index)
    .map(({ note }) => note);
}

/** The section's heading: who wrote what it holds. */
export function notesHeading(notes: readonly ReviewNote[]): string {
  if (notes.length === 0) return "Notes";
  if (notes.every((note) => note.by === "claude-code")) {
    return "Reviewed by Claude Code";
  }
  if (notes.every((note) => note.by === "you")) {
    return notes.length === 1 ? "Your note" : "Your notes";
  }
  return "Review notes";
}

/**
 * 51e2: the notes kept beside a run (`reviewNotes` in the run's API
 * answer), newest first: its verdict as a chip, who wrote it, when, and its
 * text as plain text (line breaks kept). A note is data, never markup, so
 * nothing in it becomes HTML, Markdown or a link. They come from
 * `recipes agent note` and the curator-drive skill; 51g (e06, Roger) adds
 * "Add a note" on the page: with a run `id` and `canAdd` (the run has
 * ended), a note written here posts as `by: "you"` and shows at once.
 */
export function ReviewNotes({
  notes,
  id,
  canAdd = false,
}: {
  notes: readonly ReviewNote[];
  id?: string;
  canAdd?: boolean;
}) {
  const [added, setAdded] = useState<readonly ReviewNote[]>([]);
  const writable = canAdd && !!id;
  const known = new Set(notes.map((note) => note.id));
  const all = [...notes, ...added.filter((note) => !known.has(note.id))];
  if (all.length === 0 && !writable) return null;
  return (
    <section
      aria-labelledby="curator-notes-heading"
      data-testid="curator-notes"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="curator-notes-heading" className="font-display text-lg font-bold">
        {notesHeading(all)}
      </h2>
      <ol className="mt-3 flex flex-col gap-4">
        {newestFirst(all).map((note) => (
          <li
            key={note.id}
            data-testid="curator-note"
            data-verdict={note.verdict}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
              <span
                data-testid="curator-note-verdict"
                className="rounded-full border border-foreground px-2 leading-5 font-semibold text-foreground"
              >
                {REVIEW_NOTE_VERDICT_LABELS[note.verdict]}
              </span>
              <span>{REVIEW_NOTE_AUTHOR_LABELS[note.by]}</span>
              <Written at={note.at} />
            </p>
            <p
              data-testid="curator-note-text"
              className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            >
              {note.text}
            </p>
            {note.cases && note.cases.length > 0 && (
              <p className="font-mono text-xs text-muted-foreground">
                {note.cases.length === 1 ? "Became a case" : "Became cases"}:{" "}
                {note.cases.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ol>
      {writable && (
        <AddNote
          id={id}
          hasNotes={all.length > 0}
          onAdded={(next) => setAdded(next)}
        />
      )}
    </section>
  );
}

/**
 * "Add a note" (51g, e06): a verdict (the labels the notes use) and plain
 * text, at most 4,000 characters, posted to `POST /api/agent/<id>/note` as
 * `by: "you"`. The same check the server runs says what is wrong before
 * anything is sent (no HTML tags), and the server's own words show if it
 * refuses (a run still working is `job_live`).
 */
function AddNote({
  id,
  hasNotes,
  onAdded,
}: {
  id: string;
  hasNotes: boolean;
  onAdded: (notes: ReviewNote[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<ReviewNoteVerdict>("approved");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div className={hasNotes ? "mt-4" : "mt-3"}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="curator-note-add"
          onClick={() => setOpen(true)}
        >
          Add a note
        </Button>
      </div>
    );
  }

  const submit = async () => {
    const checked = ReviewNoteInputSchema.safeParse({
      verdict,
      text,
      by: "you",
    });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "That note can't be saved.");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/agent/${encodeURIComponent(id)}/note`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(checked.data),
        },
      );
      const body = (await response.json().catch(() => undefined)) as
        { notes?: ReviewNote[]; error?: { message?: string } } | undefined;
      if (!response.ok || !body?.notes) {
        setError(
          body?.error?.message ?? `The editor answered ${response.status}.`,
        );
        return;
      }
      onAdded(body.notes);
      setText("");
      setOpen(false);
    } catch (failure) {
      setError(
        `Couldn't reach the editor: ${failure instanceof Error ? failure.message : String(failure)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      data-testid="curator-note-form"
      className="mt-4 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5">
        <legend className="mb-1 text-sm font-semibold">Verdict</legend>
        {REVIEW_NOTE_VERDICTS.map((option) => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="curator-note-verdict"
              value={option}
              checked={verdict === option}
              onChange={() => setVerdict(option)}
              className="size-4 shrink-0 accent-primary"
            />
            {REVIEW_NOTE_VERDICT_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="curator-note-text" className="text-sm font-semibold">
          Your note
        </label>
        <Textarea
          id="curator-note-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "curator-note-error" : undefined}
          maxLength={REVIEW_NOTE_TEXT_MAX}
          rows={4}
        />
        <p className="font-mono text-xs text-muted-foreground">
          Plain text, up to {REVIEW_NOTE_TEXT_MAX.toLocaleString("en-US")}{" "}
          characters.
        </p>
      </div>
      {error && (
        <p
          id="curator-note-error"
          role="alert"
          data-testid="curator-note-error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Save note
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** When it was written: UTC from the server, the reader's zone once mounted. */
function Written({ at }: { at: string }) {
  const epoch = Date.parse(at);
  if (Number.isNaN(epoch)) return null;
  return <When epoch={epoch} />;
}
