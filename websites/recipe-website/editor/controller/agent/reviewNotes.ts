/**
 * Review notes on a curator run (epic 51, 51e; D6): what Claude Code — or
 * the person — made of a run, kept beside it. A note is data, never markup:
 * plain text the run view shows as text only (no HTML, no Markdown).
 *
 * This module is the shape and the check, browser-safe (zod only), so the
 * run view can import the types and labels; the store is
 * `reviewNoteStore.ts`.
 */
import { z } from "zod";

/** Who wrote a note: Claude Code driving the curator, or the person. */
export const REVIEW_NOTE_AUTHORS = ["claude-code", "you"] as const;
export type ReviewNoteAuthor = (typeof REVIEW_NOTE_AUTHORS)[number];

/**
 * What the note says of the run:
 * - `approved` — the held writes it judged were approved (some or all);
 * - `left-for-you` — nothing approved: a matter of taste, or not sure;
 * - `rerun` — the run should be asked again (a stale editor, a busy GPU);
 * - `miss` — the run got it wrong; the miss became a case (`cases`).
 */
export const REVIEW_NOTE_VERDICTS = [
  "approved",
  "left-for-you",
  "rerun",
  "miss",
] as const;
export type ReviewNoteVerdict = (typeof REVIEW_NOTE_VERDICTS)[number];

export const REVIEW_NOTE_AUTHOR_LABELS: Record<ReviewNoteAuthor, string> = {
  "claude-code": "Claude Code",
  you: "You",
};

export const REVIEW_NOTE_VERDICT_LABELS: Record<ReviewNoteVerdict, string> = {
  approved: "Approved",
  "left-for-you": "Left for you",
  rerun: "Run it again",
  miss: "A miss",
};

/** A note's text is at most this many characters. */
export const REVIEW_NOTE_TEXT_MAX = 4_000;
/** A run keeps at most this many notes. */
export const REVIEW_NOTES_MAX = 20;
/** A note names at most this many cases. */
export const REVIEW_NOTE_CASES_MAX = 20;

/** One note, as stored and as the run view answers it. */
export interface ReviewNote {
  /** A ULID, so a later note (or a person) can name this one. */
  id: string;
  by: ReviewNoteAuthor;
  /** When it was written (ISO 8601, the server's clock). */
  at: string;
  verdict: ReviewNoteVerdict;
  text: string;
  /** The case ids (`curator-cases.json`) the note's misses became. */
  cases?: string[];
}

/** A case id as `curator-cases.json` takes one (`parseCases`). */
const CASE_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Markup in a note is refused, not escaped: a note is plain text. A `<`
 * followed by a letter, `/`, `!` or `?` reads as a tag ("<b>", "</p>",
 * "<!--"); "< 2 GB" and "3<4" pass.
 */
const MARKUP = /<\s*[A-Za-z!/?]/;
/**
 * Control characters other than tab and newline (a CR is folded first):
 * C0, DEL and C1 (U+0080–U+009F), and the bidi overrides and isolates
 * (U+202A–U+202E, U+2066–U+2069) that would make a note read other than
 * it is.
 */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

/** Whether `text` is plain text a note may hold (no tags, no controls). */
export function isPlainNoteText(text: string): boolean {
  return !MARKUP.test(text) && !CONTROL.test(text);
}

/** The text as stored: CRLF folded to LF, trimmed. */
export function normalizeNoteText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** The body of `POST /api/agent/<id>/note` (and `recipes agent note`). */
export const ReviewNoteInputSchema = z.strictObject({
  verdict: z.enum(REVIEW_NOTE_VERDICTS),
  text: z
    .string()
    .transform(normalizeNoteText)
    .pipe(
      z
        .string()
        .min(1, "The note needs some text.")
        .max(
          REVIEW_NOTE_TEXT_MAX,
          `A note is at most ${REVIEW_NOTE_TEXT_MAX.toLocaleString("en-US")} characters.`,
        )
        .refine((text) => !MARKUP.test(text), {
          message: "A note is plain text: no HTML tags.",
        })
        .refine((text) => !CONTROL.test(text), {
          message:
            "A note has no control characters (tabs and newlines are fine).",
        }),
    ),
  by: z.enum(REVIEW_NOTE_AUTHORS).optional(),
  cases: z
    .array(
      z
        .string()
        .max(40)
        .regex(CASE_ID, "A case id is a lowercase word (curator-cases.json)."),
    )
    .max(REVIEW_NOTE_CASES_MAX)
    .optional(),
});

export type ReviewNoteInput = z.input<typeof ReviewNoteInputSchema>;
export type ReviewNoteInputParsed = z.output<typeof ReviewNoteInputSchema>;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * A stored note read back, or nothing when the file holds something else
 * (hand-edited, or from a later version): the view never shows what it
 * cannot vouch for as plain text.
 */
export function readStoredNote(value: unknown): ReviewNote | undefined {
  if (!isObject(value)) return undefined;
  const { id, by, at, verdict, text, cases } = value;
  if (typeof id !== "string" || !id) return undefined;
  if (typeof at !== "string" || !at) return undefined;
  if (!(REVIEW_NOTE_AUTHORS as readonly unknown[]).includes(by)) {
    return undefined;
  }
  if (!(REVIEW_NOTE_VERDICTS as readonly unknown[]).includes(verdict)) {
    return undefined;
  }
  /* A hand-edited file is checked as a posted note is: plain text only. */
  if (typeof text !== "string" || !isPlainNoteText(text)) return undefined;
  const caseIds = Array.isArray(cases)
    ? cases.filter(
        (entry): entry is string =>
          typeof entry === "string" && CASE_ID.test(entry),
      )
    : [];
  return {
    id,
    by: by as ReviewNoteAuthor,
    at,
    verdict: verdict as ReviewNoteVerdict,
    text: text.slice(0, REVIEW_NOTE_TEXT_MAX),
    ...(caseIds.length > 0 ? { cases: caseIds } : {}),
  };
}
