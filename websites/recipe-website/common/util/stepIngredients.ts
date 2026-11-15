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
 * A line is listed where it comes in, not everywhere it is named: "whisk
 * the egg whites into the mixture" brings in nothing when a step before beat
 * them, so `matchStepIngredients` keeps a line's first mention only — unless
 * the line itself says it is used more than once ("divided", "plus 1
 * tablespoon", "more for serving"). Each option of a set of alternatives
 * (45e) starts from what the steps before the set brought in.
 * `matchStepMentions` is every mention, for the form's "is every line
 * named?" check.
 *
 * All of that is a guess, and a step may say otherwise (47f): its stored
 * `uses` — ingredient names — replaces the guess for that step. `stepUses`
 * is the one answer the recipe page, the cook view and the form read.
 *
 * Pure, and safe in the browser; the recipe page runs it on the server.
 */
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "../controller/types";
import { detectHeading } from "./detectHeading";
import {
  DERIVED_FORMS,
  isGenericHead,
  parseIngredientLine,
  stripMarkup,
  toName,
  withoutCanned,
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
  /** A compound's last word, usable when no other line has it (`BARE_COMPOUNDS`). */
  bareHeads: string[];
  /** Whether the line says it is used more than once ("divided"). */
  repeats: boolean;
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

/**
 * Compounds a step names by their last word alone: "the milk and cream" is
 * the heavy cream, "the yolks" the egg yolks. Such a word stands for the
 * line only when no other line has it in a name at all — `sour cream` and
 * `cream cheese` beside `heavy cream` leave a bare "cream" to nobody.
 */
const BARE_COMPOUNDS: Record<string, string> = {
  "heavy cream": "cream",
  "egg yolk": "yolk",
};

/** The bare words a line's one-word compound names go by. */
function bareHeadsOf(names: string[][]): string[] {
  return [
    ...new Set(
      names
        .filter((words) => words.length === 1)
        .map(([word]) => BARE_COMPOUNDS[word])
        .filter((bare): bare is string => Boolean(bare)),
    ),
  ];
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

/**
 * A line that says it goes in more than once: every mention of it is a use.
 * "1/3 cup sugar, plus 1 tablespoon", "butter, divided", "nutmeg, plus more
 * for serving", "parsley, for garnish".
 */
const REPEATS =
  /\b(?:divided|separated|plus|more for|for (?:serving|garnish|garnishing|dusting|sprinkling|topping|the top|finishing|rolling|greasing|brushing|drizzling))\b/i;

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
        /* A step says "the tomato sauce", not "the canned tomato sauce" (43n). */
        add(withoutCanned(alternative).words);
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
    out.push({
      index,
      names,
      heads,
      bareHeads: bareHeadsOf(names),
      repeats: REPEATS.test(readable),
      section,
    });
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
  /* A bare compound head is anyone's whose name has the word at all, joined
   * compounds included: `sour cream` is one word that still says "cream". */
  const wordElsewhere = (line: LineNames, word: string) =>
    competitors(line, (other) =>
      other.names.some((theirs) =>
        theirs.some((theirWord) => theirWord.split(" ").includes(word)),
      ),
    );
  for (const line of lines) {
    for (const words of line.names) {
      record(line, words, !containedElsewhere(line, words));
    }
    for (const head of line.heads) {
      record(line, [head], !containedElsewhere(line, [head]));
    }
    for (const bare of line.bareHeads) {
      record(line, [bare], !wordElsewhere(line, bare));
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

/** For each step of each entry, every ingredient line it names (D3). */
export function matchStepMentions(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
): StepLines {
  const lines = lineNames(ingredients);
  const sections = new Set(lines.map((line) => line.section).filter(Boolean));
  const texts = entryTexts(instructions);
  return instructions.map((entry, i) => {
    const groupKey = stepSection(entry);
    const scope = sections.has(groupKey) ? groupKey : "";
    return texts[i].map((text) => matchStep(text, lines, scope));
  });
}

/** A group's set of alternatives, as a key; "" for an ordinary entry. */
function choiceKey(entry: InstructionEntry): string {
  return "instructions" in entry && typeof entry.choice === "string"
    ? entry.choice.trim().toLowerCase()
    : "";
}

/** Each entry's steps: the entry itself, or a group's own. */
function entrySteps(entry: InstructionEntry): readonly Instruction[] {
  return "instructions" in entry ? (entry.instructions ?? []) : [entry];
}

/** The section a group's steps are read in: its name as a `sectionKey`. */
export function stepSection(entry: InstructionEntry | undefined): string {
  return entry && "instructions" in entry && entry.name
    ? sectionKey(entry.name)
    : "";
}

/** A line as a stored name may spell it out whole: folded, spaces single. */
function wholeLine(text: string): string {
  return stripMarkup(text).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The line a stored name means (47f), or `undefined` when no line goes by
 * it. Tried in order, the first kind with a candidate deciding: the line
 * written out whole, one of a line's names, a head or a bare compound's
 * word. Among several candidates, the one under the step's section
 * (`section`, a `sectionKey`), else the first.
 */
function resolveName(
  entry: string,
  ingredients: readonly Ingredient[],
  lines: readonly LineNames[],
  section: string,
): number | undefined {
  const pick = (candidates: LineNames[]) =>
    (
      (section && candidates.find((line) => line.section === section)) ||
      candidates[0]
    )?.index;
  const whole = wholeLine(entry);
  if (!whole) return undefined;
  const written = lines.filter(
    (line) => wholeLine(ingredients[line.index].ingredient ?? "") === whole,
  );
  if (written.length) return pick(written);
  const name = toName(entry).words.join(" ");
  if (!name) return undefined;
  const named = lines.filter((line) =>
    line.names.some((words) => words.join(" ") === name),
  );
  if (named.length) return pick(named);
  return pick(
    lines.filter(
      (line) => line.heads.includes(name) || line.bareHeads.includes(name),
    ),
  );
}

/** The line a stored name means in a step of `section` (`resolveName`). */
export function usesLine(
  ingredients: readonly Ingredient[],
  name: string,
  section = "",
): number | undefined {
  return resolveName(name, ingredients, lineNames(ingredients), section);
}

/**
 * The name to store for a line in a step's `uses` (47f): the short name
 * (`label`, the form's chip) when it finds its way back to the line, else
 * another of the line's names that does, else the line written out whole —
 * the second of two butter lines is not "butter".
 */
export function usesName(
  ingredients: readonly Ingredient[],
  index: number,
  label: string,
  section = "",
): string {
  const lines = lineNames(ingredients);
  const own = lines.find((line) => line.index === index);
  const candidates = [
    label,
    ...(own?.names ?? []).map((words) => words.join(" ")),
  ];
  for (const candidate of candidates) {
    if (resolveName(candidate, ingredients, lines, section) === index) {
      return candidate;
    }
  }
  return stripMarkup(ingredients[index]?.ingredient ?? "").trim();
}

/** What `resolveStepUses` knows about every step, entry → step. */
export interface ResolvedStepUses {
  /** The lines each step brings in: its stored `uses`, else the guess. */
  lines: StepLines;
  /** Every line each step names, in its text or in its stored `uses`. */
  mentions: StepLines;
  /** Whether the step's list is a stored one. */
  stored: boolean[][];
  /** The stored names no ingredient line goes by, as written. */
  unresolved: string[][][];
}

/**
 * For each step of each entry, the ingredient lines it brings in. A step
 * with a stored `uses` (47f) lists exactly those lines, in that order — none
 * for an empty list; a name no line goes by is reported and skipped, never
 * thrown. Any other step lists the guess: a line's first mention, and every
 * mention of a line that says it is used more than once, where a stored list
 * stands for its step's mentions. The options of one set of alternatives
 * are parallel, so each starts from what came before the set.
 */
export function resolveStepUses(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
  { guessOnly = false }: { guessOnly?: boolean } = {},
): ResolvedStepUses {
  const names = lineNames(ingredients);
  const textMentions = matchStepMentions(ingredients, instructions);
  const repeats = new Set(
    names.filter((line) => line.repeats).map((line) => line.index),
  );
  const unresolved: string[][][] = [];
  const set: (number[] | undefined)[][] = instructions.map((entry, i) => {
    const section = stepSection(entry);
    unresolved.push([]);
    return entrySteps(entry).map((step) => {
      const missing: string[] = [];
      unresolved[i].push(missing);
      if (guessOnly || !Array.isArray(step?.uses)) return undefined;
      const lines: number[] = [];
      for (const name of step.uses) {
        if (typeof name !== "string" || !name.trim()) continue;
        const line = resolveName(name, ingredients, names, section);
        if (line === undefined) missing.push(name);
        else if (!lines.includes(line)) lines.push(line);
      }
      return lines;
    });
  });
  /* Lines brought in so far; inside a set, `before` is the state at its
   * start and `inSet` what any of its options brought in. */
  let seen = new Set<number>();
  let before = seen;
  let inSet = new Set<number>();
  let setKey = "";
  const lines = textMentions.map((steps, i) => {
    const key = choiceKey(instructions[i]);
    if (key !== setKey) {
      if (setKey) seen = new Set([...before, ...inSet]);
      setKey = key;
      before = seen;
      inSet = new Set();
    }
    if (key) seen = new Set(before);
    const out = steps.map((mentioned, j) => {
      const stored = set[i][j];
      if (stored) {
        for (const line of stored) seen.add(line);
        return stored;
      }
      return mentioned.filter((line) => {
        if (repeats.has(line)) return true;
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
    });
    if (key) for (const line of seen) inSet.add(line);
    return out;
  });
  return {
    lines,
    mentions: textMentions.map((steps, i) =>
      steps.map((mentioned, j) => [
        ...new Set([...mentioned, ...(set[i][j] ?? [])]),
      ]),
    ),
    stored: set.map((steps) => steps.map((step) => step !== undefined)),
    unresolved,
  };
}

/**
 * What each step brings in: its stored `uses`, else the guess. The one
 * answer for the recipe page, the cook view and the form.
 */
export function stepUses(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
): StepLines {
  return resolveStepUses(ingredients, instructions).lines;
}

/** The guess alone, whatever the steps store (`stepUses` is the answer). */
export function matchStepIngredients(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
): StepLines {
  return resolveStepUses(ingredients, instructions, { guessOnly: true }).lines;
}

export { stepNumbers } from "./stepNumbers";
