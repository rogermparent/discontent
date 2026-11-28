/**
 * Grams for a recipe's lines (51f): from a pasted metric list, from the
 * bank, and — for what those leave — from the model, one line at a time.
 *
 * **The order is Roger's (answer 2).** A paste wins: King Arthur's chart
 * itself says to go by a recipe's own weights, and the source's numbers
 * differ from the bank's by up to 6% on Pouding Chômeur. The bank fills only
 * lines the paste leaves without grams; the model only what the bank can't.
 *
 * **What gets grams (answer 4).** A line measured in cups, tablespoons,
 * teaspoons (or millilitres) from the bank, rounded to whole grams, or half
 * grams under 5 g (`roundGrams`). A counted line ("2 eggs") only from a
 * paste or the model: the bank is grams per cup. Never a pinch, a dash, "to
 * taste" or "a splash" (`parseAmount` reads those as needed), nor a line
 * that gives grams already (`hasStoredGrams`).
 *
 * **The house form (answer 1)** is what 1,368 of Roger's lines already do:
 * the grams in a Multiplyable so they scale, "g" straight after, after the
 * unit for a measured line — `2 cups (<Multiplyable baseNumber="400" />g)
 * brown sugar` — and after the name for a counted one — `2 eggs
 * (<Multiplyable baseNumber="100" />g)` (`withGrams`).
 *
 * Pure, and safe in the browser.
 */
import { formatAmount, parseAmount, type Amount } from "./ingredientAmount";
import { cupsOfVolume, gramsOfVolume } from "./shoppingMerges";
import { densityOf, gramsKeyOf, type GramsTable } from "./gramsBank";
import { plainLine } from "../components/Form/Ingredients/ingredientRows";
import { detectHeading } from "./detectHeading";
import { shoppingNameOf } from "./shoppingView";

export type GramsSource = "paste" | "bank" | "model";

/** Grams the way the house writes them: whole, or halves under 5 g. */
export function roundGrams(grams: number): number {
  return grams < 5 ? Math.round(grams * 2) / 2 : Math.round(grams);
}

/** "400", "4.5": a rounded gram count as a Multiplyable's baseNumber. */
function gramsNumber(grams: number): string {
  const rounded = roundGrams(grams);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A line that already gives grams: "(400g)", "400 g", "1.2 kg", "200 grams". */
const STORED_GRAMS_RE =
  /\d(?:[\d.,]*|\s+\d+\/\d+)\s*(?:g|grams?|gr|kg|kilos?|kilograms?)\b/i;

export function hasStoredGrams(stored: string): boolean {
  return STORED_GRAMS_RE.test(plainLine(stored));
}

/** Does this line have something a scale could weigh, and how is it measured? */
export type LineKind =
  /** A heading, a blank line. */
  | "none"
  /** Grams written already. */
  | "has-grams"
  /** A pinch, a dash, "to taste": as needed. */
  | "as-needed"
  /** Cups, spoons, millilitres: the bank can weigh it. */
  | "volume"
  /** "2 eggs", "1 can": a paste or the model only. */
  | "counted"
  /** Ounces or pounds already, or numbers that can't be read. */
  | "other";

export interface ReadLine {
  kind: LineKind;
  amount?: Amount;
  /** `gramsKeyOf` the line. */
  key?: string;
}

export function readLine(stored: string, heading = false): ReadLine {
  const plain = plainLine(stored).trim();
  if (heading || !plain || detectHeading(plain)) return { kind: "none" };
  if (hasStoredGrams(stored)) return { kind: "has-grams" };
  const amount = parseAmount(stored);
  const key = gramsKeyOf(stored);
  if (!amount) return { kind: "other", ...(key ? { key } : {}) };
  const parts = amount.parts.filter((part) => part.qty > 0);
  if (parts.length === 0) return { kind: "as-needed", amount };
  const families = new Set(parts.map((part) => part.family));
  const kind: LineKind = [...families].every(
    (family) => family === "us-volume" || family === "metric-volume",
  )
    ? "volume"
    : [...families].every(
          (family) => family === "count" || family === "container",
        )
      ? "counted"
      : "other";
  return { kind, amount, ...(key ? { key } : {}) };
}

/** Whether a line could take grams at all (a paste's, the bank's, the model's). */
export function weighable(read: ReadLine): boolean {
  return read.kind === "volume" || read.kind === "counted";
}

// --- the house form ---------------------------------------------------------

const AMOUNT_HEAD =
  /^(\s*(?:[*_]{1,2})?\s*<Multiplyable\s+baseNumber="[^"]*"\s*\/>(?:\s*(?:-|–|to)\s*<Multiplyable\s+baseNumber="[^"]*"\s*\/>)?)/;

