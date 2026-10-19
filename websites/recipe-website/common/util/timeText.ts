/**
 * Times as a recipe writes them.
 *
 * `parseTimeText` reads a time *field* — a whole string that is one time —
 * in minutes (36a; moved out of `extractRecipe.ts` in 38c so the reading's
 * tidy rules could use it, and from the editor's `controller/llm/` to here in
 * 42c2 so the recipe page can share it; the old path re-exports it).
 *
 * `findStepTimes` finds the durations *inside* a step's text — "bake for 25
 * minutes", "10-12 min", "1½ hours" — with their positions, for the recipe
 * page's timer buttons (42c2).
 */
import { normalizeIngredientText } from "./parseIngredients";

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

/* ------------------------------------------------------------------------ */
/* Durations in step text (42c2)                                             */
/* ------------------------------------------------------------------------ */

const VULGAR: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const VULGAR_CLASS = `[${Object.keys(VULGAR).join("")}]`;

/**
 * A number in step text, as written: `25`, `1.5`, `1/2`, `1 1/2`, `1-1/2`,
 * `1½`, `1-½`, `½`. The hyphenated mixed numbers come before a range's dash
 * is tried, so "1-1/2 hours" is 1½ hours, not a range from 1 to ½.
 */
const STEP_NUMBER = `(?:\\d+(?:\\s+|-)\\d+\\/\\d+|\\d+\\/\\d+|\\d+-${VULGAR_CLASS}|\\d+(?:\\.\\d+)?(?:\\s?${VULGAR_CLASS})?|${VULGAR_CLASS})`;

/** Units a timer counts in. Days are not a timer ("rest 2 days"). */
const STEP_UNIT = "(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)";

/** A word for one: "an hour", "a minute", "one hour". */
const ONE = "(?:an?|one)";

/**
 * One duration, as a regex source with named groups. Alternatives, longest
 * first:
 * - `low` to/–/- `number` `unit`: "45 to 50 minutes", "10-12 min", "1½–2 hours"
 *   — a hyphen before a fraction is a mixed number's, never a range's
 * - `number` `unit`, the unit maybe hyphenated: "25 minutes", "a 10-minute rest"
 * - "half an hour", "an hour and a half", "an hour", "a minute" — not "a
 *   second", which is as often the second egg as a second
 */
const PART = [
  `(?:(?<low>${STEP_NUMBER})\\s*(?:-(?!\\d+\\/|${VULGAR_CLASS})|–|—|to)\\s*)?(?<number>${STEP_NUMBER})\\s*-?\\s*(?<unit>${STEP_UNIT})(?![a-z])`,
  `(?<half>half\\s+an?\\s+hour)(?![a-z])`,
  `(?<one>${ONE}\\s+(?<oneUnit>hour|minute))(?<andHalf>\\s+and\\s+a\\s+half)?(?![a-z])`,
].join("|");

const PART_PATTERN = new RegExp(
  `(?<![\\w./${Object.keys(VULGAR).join("")}])(?:${PART})`,
  "gi",
);

/** What joins two parts of one duration: "1 hour 15 minutes", "2 hours, and 30 minutes". */
const COMPOUND_GAP = /^\s*,?\s*(?:and\s+)?$/i;
/** What joins the two ends of a range: "30 minutes to 1 hour". */
const RANGE_GAP = /^\s*(?:-|–|—|to)\s*$/i;

/** The longest timer a step offers: a day. "Chill 48 hours" is a plan, not a timer. */
const MAX_TIMER_SECONDS = 24 * 60 * 60;

/** A number as step text writes it, in its own value. */
function stepAmount(text: string): number {
  /* A hyphen inside a number is a mixed number's: "1-1/2", "1-½". */
  const trimmed = text.trim().replace(/^(\d+)-/, "$1 ");
  const vulgar = trimmed.match(new RegExp(`^(\\d*)\\s?(${VULGAR_CLASS})$`));
  if (vulgar) return Number(vulgar[1] || 0) + VULGAR[vulgar[2]];
  return amount(trimmed.replace(/\s+/g, " "));
}

/** Seconds per unit, by the unit's first letter. */
function unitSeconds(unit: string): number {
  const letter = unit[0].toLowerCase();
  return letter === "h" ? 3600 : letter === "m" ? 60 : 1;
}

interface Part {
  start: number;
  end: number;
  /** The low end of a range inside the part ("45 to 50 minutes"), seconds. */
  low?: number;
  seconds: number;
  /** Seconds per unit of the part's unit, to order a compound's parts. */
  unit: number;
}

