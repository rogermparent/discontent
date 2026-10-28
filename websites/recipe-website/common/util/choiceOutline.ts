/**
 * What the model is shown when the edit page asks it to look for
 * alternatives (46f, Roger on 45-De2-1: "at least let this be an option to
 * try out"), and how its answer is held to the recipe.
 *
 * **The outline.** Each top-level entry of the form's steps as it stands —
 * a group's name and its first step, or a bare step's text — with whether
 * it is already in a choice. Small (a first line is cut at
 * `OUTLINE_FIRST_MAX`), so the job's spec can carry it and a retry asks
 * the same question.
 *
 * **The grounding.** The model answers sets of entry numbers (1-based, as
 * the outline lists them). Each number must name an entry that exists,
 * is a named group and is in no choice yet, and that no earlier set has
 * taken — anything else is dropped. A set needs two or more groups left,
 * next to each other, and a label of 1–`CHOICE_LABEL_MAX` characters;
 * otherwise the whole set is dropped. What passes is a `SuggestedChoice`,
 * shown in the form as a marked card ("suggested by the model") that the
 * person accepts or puts away (G5): never applied by itself.
 *
 * Pure and browser-safe: the edit page builds the outline from its values,
 * and the server grounds the answer against it.
 */
import type { InstructionEntry, InstructionGroup } from "../controller/types";
import { stepPlainText } from "./stepPlainText";
import type { SuggestedChoice } from "./suggestChoices";

/** How much of a first step the model sees. */
export const OUTLINE_FIRST_MAX = 120;

/** The most entries the model is shown (a longer recipe is cut). */
export const OUTLINE_MAX_ENTRIES = 80;

/** A proposed set's longest label ("Then make", "Frosting"). */
export const CHOICE_LABEL_MAX = 40;

/** One top-level entry of the steps, as the model sees it. */
export interface OutlineEntry {
  /** A group (named or not), else a bare step. */
  group: boolean;
  /** The group's name; "" for a step or an unnamed group. */
  name: string;
  /** The group's first step, or the step itself: plain words, cut. */
  first: string;
  /** Already an option of a choice (a group with a `choice`). */
  inChoice: boolean;
}

/** A set as the model proposes it, before grounding. */
export interface ProposedSet {
  label: string;
  /** Entry numbers, 1-based as the outline lists them. */
  groups: number[];
}

function isGroup(entry: InstructionEntry): entry is InstructionGroup {
  return "instructions" in entry && Array.isArray(entry.instructions);
}

function cut(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** The steps as the model is shown them (at most `OUTLINE_MAX_ENTRIES`). */
export function choiceOutline(
  instructions: readonly InstructionEntry[],
): OutlineEntry[] {
  return instructions.slice(0, OUTLINE_MAX_ENTRIES).map((entry) => {
    if (!isGroup(entry)) {
      return {
        group: false,
        name: "",
        first: cut(stepPlainText(entry.text), OUTLINE_FIRST_MAX),
        inChoice: false,
      };
    }
    const first = entry.instructions.find((step) => step.text?.trim());
    return {
      group: true,
      name: cut(entry.name ?? "", OUTLINE_FIRST_MAX),
      first: cut(stepPlainText(first?.text), OUTLINE_FIRST_MAX),
      inChoice: typeof entry.choice === "string",
    };
  });
}

/** Whether two or more named groups in no choice sit next to each other. */
export function outlineHasCandidates(
  outline: readonly OutlineEntry[],
): boolean {
  const open = (entry: OutlineEntry | undefined) =>
    Boolean(entry?.group && entry.name.trim() && !entry.inChoice);
  return outline.some(
    (entry, index) => open(entry) && open(outline[index + 1]),
  );
}

/** The outline as the prompt lists it: "3. group “Bagels” — Shape 8 bagels…". */
export function outlineText(outline: readonly OutlineEntry[]): string {
  return outline
    .map((entry, index) => {
      const number = `${index + 1}.`;
      if (!entry.group) return `${number} step — ${entry.first || "(empty)"}`;
      const name = entry.name.trim() ? `“${entry.name.trim()}”` : "(unnamed)";
      const taken = entry.inChoice ? " (already in a choice)" : "";
      return `${number} group ${name}${taken} — ${entry.first || "(no steps)"}`;
    })
    .join("\n");
}

/** What grounding kept, and how much of the answer it dropped. */
export interface GroundedChoices {
  sets: SuggestedChoice[];
  /** Entry numbers dropped from sets that otherwise stood or fell. */
  droppedNumbers: number;
  /** Whole sets dropped: too few groups, not adjacent, a bad label. */
  droppedSets: number;
}

/**
 * The model's sets held to the outline (see the module note): bad numbers
 * dropped one by one, then a set kept only with ≥ 2 adjacent groups and a
 * label of 1–40 characters. `SuggestedChoice.groups` are 0-based entry
 * indexes, as the form's suggestions are.
 */
export function groundChoiceSets(
  proposed: readonly ProposedSet[],
  outline: readonly OutlineEntry[],
): GroundedChoices {
  const claimed = new Set<number>();
  const sets: SuggestedChoice[] = [];
  let droppedNumbers = 0;
  let droppedSets = 0;
  for (const set of proposed) {
    const label = (set.label ?? "").replace(/\s+/g, " ").trim();
    const indexes: number[] = [];
    for (const number of set.groups ?? []) {
      const index = number - 1;
      const entry = Number.isInteger(number) ? outline[index] : undefined;
      if (
        !entry ||
        !entry.group ||
        !entry.name.trim() ||
        entry.inChoice ||
        claimed.has(index) ||
        indexes.includes(index)
      ) {
        droppedNumbers++;
        continue;
      }
      indexes.push(index);
    }
    indexes.sort((a, b) => a - b);
    const adjacent = indexes.every(
      (index, i) => i === 0 || index === indexes[i - 1] + 1,
    );
    if (
      !label ||
      label.length > CHOICE_LABEL_MAX ||
      indexes.length < 2 ||
      !adjacent
    ) {
      droppedSets++;
      continue;
    }
    for (const index of indexes) claimed.add(index);
    sets.push({ label, groups: indexes });
  }
  return { sets, droppedNumbers, droppedSets };
}
