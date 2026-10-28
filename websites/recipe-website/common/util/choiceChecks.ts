/**
 * The edit form's rules for alternatives (45e2): what makes a set of step
 * groups a set the reader can choose from, said the way 45d says a
 * refusal — "The choice “Then make” needs at least two options".
 *
 * **Two kinds of set.** A set as stored reads exactly as `readChoices`
 * reads it — consecutive groups whose `choice` has one slug, with two or
 * more options; a lone group with a `choice` is an ordinary group that
 * keeps its key — and nothing here judges it (43-D4: an unchanged save
 * stays byte-identical, even of data that breaks a rule). A set the person
 * has **worked on** carries an id (`SetIds`: the form's, or the
 * `choiceSet` each of its options posts): its bounds are its id's, not its
 * label's — so typing a neighbour's label never merges the two — and every
 * rule applies to it, a set of one or a blank label (while it is typed)
 * included. `choiceProblems` lists what a worked-on set breaks; the form
 * shows it in the set and `parseFormData` refuses a save with the same
 * sentences. The curation write path (`recipe_create` / `recipe_update`)
 * reads every set as worked on (`everySet`). Pure and browser-safe.
 */
import type { InstructionEntry, InstructionGroup } from "../controller/types";
import { choiceSlug } from "./alternatives";
import { formatDurationLong } from "./formatDuration";

/** A set as the form holds it: entries `start` to `end` (exclusive). */
export interface ChoiceRun {
  start: number;
  end: number;
  /** The label as typed (the first option's `choice`). */
  label: string;
  /** A set the person has worked on: its id. Absent for one as stored. */
  set?: string;
}

/**
 * Per top-level entry, the worked-on set it is an option of (by id), or
 * undefined: a step, an ordinary group, or an option of a set as stored.
 */
export type SetIds = readonly (string | undefined)[];

/** One rule a set breaks, at the entry it is about. */
export interface ChoiceProblem {
  /** The top-level entry: a set's first option, or the option itself. */
  index: number;
  /**
   * The field it is about: the set's label, an option's name, or (46f) an
   * option's total time.
   */
  field: "choice" | "name" | "totalTime";
  message: string;
}

/* The curation input may hold prose strings beside objects (45d's trap). */
function isGroup(entry: unknown): entry is InstructionGroup {
  return (
    typeof entry === "object" &&
    entry !== null &&
    Array.isArray((entry as InstructionGroup).instructions)
  );
}

/** In a set: a group whose `choice` is set, even to "" while typed. */
export function inChoice(entry: unknown): boolean {
  return isGroup(entry) && typeof entry.choice === "string";
}

function slugOf(entry: unknown): string {
  return isGroup(entry) ? choiceSlug((entry.choice ?? "").trim()) : "";
}

/** How many options `readChoices` reads in `groups`: one per name (by slug); an unnamed group is one of its own. */
function optionCount(groups: readonly InstructionGroup[]): number {
  const names = new Set<string>();
  let unnamed = 0;
  for (const group of groups) {
    const slug = choiceSlug((group.name ?? "").trim());
    if (slug) names.add(slug);
    else unnamed++;
  }
  return names.size + unnamed;
}

/**
 * The sets: each worked-on set (consecutive options of one id), and each
 * set as stored that `readChoices` reads as a set (consecutive groups of one
 * label slug, not worked on, with two or more options).
 */
export function choiceRuns(
  instructions: readonly InstructionEntry[],
  sets: SetIds = [],
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
    const set = sets[i];
    let end = i + 1;
    if (set !== undefined) {
      while (
        end < instructions.length &&
        inChoice(instructions[end]) &&
        sets[end] === set
      ) {
        end++;
      }
      runs.push({ start: i, end, label, set });
      i = end;
      continue;
    }
    const key = slugOf(entry);
    if (!key) {
      i++;
      continue;
    }
    while (
      end < instructions.length &&
      inChoice(instructions[end]) &&
      sets[end] === undefined &&
      slugOf(instructions[end]) === key
    ) {
      end++;
    }
    const groups = instructions.slice(i, end) as InstructionGroup[];
    if (optionCount(groups) >= 2) runs.push({ start: i, end, label });
    i = end;
  }
  return runs;
}

