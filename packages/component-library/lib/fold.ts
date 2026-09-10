/**
 * Fold a string for accent-insensitive, case-insensitive matching: decompose to
 * NFD so diacritics become separate combining marks, strip those marks, and
 * lowercase. "Crème Brûlée" → "creme brulee".
 *
 * Shared because both search implementations in this monorepo need the same
 * folding, and a corpus filter that disagrees with its own index about what
 * "matches" is a bug that only shows up on accented content.
 */
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
