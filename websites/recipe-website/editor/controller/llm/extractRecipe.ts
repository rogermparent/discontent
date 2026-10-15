/**
 * A recipe out of plain text by a local model (epic 36: D4, D7, D8).
 *
 * One prompt and one schema serve every input: a page's text (`pageText`,
 * D6), a video's title and description, and pasted text (D8). The model
 * copies lines; this module checks that it did (the grounding guard, D4) and
 * maps the answer onto `Partial<ImportedRecipe>` with the importer's own
 * `createIngredient` and `InstructionGroup` shape (D7), so everything after
 * it — `importedToInput`, drafts, dry runs, the form — is unchanged.
 *
 * What the model is trusted with is decided here, not by the caller: unless
 * at least `GROUNDED_MIN` of its ingredient lines are found in the source and
 * it returned at least one ingredient and one step, the result stays
 * `partial`, and 26-D3's `allowPartial` gate still means "not trustworthy".
 */
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import { capText } from "recipe-website-common/util/pageText";
import {
  createIngredient,
  normalizeIngredientText,
} from "recipe-website-common/util/parseIngredients";
import {
  buildSource,
  isVideoUrl,
  type ImportedRecipe,
} from "recipe-website-common/util/importRecipeData";
import { chatJson, type LlmConfig } from "./client";
import { jobContext, type JobRun } from "../jobs/context";
import type { StepData, StepHandle } from "../jobs/log";

/* ------------------------------------------------------------------ */
/* Prompt and schema (D7, D8)                                          */
/* ------------------------------------------------------------------ */

/**
 * What the model returns. Times are copied as the text writes them ("3 hours,
 * 45 minutes") and converted here (`parseTimeText`): asked for whole minutes,
 * qwen3:8b turned Sally's "3 hours, 45 minutes" into 234 — the arithmetic,
 * not the reading, is what a small model gets wrong (36a). Only `found`, `name`,
 * `ingredients` and `instructions` are required, so a constrained decoder can
 * leave a time or a yield out instead of being made to guess one.
 *
 * Instructions are flat lines, sections as "Name:" lines, the same as
 * ingredients. D7's nested `[{section?, steps}]` let qwen3:8b close the list
 * empty on a long Sally's card (Star Bread: 10 ingredients, 0 steps); the
 * flat list read all nine (36a).
 */
export const LLM_RECIPE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    name: { type: "string" },
    description: { type: "string" },
    recipeYield: { type: "string" },
    prepTime: { type: "string" },
    cookTime: { type: "string" },
    totalTime: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    instructions: { type: "array", items: { type: "string" } },
  },
  required: ["found", "name", "ingredients", "instructions"],
} as const;

export const LLM_RECIPE_SCHEMA_NAME = "recipe";

export const LLM_RECIPE_SYSTEM_PROMPT = `You extract one recipe from text and return it as JSON.

The text may be a web page, a video description, an email or a note. Find the recipe in it: its ingredient list and its instructions.

Copy, never write:
- Copy every ingredient line and every instruction step exactly as the text has it: the same words, amounts and units, in the same order. Do not convert, round, translate, summarise, reword or correct anything.
- One ingredient per entry, as the text lists them. A line with two measures stays one line, e.g. "500g (4 cups) bread flour" or "1 cup (120g) flour".
- Never add an ingredient, an amount or a step that is not in the text. If a line has no amount, leave it without one.
- Leave out list bullets and step numbers ("1.", "Step 2:"), but keep the rest of the line as written.
- Copy the whole ingredient list, every line of it, including lines whose amount is approximate ("handful", "about 2") or a range ("5-8g", "100-150g"). Do not skip a line.

Sections:
- When the ingredients come in parts (e.g. "Dough", "Sauce", "For the filling"), put each part's heading in "ingredients" as its own entry ending with a colon, e.g. "Dough:", directly before that part's lines.
- When the instructions come in parts, put each part's heading in "instructions" as its own entry ending with a colon, directly before that part's steps.
- Instructions are often a plain paragraph with no heading and no numbers, e.g. right after the ingredient list. That paragraph is the method: split it into steps at sentence boundaries without changing the words.

Ignore everything that is not the recipe:
- links and URLs, sponsor messages, discount codes, merch, Patreon and membership plugs;
- affiliate links, "my gear" and equipment lists, shopping links;
- chapter lists and timestamps (like "4:45 Boiling the pasta");
- social media handles, "subscribe", music credits, comments, ratings, navigation, nutrition facts;
- other recipes that are only mentioned or linked.

Other fields:
- "name": the recipe's name.
- "description": one or two sentences from the text that describe the dish, or leave it out.
- "recipeYield": the yield as the text says it ("12 cookies", "Serves 4"), only if it says one. A yield or servings line ("Serving: 1", "Makes 5 dozen") goes here, never in "ingredients".
- "prepTime", "cookTime", "totalTime": copied as the text labels them ("25 minutes", "3 hours, 45 minutes"), only when the text states that time. Never estimate or add up a time.

If the text has no recipe — no ingredient list or no instructions — return "found": false with an empty "name", "ingredients" and "instructions".`;

