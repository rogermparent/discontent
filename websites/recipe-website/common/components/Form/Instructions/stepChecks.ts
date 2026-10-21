/**
 * What the Steps section says about each step (43e2, canvas B): the lines it
 * uses — the recipe page's own matcher (42c1, `matchStepIngredients`, only
 * confident matches) — the waits in it (`findStepTimes`, 42c2), and whether
 * every ingredient is named somewhere. It only informs: the matcher misses
 * odd names, so nothing here blocks a save. Pure.
 */
import type { Ingredient, InstructionEntry } from "../../../controller/types";
import { detectHeading } from "../../../util/detectHeading";
import {
  nameLabel,
  parseIngredientLine,
  stripMarkup,
} from "../../../util/ingredientNames";
import {
  matchStepIngredients,
  type StepLines,
} from "../../../util/stepIngredients";
import { stepPlainText } from "../../../util/stepPlainText";
import { findStepTimes } from "../../../util/timeText";
import { formatDurationCompact } from "../../../util/formatDuration";

/** The lines each step uses, or no lines at all when the matcher throws. */
export function stepLines(
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
): StepLines {
  try {
    return matchStepIngredients(ingredients, instructions);
  } catch {
    return instructions.map((entry) =>
      "instructions" in entry ? entry.instructions.map(() => []) : [[]],
    );
  }
}

/**
 * A line's short name for a "uses" chip — "flour" for "2 cups (250g)
 * all-purpose flour" — from the names the matcher reads; the line as
 * written when it names nothing.
 */
export function ingredientChipLabel(line: Ingredient): string {
  const text = line.ingredient ?? "";
  try {
    const [first] = parseIngredientLine(text);
    const name = first?.alternatives[0];
    const label = name ? nameLabel(name) : "";
    if (label) return label;
  } catch {
    /* fall through to the line itself */
  }
  return stripMarkup(text).trim();
}

/** The ingredient lines (not headings) that no step names. */
export function unnamedLines(
  ingredients: readonly Ingredient[],
  lines: StepLines,
): number[] {
  const used = new Set(lines.flat(2));
  const out: number[] = [];
  ingredients.forEach((line, index) => {
    const text = stripMarkup(line.ingredient ?? "").trim();
    if (!text || line.type === "heading" || detectHeading(text)) return;
    if (!used.has(index)) out.push(index);
  });
  return out;
}

/** A wait the step names: "chill 1 hour". */
export interface StepWait {
  label: string;
  seconds: number;
  /** The waiting word, when one came before the time: "chill". */
  verb?: string;
}

/** Words for waiting: what dough, a marinade or a drink does with time. */
const WAIT_VERBS =
  /\b(chill(?:ed|ing)?|refrigerat\w*|rest(?:ed|ing|s)?|rise|rising|proof\w*|marinat\w*|soak\w*|steep\w*|freez\w*|set(?:s|ting)? aside|let (?:it )?(?:sit|stand|cool)|sit|stand|cool(?:ed|ing|s)?|infus\w*)\b[^.;]*$/i;

/** A time on its own this long is a wait whatever the verb (a long bake is one). */
const LONG_WAIT_SECONDS = 30 * 60;

/**
 * The waits in a step: each time `findStepTimes` finds, when a waiting word
 * comes before it in the same sentence ("Cover and chill the dough for 1
 * hour"), or when it is half an hour or more. A minute of beating is not a
 * wait. Labelled with the verb when there is one.
 */
export function stepWaits(text: string): StepWait[] {
  const plain = stepPlainText(text);
  const waits: StepWait[] = [];
  for (const time of findStepTimes(plain)) {
    const before = plain.slice(Math.max(0, time.start - 80), time.start);
    const verb = WAIT_VERBS.exec(before);
    if (!verb && time.seconds < LONG_WAIT_SECONDS) continue;
    const word = verb ? waitWord(verb[1]) : "";
    waits.push({
      label: word ? `${word} ${time.text}` : time.text,
      seconds: time.seconds,
      ...(word ? { verb: word } : {}),
    });
  }
  return waits;
}

/** "chilling" → "chill", "refrigerate" → "chill", "let it sit" → "sit". */
function waitWord(verb: string): string {
  const word = verb.toLowerCase();
  if (word.startsWith("chill") || word.startsWith("refrigerat")) return "chill";
  if (word.startsWith("rest")) return "rest";
  if (word === "rise" || word === "rising" || word.startsWith("proof"))
    return "rise";
  if (word.startsWith("marinat")) return "marinate";
  if (word.startsWith("soak")) return "soak";
  if (word.startsWith("steep")) return "steep";
  if (word.startsWith("freez")) return "freeze";
  if (word.startsWith("infus")) return "infuse";
  if (word.startsWith("cool") || word.endsWith("cool")) return "cool";
  if (word.endsWith("stand") || word === "stand") return "stand";
  if (word.endsWith("sit") || word === "sit") return "sit";
  if (word.startsWith("set")) return "set aside";
  return word;
}

/**
 * The Times section's hint (canvas B): what prep + cook adds up to, and —
 * when the total is longer — where the rest plainly is ("the chill in step
 * 3"), said only when exactly one step names a wait. `undefined` when there
 * is nothing to add up.
 */
export function timesHint({
  prepTime,
  cookTime,
  totalTime,
  instructions,
}: {
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  instructions: readonly InstructionEntry[];
}): { sum: string; rest?: string } | undefined {
  const prep = prepTime || 0;
  const cook = cookTime || 0;
  const total = totalTime || 0;
  if (!prep || !cook) return undefined;
  const sum = formatDurationCompact(prep + cook);
  if (!total) return { sum, rest: "with no total, the recipe shows that" };
  if (total === prep + cook) return { sum, rest: "the same as the total" };
  if (total < prep + cook) return { sum, rest: "longer than the total" };
  const waiting = flatSteps(instructions)
    .map((step, index) => ({ index, waits: stepWaits(step.text) }))
    .filter((step) => step.waits.length > 0);
  const only = waiting.length === 1 ? waiting[0] : undefined;
  const verb = only?.waits.length === 1 ? only.waits[0].verb : undefined;
  if (only && verb) {
    return { sum, rest: `the rest is the ${verb} in step ${only.index + 1}` };
  }
  return {
    sum,
    rest: `the other ${formatDurationCompact(total - prep - cook)} is waiting`,
  };
}

/** Each step's text, in reading order, with its place: entry, then step. */
export function flatSteps(
  instructions: readonly InstructionEntry[],
): { entry: number; step: number; text: string }[] {
  const out: { entry: number; step: number; text: string }[] = [];
  instructions.forEach((entry, i) => {
    if ("instructions" in entry) {
      entry.instructions.forEach((step, j) =>
        out.push({ entry: i, step: j, text: step.text ?? "" }),
      );
    } else {
      out.push({ entry: i, step: 0, text: entry.text ?? "" });
    }
  });
  return out;
}
