/**
 * What a meal plan needs to know about each recipe's clock (epic 43, 43p1,
 * D5): how long a dough chills and how long it keeps, a rest, the minutes a
 * batch bakes, the oven's temperature, what it makes, and the extras that
 * come after the oven ("then 10 minutes in the freezer", "the icing sets in
 * 24 hours").
 *
 * Read from the recipe's **step text** only — never the description, which
 * is marketing copy — by a short list of plain statements, the way 42c1's
 * heads-up notes are. A fact the steps don't state plainly is absent, never
 * guessed: no "350 degrees" without an F or a C, no chill time from "until
 * firm", nothing from "up to 2 hours" but a limit. Each fact carries the
 * sentence it came from and its step number, so the page can say "from the
 * steps" and a reader can check it.
 *
 * Pure, and safe in the browser. The plan page (43p1) and the run sheet
 * (43p2) call `readPlanTimes` per recipe and `summarizeMakeAhead` over the
 * plan; the formatters below are the one wording both use.
 */
import type { InstructionEntry, Recipe } from "../controller/types";
import { sentences } from "./headsUp";
import { stripMarkup } from "./ingredientNames";
import { stepNumbers } from "./stepNumbers";
import { findStepTimes, type StepTime } from "./timeText";

/** A length of time in whole minutes, or a range of them. */
export interface PlanSpan {
  /** The low end (or the only time), in minutes. */
  min: number;
  /** A range's high end, in minutes. */
  max?: number;
}

/** A chill: "at least 3 hours", "1–2 hours", "overnight". */
export interface PlanChill {
  /** Minutes; absent for a bare "refrigerate overnight". */
  min?: number;
  max?: number;
  /** "at least 3 hours": the time is a floor, not a target. */
  atLeast?: boolean;
  /** "… or overnight", or overnight alone. */
  overnight?: boolean;
}

/** How long it keeps made ahead: "up to 3 days", "2–3 days ahead". */
export interface PlanKeeps {
  count: number;
  max?: number;
  unit: "day" | "week";
}

/** The oven: "350°F", as the step writes it. */
export interface PlanOven {
  degrees: number;
  unit: "F" | "C";
}

/** One bake: "11–12 minutes", maybe "about", maybe a batch of several. */
export interface PlanBake extends PlanSpan {
  /** "about 15 minutes". */
  about?: boolean;
  /**
   * The recipe bakes in batches — its steps say "batch", or it makes
   * cookies — so the minutes are a batch's, not the dish's.
   */
  perBatch: boolean;
}

/** What comes after the oven, timed. */
export interface PlanExtra {
  /** "freeze": into the freezer. "set": icing, glaze or chocolate setting. */
  kind: "freeze" | "set";
  span: PlanSpan;
  /** For `set`, the thing that sets as the step names it: "icing". */
  what?: string;
}

/** A recipe's yield, read from its `recipeYield`. */
export interface PlanYield {
  min: number;
  max?: number;
  /** The words after the number: "bite-size cookies", "servings", "". */
  unit: string;
  /** "about 24 cookies", "Makes approximately …". */
  about?: boolean;
  /** The yield as stored, markup undone. */
  text: string;
}

/** A fact, with where it came from. */
export interface PlanFact<T> {
  value: T;
  /** The sentence, quoted as written (markup undone). */
  sentence: string;
  /** The recipe page's step number (numbered straight through groups). */
  step: number;
}

/** Every fact the steps state plainly; each absent when they don't. */
export interface PlanTimes {
  chill?: PlanFact<PlanChill>;
  keeps?: PlanFact<PlanKeeps>;
  rest?: PlanFact<PlanSpan>;
  bake?: PlanFact<PlanBake>;
  oven?: PlanFact<PlanOven>;
  /** From `recipeYield`, not the steps — so it has no sentence. */
  yield?: PlanYield;
  extras: PlanFact<PlanExtra>[];
}

/** How far from its verb a time may sit and still be that verb's. */
const NEAR = 60;

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fourteen: 14,
};

