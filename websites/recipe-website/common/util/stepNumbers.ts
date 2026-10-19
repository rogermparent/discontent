import type { InstructionEntry } from "../controller/types";

/**
 * The recipe page's step numbers (42c1): one count through every step, a
 * group's steps included, so "step 4" means the same thing in a heads-up as
 * in the list. Its own module so the client-side step list does not pull in
 * `ingredientNames`.
 */
export function stepNumbers(
  instructions: readonly InstructionEntry[] = [],
): number[][] {
  let next = 1;
  return instructions.map((entry) =>
    "instructions" in entry
      ? (entry.instructions ?? []).map(() => next++)
      : [next++],
  );
}
