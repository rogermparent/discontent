/**
 * The browser's half of the heads-up notes (45e): `headsUp.ts` finds every
 * heads-up sentence on the server (`headsUpCandidates`), and which of them
 * show depends on the path the reader chose, so the choosing is here — in a
 * module that imports nothing, so the recipe page's client code does not
 * pull in `ingredientNames` (42c1's rule).
 */

export interface HeadsUp {
  /** The sentence, quoted as written (markup undone). */
  sentence: string;
  /** The page's step number it came from; absent for a schedule note. */
  step?: number;
  /** The step's anchor when it is not `stepId(step)` (inside an option, 45e). */
  anchor?: string;
  /** Where it came from: a step, or a cook schedule's note. */
  source: "step" | "schedule";
}

/**
 * A heads-up sentence where it was found: the instruction entry and the
 * step within it, or neither for a schedule note. Every occurrence, in
 * order, not yet de-duplicated.
 */
export interface HeadsUpCandidate {
  sentence: string;
  entry?: number;
  step?: number;
  source: "step" | "schedule";
}

/** At most this many notes: a heads-up is a line or two, not a summary. */
export const MAX_HEADS_UPS = 3;

/**
 * The notes from `candidates` for one path: a step's note only when `place`
 * puts the step on it (with its number there and, optionally, its anchor),
 * each sentence once, at most `MAX_HEADS_UPS`.
 */
export function selectHeadsUps(
  candidates: readonly HeadsUpCandidate[],
  place: (
    entry: number,
    step: number,
  ) => { number: number; anchor?: string } | undefined,
): HeadsUp[] {
  const out: HeadsUp[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.sentence.toLowerCase();
    if (seen.has(key)) continue;
    if (candidate.source === "schedule") {
      seen.add(key);
      out.push({ sentence: candidate.sentence, source: "schedule" });
      continue;
    }
    const at = place(candidate.entry ?? 0, candidate.step ?? 0);
    if (!at) continue;
    seen.add(key);
    out.push({
      sentence: candidate.sentence,
      step: at.number,
      ...(at.anchor ? { anchor: at.anchor } : {}),
      source: "step",
    });
  }
  return out.slice(0, MAX_HEADS_UPS);
}