/** Volume unit words, as a line writes them after its number. */
const VOLUME_UNIT_RE =
  /^\s*(?:fl\.?\s*oz\.?|fluid\s+ounces?|cups?|c\.|tablespoons?|tbsps?\.?|tbs\.?|tbl\.?|T\b|teaspoons?|tsps?\.?|t\b|millilit(?:er|re)s?|ml\.?|lit(?:er|re)s?|l\b)/i;

/**
 * The line with its grams in the house form: after the unit for a measured
 * line, after the name for a counted one (before its first comma or
 * bracketed remark). A line whose amount isn't the house markup is left
 * alone: `undefined`.
 */
export function withGrams(stored: string, grams: number): string | undefined {
  const mark = ` (<Multiplyable baseNumber="${gramsNumber(grams)}" />g)`;
  const head = AMOUNT_HEAD.exec(stored);
  if (!head) return undefined;
  const afterAmount = stored.slice(head[0].length);
  const unit = VOLUME_UNIT_RE.exec(afterAmount);
  if (unit) {
    const at = head[0].length + unit[0].length;
    return `${stored.slice(0, at)}${mark}${stored.slice(at)}`;
  }
  /* Counted: after the name — before ", beaten", " (optional)", " - ". */
  const tail = /(,|\s+\(|\s+[-–—]\s)/.exec(afterAmount);
  const at =
    head[0].length + (tail ? tail.index : afterAmount.trimEnd().length);
  return `${stored.slice(0, at)}${mark}${stored.slice(at)}`;
}

// --- 1 · the paste ----------------------------------------------------------

/**
 * A pasted number: "1,000" and "1,250.5" are thousands (a comma before
 * exactly three digits, then no more), "1,5" and "1.5" a decimal.
 */
const PASTED_NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|\d+(?:[.,]\d+)?`;

function pastedNumber(text: string): number {
  return /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)
    ? Number(text.replace(/,/g, ""))
    : Number(text.replace(",", "."));
}

const PASTED_LEAD = new RegExp(
  String.raw`^\s*(${PASTED_NUMBER})\s*(kg|kilos?|kilograms?|grams?|gr|g)(?![a-z])|^\s*(${PASTED_NUMBER})\s*(kg|g)(?=[a-z]{2,})`,
  "i",
);
const PASTED_ANYWHERE = new RegExp(
  String.raw`(${PASTED_NUMBER})\s*(kg|kilos?|kilograms?|grams?|g)\b`,
  "i",
);

/**
 * "400 gbrown sugar" → 400; "1.2 kg flour" → 1200; "1,000 g flour" → 1000;
 * none for "1 tbspflour".
 */
export function pastedGrams(line: string): number | undefined {
  const anywhere = PASTED_LEAD.exec(line) ?? PASTED_ANYWHERE.exec(line);
  if (!anywhere) return undefined;
  const value = pastedNumber(anywhere[1] ?? anywhere[3]);
  const unit = (anywhere[2] ?? anywhere[4]).toLowerCase();
  if (!(value > 0)) return undefined;
  return unit.startsWith("k") ? value * 1000 : value;
}

const lettersOf = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export interface PasteMatch {
  /** The recipe line it matched. */
  line: number;
  /** As pasted. */
  pasted: string;
  /** Its grams, when it gave some. */
  grams?: number;
}

export interface PasteAlignment {
  matches: PasteMatch[];
  /** Pasted lines that matched no recipe line. */
  unmatched: string[];
}

/** A line's own name, as written: "1 cup sugar" → "sugar" (no amount, unit or remark). */
function ownNameOf(stored: string): string {
  const plain = plainLine(stored)
    .replace(/^[\s\d/.,½⅓⅔¼¾⅛⅜⅝⅞-]+(?:(?:to|-|–)\s*[\d/.,½⅓⅔¼¾⅛⅜⅝⅞]+)?/i, "")
    .replace(VOLUME_UNIT_RE, "")
    .replace(/^\s*(?:g|grams?|kg|oz|ounces?|lbs?|pounds?)\b/i, "");
  return plain.split(/[,(;]|\s[-–—]\s/)[0] ?? "";
}

/** A pasted line's name, its amount and unit taken off, each way it may be glued. */
function pastedNamesOf(pasted: string): string[] {
  const rest = pasted.replace(/^[\s\d/.,½⅓⅔¼¾⅛⅜⅝⅞-]+/, "");
  return [
    rest,
    rest.replace(VOLUME_UNIT_RE, ""),
    rest.replace(/^\s*(?:kg|kilos?|kilograms?|grams?|gr|g)/i, ""),
  ].map(lettersOf);
}

/**
 * Each pasted line to the recipe line it is (51f): glued text is fine
 * ("400 gbrown sugar", "2egg", "a pinchsalt", "2½ tspbaking powder"), as
 * the letters are compared alone. A pasted line matches the line whose name
 * key its letters end with — else contain — the longest such name first,
 * then the first unused line in order (Pouding Chômeur's two butters).
 *
 * When no key fits (review finding 6), the line's own name is tried the
 * same way — "200 g sugar" is "1 cup sugar", whose key is `granulated
 * sugar` — and last the key's last word, when it is the whole pasted name
 * — "1 tbspflour" is "1 tbsp all-purpose flour", "50 g cocoa powder" is not
 * "2 tsp baking powder". A line with no name key is never matched.
 */
export function alignPaste(
  lines: readonly { ingredient: string; type?: string }[],
  paste: string,
): PasteAlignment {
  const keys = lines.map((line) => {
    if (line.type === "heading") return "";
    const key = shoppingNameOf(line.ingredient).key;
    return key.startsWith("text:") ? "" : key;
  });
  const ownNames = lines.map((line, index) =>
    keys[index] ? lettersOf(ownNameOf(line.ingredient)) : "",
  );
  const lastWords = keys.map((key) => lettersOf(key.split(" ").at(-1) ?? ""));
  const used = new Set<number>();
  const matches: PasteMatch[] = [];
  const unmatched: string[] = [];
  for (const raw of paste.split(/\r?\n/)) {
    const pasted = raw.trim();
    if (!pasted) continue;
    const letters = lettersOf(pasted);
    const ends = (name: string) => letters.endsWith(name);
    const holds = (name: string) => letters.includes(name);
    /* The last word only when it is the pasted name entire: "1 tbspflour"
     * is all-purpose flour, "50 gcocoa powder" is not baking powder. */
    const bare = pastedNamesOf(pasted);
    const isBare = (name: string) => bare.includes(name);
    const tiers: [readonly string[], ((name: string) => boolean)[]][] = [
      [keys.map(lettersOf), [ends, holds]],
      [ownNames, [ends, holds]],
      [lastWords, [isBare]],
    ];
    let best = -1;
    search: for (const [names, tests] of tiers) {
      for (const test of tests) {
        let length = 0;
        names.forEach((name, index) => {
          if (!name || used.has(index) || !test(name)) return;
          if (name.length > length) {
            best = index;
            length = name.length;
          }
        });
        if (best >= 0) break search;
      }
    }
    if (best < 0) {
      unmatched.push(pasted);
      continue;
    }
    used.add(best);
    const grams = pastedGrams(pasted);
    matches.push({
      line: best,
      pasted,
      ...(grams !== undefined ? { grams: roundGrams(grams) } : {}),
    });
  }
  return { matches, unmatched };
}

// --- 2 · the bank -----------------------------------------------------------

export interface BankGrams {
  grams: number;
  gramsPerCup: number;
  /** "213 g a cup × 2 cups" */
  why: string;
  key: string;
}

/** A measured line's grams from the bank, or none. */
export function bankGramsOf(
  stored: string,
  table: GramsTable,
  read: ReadLine = readLine(stored),
): BankGrams | undefined {
  if (read.kind !== "volume" || !read.amount) return undefined;
  const density = densityOf(table, stored);
  if (!density) return undefined;
  const grams = gramsOfVolume(read.amount, density.gramsPerCup);
  const cups = cupsOfVolume(read.amount);
  /* A suggestion that rounds to 0 g says nothing (review finding 7). */
  if (grams === undefined || cups === undefined || !(roundGrams(grams) > 0)) {
    return undefined;
  }
  const perCup = Math.round(density.gramsPerCup * 10) / 10;
  return {
    grams: roundGrams(grams),
    gramsPerCup: density.gramsPerCup,
    why: `${perCup} g a cup × ${formatAmount(read.amount)} (${density.origin === "built-in" ? "built in" : "yours"})`,
    key: density.key,
  };
}

// --- 3 · the model's answer, checked ----------------------------------------

/** What a cup of anything may weigh, for a model's answer on a measured line. */
const MODEL_PER_CUP_MIN = 3;
const MODEL_PER_CUP_MAX = 500;
/** A counted line's grams at most: a whole turkey is under this. */
const MODEL_COUNTED_MAX = 10_000;

export type ModelGramsCheck =
  { ok: true; grams: number } | { ok: false; problem: string };

/**
 * A model's grams for a line, checked (answer 5): a number, positive, and
 * sane for the line — on a measured line, a cup of it between 3 g (popped
 * corn) and 500 g; on a counted one (or a measure no cup is had from), at
 * most 10 kg. Rounded as the house writes grams.
 */
export function checkModelGrams(
  stored: string,
  value: unknown,
  read: ReadLine = readLine(stored),
): ModelGramsCheck {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, problem: "the answer was not a number" };
  }
  if (!(value > 0))
    return { ok: false, problem: "the answer was not positive" };
  if (!weighable(read)) {
    return { ok: false, problem: "this line has nothing to weigh" };
  }
  const cups =
    read.kind === "volume" && read.amount
      ? cupsOfVolume(read.amount)
      : undefined;
  if (cups && cups > 0) {
    const perCup = value / cups;
    if (perCup < MODEL_PER_CUP_MIN || perCup > MODEL_PER_CUP_MAX) {
      return {
        ok: false,
        problem: `${Math.round(perCup)} g a cup is not a weight any ingredient has`,
      };
    }
  } else if (value > MODEL_COUNTED_MAX) {
    /* A counted line, or a measure with no cup to compare against. */
    return { ok: false, problem: "more than 10 kg for this line" };
  }
  const grams = roundGrams(value);
  return grams > 0
    ? { ok: true, grams }
    : { ok: false, problem: "the answer rounds to 0 g" };
}

// --- the whole plan (the CLI and HTTP) --------------------------------------

export interface GramsSuggestion {
  line: number;
  before: string;
  after: string;
  grams: number;
  source: GramsSource;
  /** Why this number: the pasted line, the bank's arithmetic, the model's reason. */
  why: string;
  /** A paste's or the model's grams per cup, for "Save to the bank". */
  gramsPerCup?: number;
  key?: string;
}

export interface GramsPlan {
  suggestions: GramsSuggestion[];
  /** Lines nothing filled that could take grams: what the model is asked. */
  left: number[];
  /** Pasted lines that matched no line. */
  unmatched: string[];
  /** Lines with grams already. */
  had: number[];
}

/** A suggestion for a line, written in the house form. */
export function gramsSuggestion(
  lines: readonly { ingredient: string }[],
  line: number,
  grams: number,
  source: GramsSource,
  why: string,
): GramsSuggestion | undefined {
  const before = lines[line]?.ingredient;
  if (before === undefined || !(roundGrams(grams) > 0)) return undefined;
  const after = withGrams(before, grams);
  if (after === undefined) return undefined;
  const read = readLine(before);
  const cups =
    read.kind === "volume" && read.amount
      ? cupsOfVolume(read.amount)
      : undefined;
  return {
    line,
    before,
    after,
    grams: roundGrams(grams),
    source,
    why,
    ...(cups && cups > 0 ? { gramsPerCup: grams / cups } : {}),
    ...(read.key ? { key: read.key } : {}),
  };
}

/**
 * The paste, then the bank (the model's lines are `left`): what the CLI's
 * `recipes grams` and the form's first two steps propose.
 */
export function suggestGrams(
  lines: readonly { ingredient: string; type?: string }[],
  { paste, table }: { paste?: string; table: GramsTable },
): GramsPlan {
  const reads = lines.map((line) =>
    readLine(line.ingredient, line.type === "heading"),
  );
  const suggestions: GramsSuggestion[] = [];
  const done = new Set<number>();
  let unmatched: string[] = [];
  if (paste?.trim()) {
    const aligned = alignPaste(lines, paste);
    unmatched = aligned.unmatched;
    for (const match of aligned.matches) {
      if (match.grams === undefined || !weighable(reads[match.line])) continue;
      const made = gramsSuggestion(
        lines,
        match.line,
        match.grams,
        "paste",
        `Pasted: “${match.pasted}”`,
      );
      if (made) {
        suggestions.push(made);
        done.add(match.line);
      }
    }
  }
  reads.forEach((read, line) => {
    if (done.has(line)) return;
    const bank = bankGramsOf(lines[line].ingredient, table, read);
    if (!bank) return;
    const made = gramsSuggestion(lines, line, bank.grams, "bank", bank.why);
    if (made) {
      suggestions.push({ ...made, gramsPerCup: bank.gramsPerCup });
      done.add(line);
    }
  });
  suggestions.sort((a, b) => a.line - b.line);
  return {
    suggestions,
    left: reads.flatMap((read, line) =>
      !done.has(line) &&
      weighable(read) &&
      withGrams(lines[line].ingredient, 1) !== undefined
        ? [line]
        : [],
    ),
    unmatched,
    had: reads.flatMap((read, line) =>
      read.kind === "has-grams" ? [line] : [],
    ),
  };
}

// --- the recipe page's "Show grams" (answer 6) ------------------------------

/**
 * The grams the recipe page shows for each line with "Show grams" on:
 * worked out from the bank for a measured line without stored grams
 * (marked ≈ there), nothing for any other. Stored grams always show, as
 * the line writes them.
 */
export function viewGrams(
  lines: readonly { ingredient: string; type?: string }[],
  table: GramsTable,
): (number | undefined)[] {
  return lines.map((line) => {
    if (line.type === "heading") return undefined;
    return bankGramsOf(line.ingredient, table)?.grams;
  });
}
