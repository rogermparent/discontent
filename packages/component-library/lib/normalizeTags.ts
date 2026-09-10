/**
 * Normalize a tag: trim surrounding whitespace, collapse internal runs, and
 * lowercase. Returns "" for tags that are empty after trimming so callers can
 * drop them.
 */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalize a list of tags: normalize each, drop empties, and dedupe while
 * preserving first-seen order. The canonical shape persisted on a Recipe and
 * fed to the search index.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}
