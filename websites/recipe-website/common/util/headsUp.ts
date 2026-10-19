/**
 * Heads-up notes for the recipe page (epic 42c1, D3): the sentences that say
 * a recipe must be started well before it is eaten — "Prepare 1 day in
 * advance", "chill for at least 4 hours", "refrigerate overnight".
 *
 * Only a short list of unambiguous phrases counts, and the note quotes the
 * sentence it came from with its step number rather than paraphrasing it.
 * Anything vaguer ("let rest 5 minutes", a recipe called "overnight oats")
 * shows nothing.
 *
 * Pure, and safe in the browser; the recipe page runs it on the server.
 */
import type { InstructionEntry, Timeline } from "../controller/types";
import { stripMarkup } from "./ingredientNames";
import { stepNumbers } from "./stepNumbers";

export interface HeadsUp {
  /** The sentence, quoted as written (markup undone). */
  sentence: string;
  /** The page's step number it came from; absent for a schedule note. */
  step?: number;
  /** Where it came from: a step, or a cook schedule's note. */
  source: "step" | "schedule";
}

const COUNT = String.raw`(?:\d+(?:\s*(?:-|–|to)\s*\d+)?|one|two|three|four|five|six|eight|ten|twelve|twenty[- ]four|forty[- ]eight)`;

/**
 * Dishes named for the night they spend in the fridge: a step that says
 * "top the overnight oats" is not telling anyone to start yesterday.
 */
const OVERNIGHT_DISH = String.raw`(?:oats?|oatmeal|french toast|breakfast|casserole|chia|pudding|egg bake|cinnamon rolls?)`;

/** The phrases that count, each tested against one sentence. */
export const HEADS_UP_PATTERNS: RegExp[] = [
  /\bthe (?:day|night|evening) before\b/i,
  new RegExp(String.raw`\bovernight\b(?!\s+${OVERNIGHT_DISH}\b)`, "i"),
  new RegExp(
    String.raw`\b(?:${COUNT}|a|one) (?:full )?days? (?:in advance|ahead|before)\b`,
    "i",
  ),
  /\bmake[- ]ahead\b|\bmake (?:it |this |them )?ahead\b/i,
  new RegExp(
    String.raw`\b(?:chill|refrigerate|marinate)\w*\b[^.!?]{0,60}?\b${COUNT}\s*(?:\+\s*)?(?:hours?|hrs?)\b`,
    "i",
  ),
];

/** Is this sentence a heads-up? */
export function isHeadsUp(sentence: string): boolean {
  return HEADS_UP_PATTERNS.some((pattern) => pattern.test(sentence));
}

/**
 * Sentences, split after `.`, `!` or `?` (and any closing bracket or quote
 * after it); a sentence wrapped whole in brackets loses them.
 */
export function sentences(text: string): string[] {
  return stripMarkup(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?]["”')\]]*)\s+/)
    .map((sentence) => {
      const trimmed = sentence.trim();
      const wrapped = /^\((.*)\)$/.exec(trimmed);
      return (
        wrapped && !/[()]/.test(wrapped[1]) ? wrapped[1] : trimmed
      ).trim();
    })
    .filter(Boolean);
}

/** At most this many notes: a heads-up is a line or two, not a summary. */
export const MAX_HEADS_UPS = 3;

/** The recipe's heads-up notes, in step order, each sentence once. */
export function findHeadsUps(
  instructions: readonly InstructionEntry[] = [],
  timelines: readonly Timeline[] = [],
): HeadsUp[] {
  const out: HeadsUp[] = [];
  const seen = new Set<string>();
  const add = (sentence: string, note: Omit<HeadsUp, "sentence">) => {
    const key = sentence.toLowerCase();
    if (seen.has(key) || !isHeadsUp(sentence)) return;
    seen.add(key);
    out.push({ sentence, ...note });
  };
  const numbers = stepNumbers(instructions);
  instructions.forEach((entry, i) => {
    const steps =
      "instructions" in entry ? (entry.instructions ?? []) : [entry];
    steps.forEach((step, j) => {
      for (const sentence of sentences(step.text ?? "")) {
        add(sentence, { step: numbers[i][j], source: "step" });
      }
    });
  });
  for (const timeline of timelines) {
    for (const sentence of sentences(timeline.note ?? "")) {
      add(sentence, { source: "schedule" });
    }
  }
  return out.slice(0, MAX_HEADS_UPS);
}