/** What the caller knows about the source besides its text. */
export interface ExtractMeta {
  /** The page's or video's title. */
  title?: string;
  /** `og:site_name`, or the channel for a video. */
  siteName?: string;
  author?: string;
}

/** The user message: where the text is from, then the text itself. */
export function buildRecipeUserPrompt({
  text,
  url,
  meta,
}: {
  text: string;
  url?: string;
  meta?: ExtractMeta;
}): string {
  const header = [
    url && `Source URL: ${url}`,
    meta?.title && `Title: ${meta.title}`,
    meta?.siteName && `Site: ${meta.siteName}`,
  ].filter(Boolean);
  return [
    "Extract the recipe from this text.",
    ...header,
    "",
    "--- TEXT ---",
    text,
    "--- END OF TEXT ---",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Grounding (D4)                                                       */
/* ------------------------------------------------------------------ */

/** At least this share of ingredient lines must be found in the source. */
export const GROUNDED_MIN = 0.9;

/**
 * A line is found in a source line when at least this share of its words
 * are in that one line (and every number is, `isGrounded`).
 */
export const TOKEN_MATCH_MIN = 0.8;

/**
 * A line as grounding compares it: bullets gone, unicode fractions as `1/2`
 * (`normalizeIngredientText`), accents and case folded, punctuation dropped
 * (the slash of a fraction kept), whitespace collapsed.
 */
export function normaliseForGrounding(text: string): string {
  return normalizeIngredientText(text)
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
    .replace(/[^\p{L}\p{N}/]+/gu, " ")
    .replace(/(^|\s)\/+|\/+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Words a heading adds without changing what it names ("For the filling:"
 * for "Filling"): left out of the word share, never out of the numbers.
 */
const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "of",
  "or",
  "the",
  "to",
  "with",
]);

/** The words that say something: `FILLER_WORDS` out, unless that is all. */
function contentWords(words: string[]): string[] {
  const content = words.filter((word) => !FILLER_WORDS.has(word));
  return content.length > 0 ? content : words;
}

/** The numbers in a normalised line: `1`, `1/2`, `125` out of `125g`. */
function numbersOf(words: string[]): string[] {
  return words.flatMap((word) => word.match(/\d+(?:\/\d+)?/g) ?? []);
}

/** One normalised source line. */
export interface SourceLine {
  /** The line as the source has it, trimmed. */
  raw: string;
  /** `normaliseForGrounding(raw)`, space-padded for whole-word `includes`. */
  padded: string;
  words: string[];
  wordSet: Set<string>;
  numbers: Set<string>;
  /** `words` without `FILLER_WORDS` (all of them, if that leaves none). */
  content: string[];
}

/** The source, split and normalised once, for any number of checks. */
export interface GroundingSource {
  lines: SourceLine[];
}

function sourceLine(raw: string): SourceLine {
  const norm = normaliseForGrounding(raw);
  const words = norm ? norm.split(" ") : [];
  return {
    raw: raw.trim(),
    padded: ` ${norm} `,
    words,
    wordSet: new Set(words),
    numbers: new Set(numbersOf(words)),
    content: contentWords(words),
  };
}

export function groundingSource(text: string): GroundingSource {
  return { lines: text.split("\n").map(sourceLine) };
}

export type Grounding = "verbatim" | "found" | "missing";

/**
 * Where a line stands against the source, line by line — never against the
 * whole page, where "3 cups flour" would find its 3 in "3 eggs" (36a
 * review):
 *
 * - `verbatim`: once normalised, a run of whole words of one source line;
 * - `found`: one source line holds every number of it and at least
 *   `TOKEN_MATCH_MIN` of its words (filler words like "for the" aside);
 * - `missing`: neither. A line with no words left counts as `verbatim`.
 */
export function groundLine(line: string, source: GroundingSource): Grounding {
  const norm = normaliseForGrounding(line);
  if (!norm) return "verbatim";
  const padded = ` ${norm} `;
  const words = norm.split(" ");
  const numbers = numbersOf(words);
  const content = words.filter((word) => !FILLER_WORDS.has(word));
  const counted = content.length > 0 ? content : words;
  let found = false;
  for (const candidate of source.lines) {
    if (candidate.words.length === 0) continue;
    if (candidate.padded.includes(padded)) return "verbatim";
    if (found) continue;
    if (!numbers.every((number) => candidate.numbers.has(number))) continue;
    const share =
      counted.filter((word) => candidate.wordSet.has(word)).length /
      counted.length;
    if (share >= TOKEN_MATCH_MIN) found = true;
  }
  return found ? "found" : "missing";
}

/** `groundLine(line, source) !== "missing"`. */
export function isGrounded(line: string, source: GroundingSource): boolean {
  return groundLine(line, source) !== "missing";
}

/* ------------------------------------------------------------------ */
/* Skipped lines                                                       */
/* ------------------------------------------------------------------ */

/** Word-multiset Dice similarity of two normalised lines. */
function dice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  return (2 * shared(left, right)) / (left.length + right.length);
}

/** How many words two lines share, counting repeats. */
function shared(left: string[], right: string[]): number {
  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);
  let count = 0;
  for (const word of left) {
    const remaining = pool.get(word) ?? 0;
    if (remaining > 0) {
      count += 1;
      pool.set(word, remaining - 1);
    }
  }
  return count;
}

