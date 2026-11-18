/**
 * A recipe's own notes (47j): the limits every write path holds them to,
 * the "(Note 2)" linker the recipe page runs over step text, and the
 * migration's pick of a trailing "Notes" step group. Pure and browser-safe.
 *
 * Notes are not steps. Before 47j a recipe's notes could only be pasted in
 * as a step group named "Notes", which the step matcher, the timers, the
 * step checks and the cook view then read as steps; `notes migrate` moves
 * those groups into `Recipe.notes`.
 */
import type {
  Instruction,
  InstructionEntry,
  InstructionGroup,
  Recipe,
} from "../controller/types";

/** At most this many notes on a recipe. */
export const NOTES_MAX = 50;

/** At most this many characters in one note (a few paragraphs). */
export const NOTE_MAX_CHARS = 10_000;

/** Line endings as `\n`, the note trimmed. */
function cleanNote(note: string): string {
  return note.replace(/\r\n?/g, "\n").trim();
}

/** The notes as stored: each trimmed, blank ones dropped. */
export function cleanNotes(notes: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((note): note is string => typeof note === "string")
    .map(cleanNote)
    .filter(Boolean);
}

/** The DOM id of note `n` (1-based) on the recipe page. */
export function noteAnchor(n: number): string {
  return `recipe-note-${n}`;
}

/** The id of the recipe page's Notes heading. */
export const NOTES_ID = "recipe-notes";

/* ------------------------------------------------------------------ */
/* "(Note 2)" → a link                                                 */
/* ------------------------------------------------------------------ */

/**
 * Markdown a note reference must not be found inside: a link (its text and
 * its target), a reference link, inline code, a component element with
 * what it holds (`<VideoTime …>note 1</VideoTime>`, a button), any other
 * tag with its attributes (`<Multiplyable …/>`), and a bare URL
 * (`https://x.example/note2`).
 */
