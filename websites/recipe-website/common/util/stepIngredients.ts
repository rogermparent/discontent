/**
 * Which ingredient lines a step uses, for the recipe page's "Uses" lists
 * (epic 42c1, D3: only confident matches).
 *
 * A step lists a line only when one of the line's names appears in the
 * step's text as whole words — or, for a name of two words or more, its head
 * noun (the last word) does and no other line shares that head. Both sides go
 * through `ingredientNames`' one word pipeline (`toName`: folded, singular,
 * descriptive words dropped, compounds joined), so "eggs" meets `egg`,
 * "baking powder" is one word that `powder` cannot match, and "the brown
 * sugar" is never also a bare `sugar` line's. There is no fuzzy matching and
 * no list of synonyms beyond the ones `toName` already applies to both sides.
 *
 * Ambiguity shows nothing: a name or head that another line's name contains
 * (two butter lines, salt in three places, "butter, for greasing" beside
 * "unsalted butter") is listed for neither — except inside a
 * section, when an instruction group's name is an ingredient heading's
 * ("Crust" / "For the crust:"), where only that heading's lines compete.
 *
 * Pure, and safe in the browser; the recipe page runs it on the server.
 */
import type { Ingredient, InstructionEntry } from "../controller/types";
import { detectHeading } from "./detectHeading";
import {
  DERIVED_FORMS,
  isGenericHead,
  parseIngredientLine,
  stripMarkup,
  toName,
} from "./ingredientNames";

/** Entry → step → the indices (into `ingredients`) of the lines it uses. */
export type StepLines = number[][][];

/**
 * Last words that name the shape a thing comes in, not the thing: "pecan
 * halves" and "thyme leaves" are headed by the word before (`pecan`,
 * `thyme`), and "slice in half" never meets the pecans.
 */
const SHAPE_WORDS = new Set([
  "half",
  "piece",
  "cube",
  "chunk",
  "strip",
  "leaf",
  "sprig",
]);

/**
 * Heads too likely to be something else in a step: a verb ("puree the
 * soup", "rub the meat"), the dish being made ("stir the cocktail"), or a
 * part named on its own (`juice`, `zest` — `DERIVED_FORMS`). The whole name
 * still matches; only the head alone does not.
 */
const UNSAFE_HEADS = new Set([
  "cocktail",
  "drink",
  "mixture",
  "puree",
  "paste",
  "glaze",
  "dressing",
  "seasoning",
  "rub",
  "spread",
  "topping",
  "filling",
  "frosting",
  "icing",
  "wash",
  "and",
  "or",
]);

/** A step's text and, when it has one, its own title. */
function stepText({ name, text }: { name?: string; text?: string }): string {
  return [name, text].filter(Boolean).join(". ");
}

/** Each entry's steps' texts: one for a step, one per step of a group. */
function entryTexts(instructions: readonly InstructionEntry[]): string[][] {
  return instructions.map((entry) =>
    "instructions" in entry
      ? (entry.instructions ?? []).map(stepText)
      : [stepText(entry)],
  );
}

/**
 * The words of each clause of `text`, as `toName` reads words. Split at
 * punctuation first so a name never spans a sentence or a list comma.
 */
export function stepWords(text: string): string[][] {
  return stripMarkup(text)
    .split(/[.,;:!?()[\]{}"“”]|\s[-–—]\s|\s+&\s+|\s+\+\s+/)
    .map((clause) => toName(clause).words)
    .filter((words) => words.length > 0);
}

/**
 * The key a section is matched by: "For the crust:", "Crust" and "Make the
 * crust" are all `crust`.
 */
export function sectionKey(text: string): string {
  const cleaned = stripMarkup(text)
    .replace(/[:.]\s*$/, "")
    .replace(/^\s*(?:(?:to\s+)?make|for|prepare|assemble)\s+(?:the\s+)?/i, "")
    .replace(/^\s*the\s+/i, "");
  return toName(cleaned).words.join(" ");
}

interface LineNames {
  index: number;
  /** Every name the line goes by, as words. */
  names: string[][];
  /** The heads usable on their own (from names of two words or more). */
  heads: string[];
  /** The heading the line sits under, as a `sectionKey`; "" for none. */
  section: string;
}

/** Link texts in a stored line: a sub-recipe line goes by its recipe's name. */
function linkTexts(line: string): string[] {
  return [...line.matchAll(/\[([^\]]+)\]\([^)]*\)/g)].map((match) => match[1]);
}

/** A name's head: its last word, or the one before a shape word. */
function headOf(words: string[]): string {
  const last = words[words.length - 1];
  return SHAPE_WORDS.has(last) && words.length > 1
    ? words[words.length - 2]
    : last;
}

/**
 * Heads that, said alone in a step, mean one particular kind: "salt and
 * pepper" is black pepper, never the bell pepper. Such a head stands for a
 * name only when the name has one of these words.
 */
const QUALIFIED_HEADS: Record<string, string[]> = {
  pepper: ["black", "white", "ground", "cracked"],
};

/**
 * Heads that name a kind, so the word before names the line as well (43n):
 * "mozzarella cheese" goes by `cheese` and by `mozzarella`. Named cheeses
 * gained their `cheese` in `toName`, and a step that says "the mozzarella"
 * must still find the line it found when the name was `mozzarella`.
 */