/**
 * Every group with a `choice` read as worked on, its sets bounded by label
 * as `readChoices` bounds them — for the curation write path, which judges
 * every set it is handed.
 */
export function everySet(instructions: readonly unknown[]): SetIds {
  const ids: (string | undefined)[] = [];
  let run = 0;
  instructions.forEach((entry, index) => {
    if (!inChoice(entry)) {
      ids.push(undefined);
      return;
    }
    const previous = instructions[index - 1];
    if (!(inChoice(previous) && slugOf(previous) === slugOf(entry))) run++;
    ids.push(`set-${run}`);
  });
  return ids;
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
 * An option's times that cannot be (46f): a total shorter than its own
 * prep or cook time. Within the option only — its times are the recipe's
 * when it is made, so the recipe's own are not its to meet.
 */
export function optionTimeProblem(
  group: Pick<InstructionGroup, "prepTime" | "cookTime" | "totalTime">,
  name: string,
): string | undefined {
  const at = (value: unknown) =>
    typeof value === "number" && value > 0 ? value : 0;
  const total = at(group.totalTime);
  if (!total) return undefined;
  const option = name.trim() ? quoted(name) : "an option";
  const checks = [
    [at(group.cookTime), "cook"],
    [at(group.prepTime), "prep"],
  ] as const;
  for (const [value, kind] of checks) {
    if (total < value) {
      return `The total time of ${option} (${formatDurationLong(total)}) is shorter than its ${kind} time (${formatDurationLong(value)})`;
    }
  }
  return undefined;
}

/**
 * Every rule the worked-on sets break: a label is required; a set needs two
 * options; each option needs a name, unique in its set; two sets may not
 * share a label (45e1's known limit: an ingredient heading names its set by
 * the label alone, so it could not tell them apart); and a set next to a
 * group of its label would be read as one set with it, so it may not.
 * An option's total time may not be shorter than its own prep or cook
 * time (46f). A set as stored is judged by none of them.
 */
export function choiceProblems(
  instructions: readonly InstructionEntry[],
  sets: SetIds = [],
): ChoiceProblem[] {
  const problems: ChoiceProblem[] = [];
  const runs = choiceRuns(instructions, sets);
  runs.forEach((run, position) => {
    if (run.set === undefined) return;
    const groups = instructions.slice(run.start, run.end) as InstructionGroup[];
    const label = run.label.trim();
    const key = choiceSlug(label);
    const firstName = groups.find((group) => group.name?.trim())?.name;
    const set = key ? `The choice ${quoted(label)}` : undefined;
    const touching =
      key !== "" &&
      ((inChoice(instructions[run.start - 1]) &&
        slugOf(instructions[run.start - 1]) === key) ||
        (inChoice(instructions[run.end]) &&
          slugOf(instructions[run.end]) === key));
    /* A clash is said once: by the later set, or by the worked-on one
     * when the other is as stored (which is never judged). */
    const clash = runs.some(
      (other, at) =>
        at !== position &&
        choiceSlug(other.label.trim()) === key &&
        (at < position || other.set === undefined),
    );
    if (!key) {
      problems.push({
        index: run.start,
        field: "choice",
        message: firstName
          ? `The choice starting with ${quoted(firstName)} needs a label`
          : "A choice needs a label",
      });
    } else if (touching) {
      problems.push({
        index: run.start,
        field: "choice",
        message: "Two choices next to each other can't share a label",
      });
    } else if (clash) {
      problems.push({
        index: run.start,
        field: "choice",
        message: `Two choices are called ${quoted(label)}: give each its own label`,
      });
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
      const timeProblem = optionTimeProblem(group, name);
      if (timeProblem) {
        problems.push({ index, field: "totalTime", message: timeProblem });
      }
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
  });
  return problems;
}
