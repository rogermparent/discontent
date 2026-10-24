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
import {
  selectHeadsUps,
  type HeadsUp,
  type HeadsUpCandidate,
} from "./headsUpSelect";

export {
  MAX_HEADS_UPS,
  selectHeadsUps,
  type HeadsUp,
  type HeadsUpCandidate,
} from "./headsUpSelect";

const COUNT = String.raw`(?:\d+(?:\s*(?:-|–|to)\s*\d+)?|one|two|three|four|five|six|eight|ten|twelve|twenty[- ]four|forty[- ]eight)`;

/**
 * Dishes named for the night they spend in the fridge: a step that says
 * "top the overnight oats" is not telling anyone to start yesterday.
 */
const OVERNIGHT_DISH = String.raw`(?:oats?|oatmeal|french toast|breakfast|casserole|chia|pudding|egg bake|cinnamon rolls?)`;

/**
 * A sentence about keeping what is already made — "Leftovers can be
 * refrigerated for up to 48 hours", "Store covered overnight" — is not a
 * reason to start early. Checked for the overnight and hours phrases only:
 * "Make ahead: the filling keeps for 3 days" is still a heads-up.
 */
const STORAGE_RE = /\b(?:leftovers?|store[sd]?|storing|storage|keeps?)\b/i;

/** The phrases that count whatever else the sentence says. */
export const HEADS_UP_PATTERNS: RegExp[] = [
  /\bthe (?:day|night|evening) before\b/i,
  new RegExp(
    String.raw`\b(?:${COUNT}|a|one) (?:full )?days? (?:in advance|ahead|before)\b`,
    "i",
  ),
  /\bmake[- ]ahead\b|\bmake (?:it |this |them )?ahead\b/i,
];

const OVERNIGHT_RE = new RegExp(
  String.raw`\bovernight\b(?!\s+${OVERNIGHT_DISH}\b)`,
  "i",
);

/**
 * "chill / refrigerate / marinate … N hours", within 60 characters of one
 * sentence. The count's first number, `lead` the words just before it.
 */
const LONG_WAIT_RE = new RegExp(
  String.raw`\b(?:chill|refrigerat|marinat)\w*\b([^.!?]{0,60}?)\b(${COUNT})\s*(?:\+\s*)?(?:hours?|hrs?)\b`,
  "gi",
);

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  eight: 8,
  ten: 10,
  twelve: 12,
};

/**
 * A wait worth planning for: two hours or more, or "at least" any hours —
 * never "up to N hours" (a limit, not a wait) nor "30 minutes to 1 hour".
 */
function longWait(sentence: string): boolean {
  for (const match of sentence.matchAll(LONG_WAIT_RE)) {
    const [, lead, count] = match;
    if (/\bup to\s*$/i.test(lead)) continue;
    const first = count.toLowerCase().match(/^\d+|^[a-z]+/)?.[0] ?? "";
    const hours = /^\d+$/.test(first)
      ? Number(first)
      : (WORD_NUMBERS[first] ?? 24);
    if (hours >= 2 || /\bat least\s*$/i.test(lead)) return true;
  }
  return false;
}

/** Is this sentence a heads-up? */
export function isHeadsUp(sentence: string): boolean {
  if (HEADS_UP_PATTERNS.some((pattern) => pattern.test(sentence))) {
    return true;
  }
  if (STORAGE_RE.test(sentence)) return false;
  return OVERNIGHT_RE.test(sentence) || longWait(sentence);
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

/**
 * Every heads-up sentence in the steps and the schedule notes, where each
 * was found (45e) — the server's half of `findHeadsUps`. Which of them show
 * depends on the path the reader chose, so `selectHeadsUps`
 * (`headsUpSelect.ts`) finishes the job in the browser, and `isHeadsUp`
 * stays off its bundle.
 */
export function headsUpCandidates(
  instructions: readonly InstructionEntry[] = [],
  timelines: readonly Timeline[] = [],
): HeadsUpCandidate[] {
  const out: HeadsUpCandidate[] = [];
  instructions.forEach((entry, i) => {
    const steps =
      "instructions" in entry ? (entry.instructions ?? []) : [entry];
    steps.forEach((step, j) => {
      for (const sentence of sentences(step.text ?? "")) {
        if (isHeadsUp(sentence)) {
          out.push({ sentence, entry: i, step: j, source: "step" });
        }
      }
    });
  });
  for (const timeline of timelines) {
    for (const sentence of sentences(timeline.note ?? "")) {
      if (isHeadsUp(sentence)) out.push({ sentence, source: "schedule" });
    }
  }
  return out;
}

/** The recipe's heads-up notes, in step order, each sentence once. */
export function findHeadsUps(
  instructions: readonly InstructionEntry[] = [],
  timelines: readonly Timeline[] = [],
): HeadsUp[] {
  const numbers = stepNumbers(instructions);
  return selectHeadsUps(
    headsUpCandidates(instructions, timelines),
    (entry, step) => ({ number: numbers[entry][step] }),
  );
}