const CLASS_HEADS = new Set(["cheese"]);

/** A name's heads: `headOf`, and the word before a `CLASS_HEADS` head. */
function headsOf(words: string[]): string[] {
  const head = headOf(words);
  return CLASS_HEADS.has(head) && words.length > 1
    ? [head, words[words.length - 2]]
    : [head];
}

function qualifiedHead(words: string[]): boolean {
  const needs = QUALIFIED_HEADS[headOf(words)];
  return !needs || words.some((word) => needs.includes(word));
}

function usableHead(word: string): boolean {
  return (
    word.length >= 3 &&
    !isGenericHead(word) &&
    !DERIVED_FORMS.has(word) &&
    !SHAPE_WORDS.has(word) &&
    !UNSAFE_HEADS.has(word)
  );
}

/** What each line goes by. Headings (stored or detected) set the section. */
export function lineNames(ingredients: readonly Ingredient[]): LineNames[] {
  const out: LineNames[] = [];
  let section = "";
  ingredients.forEach(({ ingredient, type }, index) => {
    const readable = stripMarkup(ingredient ?? "").trim();
    if (!readable) return;
    if (type === "heading" || detectHeading(readable)) {
      section = sectionKey(readable);
      return;
    }
    const names: string[][] = [];
    const seen = new Set<string>();
    const add = (words: string[]) => {
      const key = words.join("|");
      if (words.length === 0 || seen.has(key)) return;
      seen.add(key);
      names.push(words);
    };
    for (const requirement of parseIngredientLine(ingredient, { index })) {
      /* An infusion's flavour is loose: "chamomile" is not the vodka line. */
      if (requirement.loose) continue;
      for (const alternative of requirement.alternatives) {
        add(alternative.words);
      }
    }
    for (const text of linkTexts(ingredient)) add(toName(text).words);
    const heads = [
      ...new Set(
        names
          .filter((words) => words.length > 1)
          .filter((words) => qualifiedHead(words))
          .flatMap(headsOf)
          .filter(usableHead),
      ),
    ];
    out.push({ index, names, heads, section });
  });
  return out;
}

/** Where `needle` occurs in `hay` as consecutive words. */
function occurrences(hay: string[], needle: string[]): number[] {
  const found: number[] = [];
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((word, j) => hay[i + j] === word)) found.push(i);
  }
  return found;
}

interface Hit {
  line: number;
  clause: number;
  start: number;
  length: number;
  confident: boolean;
}

/**
 * The lines one step uses. `scope` is the step's section key when its group
 * names an ingredient heading, else "".
 */
function matchStep(text: string, lines: LineNames[], scope: string): number[] {
  const clauses = stepWords(text);
  if (clauses.length === 0) return [];

  /* Who else goes by a name or a head, within the step's section if any. */
  const competitors = (line: LineNames, test: (other: LineNames) => boolean) =>
    lines.some(
      (other) =>
        other.index !== line.index &&
        test(other) &&
        (!scope || line.section !== scope || other.section === scope),
    );

  /* Every occurrence of every name, confident or not: an ambiguous long
   * name still covers the shorter names inside it. */
  const hits: Hit[] = [];
  const record = (line: LineNames, words: string[], confident: boolean) => {
    clauses.forEach((clause, c) => {
      for (const start of occurrences(clause, words)) {
        hits.push({
          line: line.index,
          clause: c,
          start,
          length: words.length,
          confident,
        });
      }
    });
  };
  /*
   * A name is shared when another line's name *contains* it as consecutive
   * words, not only when it equals it: with "unsalted butter" and "butter,
   * for greasing" on the list, "the butter" could be either, so it is
   * neither's (D3). The same for a head, which is a one-word name.
   */
  const containedElsewhere = (line: LineNames, words: string[]) =>
    competitors(line, (other) =>
      other.names.some((theirs) => occurrences(theirs, words).length > 0),
    );
  for (const line of lines) {
    for (const words of line.names) {
      record(line, words, !containedElsewhere(line, words));
    }
    for (const head of line.heads) {
      record(line, [head], !containedElsewhere(line, [head]));
    }
  }

  /*
   * A hit inside a longer hit of another line belongs to that line: "brown
   * sugar" is the brown sugar line's, not also the head `sugar` of another.
   */
  const covered = (hit: Hit) =>
    hits.some(
      (other) =>
        other.line !== hit.line &&
        other.clause === hit.clause &&
        other.length > hit.length &&
        other.start <= hit.start &&
        other.start + other.length >= hit.start + hit.length,
    );
  const used = new Set<number>();
  for (const hit of hits) {
    if (hit.confident && !covered(hit)) used.add(hit.line);
  }
  return [...used].sort((a, b) => a - b);
}

/** For each step of each entry, the ingredient lines it uses (D3). */
export function matchStepIngredients(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
): StepLines {
  const lines = lineNames(ingredients);
  const sections = new Set(lines.map((line) => line.section).filter(Boolean));
  const texts = entryTexts(instructions);
  return instructions.map((entry, i) => {
    const groupKey =
      "instructions" in entry && entry.name ? sectionKey(entry.name) : "";
    const scope = sections.has(groupKey) ? groupKey : "";
    return texts[i].map((text) => matchStep(text, lines, scope));
  });
}

export { stepNumbers } from "./stepNumbers";
