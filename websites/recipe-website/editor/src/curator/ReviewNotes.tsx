"use client";

import {
  REVIEW_NOTE_AUTHOR_LABELS,
  REVIEW_NOTE_VERDICT_LABELS,
  type ReviewNote,
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
 * nothing in it becomes HTML, Markdown or a link. The page writes none
 * (De2-1): they come from `recipes agent note` and the curator-drive skill.
 */
export function ReviewNotes({ notes }: { notes: readonly ReviewNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section
      aria-labelledby="curator-notes-heading"
      data-testid="curator-notes"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="curator-notes-heading" className="font-display text-lg font-bold">
        {notesHeading(notes)}
      </h2>
      <ol className="mt-3 flex flex-col gap-4">
        {newestFirst(notes).map((note) => (
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
    </section>
  );
}

/** When it was written: UTC from the server, the reader's zone once mounted. */
function Written({ at }: { at: string }) {
  const epoch = Date.parse(at);
  if (Number.isNaN(epoch)) return null;
  return <When epoch={epoch} />;
}
