/**
 * A step's markdown as plain words (42c2): a `Multiplyable` as its number,
 * a link as its text, emphasis and other tags dropped. For a step
 * checkbox's name — so a timer button inside the step's label, whose
 * countdown changes every half second, is not read as part of it — and for
 * the cook view's "next step" line. Small and dependency-free, so it ships
 * to the browser (`ingredientNames`' `stripMarkup` does not).
 */
export function stepPlainText(text: string | undefined): string {
  return (text ?? "")
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/gi, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
