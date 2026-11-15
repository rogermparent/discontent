/**
 * A model's reading of what each step uses (47g), as data: the numbered
 * outline it is shown, the check its answer must pass, and what that answer
 * would change. Pure and browser-safe — the fill job runs it over the stored
 * recipe (`fillRecipe`, the CLI's patch) and the edit form over what it
 * holds, as `fillGaps` is run twice (45b, Fb2).
 *
 * The model never writes a name. It is shown the ingredient lines and the
 * steps, each numbered, and answers with numbers only: `{steps: [{step,
 * lines}]}`. `checkUsesAnswer` keeps a step's answer only when every number
 * in it is a whole number that names a numbered line — a heading has no
 * number, so it can never be answered — and the step is one of the recipe's;
 * the numbers then become names through 47f's own `usesName`, the names the
 * form's chips store. So the recipe's text, whatever it says, can put
 * nothing into a suggestion but the recipe's own ingredient lines.
 *
 * Nothing here applies a suggestion by itself: the form offers each, marked,
 * and stores it only when the person accepts it and saves.
 */
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "../controller/types";
import { ingredientChipLabel } from "../components/Form/Instructions/stepChecks";
import { stripMarkup } from "./ingredientNames";
import {
  USES_MAX_NAMES,
  USES_MAX_NAME_LENGTH,
  lineNames,
  resolveStepUses,
  stepSection,
  usesLine,
  usesName,
  type LineNames,
} from "./stepIngredients";
import { stepPlainText } from "./stepPlainText";

/** One step as the outline numbers it. */
export interface OutlineStep {
  /** Where it is: the entry, and the step inside a group (0 outside one). */
  entry: number;
  step: number;
  /** Its number in reading order, from 1 — the form's own step number. */
  number: number;
  /** Its text as stored (`stepKey` compares it). */
  text: string;
  /** Whether the step has a stored `uses` already. */
  stored: boolean;
}

/** The recipe as the model is shown it: what each number means. */
export interface UsesOutline {
  /** Line number − 1 → the index into `ingredients`. Headings have none. */
  lines: number[];
  /** Every step, in reading order; a blank one is numbered and not shown. */
  steps: OutlineStep[];
  /** The numbered lines and steps, as text. */
  text: string;
}

/** A step's answer that passed the check. */
export interface StepUsesAnswer {
  entry: number;
  step: number;
  number: number;
  /** The step's text when it was read: an answer is for that text only. */
  text: string;
  /** The ingredient lines (indices), in the list's order. */
  lines: number[];
  /** The same as names, as a step's `uses` stores them (47f). */
  uses: string[];
}

