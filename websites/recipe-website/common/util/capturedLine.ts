/**
 * What goes between a `<Multiplyable />` and the line markdown-to-jsx handed
 * it as children (41c, see `withCapturedLine`): the space the parser
 * consumed, unless the line starts with punctuation that belongs against the
 * number — `2%`, `3,`, `(about 4)`.
 */
export function capturedLineSeparator(line: string): string {
  return /^[,.;:!?%)\]}]/.test(line) ? "" : " ";
}