/** A position match needs the shorter line to cover this much of the longer. */
const POSITION_MATCH_MIN = 0.75;

/** A heading only maps to a source line this short. */
const HEADING_SOURCE_MAX_WORDS = 6;

/**
 * How well a copied line matches one source line, for finding where it came
 * from: shared whole words over the *longer* line's words, so "For the
 * dough:" does not sit on "1 cup water for the dough" and a lone "4" does
 * not sit on "1/4 tsp salt". Every number of the line must be in the source
 * line; a heading only matches a short line. 0 when it does not match.
 */
function positionScore(
  words: string[],
  numbers: string[],
  heading: boolean,
  candidate: SourceLine,
): number {
  if (candidate.words.length === 0) return 0;
  if (heading && candidate.words.length > HEADING_SOURCE_MAX_WORDS) return 0;
  if (!numbers.every((number) => candidate.numbers.has(number))) return 0;
  const score =
    shared(words, candidate.content) /
    Math.max(words.length, candidate.content.length);
  return score >= POSITION_MATCH_MIN ? score : 0;
}

/**
 * The source line each copied line came from (or -1): the best score, and
 * on a tie the first line after the previous match — a list is copied in
 * order, so the earliest line on the page is not the likeliest.
 */
export function sourcePositions(
  lines: string[],
  text: string | SourceLine[],
): number[] {
  const source =
    typeof text === "string" ? text.split("\n").map(sourceLine) : text;
  const used = new Set<number>();
  let previous = -1;
  return lines.map((line) => {
    const all = normaliseForGrounding(line).split(" ").filter(Boolean);
    if (all.length === 0) return -1;
    const words = contentWords(all);
    const numbers = numbersOf(all);
    const heading = /:\s*$/.test(line);
    let best = -1;
    let bestScore = 0;
    let bestAfter = false;
    source.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = positionScore(words, numbers, heading, candidate);
      if (score === 0) return;
      const after = index > previous;
      if (score > bestScore || (score === bestScore && after && !bestAfter)) {
        best = index;
        bestScore = score;
        bestAfter = after;
      }
    });
    if (best >= 0) {
      used.add(best);
      previous = best;
    }
    return best;
  });
}

