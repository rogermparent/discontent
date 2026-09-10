/**
 * Decide whether an already-trimmed paste line is a *section heading* rather
 * than a content line (an ingredient or an instruction step).
 *
 * The classifier is a conservative OR of three high-precision rules. It is
 * deliberately biased toward *under*-detection: a false positive silently
 * re-shapes the persisted tree (a step becomes a group), whereas a missed
 * heading is a one-click promote in the paste review UI. That asymmetry is why
 * there is no "Title Case" or "short line" rule — those would misfire on
 * ordinary short lines like `Salt` or `Bake`.
 *
 * Strippable *prefixes* — `Step N`, `N.`/`N)`, lettered `a)` — are intentionally
 * NOT headings here; they are handled by the per-step number stripper.
 */
export function detectHeading(line: string): boolean {
  // Trailing colon — exactly reproduces the historical ingredient rule.
  if (/:\s*$/.test(line)) return true;

  // "For the …" / "For your …" prefix, the most common recipe section lead-in.
  if (/^for\s+(the|your)\b/i.test(line)) return true;

  // ALL-CAPS line: the whole line is uppercase, has at least two letters, and
  // doesn't end in sentence punctuation (which would mark it as a shouted step
  // like "MIX WELL!" rather than a heading label).
  if (
    line === line.toUpperCase() &&
    /\p{Lu}/u.test(line) &&
    /[A-Za-z]{2,}/.test(line) &&
    !/[.!?]$/.test(line)
  ) {
    return true;
  }

  return false;
}
