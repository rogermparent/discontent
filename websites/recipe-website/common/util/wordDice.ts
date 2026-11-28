/**
 * Word-multiset Dice similarity of two word lists: 2 × shared words ÷ both
 * lengths, 0 when either is empty. Lifted from the importer's grounding
 * guard (`extractRecipe.ts`) in 51a so `closeRecipeName` shares it.
 */
export function wordDice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  return (2 * sharedWords(left, right)) / (left.length + right.length);
}

/** How many words two lists share, counting repeats. */
export function sharedWords(left: string[], right: string[]): number {
  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);
  let count = 0;
  for (const word of left) {
    const remaining = pool.get(word) ?? 0;
    if (remaining > 0) {
      count += 1;
      pool.set(word, remaining - 1);
    }
  }
  return count;
}
