/**
 * The edit form's rules for alternatives (45e2): what makes a set of step
 * groups a set the reader can choose from, said the way 45d says a
 * refusal — "The choice “Then make” needs at least two options".
 *
 * The form reads its sets as `choiceRuns` does — consecutive groups whose
 * `choice` is set (a blank label too, while it is being typed), one run per
 * label compared by slug, as `readChoices` compares them — and shows
 * `choiceProblems` in each set as it is edited; `parseFormData` refuses a
 * save with the same sentences. Pure and browser-safe.
 */
import type { InstructionEntry, InstructionGroup } from "../controller/types";
import { choiceSlug } from "./alternatives";

/** A set as the form holds it: entries `start` to `end` (exclusive). */
export interface ChoiceRun {
  start: number;
  end: number;
  /** The label as typed (the first option's `choice`). */
  label: string;
}

/** One rule a set breaks, at the entry it is about. */
export interface ChoiceProblem {
  /** The top-level entry: a set's first option, or the option itself. */
  index: number;
  /** The field it is about: the set's label, or an option's name. */
  field: "choice" | "name";
  message: string;
}

function isGroup(
  entry: InstructionEntry | undefined,
): entry is InstructionGroup {
  return Boolean(entry && "instructions" in entry && entry.instructions);
}

/** In a set: a group whose `choice` is set, even to "" while typed. */
export function inChoice(entry: InstructionEntry | undefined): boolean {
  return isGroup(entry) && typeof entry.choice === "string";
}

/**
 * The form's sets: each run of consecutive groups in a set with one label
 * (by slug; a label with no letters is "" and runs with other blank ones).
 * A run of one is still a run — the form says it needs a second option.
 */
export function choiceRuns(
  instructions: readonly InstructionEntry[],
): ChoiceRun[] {
  const runs: ChoiceRun[] = [];
  let i = 0;
  while (i < instructions.length) {
    const entry = instructions[i];
    if (!inChoice(entry)) {
      i++;
      continue;
    }
    const label = (entry as InstructionGroup).choice ?? "";
    const key = choiceSlug(label);
    let end = i + 1;
    while (
      end < instructions.length &&
      inChoice(instructions[end]) &&
      choiceSlug((instructions[end] as InstructionGroup).choice ?? "") === key
    ) {
      end++;
    }
    runs.push({ start: i, end, label });
    i = end;
  }
  return runs;
}

/** The run `index` is in, if any. */
export function runOf(
  runs: readonly ChoiceRun[],
  index: number,
): ChoiceRun | undefined {
  return runs.find((run) => index >= run.start && index < run.end);
}

/** "“Large Loaf”" — a name in the messages' quotes. */
function quoted(text: string): string {
  return `“${text.replace(/\s+/g, " ").trim()}”`;
}

/**
 * Every rule the sets break: a label is required; a set needs two options;
 * each option needs a name, unique in its set; and two sets may not share
 * a label (45e1's known limit: an ingredient heading names its set by the
 * label alone, so it could not tell them apart).
 */
export function choiceProblems(
  instructions: readonly InstructionEntry[],
): ChoiceProblem[] {
  const problems: ChoiceProblem[] = [];
  const runs = choiceRuns(instructions);
  const seen = new Map<string, ChoiceRun>();
  for (const run of runs) {
    const groups = instructions.slice(run.start, run.end) as InstructionGroup[];
    const label = run.label.trim();
    const key = choiceSlug(label);
    const firstName = groups.find((group) => group.name?.trim())?.name;
    const set = key ? `The choice ${quoted(label)}` : undefined;
    if (!key) {
      problems.push({
        index: run.start,
        field: "choice",
        message: firstName
          ? `The choice starting with ${quoted(firstName)} needs a label`
          : "A choice needs a label",
      });
    } else if (seen.has(key)) {
      problems.push({
        index: run.start,
        field: "choice",
        message: `Two choices are called ${quoted(label)}: give each its own label`,
      });
    } else {
      seen.set(key, run);
    }
    if (groups.length < 2) {
      problems.push({
        index: run.start,
        field: "choice",
        message: `${set ?? "A choice"} needs at least two options`,
      });
    }
    const names = new Map<string, string>();
    groups.forEach((group, offset) => {
      const index = run.start + offset;
      const name = group.name?.trim() ?? "";
      if (!name) {
        problems.push({
          index,
          field: "name",
          message: set
            ? `An option of the choice ${quoted(label)} needs a name`
            : "An option of a choice needs a name",
        });
        return;
      }
      const nameKey = choiceSlug(name) || name.toLowerCase();
      if (names.has(nameKey)) {
        problems.push({
          index,
          field: "name",
          message: `${set ?? "A choice"} has two options called ${quoted(name)}`,
        });
        return;
      }
      names.set(nameKey, name);
    });
  }
  return problems;
}
