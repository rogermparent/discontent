/**
 * A line the form changed for a person to look at (51f): 50e's linked-line
 * mark (`LinkedLineMark`, an import linked the line to a recipe), made
 * general — `source` says who changed it. A mark shows while its row holds
 * what the change wrote (`after`), and goes when the row is kept, undone
 * (back to `before`) or edited by hand. Never stored.
 *
 * - `link` (50e): Keep the link / Undo; it does not hold Save (De7).
 * - `paste`, `bank`, `model` (51f, "Add grams"): Keep / Undo, and Save
 *   waits until every one is kept or undone — every model-made change is
 *   approved before Save (Roger's standing rule), and a paste's or the
 *   bank's grams are the same kind of change to the recipe. The model's are
 *   marked "≈ Model" (answer 5).
 */
import type { LinkedLineMark } from "./linkedLines";
import type { GramsSource } from "./suggestGrams";

export type LineMarkSource = "link" | GramsSource;

export interface GramsLineMark {
  source: GramsSource;
  /** What the row held, and what the change wrote. */
  before: string;
  after: string;
  grams: number;
  /** The pasted line, the bank's arithmetic, the model's reason. */
  why: string;
  /** Kept: still shown (with Undo) until Save, but no longer holds Save. */
  kept?: boolean;
  /** Grams in a cup, for "Save to the bank" (a measured line only). */
  gramsPerCup?: number;
  /** The line's grams key, the bank entry's name. */
  key?: string;
}

export type LineMark = (LinkedLineMark & { source: "link" }) | GramsLineMark;

/** 50e's marks as line marks. */
export function linkLineMarks(
  linked: readonly LinkedLineMark[],
): (LinkedLineMark & { source: "link" })[] {
  return linked.map((mark) => ({ ...mark, source: "link" as const }));
}

/** Whether a mark keeps Save waiting (51f: an unreviewed gram). */
export function holdsSave(mark: LineMark): boolean {
  return mark.source !== "link" && !mark.kept;
}

/** The chip a gram mark shows. */
export const GRAMS_SOURCE_LABEL: Record<GramsSource, string> = {
  paste: "Pasted",
  bank: "Bank",
  model: "≈ Model",
};

/**
 * A gram mark with its own id and the row it was made on (review findings
 * 2 and 3): held above the form's keyed shell, so it outlives a remount
 * ("Edit with AI", "Fill gaps"), and told apart from a mark on an
 * identical line ("½ cup butter" twice) by its id.
 */
export interface PlacedGramMark extends GramsLineMark {
  id: string;
  /** The row it was made (or last kept) on. */
  at: number;
}

/**
 * Each row's gram mark: a mark sits on its own row while that row holds
 * what it wrote; a row moved or a line put in above it, it sits on the
 * first other row holding that text that no mark has. A mark with no such
 * row is gone (the line was edited by hand, or undone). One mark a row.
 */
export function placeGramMarks<M extends { after: string; at: number }>(
  marks: readonly M[],
  lines: readonly { ingredient: string }[],
): (M | undefined)[] {
  const placed: (M | undefined)[] = lines.map(() => undefined);
  const waiting: M[] = [];
  for (const mark of marks) {
    if (lines[mark.at]?.ingredient === mark.after && !placed[mark.at]) {
      placed[mark.at] = mark;
    } else {
      waiting.push(mark);
    }
  }
  for (const mark of waiting) {
    const row = lines.findIndex(
      (line, index) => line.ingredient === mark.after && !placed[index],
    );
    if (row >= 0) placed[row] = mark;
  }
  return placed;
}

/** "Save to the bank" only from a measure big enough to set a cup by (¼ cup and up). */
export const SAVE_TO_BANK_MIN_CUPS = 0.24;
