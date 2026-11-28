/**
 * Whether two recipe names read as the same dish (51a, Dd2 of epic 51: "a
 * name close to one of Roger's is shown marked 'Close to yours'"). Folded
 * (case, accents, punctuation), stop words and filler dropped, then the
 * word sets compared by Dice similarity. Versions of a dish that differ in a
 * method word (oven / slow cooker) are different dishes, so method words stay.
 * 51b's online plan reuses it.
 */
import { fold } from "./fold";
import { wordDice } from "./wordDice";

/** Words that do not tell one dish from another. */
const FILLER = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "for",
  "of",
  "to",
  "in",
  "my",
  "best",
  "easy",
  "simple",
  "perfect",
  "recipe",
  "recipes",
  "homemade",
  "ultimate",
  "favorite",
  "favourite",
  "classic",
  "how",
  "make",
]);

/** A name's content words, folded, de-pluralised, in order. */
export function nameWords(name: string): string[] {
  return fold(name)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !FILLER.has(word))
    .map((word) =>
      word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
    );
}

/** Dice similarity at or above which two names are one dish. */
export const CLOSE_NAME_MIN = 0.85;

export function closeRecipeName(a: string, b: string): boolean {
  const left = nameWords(a);
  const right = nameWords(b);
  if (left.length === 0 || right.length === 0) return false;
  return wordDice(left, right) >= CLOSE_NAME_MIN;
}
