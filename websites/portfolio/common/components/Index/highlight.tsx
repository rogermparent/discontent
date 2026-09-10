import type { ReactNode } from "react";
import { fold } from "@discontent/component-library/lib/fold";

/**
 * Wrap the matched substring in a mark.
 *
 * Matching happens on the *folded* string (accents stripped, lowercased) while
 * the slices come from the original, so "Résumé" highlights correctly for a
 * query of "resume". That only works because folding here is 1:1 per character —
 * NFD decomposition can expand a character, so the index is computed against a
 * fold of the same length rather than assuming the two align.
 *
 * Returns a React tree, never HTML: a highlighter that emits markup for
 * dangerouslySetInnerHTML is an XSS sink on user-controlled content, which is
 * exactly why recipe rejected FlexSearch's built-in one.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const needle = fold(query.trim());
  if (!needle) return text;

  // Fold per character so offsets in the folded string map back to the original.
  const foldedChars = Array.from(text, (char) => fold(char));
  const folded = foldedChars.join("");
  if (foldedChars.some((c) => c.length !== 1)) {
    // A character folded to something other than one char, so offsets would be
    // wrong. Highlighting is decoration; correctness of the text is not.
    return text;
  }

  const start = folded.indexOf(needle);
  if (start === -1) return text;
  const end = start + needle.length;

  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-transparent text-primary">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}