/** "Instructions", "Directions", "Method"… as a label line of its own. */
const INSTRUCTIONS_LABEL_LINE =
  /^(instructions?|directions?|method|preparation|steps|how to make( it)?)$/;

/** Fill a gap of at most this many non-blank source lines, no wider. */
export const MAX_FILL_GAP = 4;

/**
 * A source line that reads as an ingredient: it starts (after a bullet) with
 * an amount, and is not a numbered step, a timestamp, a time ("10 minutes
 * later…"), a link, a promotion (`%`, "code"), a temperature, or a sentence.
 */
function looksLikeIngredient(raw: string): boolean {
  const text = raw.replace(/^[\s*•▪-]+/, "");
  return (
    /^(\d|[¼-¾⅐-⅞])/.test(text) &&
    !/^\d{1,2}\s*[.)]\s/.test(text) &&
    !/^\d{1,2}:\d{2}/.test(text) &&
    !/^[\d\s/.,–-]+\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\b/i.test(
      text,
    ) &&
    !/https?:|www\.|%|°|\bcode\b/i.test(text) &&
    !/[.!?]$/.test(text) &&
    !/[.!?]\s+\p{Lu}/u.test(text) &&
    text.length <= 120
  );
}

/**
 * The model's ingredient lines, with any it skipped put back (36a).
 *
 * qwen3:8b sometimes leaves lines out of the middle of a list — four of
 * Brian Lagerstrom's sixteen drunken-noodle lines ("75g (about 2 med-lrg)
 * shallot…", "15g (handful) scallion…") — and grounding cannot see an
 * omission. So each copied line is placed in the source (`sourcePositions`)
 * and, between two consecutive placed lines, a *small* gap (at most
 * `MAX_FILL_GAP` non-blank lines, no "Instructions" label inside) gives back
 * its ingredient-looking lines (`looksLikeIngredient`), verbatim, in source
 * order. A model line placed nowhere between the two that shares half its
 * words with one of them is a garbled copy ("1 cup desicc thaned coconut")
 * and is replaced by it. Nothing is added outside the copied list.
 *
 * What is put back never counts toward grounding (`extractRecipeWithLlm`
 * grounds the model's own lines): it is reported as `added`.
 */
export function fillSkippedLines(
  lines: string[],
  source: string,
): { lines: string[]; added: string[] } {
  const sourceLines = source.split("\n").map(sourceLine);
  const positions = sourcePositions(lines, sourceLines);
  const placed = positions
    .map((position, at) => ({ position, at }))
    .filter(({ position }) => position >= 0);
  if (placed.length < 2) return { lines, added: [] };

  const result: string[] = [];
  const added: string[] = [];
  let next = 0;
  const words = (line: string) =>
    normaliseForGrounding(line).split(" ").filter(Boolean);

  for (let pair = 0; pair + 1 < placed.length; pair += 1) {
    const from = placed[pair];
    const to = placed[pair + 1];
    /* Copy the model's lines up to and including `from`. */
    while (next <= from.at) result.push(lines[next++]);
    if (to.position <= from.position + 1) continue;

    const gap = sourceLines
      .slice(from.position + 1, to.position)
      .filter((line) => line.words.length > 0);
    if (
      gap.length === 0 ||
      gap.length > MAX_FILL_GAP ||
      gap.some((line) => INSTRUCTIONS_LABEL_LINE.test(line.words.join(" ")))
    ) {
      continue;
    }
    const candidates = gap
      .filter((line) => looksLikeIngredient(line.raw))
      .map((line) => line.raw.replace(/^[\s*•▪-]+/, "").trim());
    if (candidates.length === 0) continue;

    /* The model's unplaced lines between the two: garbled copies, if alike. */
    const between: string[] = [];
    while (next < to.at) between.push(lines[next++]);
    const garbled = new Set<number>();
    for (const candidate of candidates) {
      const twin = between.findIndex(
        (line, at) =>
          !garbled.has(at) && dice(words(line), words(candidate)) >= 0.5,
      );
      if (twin >= 0) garbled.add(twin);
    }
    result.push(...between.filter((_, at) => !garbled.has(at)));
    result.push(...candidates);
    added.push(...candidates);
  }
  while (next < lines.length) result.push(lines[next++]);
  return { lines: result, added };
}