function readPart(match: RegExpMatchArray): Part | undefined {
  const groups = match.groups ?? {};
  const start = match.index ?? 0;
  const end = start + match[0].length;
  if (groups.number !== undefined && groups.unit !== undefined) {
    const unit = unitSeconds(groups.unit);
    const seconds = stepAmount(groups.number) * unit;
    const low =
      groups.low === undefined ? undefined : stepAmount(groups.low) * unit;
    return { start, end, seconds, low, unit };
  }
  if (groups.half !== undefined) {
    return { start, end, seconds: 1800, unit: 3600 };
  }
  if (groups.oneUnit !== undefined) {
    const unit = unitSeconds(groups.oneUnit);
    return {
      start,
      end,
      seconds: unit * (groups.andHalf ? 1.5 : 1),
      unit,
    };
  }
  return undefined;
}

/** A duration found in step text. */
export interface StepTime {
  /** Where it is in the text, as `text.slice(start, end)`. */
  start: number;
  end: number;
  /** The words as written: "45 to 50 minutes". */
  text: string;
  /**
   * What the timer runs for, in whole seconds — a range's low end (42c2,
   * Dc2-1: start checking at the earliest time the recipe gives).
   */
  seconds: number;
  /** A range's high end, in seconds; absent for one time. */
  maxSeconds?: number;
}

/**
 * Every duration in a step's text, in order, that a kitchen timer could run:
 * "25 minutes", "1 1/2 hours", "1½ hours", "1 hour 15 minutes", "45 to 50
 * minutes", "10-12 min", "30 minutes to 1 hour", "half an hour", "an hour",
 * "30 seconds". Not "overnight", "350 degrees", "2 cups", "2 days", "48 hours"
 * (over a day) or "minute 50".
 */
export function findStepTimes(text: string): StepTime[] {
  if (!text) return [];
  const parts = [...text.matchAll(PART_PATTERN)]
    .map(readPart)
    .filter((part): part is Part => part !== undefined);

  /*
   * One whole time from part `i`: the part, with any smaller units joined on
   * ("1 hour 15 minutes", each unit once). Answers the index of its last part.
   */
  const whole = (i: number) => {
    let { end, seconds, unit } = parts[i];
    while (
      i + 1 < parts.length &&
      parts[i + 1].low === undefined &&
      parts[i + 1].unit < unit &&
      COMPOUND_GAP.test(text.slice(end, parts[i + 1].start))
    ) {
      i += 1;
      seconds += parts[i].seconds;
      unit = parts[i].unit;
      end = parts[i].end;
    }
    return { last: i, end, seconds };
  };

  const times: StepTime[] = [];
  for (let i = 0; i < parts.length; i++) {
    const first = parts[i];
    let low = first.low;
    let maxSeconds: number | undefined;
    const span =
      low === undefined
        ? whole(i)
        : { last: i, end: first.end, seconds: first.seconds };
    i = span.last;
    let { end, seconds } = span;
    /* "30 minutes to 1 hour", "1 hour to 1 hour 30 minutes": a range of two whole times. */
    if (
      low === undefined &&
      i + 1 < parts.length &&
      parts[i + 1].low === undefined &&
      RANGE_GAP.test(text.slice(end, parts[i + 1].start))
    ) {
      const high = whole(i + 1);
      if (high.seconds > seconds) {
        low = seconds;
        seconds = high.seconds;
        end = high.end;
        i = high.last;
      }
    }
    if (low !== undefined && low < seconds) {
      maxSeconds = seconds;
      seconds = low;
    }
    const rounded = Math.round(seconds);
    if (rounded < 1 || (maxSeconds ?? rounded) > MAX_TIMER_SECONDS) continue;
    times.push({
      start: first.start,
      end,
      text: text.slice(first.start, end),
      seconds: rounded,
      ...(maxSeconds !== undefined && { maxSeconds: Math.round(maxSeconds) }),
    });
  }
  return times;
}

/**
 * A duration in words, for a name: 1500 → "25 minutes", 5400 → "1 hour 30
 * minutes", 30 → "30 seconds".
 */
export function durationWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const words = [
    hours && `${hours} ${hours === 1 ? "hour" : "hours"}`,
    minutes && `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    rest && `${rest} ${rest === 1 ? "second" : "seconds"}`,
  ].filter(Boolean);
  return words.length > 0 ? words.join(" ") : "0 seconds";
}

/**
 * A countdown as a timer shows it, rounded up to the next whole second so it
 * reads 0:00 only when it is done: 1500000 → "25:00", 61000 → "1:01", 5400000
 * → "1:30:00".
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}`
    : `${minutes}:${ss}`;
}
