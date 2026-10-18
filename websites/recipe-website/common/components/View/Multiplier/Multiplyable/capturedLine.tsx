import { Children, type ReactNode } from "react";

/**
 * A `<Multiplyable />` followed by the rest of its line, when markdown-to-jsx
 * has handed that line to it as children (41c).
 *
 * `<Multiplyable baseNumber="2" />` is self-closing and never has children of
 * its own. Since markdown-to-jsx 9.7, though, one that *starts* a list item or
 * a blockquote line (`- <Multiplyable baseNumber="1/2" /> cup sugar`) is
 * parsed as an HTML block whose children are the rest of the line, with the
 * space after the tag consumed. A component that renders only its number would
 * show "1/2" and drop "cup sugar". Anywhere else in a line the tag is still
 * self-closing and `children` is absent, so this renders `number` alone.
 *
 * The number and the line are joined by the space the parser consumed.
 */
export function withCapturedLine(number: ReactNode, children?: ReactNode) {
  if (Children.count(children) === 0) return <>{number}</>;
  return (
    <>
      {number} {children}
    </>
  );
}