/* ------------------------------------------------------------------ */
/* The answer                                                          */
/* ------------------------------------------------------------------ */

/** The model's answer, read defensively: it is JSON, not yet this shape. */
export interface LlmRecipeAnswer {
  found: boolean;
  name?: string;
  description?: string;
  recipeYield?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  ingredients: string[];
  instructions: { section?: string; steps: string[] }[];
}

function text(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((line): line is string => !!line);
}

const MINUTES_PER: Record<string, number> = {
  d: 1440,
  h: 60,
  m: 1,
  s: 1 / 60,
};

/** A number as a time writes it: `1 1/2`, `1/2`, `1.5`, `2`. */
const NUMBER = "(\\d+ \\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";

/** A number as written: `2`, `1.5`, `1/2`, `1 1/2` (fractions already ascii). */
function amount(text: string): number {
  const [whole, fraction] = text.includes("/")
    ? text.includes(" ")
      ? text.split(" ")
      : ["0", text]
    : [text, undefined];
  const value = Number(whole);
  if (!fraction) return value;
  const [top, bottom] = fraction.split("/").map(Number);
  return value + top / bottom;
}

/**
 * A time as a recipe writes it, in whole minutes: "25 minutes", "1 hour 15
 * mins", "3 hours, 45 minutes", "1 1/2 hours", "1h30m", "an hour", "half an
 * hour", "an hour and a half", "1 hour 30", "90 seconds", "1 day"; a range
 * ("17–18 minutes", "1 1/2 to 2 hours") reads as its upper end; a bare
 * number is minutes. `undefined` for nothing positive under a week — "0
 * minutes", "overnight", "varies".
 */
export function parseTimeText(value: unknown): number | undefined {
  let total: number | undefined;
  if (typeof value === "number") {
    total = value;
  } else if (typeof value === "string") {
    const text = normalizeIngredientText(value)
      .toLowerCase()
      .replace(/\bhalf\s+(an?\s+)?(hour|hr)\b/g, "30 minutes")
      .replace(/\b(hours?|hrs?)\s+and\s+a\s+half\b/g, "$1 30 minutes")
      .replace(
        /\b(an?|one)\s+(?=(day|hour|hr|minute|min|second|sec)s?\b)/g,
        "1 ",
      )
      /* A range reads as its upper end: drop "1 1/2 to " from "1 1/2 to 2 hours". */
      .replace(
        new RegExp(
          `(?<![\\d/.])${NUMBER}\\s*(?:-|–|—|to)\\s*(?=\\d+(?:[./]\\d+)?\\s*[a-z])`,
          "g",
        ),
        "",
      )
      /* "1 hour 30": the number after hours is minutes. */
      .replace(/\b(h|hrs?|hours?)\s*,?\s*(\d+)\s*$/, "$1 $2 minutes");
    const units = [
      ...text.matchAll(
        new RegExp(
          `${NUMBER}\\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|secs?|seconds?)(?![a-z])`,
          "g",
        ),
      ),
    ];
    if (units.length > 0) {
      total = units.reduce(
        (sum, [, number, unit]) => sum + amount(number) * MINUTES_PER[unit[0]],
        0,
      );
    } else if (/^\d+(?:\.\d+)?$/.test(text.trim())) {
      total = Number(text.trim());
    }
  }
  if (total === undefined || !Number.isFinite(total)) return undefined;
  const rounded = Math.round(total);
  return rounded > 0 && rounded < 7 * 24 * 60 ? rounded : undefined;
}

/** An instruction line that names a section: short, ending in a colon. */
const SECTION_LINE = /^[^.!?]{1,60}:$/;

