/**
 * The Steps section's edits for alternatives (45e2), pure so the form and
 * its tests read the same rules: make adjacent groups a choice, undo it,
 * relabel a set (its tied ingredient headings follow), reorder its options
 * (the first is the default, G2), add one, and move an ordinary entry past
 * a set whole rather than into it.
 */
import type {
  Ingredient,
  InstructionEntry,
  InstructionGroup,
} from "../../../controller/types";
import { choiceSlug } from "../../../util/alternatives";
import {
  choiceRuns,
  inChoice,
  runOf,
  type ChoiceRun,
} from "../../../util/choiceChecks";
import type { SuggestedChoice } from "../../../util/suggestChoices";

function isGroup(
  entry: InstructionEntry | undefined,
): entry is InstructionGroup {
  return Boolean(entry && "instructions" in entry && entry.instructions);
}

/** A group with no `choice` and no option yield. */
function plainGroup(group: InstructionGroup): InstructionGroup {
  const { choice: _choice, recipeYield: _yield, ...rest } = group;
  void _choice;
  void _yield;
  return rest;
}

/**
 * Why `indexes` cannot be made a choice, or undefined when they can: two
 * or more groups, next to each other, none already in a set (`runs`).
 */
export function selectionProblem(
  instructions: readonly InstructionEntry[],
  indexes: readonly number[],
  runs: readonly ChoiceRun[] = choiceRuns(instructions),
): string | undefined {
  const sorted = [...indexes].sort((a, b) => a - b);
  if (sorted.length < 2) return "Tick at least two groups.";
  if (
    sorted.some((index) => !isGroup(instructions[index]) || runOf(runs, index))
  ) {
    return "Only groups that are not in a choice yet can be ticked.";
  }
  if (sorted.some((index, i) => i > 0 && index !== sorted[i - 1] + 1)) {
    return "The groups must sit next to each other, with no step between them.";
  }
  return undefined;
}

/** A set of `runs` other than `except` labelled `label` (by slug). */
export function labelTaken(
  runs: readonly ChoiceRun[],
  label: string,
  except?: ChoiceRun,
): ChoiceRun | undefined {
  const key = choiceSlug(label.trim());
  if (!key) return undefined;
  return runs.find(
    (run) =>
      run.start !== except?.start && choiceSlug(run.label.trim()) === key,
  );
}

/** Why `label` cannot be a new set's label, or undefined when it can. */
export function labelProblem(
  runs: readonly ChoiceRun[],
  label: string,
  except?: ChoiceRun,
): string | undefined {
  if (!choiceSlug(label.trim()))
    return "Give the choice a label, such as “Then make”.";
  const clash = labelTaken(runs, label, except);
  return clash
    ? `Another choice is already called “${clash.label.trim()}”.`
    : undefined;
}

/** `indexes` (adjacent groups) made one set labelled `label`. */
export function makeChoice(
  instructions: readonly InstructionEntry[],
  indexes: readonly number[],
  label: string,
): InstructionEntry[] {
  const chosen = new Set(indexes);
  return instructions.map((entry, index) =>
    chosen.has(index) && isGroup(entry)
      ? { ...entry, choice: label.trim() }
      : entry,
  );
}

/** "Not a choice": the run's groups ordinary again, their yields gone. */
export function notChoice(
  instructions: readonly InstructionEntry[],
  run: ChoiceRun,
): InstructionEntry[] {
  return instructions.map((entry, index) =>
    index >= run.start && index < run.end && isGroup(entry)
      ? plainGroup(entry)
      : entry,
  );
}

/** Every option of `run` labelled `label`. */
export function relabel(
  instructions: readonly InstructionEntry[],
  run: ChoiceRun,
  label: string,
): InstructionEntry[] {
  return instructions.map((entry, index) =>
    index >= run.start && index < run.end && isGroup(entry)
      ? { ...entry, choice: label }
      : entry,
  );
}

/**
 * Ingredient headings tied to the set labelled `from` (by slug), tied to
 * `to` instead — a relabelled set keeps its extras. `to` undefined unties
 * them ("Not a choice"). Never to a blank label: a label being typed
 * through "" would leave its headings tied to nothing, so they wait.
 */