const COUNT = String.raw`(\d+|${Object.keys(WORD_NUMBERS).join("|")})`;

function countValue(text: string): number {
  return /^\d+$/.test(text)
    ? Number(text)
    : (WORD_NUMBERS[text.toLowerCase()] ?? NaN);
}

/** A sentence about keeping what is already made, or leftovers. */
const LEFTOVERS_RE =
  /\b(?:leftovers?|room temperature|airtight|baked cookies|cooled cookies)\b/i;
const FREEZE_RE = /\bfreez(?:e|es|er|ing)\b|\bfrozen\b/i;

/**
 * A chill as a verb: "chill", "refrigerate", "cover and chill the dough",
 * "must be chilled", "place in the refrigerator". Never the adjective — "the
 * chilled dough", "refrigerated pie crust" — which is a state, not a wait.
 */
const CHILL_VERB_RE =
  /\b(?:chill(?:s|ing)?|refrigerate(?:s)?|refrigerating|(?:be|been|is|are|get)\s+(?:chilled|refrigerated)|(?:in|into)\s+the\s+(?:fridge|refrigerator))\b/i;

/** "Let the dough rest", "allow to sit", "rest the dough", "let stand". */
const REST_VERB_RE =
  /\b(?:(?:let|allow)\b[^.!?]{0,40}?\b(?:rest|sit|stand)|^rest)\b/i;

/**
 * "Bake", "bake the cookies" — not "pre-bake", "par-bake" or "blind bake"
 * (the crust's own bake, before the dish's), nor "baked" or "baking".
 */
const BAKE_VERB_RE = /(?<![-\w])(?<!blind\s)bake(?:s)?\b/i;

/**
 * The oven's temperature: "preheat the oven to 350°F (177°C)", "Bake at
 * 375 °F", "350 degrees F", "180°C". The unit is required — "preheat to 350
 * degrees" is not plain enough to say F.
 */