export function readLlmAnswer(data: unknown): LlmRecipeAnswer {
  const record = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  /*
   * Flat lines, a heading ("For the sauce:") opening a section — the shape
   * the schema asks for. A `{section, steps}` object (D7's first shape) is
   * still read, should a model or a test send one.
   */
  const instructions: LlmRecipeAnswer["instructions"] = [];
  let current: LlmRecipeAnswer["instructions"][number] | undefined;
  for (const entry of Array.isArray(record.instructions)
    ? record.instructions
    : []) {
    if (entry && typeof entry === "object") {
      const { section, steps } = entry as Record<string, unknown>;
      current = undefined;
      instructions.push({ section: text(section), steps: lines(steps) });
      continue;
    }
    const line = text(entry);
    if (!line) continue;
    if (SECTION_LINE.test(line)) {
      current = { section: line, steps: [] };
      instructions.push(current);
    } else {
      if (!current) {
        current = { steps: [] };
        instructions.push(current);
      }
      current.steps.push(line);
    }
  }
  return {
    found: record.found !== false,
    name: text(record.name),
    description: text(record.description),
    recipeYield: text(record.recipeYield),
    prepMinutes: parseTimeText(record.prepTime),
    cookMinutes: parseTimeText(record.cookTime),
    totalMinutes: parseTimeText(record.totalTime),
    ingredients: lines(record.ingredients),
    instructions,
  };
}

/** "Ingredients:", "Instructions" — a label the model echoed, not content. */
const BARE_LABEL =
  /^(ingredients?|instructions?|directions?|method|steps|recipe)\s*:?$/i;

/**
 * A markdown heading the model copied from the page text ("#### Cream Cheese
 * Frosting") as the heading line `createIngredient` detects ("Cream Cheese
 * Frosting:").
 */
function markdownHeading(line: string): string {
  const match = /^#{1,6}\s+(.+)$/.exec(line);
  if (!match) return line;
  const text = match[1].trim();
  return text.endsWith(":") ? text : `${text}:`;
}

/** `1.`, `2)`, `Step 3:`, a bullet (`•`, `-`, `*`) at a step's start. */
const STEP_NUMBER = /^(step\s*\d+\s*[:.)-]?|\d{1,2}\s*[.)]|[•▪*-])\s+/i;

function cleanStep(step: string): string {
  return step.replace(STEP_NUMBER, "").trim();
}

function instructionEntries(
  groups: LlmRecipeAnswer["instructions"],
): InstructionEntry[] {
  const entries: InstructionEntry[] = [];
  for (const { section, steps } of groups) {
    const instructions: Instruction[] = steps
      .map(cleanStep)
      .filter((step) => step && !BARE_LABEL.test(step))
      .map((step) => ({ text: step }));
    if (instructions.length === 0) continue;
    const name = section?.replace(/:\s*$/, "").trim();
    if (name && !BARE_LABEL.test(name)) {
      entries.push({ name, instructions });
    } else {
      entries.push(...instructions);
    }
  }
  return entries;
}

function stepCount(entries: InstructionEntry[]): number {
  return entries.reduce(
    (total, entry) =>
      total + ("instructions" in entry ? entry.instructions.length : 1),
    0,
  );
}

/**
 * A line that is a link, a chapter timestamp or a social handle — never a
 * recipe's name (36c review: a pasted description often opens with one).
 */
const NOT_A_NAME = /https?:\/\/|^\d{1,2}:\d{2}|(^|\s)@\w/i;

/**
 * The first line of the text that reads as a title, for a nameless answer;
 * `undefined` when none does (the caller then asks for `--name`).
 */