const PROTECTED =
  /\[[^\]\n]*\]\([^)\n]*\)|\[[^\]\n]*\]\[[^\]\n]*\]|`[^`\n]*`|<([A-Z][\w.]*)\b[^>]*>[\s\S]*?<\/\1>|<[^>\n]+>|\bhttps?:\/\/\S+|\bwww\.\S+/g;

/**
 * "Note 2", "note #3", "notes 1 and 3", "Notes 1, 2 & 4" — the word, not
 * inside one ("footnote", "keynote", "/note2"), then one number or a list
 * of them. A list's later number must end the list or be followed by
 * another "and"/"or"/comma: "notes 1, 2 cups" links note 1 only. A note
 * number is one or two digits, never a decimal or fraction ("note 2.5").
 */
const NOTE_REF =
  /(?<![\w/#.-])(notes?)(\s*#?\s*)(\d{1,2})(?![\d.,/]\d)((?:\s*(?:,|&|\band\b|\bor\b)\s*#?\s*\d{1,2}(?![\d.,/]\d)(?=\s*(?:,|&|\band\b|\bor\b|[).;:!?\]]|$)))*)/gi;

/** One reference found in a step's text. */
export interface NoteRef {
  /** Where the linked words start and end in the text. */
  start: number;
  end: number;
  /** The note numbers it names, 1-based, each one the recipe has. */
  notes: number[];
}

/** The parts of `text` outside the protected markdown, with their offsets. */
function openSpans(text: string): { start: number; value: string }[] {
  const spans: { start: number; value: string }[] = [];
  let at = 0;
  for (const match of text.matchAll(PROTECTED)) {
    const start = match.index ?? 0;
    if (start > at) spans.push({ start: at, value: text.slice(at, start) });
    at = start + match[0].length;
  }
  if (at < text.length) spans.push({ start: at, value: text.slice(at) });
  return spans;
}

/**
 * The note references in a step's text (47j): "(Note 2)", "see note 2",
 * "notes 1 and 3" — each number one the recipe has (`count` notes; a
 * reference past them is left alone, as is one inside a link or code).
 */
export function noteRefs(text: string, count: number): NoteRef[] {
  if (!text || count < 1) return [];
  const refs: NoteRef[] = [];
  for (const span of openSpans(text)) {
    for (const match of span.value.matchAll(NOTE_REF)) {
      const numbers = [match[3], ...(match[4].match(/\d{1,2}/g) ?? [])].map(
        Number,
      );
      const notes = numbers.filter((n) => n >= 1 && n <= count);
      if (notes.length === 0) continue;
      const start = span.start + (match.index ?? 0);
      refs.push({ start, end: start + match[0].length, notes });
    }
  }
  return refs;
}

/**
 * The step's text with each note reference a link to its note (47j) — at
 * render time only: the stored text is never rewritten. "Note 2" becomes
 * `[Note 2](#recipe-note-2)`; in a list ("notes 1 and 3") each number is
 * its own link. A text with no reference comes back unchanged.
 */
export function linkNoteRefs(text: string, count: number): string {
  const refs = noteRefs(text, count);
  if (refs.length === 0) return text;
  let out = "";
  let at = 0;
  for (const ref of refs) {
    out += text.slice(at, ref.start);
    const words = text.slice(ref.start, ref.end);
    const numbers = [...words.matchAll(/\d{1,2}/g)];
    if (numbers.length === 1) {
      out += `[${words}](#${noteAnchor(Number(numbers[0][0]))})`;
    } else {
      let inner = 0;
      for (const number of numbers) {
        const n = Number(number[0]);
        const index = number.index ?? 0;
        out += words.slice(inner, index);
        out += ref.notes.includes(n)
          ? `[${number[0]}](#${noteAnchor(n)})`
          : number[0];
        inner = index + number[0].length;
      }
      out += words.slice(inner);
    }
    at = ref.end;
  }
  return out + text.slice(at);
}

/* ------------------------------------------------------------------ */
/* The migration's pick                                                */
/* ------------------------------------------------------------------ */

/**
 * A step group's name that says it holds notes, not steps: "Notes",
 * "Recipe Notes", "Notes:", "Tips", "Cook's notes", "Notes & tips".
 */
const NOTES_NAME =
  /^\s*(?:(?:recipe|cook'?s|chef'?s|my|extra|helpful|baking|cooking)\s+)?(?:notes?|tips?)(?:\s*(?:&|and|\+)\s*(?:notes?|tips?|tricks?|substitutions?))?\s*[:.]?\s*$/i;

/** Whether a step group's name is a notes heading, not a part of the recipe. */
export function isNotesName(name: string | undefined): boolean {
  return typeof name === "string" && NOTES_NAME.test(name.replace(/’/g, "'"));
}

function isGroup(entry: InstructionEntry): entry is InstructionGroup {
  return "instructions" in entry && Array.isArray(entry.instructions);
}

/** A moved step as a note: its title, when it has one, leads it in bold. */
function stepNote(step: Instruction): string {
  const text = cleanNote(step.text ?? "");
  const name = step.name?.trim();
  if (!name) return text;
  const lead = /[:.!?]$/.test(name) ? `**${name}**` : `**${name}:**`;
  return text ? `${lead} ${text}` : lead;
}

/** What `notes migrate` would do to one recipe. */
export interface NotesMigration {
  /** The group's name, as stored ("Recipe Notes"). */
  group: string;
  /** The notes it becomes, after any the recipe already has. */
  moved: string[];
  /** The recipe's notes after the move. */
  notes: string[];
  /** The steps left: every entry but the trailing group. */
  instructions: InstructionEntry[];
}

/**
 * The migration's pick (47j): a recipe whose **last** instruction entry is
 * a step group named like notes (`isNotesName`) — not an option of a set of
 * alternatives — has that group moved into its notes, each step one note
 * (a step's title kept, in bold), after the notes it already has. Anything
 * else — a notes group in the middle, a lone step called "Notes", a group
 * with no text in it — is left alone: `undefined`.
 */
export function notesMigration(
  recipe: Pick<Recipe, "instructions" | "notes">,
): NotesMigration | undefined {
  const entries = recipe.instructions ?? [];
  const last = entries[entries.length - 1];
  if (!last || !isGroup(last) || last.choice) return undefined;
  if (!isNotesName(last.name)) return undefined;
  const moved = last.instructions.map(stepNote).filter(Boolean);
  if (moved.length === 0) return undefined;
  const existing = cleanNotes(recipe.notes);
  return {
    group: last.name,
    moved,
    notes: [...existing, ...moved],
    instructions: entries.slice(0, -1),
  };
}