const OVEN_RE =
  /\b(\d{3})\s*(?:°|º|˚|degrees?)\s*(F|C|Fahrenheit|Celsius)\b|\b(\d{3})\s*(F|C)\b(?=\s*[(.,;]|\s+(?:oven|for|until)\b)/i;
const OVEN_CONTEXT_RE = /\b(?:preheat|oven|bake|roast)\b/i;

/** "the icing sets", "allow the glaze to set", "until the chocolate hardens". */
const SET_RE =
  /\b(icing|glaze|frosting|chocolate|royal icing)\b[^.!?]{0,40}?\b(?:set|sets|harden|hardens|firm up)\b|\b(?:set|harden)\b[^.!?]{0,20}?\b(icing|glaze|frosting|chocolate)\b/i;

/** The recipe's steps, flattened, each with its page number. */
function stepTexts(
  instructions: readonly InstructionEntry[] = [],
): Array<{ text: string; step: number }> {
  const numbers = stepNumbers(instructions);
  return instructions.flatMap((entry, i) =>
    ("instructions" in entry ? (entry.instructions ?? []) : [entry]).map(
      (step, j) => ({ text: step.text ?? "", step: numbers[i][j] }),
    ),
  );
}

/** Seconds to whole minutes, at least one. */
function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

function spanOf(time: StepTime): PlanSpan {
  return time.maxSeconds === undefined
    ? { min: minutes(time.seconds) }
    : { min: minutes(time.seconds), max: minutes(time.maxSeconds) };
}

/**
 * The first time after `from` in `sentence`, within `NEAR` characters, with
 * the words between — or `undefined`.
 */
function timeAfter(
  sentence: string,
  from: number,
  near = NEAR,
): { time: StepTime; lead: string } | undefined {
  const rest = sentence.slice(from);
  const [time] = findStepTimes(rest);
  if (!time || time.start > near) return undefined;
  return { time, lead: rest.slice(0, time.start) };
}

const UP_TO_RE = /\bup\s+to\s*$/i;
const AT_LEAST_RE = /\b(?:at\s+least|a\s+minimum\s+of|minimum)\s*$/i;
const ABOUT_RE = /\b(?:about|around|approximately|roughly)\s*$/i;

/** A chill, read from one sentence, or `undefined`. */
export function readChill(sentence: string): PlanChill | undefined {
  if (LEFTOVERS_RE.test(sentence) || FREEZE_RE.test(sentence)) {
    return undefined;
  }
  const verb = CHILL_VERB_RE.exec(sentence);
  if (!verb) return undefined;
  const after = verb.index + verb[0].length;
  const tail = sentence.slice(after);
  const overnight = /^[^.!?]{0,40}?\bovernight\b/i.test(tail);
  const found = timeAfter(sentence, after);
  if (!found || UP_TO_RE.test(found.lead)) {
    return overnight ? { overnight: true } : undefined;
  }
  const span = spanOf(found.time);
  return {
    min: span.min,
    ...(span.max !== undefined ? { max: span.max } : {}),
    ...(AT_LEAST_RE.test(found.lead) ? { atLeast: true } : {}),
    ...(overnight ? { overnight: true } : {}),
  };
}

const STORE_RE = /\bstor(?:e|es|ed|ing|age)\b/i;
const MADE_AHEAD_RE = /\b(?:dough|batter|filling)\b/i;
const KEEPS_CONTEXT_RE =
  /\b(?:dough|chill|refrigerat\w*|make[- ]ahead|ahead|in advance)\b/i;
const KEEPS_RE = new RegExp(
  String.raw`\b(?:up\s+to|keeps?\s+(?:for\s+)?(?:up\s+to\s+)?)\s*${COUNT}(?:\s*(?:-|–|to)\s*${COUNT})?\s+(days?|weeks?)\b|\b${COUNT}(?:\s*(?:-|–|to)\s*${COUNT})?\s+(days?|weeks?)\s+(?:ahead|in\s+advance)\b`,
  "i",
);

/** How long it keeps made ahead, from one sentence, or `undefined`. */
export function readKeeps(sentence: string): PlanKeeps | undefined {
  if (LEFTOVERS_RE.test(sentence) || FREEZE_RE.test(sentence)) {
    return undefined;
  }
  if (!KEEPS_CONTEXT_RE.test(sentence)) return undefined;
  /* "Store the baked cookies in the fridge for up to a week" is the
   * cookies keeping, not the dough made ahead. */
  if (STORE_RE.test(sentence) && !MADE_AHEAD_RE.test(sentence)) {
    return undefined;
  }
  const match = KEEPS_RE.exec(sentence);
  if (!match) return undefined;
  const [, a1, a2, aUnit, b1, b2, bUnit] = match;
  const first = countValue(a1 ?? b1);
  const second = a2 ?? b2;
  const unit = (aUnit ?? bUnit).toLowerCase().startsWith("w") ? "week" : "day";
  if (!Number.isFinite(first) || first <= 0) return undefined;
  const max = second === undefined ? undefined : countValue(second);
  return {
    count: first,
    ...(max !== undefined && Number.isFinite(max) && max > first
      ? { max }
      : {}),
    unit,
  };
}

/** A rest, from one sentence, or `undefined`. */
export function readRest(sentence: string): PlanSpan | undefined {
  const verb = REST_VERB_RE.exec(sentence);
  if (!verb) return undefined;
  const found = timeAfter(sentence, verb.index + verb[0].length);
  if (!found || UP_TO_RE.test(found.lead)) return undefined;
  return spanOf(found.time);
}

/** A bake's minutes, from one sentence, or `undefined` (`perBatch` unset). */
export function readBake(
  sentence: string,
): Omit<PlanBake, "perBatch"> | undefined {
  const verb = BAKE_VERB_RE.exec(sentence);
  if (!verb) return undefined;
  /* Room for "at 350°F (177°C) on the middle rack for" between. */
  const found = timeAfter(sentence, verb.index + verb[0].length, 80);
  if (!found || UP_TO_RE.test(found.lead)) return undefined;
  const span = spanOf(found.time);
  return { ...span, ...(ABOUT_RE.test(found.lead) ? { about: true } : {}) };
}

/** The oven's temperature, from one sentence, or `undefined`. */
export function readOven(sentence: string): PlanOven | undefined {
  if (!OVEN_CONTEXT_RE.test(sentence)) return undefined;
  const match = OVEN_RE.exec(sentence);
  if (!match) return undefined;
  const degrees = Number(match[1] ?? match[3]);
  const unit = (match[2] ?? match[4]).charAt(0).toUpperCase() as "F" | "C";
  /* A cool or a scorching number is not an oven. */
  const [low, high] = unit === "F" ? [200, 550] : [90, 290];
  if (degrees < low || degrees > high) return undefined;
  return { degrees, unit };
}

/** A timed extra — the freezer, or icing setting — from one sentence. */
export function readExtra(sentence: string): PlanExtra | undefined {
  const freeze = FREEZE_RE.exec(sentence);
  if (freeze) {
    const found = timeAfter(sentence, freeze.index + freeze[0].length, 40);
    const before = findStepTimes(sentence.slice(0, freeze.index)).at(-1);
    /* "Freeze for 10 minutes", or "… 10 minutes in the freezer". */
    if (found && !UP_TO_RE.test(found.lead)) {
      return { kind: "freeze", span: spanOf(found.time) };
    }
    if (
      before &&
      freeze.index - before.end <= 12 &&
      /^\s*(?:in|into)\s+the\s*$/i.test(
        sentence.slice(before.end, freeze.index),
      )
    ) {
      return { kind: "freeze", span: spanOf(before) };
    }
    return undefined;
  }
  const set = SET_RE.exec(sentence);
  if (!set) return undefined;
  const found =
    timeAfter(sentence, set.index + set[0].length, 40) ??
    timeAfter(sentence, set.index, 80);
  if (!found || UP_TO_RE.test(found.lead)) return undefined;
  return {
    kind: "set",
    span: spanOf(found.time),
    what: (set[1] ?? set[2]).toLowerCase(),
  };
}

/** Units of things a recipe bakes several of, a sheet at a time. */
const BATCH_UNITS_RE =
  /\b(?:cookies?|biscuits?|crackers?|snowballs?|blossoms?|macarons?|meringues?|scones?|rugelach|biscotti)\b/i;
const BATCH_WORD_RE = /\b(?:batch(?:es)?|remaining dough|second sheet)\b/i;

/**
 * A recipe's yield as `recipeYield` says it: "84 bite-size cookies",
 * "20-22 cookies", "Makes about 24", "Serves 4", "2 dozen cookies",
 * `<Multiplyable baseNumber="24" /> cookies`. `undefined` when it does not
 * start with a number (after "Makes", "Yield:", "Serves", "about").
 */
export function parseYield(stored: string | undefined): PlanYield | undefined {
  if (!stored) return undefined;
  const text = stripMarkup(stored).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  let serves = /^servings?\b/i.test(text);
  let rest = text.replace(/^(?:yields?|makes|servings?)\s*:?\s*/i, "");
  if (/^serves\b/i.test(rest)) {
    serves = true;
    rest = rest.replace(/^serves\s*:?\s*/i, "");
  }
  const about = /^(?:about|around|approximately|approx\.?|roughly)\s+/i.test(
    rest,
  );
  rest = rest.replace(
    /^(?:about|around|approximately|approx\.?|roughly)\s+/i,
    "",
  );
  const match =
    /^(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?(?![\d/])\s*(.*)$/i.exec(
      rest,
    );
  if (!match) return undefined;
  let min = Number(match[1]);
  let max = match[2] === undefined ? undefined : Number(match[2]);
  let unit = match[3].replace(/^[,:-]\s*/, "").trim();
  /* "2 1/2 dozen": a mixed number this reading does not take. */
  if (/^\d/.test(unit)) return undefined;
  if (/^dozen\b/i.test(unit)) {
    min *= 12;
    if (max !== undefined) max *= 12;
    unit = unit.replace(/^dozen\b\s*/i, "");
  }
  if (serves && !unit)
    unit = min === 1 && max === undefined ? "serving" : "servings";
  if (!(min > 0)) return undefined;
  return {
    min,
    ...(max !== undefined && max > min ? { max } : {}),
    unit,
    ...(about ? { about: true } : {}),
    text,
  };
}

/**
 * Every fact `recipe`'s steps state plainly (see the module note). Each kind
 * is its first plain statement, in step order; the extras are every one.
 */
export function readPlanTimes(
  recipe: Pick<Recipe, "instructions" | "recipeYield">,
): PlanTimes {
  const out: PlanTimes = { extras: [] };
  const yieldValue = parseYield(recipe.recipeYield);
  if (yieldValue) out.yield = yieldValue;
  const steps = stepTexts(recipe.instructions);
  let batchWord = false;
  for (const { text, step } of steps) {
    for (const sentence of sentences(text)) {
      if (BATCH_WORD_RE.test(sentence)) batchWord = true;
      const fact = <T>(value: T): PlanFact<T> => ({ value, sentence, step });
      if (!out.chill) {
        const chill = readChill(sentence);
        if (chill) out.chill = fact(chill);
      }
      if (!out.keeps) {
        const keeps = readKeeps(sentence);
        if (keeps) out.keeps = fact(keeps);
      }
      if (!out.rest) {
        const rest = readRest(sentence);
        if (rest) out.rest = fact(rest);
      }
      if (!out.oven) {
        const oven = readOven(sentence);
        if (oven) out.oven = fact(oven);
      }
      if (!out.bake) {
        const bake = readBake(sentence);
        if (bake) out.bake = fact({ ...bake, perBatch: false });
      }
      const extra = readExtra(sentence);
      if (extra) out.extras.push(fact(extra));
    }
  }
  if (out.bake) {
    out.bake.value.perBatch =
      batchWord ||
      BATCH_UNITS_RE.test(out.yield?.unit ?? "") ||
      BATCH_UNITS_RE.test(out.bake.sentence);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Wording                                                                  */
/* ------------------------------------------------------------------------ */

/** 30 → "30 min", 180 → "3 h", 90 → "1 h 30 min", 1440 → "24 h". */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * A span in one unit where both ends allow it: "11–12 min", "1–2 h",
 * "30 min", "3 h".
 */
export function formatSpan({ min, max }: PlanSpan): string {
  if (max === undefined || max === min) return formatMinutes(min);
  if (max < 60) return `${min}–${max} min`;
  if (min % 60 === 0 && max % 60 === 0) return `${min / 60}–${max / 60} h`;
  return `${formatMinutes(min)}–${formatMinutes(max)}`;
}

/** "at least 3 h", "1–2 h", "at least 2 h or overnight", "overnight". */
export function formatChill(chill: PlanChill): string {
  const time =
    chill.min === undefined
      ? undefined
      : `${chill.atLeast ? "at least " : ""}${formatSpan({ min: chill.min, max: chill.max })}`;
  if (time && chill.overnight) return `${time} or overnight`;
  return time ?? "overnight";
}

/** The make-ahead list's short form: "≥ 3 h", "1–2 h", "overnight". */
export function formatChillShort(chill: PlanChill): string {
  if (chill.min === undefined) return "overnight";
  const span = formatSpan({ min: chill.min, max: chill.max });
  return chill.atLeast ? `≥ ${span}` : span;
}

/** "3 days", "1 week", "2–3 days". */
export function formatKeeps({ count, max, unit }: PlanKeeps): string {
  const top = max ?? count;
  const word = top === 1 ? unit : `${unit}s`;
  return max === undefined ? `${count} ${word}` : `${count}–${max} ${word}`;
}

/** A span of days: "3 days", "1 day", "2–3 days" (`MakeAhead.keepsDays`). */
export function formatDays({ min, max }: PlanSpan): string {
  if (max === undefined || max === min) {
    return `${min} ${min === 1 ? "day" : "days"}`;
  }
  return `${min}–${max} days`;
}

/** "350°F". */
export function formatOven({ degrees, unit }: PlanOven): string {
  return `${degrees}°${unit}`;
}

/** "9–10 min a batch", "about 15 min a batch", "50 min". */
export function formatBake(bake: PlanBake): string {
  return `${bake.about ? "about " : ""}${formatSpan(bake)}${bake.perBatch ? " a batch" : ""}`;
}

/** "then 10 min in the freezer", "icing sets in 24 h". */
export function formatExtra(extra: PlanExtra): string {
  return extra.kind === "freeze"
    ? `then ${formatSpan(extra.span)} in the freezer`
    : `${extra.what ?? "it"} sets in ${formatSpan(extra.span)}`;
}

/** A number as a yield writes it: 24, 1.5, ½ is left to the caller. */
function yieldNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(1)));
}

/**
 * The yield at a scale: "84 bite-size cookies", "20–22 cookies", "16
 * servings" at 2× of 8 — or the stored text when there is no number.
 */
export function formatYield(value: PlanYield, scale = 1): string {
  const min = yieldNumber(value.min * scale);
  const range =
    value.max === undefined ? min : `${min}–${yieldNumber(value.max * scale)}`;
  return [value.about ? "about" : "", range, value.unit]
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------------------------------------------------ */
/* Over a plan                                                              */
/* ------------------------------------------------------------------------ */

/** One recipe of a plan, as the summary reads it. */
export interface PlanTimesEntry {
  name: string;
  times: PlanTimes;
}

/** What a plan's make-ahead panel says. */
export interface MakeAhead {
  /** Recipes read (dangling rows and sub-plans are not). */
  recipes: number;
  /** The ones that chill, longest first. */
  chilling: Array<{ name: string; chill: PlanChill }>;
  /** Every chilling recipe bakes too: they are doughs. */
  doughs: boolean;
  /** The make-ahead keeps' span over the recipes that say, in days. */
  keepsDays?: PlanSpan;
  /** Each oven temperature, with how many recipes use it, commonest first. */
  ovens: Array<{ oven: PlanOven; count: number }>;
  /** The timed extras, with whose they are. */
  extras: Array<{ name: string; extra: PlanExtra }>;
}

function chillOrder(chill: PlanChill): number {
  return chill.min ?? (chill.overnight ? 8 * 60 : 0);
}

function keepsDays({ count, max, unit }: PlanKeeps): PlanSpan {
  const days = unit === "week" ? 7 : 1;
  return max === undefined
    ? { min: count * days }
    : { min: count * days, max: max * days };
}

/** The plan's make-ahead facts, over each recipe's `readPlanTimes`. */
export function summarizeMakeAhead(entries: PlanTimesEntry[]): MakeAhead {
  const chilling = entries
    .filter(({ times }) => times.chill)
    .map(({ name, times }) => ({ name, chill: times.chill!.value }))
    .sort((a, b) => chillOrder(b.chill) - chillOrder(a.chill));
  const doughs =
    chilling.length > 0 &&
    entries.every(({ times }) => !times.chill || times.bake);
  let keeps: PlanSpan | undefined;
  for (const { times } of entries) {
    if (!times.keeps) continue;
    const { min, max = min } = keepsDays(times.keeps.value);
    keeps = keeps
      ? {
          min: Math.min(keeps.min, min),
          max: Math.max(keeps.max ?? keeps.min, max),
        }
      : { min, max };
  }
  if (keeps && keeps.max === keeps.min) keeps = { min: keeps.min };
  const ovens: MakeAhead["ovens"] = [];
  for (const { times } of entries) {
    if (!times.oven) continue;
    const oven = times.oven.value;
    const same = ovens.find(
      (each) =>
        each.oven.degrees === oven.degrees && each.oven.unit === oven.unit,
    );
    if (same) same.count += 1;
    else ovens.push({ oven, count: 1 });
  }
  ovens.sort((a, b) => b.count - a.count);
  return {
    recipes: entries.length,
    chilling,
    doughs,
    ...(keeps ? { keepsDays: keeps } : {}),
    ovens,
    extras: entries.flatMap(({ name, times }) =>
      times.extras.map(({ value }) => ({ name, extra: value })),
    ),
  };
}
