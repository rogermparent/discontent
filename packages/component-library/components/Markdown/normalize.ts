/**
 * Markdown with `\n` line endings only — required before anything reaches
 * markdown-to-jsx's `compiler` (which `<Markdown>` uses too).
 *
 * markdown-to-jsx 9.6.1 never returns on CRLF text in one shape: an ordered
 * list item, a continuation line, then a blank line — `"1. A\r\nb\r\n\r\nd"`.
 * `parseList`'s blank-line lookahead advances with `findLineEnd(...) + 1`, and
 * `findLineEnd` answers the `\r` of a `\r\n` pair even when called from its
 * `\n`, so the position stops moving. Its `parser()` normalises line endings;
 * `compiler()` does not. Imported recipes keep the source page's `\r\n`, and
 * one such description (2026-10-05) pinned a core through every index
 * rebuild and would have hung its own page render.
 */
export function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}