export function firstLine(source: string): string | undefined {
  for (const line of source.split("\n")) {
    const cleaned = line.replace(/^[#>*\-\s]+/, "").trim();
    if (!cleaned || NOT_A_NAME.test(cleaned)) continue;
    return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The extractor                                                       */
/* ------------------------------------------------------------------ */

export interface LlmStats {
  model: string;
  /**
   * The model's own ingredient lines (headings included) found in the
   * source (`grounding`), out of `total` — lines `added` back are not in
   * either count.
   */
  grounded: number;
  total: number;
  /** How many of `grounded` were found word for word. */
  verbatim: number;
  /** The lines that were not found, for a person to check (at most 10). */
  ungrounded?: string[];
  /** Source lines the model skipped inside its ingredient list, put back. */
  added?: string[];
  /** Wall time of the model call. */
  durationMs: number;
}

export type LlmExtraction =
  | {
      found: true;
      recipe: Partial<ImportedRecipe>;
      llm: LlmStats;
      warnings: string[];
    }
  | {
      found: false;
      llm: Pick<LlmStats, "model" | "durationMs">;
    };

export interface ExtractRecipeInput {
  /** The source: page text (`pageText`), a video description, pasted text. */
  text: string;
  /** Where it came from; `source` (and `video`, for a video) when given. */
  url?: string;
  meta?: ExtractMeta;
  /** How the warning names the source: "the page" or "the text". */
  sourceKind?: "page" | "text";
  /**
   * What the text is, when it is more than "the text": "the video's
   * description and pinned comment" (36d). The warning names it.
   */
  sourceLabel?: string;
  /** Defaults to `llmConfig()`; unset throws `LlmError("unconfigured")`. */
  config?: LlmConfig;
  timeoutMs?: number;
  numCtx?: number;
  /** The caller's abort; default the job's. */
  signal?: AbortSignal;
  /** The job (epic 37): the reading is an `llm.extract` step. */
  job?: JobRun;
  /** What the step says it reads: a slice's `part` ("2/4") and `name`. */
  stepData?: StepData;
}

/**
 * Ask the model for the recipe in `text`, check its ingredient lines against
 * `text` (D4), and map the answer (D7).
 *
 * `{found: false}` when the model says there is no recipe, or returns no
 * ingredients and no steps. Otherwise the recipe — `partial` unless it is
 * grounded, with at least one ingredient and one step. Model failures throw
 * `LlmError` (`client.ts`).
 *
 * In a job (epic 37) the call and its grounding are one `llm.extract` step:
 * the text's length in, the model's numbers (`chatJson`) and the grounded
 * count out.
 */
export function extractRecipeWithLlm(
  input: ExtractRecipeInput,
): Promise<LlmExtraction> {
  const { stepData } = input;
  return jobContext(input.job).log.step(
    "llm.extract",
    { ...stepData, chars: input.text.length },
    async (step) => {
      const extraction = await readRecipe(input, step);
      if (extraction.found) {
        const { grounded, total, verbatim, added } = extraction.llm;
        step.set({
          found: true,
          grounded,
          total,
          verbatim,
          ...(added?.length ? { added: added.length } : {}),
          ...recipeCounts(extraction.recipe),
        });
      } else {
        step.set({ found: false });
      }
      return extraction;
    },
  );
}

function recipeCounts(recipe: Partial<ImportedRecipe>) {
  return {
    ingredients: (recipe.ingredients ?? []).filter(
      (entry) => entry.type !== "heading",
    ).length,
    steps: stepCount(recipe.instructions ?? []),
  };
}

async function readRecipe(
  input: ExtractRecipeInput,
  step: StepHandle,
): Promise<LlmExtraction> {
  const { text: source } = capText(input.text);
  const result = await chatJson({
    step,
    system: LLM_RECIPE_SYSTEM_PROMPT,
    user: buildRecipeUserPrompt({
      text: source,
      url: input.url,
      meta: input.meta,
    }),
    schema: LLM_RECIPE_SCHEMA,
    schemaName: LLM_RECIPE_SCHEMA_NAME,
    config: input.config,
    timeoutMs: input.timeoutMs,
    numCtx: input.numCtx,
    signal: input.signal,
    job: input.job,
  });
  const answer = readLlmAnswer(result.data);

  const modelLines = answer.ingredients
    .map(markdownHeading)
    .filter((line) => !BARE_LABEL.test(line));
  /*
   * Grounding is the model's own lines, before `fillSkippedLines`: what it
   * puts back is source text by construction, and counting it would let a
   * 4-line answer with 2 invented lines read 20/22 (36a review).
   */
  const grounding = groundingSource(source);
  const graded = modelLines.map((line) => ({
    line,
    grade: groundLine(line, grounding),
  }));
  const ungrounded = graded
    .filter(({ grade }) => grade === "missing")
    .map(({ line }) => line);
  const total = modelLines.length;
  const grounded = total - ungrounded.length;
  const verbatim = graded.filter(({ grade }) => grade === "verbatim").length;

  const { lines: ingredientLines, added } = fillSkippedLines(
    modelLines,
    source,
  );
  const ingredients = ingredientLines
    .map(createIngredient)
    .filter((entry): entry is Ingredient => !!entry);
  const instructions = instructionEntries(answer.instructions);
  const steps = stepCount(instructions);
  const items = ingredients.filter((entry) => entry.type !== "heading").length;

  if (!answer.found || (items === 0 && steps === 0)) {
    return {
      found: false,
      llm: { model: result.model, durationMs: result.durationMs },
    };
  }

  const trusted =
    items > 0 && steps > 0 && total > 0 && grounded / total >= GROUNDED_MIN;

  const llm: LlmStats = {
    model: result.model,
    grounded,
    total,
    verbatim,
    ...(ungrounded.length > 0 ? { ungrounded: ungrounded.slice(0, 10) } : {}),
    ...(added.length > 0 ? { added } : {}),
    durationMs: result.durationMs,
  };

  const recipe: Partial<ImportedRecipe> = {
    name: answer.name ?? input.meta?.title ?? firstLine(source),
    ...(answer.description ? { description: answer.description } : {}),
    ...(answer.recipeYield ? { recipeYield: answer.recipeYield } : {}),
    /* Only the times it has: a caller merging this over a schema keeps its own. */
    ...(answer.prepMinutes !== undefined
      ? { prepTime: answer.prepMinutes }
      : {}),
    ...(answer.cookMinutes !== undefined
      ? { cookTime: answer.cookMinutes }
      : {}),
    ...(answer.totalMinutes !== undefined
      ? { totalTime: answer.totalMinutes }
      : {}),
    ingredients,
    instructions,
    ...(input.url
      ? {
          source: buildSource(
            input.url,
            undefined,
            input.meta?.author,
            input.meta?.siteName,
          ),
          ...(isVideoUrl(input.url) ? { videoImportUrl: input.url } : {}),
        }
      : {}),
    ...(trusted ? {} : { partial: true }),
  };

  return {
    found: true,
    recipe,
    llm,
    warnings: [
      llmWarning(
        llm,
        { items, steps, trusted },
        input.sourceKind,
        input.sourceLabel,
      ),
    ],
  };
}

/**
 * Where the model's lines were found: "on the page", "in the text", or — for
 * a labelled source — "in the video's description" (36d).
 */
export function sourceWhere(
  sourceKind: "page" | "text" = "page",
  label?: string,
): string {
  if (label) return `in ${label}`;
  return sourceKind === "text" ? "in the text" : "on the page";
}

/** The one warning an extraction carries: what to check, or why it is partial. */
export function llmWarning(
  llm: Pick<LlmStats, "model" | "grounded" | "total" | "verbatim" | "added">,
  { items, steps, trusted }: { items: number; steps: number; trusted: boolean },
  sourceKind: "page" | "text" = "page",
  label?: string,
): string {
  const where = sourceWhere(sourceKind, label);
  const how =
    llm.verbatim === llm.total && llm.total > 0 ? "found verbatim" : "found";
  const found = `${llm.grounded}/${llm.total} ingredient lines ${how} ${where}`;
  const added = llm.added?.length
    ? ` (${llm.added.length} it skipped added back from the list)`
    : "";
  if (trusted && label) {
    /* A video (36d): say what was read — the import never showed it. */
    return `read from ${label} by local model ${llm.model} — ${llm.grounded}/${llm.total} ingredient lines ${how}${added}; check it`;
  }
  if (trusted) {
    return `extracted by local model ${llm.model} — ${found}${added}; check it`;
  }
  const why =
    items === 0
      ? "it found no ingredients"
      : steps === 0
        ? "it found no instructions"
        : `only ${found}`;
  return `local model ${llm.model}'s extraction is partial — ${why}; check it against the source`;
}
