/**
 * Blank rows out of an imported recipe (45d).
 *
 * Brian Lagerstrom's Everything Dough page ends its "LARGE LOAF:" section
 * with a HowToStep whose text is empty. Imported as an empty step it sat in
 * the form unseen, and Create refused the recipe (a step's text is
 * required) with nothing to show where. An empty line, an empty step, or a
 * section with no steps left carries nothing: every import path drops them
 * here — the page mapper, the form's import result and the curation layer's
 * input (CLI, MCP, the batch picker) — and the form drops blank rows itself
 * before it validates (`parseFormData.ts`).
 *
 * Pure and shape-preserving: what is kept is kept as it was (no trim of a
 * kept line), and a list with nothing left becomes an empty list.
 */
import type {
  Ingredient,
  Instruction,
  InstructionEntry,
} from "../controller/types";

/** Empty, or only whitespace (a non-breaking space counts). */
export function isBlank(text: unknown): boolean {
  return typeof text !== "string" || text.trim() === "";
}

/** The lines with text: a blank line or a blank heading is dropped. */
export function dropBlankIngredients(
  lines: readonly Ingredient[],
): Ingredient[] {
  return lines.filter((line) =>
    /* A caller's prose line (the curation input takes strings too). */
    typeof line === "string"
      ? !isBlank(line)
      : !!line && !isBlank(line.ingredient),
  );
}

/** A step with text: an `Instruction`, or a caller's prose step. */
function hasText(step: unknown): boolean {
  return typeof step === "string"
    ? !isBlank(step)
    : !!step && !isBlank((step as Instruction).text);
}

/**
 * The steps with text. A group keeps its steps that have text and is
 * dropped when none is left; a group with steps and no name gives its
 * steps to the list (a nameless section is no section). A prose step (the
 * curation input takes strings too) is a step with text unless blank.
 */
export function dropBlankSteps(
  entries: readonly InstructionEntry[],
): InstructionEntry[] {
  const kept: InstructionEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (typeof entry !== "object") {
      if (hasText(entry)) kept.push(entry);
      continue;
    }
    if ("instructions" in entry && Array.isArray(entry.instructions)) {
      const steps = entry.instructions.filter(hasText);
      if (steps.length === 0) continue;
      if (isBlank(entry.name)) kept.push(...steps);
      else if (steps.length === entry.instructions.length) kept.push(entry);
      else kept.push({ ...entry, instructions: steps });
    } else if (hasText(entry)) {
      kept.push(entry);
    }
  }
  return kept;
}

/**
 * An import's recipe with its blank rows gone; the same object when it had
 * none, so an unchanged reading stays `===` itself.
 */
export function withoutBlankRows<
  T extends {
    ingredients?: Ingredient[];
    instructions?: InstructionEntry[];
  },
>(recipe: T): T {
  const { ingredients, instructions } = recipe;
  const nextIngredients = ingredients && dropBlankIngredients(ingredients);
  const nextInstructions = instructions && dropBlankSteps(instructions);
  const same =
    nextIngredients?.length === ingredients?.length &&
    sameSteps(instructions, nextInstructions);
  if (same) return recipe;
  return {
    ...recipe,
    ...(nextIngredients ? { ingredients: nextIngredients } : {}),
    ...(nextInstructions ? { instructions: nextInstructions } : {}),
  };
}

function sameSteps(
  before: readonly InstructionEntry[] | undefined,
  after: readonly InstructionEntry[] | undefined,
): boolean {
  if (!before || !after) return before === after;
  if (before.length !== after.length) return false;
  return before.every((entry, index) => entry === after[index]);
}