export function retieHeadings(
  ingredients: readonly Ingredient[],
  from: string,
  to: string | undefined,
): Ingredient[] {
  const key = choiceSlug(from.trim());
  if (!key) return [...ingredients];
  if (to !== undefined && !choiceSlug(to.trim())) return [...ingredients];
  let changed = false;
  const next = ingredients.map((line) => {
    if (
      line.type !== "heading" ||
      line.choice === undefined ||
      choiceSlug(line.choice.trim()) !== key
    ) {
      return line;
    }
    changed = true;
    if (to === undefined) {
      const { choice: _choice, ...rest } = line;
      void _choice;
      return rest;
    }
    return { ...line, choice: to.trim() };
  });
  return changed ? next : [...ingredients];
}

/**
 * A relabelled set's headings, once the label is settled (the field left,
 * or Enter): from `tiedAs` — the label they were last tied under — to the
 * set's label now. Nothing moves to a blank label, to one another set has
 * (the clash is being fixed: they wait for a label of the set's own), or
 * from one another set has too (theirs would move with them). `tiedAs` is
 * the label the headings are tied under afterwards.
 */
export function settleLabel(
  ingredients: readonly Ingredient[],
  runs: readonly ChoiceRun[],
  run: ChoiceRun,
  tiedAs: string,
): { ingredients: Ingredient[]; tiedAs: string } {
  const label = run.label.trim();
  if (!choiceSlug(label) || labelTaken(runs, label, run)) {
    return { ingredients: [...ingredients], tiedAs };
  }
  if (labelTaken(runs, tiedAs, run)) {
    return { ingredients: [...ingredients], tiedAs: label };
  }
  return {
    ingredients: retieHeadings(ingredients, tiedAs, label),
    tiedAs: label,
  };
}

/** The option at `from` moved to `to`, both inside `run`. */
export function moveOption(
  instructions: readonly InstructionEntry[],
  run: ChoiceRun,
  from: number,
  to: number,
): InstructionEntry[] {
  if (to < run.start || to >= run.end || from === to) return [...instructions];
  const next = [...instructions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A new, empty option at the end of `run`. */
export function addOption(
  instructions: readonly InstructionEntry[],
  run: ChoiceRun,
): InstructionEntry[] {
  const next = [...instructions];
  next.splice(run.end, 0, {
    name: "",
    choice: run.label,
    instructions: [{ text: "" }],
  });
  return next;
}

/**
 * Where an ordinary entry at `index` goes one step `up` or down: past a
 * whole set (of `runs`) rather than between its options, which would split
 * it. Undefined at either end.
 */
export function moveTarget(
  instructions: readonly InstructionEntry[],
  index: number,
  up: boolean,
  runs: readonly ChoiceRun[] = choiceRuns(instructions),
): number | undefined {
  const neighbour = up ? index - 1 : index + 1;
  if (neighbour < 0 || neighbour >= instructions.length) return undefined;
  const run = runOf(runs, neighbour);
  if (!run) return neighbour;
  /* After the move the entry sits just before or just after the set. */
  return up ? run.start : run.end - 1;
}

/** `instructions` with the entry at `from` moved to `to`. */
export function moveEntry(
  instructions: readonly InstructionEntry[],
  from: number,
  to: number,
): InstructionEntry[] {
  const next = [...instructions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Whether a suggestion still fits the form: its entries are still named
 * groups, next to each other, none in a set — an edit since the import
 * may have moved them.
 */
export function suggestionFits(
  instructions: readonly InstructionEntry[],
  suggestion: SuggestedChoice,
): boolean {
  return (
    suggestion.groups.length >= 2 &&
    suggestion.groups.every(
      (index, i) =>
        (i === 0 || index === suggestion.groups[i - 1] + 1) &&
        isGroup(instructions[index]) &&
        !inChoice(instructions[index]) &&
        Boolean((instructions[index] as InstructionGroup).name?.trim()),
    )
  );
}
