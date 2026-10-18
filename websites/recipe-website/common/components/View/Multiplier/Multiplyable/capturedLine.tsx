import { Children, type ReactNode } from "react";
import { capturedLineSeparator } from "../../../../util/capturedLine";

/**
 * A `<Multiplyable />` followed by the rest of its line, when markdown-to-jsx
 * has handed that line to it as children (41c).
 *
 * `<Multiplyable baseNumber="2" />` is self-closing and never has children of
 * its own. Since markdown-to-jsx 9.7, though, one that *starts a block* — a
 * list item (`- <Multiplyable baseNumber="1/2" /> cup sugar`), a quote line,
 * an indented line, or a paragraph that runs over more than one line — is
 * parsed as an HTML block whose children are the rest of that block, with the
 * space after the tag consumed. A component that rendered only its number
 * would show "1/2" and drop "cup sugar". Only a single unindented line that
 * starts with the tag, or a tag mid-line, still arrives childless; then this
 * renders `number` alone.
 *
 * What this cannot put back (agent-epic-41.md Tc3; the parser keeps it, the
 * compiler drops it before any component sees the children): the spaces
 * *between* inline elements inside the captured block ("[Pie crust](…)
 * *chilled*" → "Pie crustchilled", two Multiplyables "3 4" → "34"), and a
 * nested sub-list or hard break inside it. None occurs in the corpus at 41c.
 *
 * The number and the line are joined by the space the parser consumed, or by
 * nothing when the line starts with punctuation (`capturedLineSeparator`).
 */
export function withCapturedLine(number: ReactNode, children?: ReactNode) {
  const nodes = Children.toArray(children);
  if (nodes.length === 0) return <>{number}</>;
  const separator =
    typeof nodes[0] === "string" ? capturedLineSeparator(nodes[0]) : " ";
  return (
    <>
      {number}
      {separator}
      {children}
    </>
  );
}