/** A step's text as two readings of it are compared: spaces single, trimmed. */
export function stepKey(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function plain(text: string | undefined): string {
  return stripMarkup(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function stepsOf(entry: InstructionEntry): readonly Instruction[] {
  return "instructions" in entry ? (entry.instructions ?? []) : [entry];
}

/**
 * The numbered outline: every ingredient line that is not a heading or a
 * blank gets a number, and every step does. Headings and group names are
 * shown in brackets, unnumbered; an option of a set of alternatives (45e)
 * says so.
 */
export function usesOutline(
  ingredients: readonly Ingredient[] = [],
  instructions: readonly InstructionEntry[] = [],
  names: readonly LineNames[] = lineNames(ingredients),
): UsesOutline {
  const numbered = new Map(names.map((line, at) => [line.index, at + 1]));
  const out: string[] = ["Ingredient lines:"];
  ingredients.forEach((line, index) => {
    const text = plain(line.ingredient);
    if (!text) return;
    const number = numbered.get(index);
    out.push(
      number === undefined
        ? `[${text.replace(/:\s*$/, "")}]`
        : `${number}. ${text}`,
    );
  });
  out.push("", "Steps:");
  const steps: OutlineStep[] = [];
  instructions.forEach((entry, i) => {
    if ("instructions" in entry) {
      const name = plain(entry.name);
      const choice = plain(entry.choice);
      if (name || choice) {
        out.push(
          choice
            ? `[${name || "(no name)"} — one way to do “${choice}”; a cook follows only one of these ways]`
            : `[${name}]`,
        );
      }
    }
    stepsOf(entry).forEach((step, j) => {
      const number = steps.length + 1;
      const text = step?.text ?? "";
      steps.push({
        entry: i,
        step: j,
        number,
        text,
        stored: Array.isArray(step?.uses),
      });
      const shown = [
        plain(step?.name).replace(/[:.]\s*$/, ""),
        stepPlainText(text),
      ]
        .filter(Boolean)
        .join(": ");
      if (shown) out.push(`${number}. ${shown}`);
    });
  });
  return {
    lines: names.map((line) => line.index),
    steps,
    text: out.join("\n"),
  };
}

export interface CheckedUses {
  /** The steps whose answer passed, in reading order. */
  answers: StepUsesAnswer[];
  /** How many of the answer's entries were dropped for their numbers. */
  dropped: number;
  /**
   * The numbers of the steps left out because a line they use cannot be
   * named apart from another (two lines written the same, 47f Df12).
   */
  unnamed: number[];
  /** Why the whole answer was refused, when it was. */
  problem?: string;
}

function wholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Check a model's answer against the outline it was shown. The whole answer
 * is refused when it is not `{steps: [...]}`. One entry is dropped — the
 * others stand — when: it is not `{step, lines}` with whole numbers; its
 * step is not one of the recipe's, is blank, or is answered twice (then
 * every answer for it goes); or any of its lines is not a numbered line.
 * A step is also left out (`unnamed`) when one of its lines cannot be named
 * so that the name finds it again — two lines written the same (47f Df12):
 * a list without that line would be a wrong one. A step the answer leaves
 * out has no suggestion — never an empty list.
 */
export function checkUsesAnswer(
  data: unknown,
  outline: UsesOutline,
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
  names: readonly LineNames[] = lineNames(ingredients),
): CheckedUses {
  const raw =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { steps?: unknown }).steps
      : undefined;
  if (!Array.isArray(raw)) {
    return {
      answers: [],
      dropped: 0,
      unnamed: [],
      problem: "the answer is not a list of steps",
    };
  }
  let dropped = 0;
  const seen = new Map<number, number[] | null>();
  for (const item of raw) {
    const { step, lines } = (item && typeof item === "object" ? item : {}) as {
      step?: unknown;
      lines?: unknown;
    };
    if (!wholeNumber(step) || !Array.isArray(lines)) {
      dropped += 1;
      continue;
    }
    if (seen.has(step)) {
      /* Two answers for one step: neither is trusted. */
      if (seen.get(step) !== null) dropped += 1;
      seen.set(step, null);
      dropped += 1;
      continue;
    }
    const known = outline.steps[step - 1];
    if (
      !known ||
      !stepKey(known.text) ||
      lines.length > USES_MAX_NAMES ||
      !lines.every(
        (line) =>
          wholeNumber(line) && line >= 1 && line <= outline.lines.length,
      )
    ) {
      seen.set(step, null);
      dropped += 1;
      continue;
    }
    seen.set(step, lines as number[]);
  }
  const labels = new Map<number, string>();
  const answers: StepUsesAnswer[] = [];
  const unnamed: number[] = [];
  for (const known of outline.steps) {
    const numbers = seen.get(known.number);
    if (!numbers) continue;
    const section = stepSection(instructions[known.entry]);
    const lines = [...new Set(numbers.map((n) => outline.lines[n - 1]))].sort(
      (a, b) => a - b,
    );
    const uses: string[] = [];
    for (const line of lines) {
      if (!labels.has(line)) {
        labels.set(line, ingredientChipLabel(ingredients[line]));
      }
      const name = usesName(
        ingredients,
        line,
        labels.get(line) ?? "",
        section,
        names,
      ).trim();
      if (
        !name ||
        name.length > USES_MAX_NAME_LENGTH ||
        usesLine(ingredients, name, section, names) !== line
      ) {
        break;
      }
      uses.push(name);
    }
    if (uses.length !== lines.length) {
      unnamed.push(known.number);
      continue;
    }
    answers.push({
      entry: known.entry,
      step: known.step,
      number: known.number,
      text: known.text,
      lines,
      uses,
    });
  }
  return { answers, dropped, unnamed };
}

/** Whether two lists name the same lines, in any order. */
export function sameLines(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): boolean {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  return left.size === right.size && [...left].every((line) => right.has(line));
}

function stepAt(
  instructions: readonly InstructionEntry[],
  entry: number,
  step: number,
): Instruction | undefined {
  const at = instructions[entry];
  if (!at) return undefined;
  return "instructions" in at
    ? at.instructions?.[step]
    : step === 0
      ? at
      : undefined;
}

/** `instructions` with `uses` set on the steps `answers` name. */
function withUses(
  instructions: readonly InstructionEntry[],
  answers: readonly StepUsesAnswer[],
): InstructionEntry[] {
  const at = new Map(answers.map((a) => [`${a.entry}:${a.step}`, a.uses]));
  return instructions.map((entry, i) => {
    if ("instructions" in entry) {
      return {
        ...entry,
        instructions: (entry.instructions ?? []).map((step, j) => {
          const uses = at.get(`${i}:${j}`);
          return uses ? { ...step, uses: [...uses] } : step;
        }),
      };
    }
    const uses = at.get(`${i}:0`);
    return uses ? { ...entry, uses: [...uses] } : entry;
  });
}

/**
 * The answers that still fit `instructions` and `ingredients`: the step is
 * where it was with the text that was read, and each name finds a line. The
 * lines are read again from the names, and the step's number from its
 * place, since both lists may have changed. The form runs this over its own
 * values when a fill lands.
 */
export function fittingAnswers(
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
  answers: readonly StepUsesAnswer[],
): StepUsesAnswer[] {
  const names = lineNames(ingredients);
  const starts: number[] = [];
  let count = 0;
  for (const entry of instructions) {
    starts.push(count);
    count += stepsOf(entry).length;
  }
  const out: StepUsesAnswer[] = [];
  /* A job's result is read back from its record: anything that is not an
   * answer's shape is skipped, never thrown on. */
  const list: readonly StepUsesAnswer[] = Array.isArray(answers) ? answers : [];
  for (const answer of list) {
    if (
      !answer ||
      typeof answer.text !== "string" ||
      !Array.isArray(answer.uses) ||
      !answer.uses.every((name) => typeof name === "string")
    ) {
      continue;
    }
    const step = stepAt(instructions, answer.entry, answer.step);
    if (!step || stepKey(step.text) !== stepKey(answer.text)) continue;
    const section = stepSection(instructions[answer.entry]);
    const lines = answer.uses.map((name) =>
      usesLine(ingredients, name, section, names),
    );
    if (lines.some((line) => line === undefined)) continue;
    out.push({
      ...answer,
      number: starts[answer.entry] + answer.step + 1,
      lines: lines as number[],
    });
  }
  return out;
}

export interface UsesChanges {
  /** `instructions`, with a `uses` on each changed step. */
  instructions: InstructionEntry[];
  /** The steps given a `uses`, in reading order. */
  changed: StepUsesAnswer[];
}

/**
 * What the answers change when all are taken: the fewest steps that need a
 * stored `uses` for every answered step to show the answer's lines.
 *
 * A step whose answer is what the page shows anyway is left alone (nothing
 * to approve). But a stored list changes the guess of the steps after it
 * (47f Df5: a line taken off step 2 is listed by the next step that names
 * it; a line step 3 stores is no longer step 4's first mention), so the
 * steps are settled in reading order: each answer is compared with what the
 * page shows once the lists before it are stored, and stored itself only
 * when that differs.
 *
 * A step that already has a stored `uses` is never changed, unless `all`.
 */
export function usesChanges(
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
  answers: readonly StepUsesAnswer[],
  { all = false }: { all?: boolean } = {},
): UsesChanges {
  const open = fittingAnswers(ingredients, instructions, answers).filter(
    (answer) =>
      all ||
      !Array.isArray(stepAt(instructions, answer.entry, answer.step)?.uses),
  );
  const changed: StepUsesAnswer[] = [];
  let applied = [...instructions];
  let shown = resolveStepUses(ingredients, applied).lines;
  for (const answer of open) {
    if (sameLines(shown[answer.entry]?.[answer.step], answer.lines)) continue;
    changed.push(answer);
    applied = withUses(instructions, changed);
    shown = resolveStepUses(ingredients, applied).lines;
  }
  return { instructions: applied, changed };
}

/** A step's suggestion as the form holds it. */
export interface SuggestedStepUses {
  entry: number;
  step: number;
  /** The text the model read: the suggestion is for that text only. */
  text: string;
  /** The names to store, when accepted. */
  uses: string[];
}

/** What a fill suggests the steps use (47g): never applied by itself. */
export interface SuggestedUses {
  /** Who suggested: "local model qwen3:8b", "the Claude API (…)". */
  model: string;
  steps: SuggestedStepUses[];
}

/**
 * What the form is handed when a fill lands (45b's Fb2, for the steps): the
 * answers that fit what the form holds now, as suggestions, and the numbers
 * of the steps where one differs from what the step shows — none of them a
 * step with a stored list, which is the person's.
 */
export function usesOffers(
  ingredients: readonly Ingredient[],
  instructions: readonly InstructionEntry[],
  answers: readonly StepUsesAnswer[],
): { steps: SuggestedStepUses[]; offered: number[] } {
  const fitting = fittingAnswers(ingredients, instructions, answers);
  const shown = resolveStepUses(ingredients, instructions);
  return {
    steps: fitting.map(({ entry, step, text, uses }) => ({
      entry,
      step,
      text,
      uses,
    })),
    offered: fitting
      .filter(
        (answer) =>
          !shown.stored[answer.entry]?.[answer.step] &&
          !sameLines(shown.lines[answer.entry]?.[answer.step], answer.lines),
      )
      .map((answer) => answer.number),
  };
}

/** "2", "2 and 4", "2, 4 and 5". */
export function numberList(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.join("");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}
