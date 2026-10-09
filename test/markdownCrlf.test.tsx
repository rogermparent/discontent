import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import StyledMarkdown from "@discontent/component-library/components/Markdown";
import { normalizeLineEndings } from "@discontent/component-library/components/Markdown/normalize";
import { flattenMarkdown } from "recipe-website-common/controller/buildIndexValue";

/*
 * markdown-to-jsx 9.6.1's `compiler` never returns on CRLF text shaped
 * "ordered item, continuation line, blank line" (see normalizeLineEndings).
 * A 2026-10-05 import with exactly that description pinned a core through
 * every index rebuild, on the Pi and the workstation alike. A regression here
 * hangs the worker rather than failing a timeout — the compiler loop is
 * synchronous — so CI's job timeout is the backstop.
 */
describe("CRLF markdown", () => {
  const crlfList = "1. A\r\nb\r\n\r\nd";

  it("normalizeLineEndings leaves only \\n", () => {
    expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("flattenMarkdown returns on a CRLF ordered list with a blank line", () => {
    expect(flattenMarkdown(crlfList)).toBe("A b d");
  });

  it("StyledMarkdown renders the same text", () => {
    const { container } = render(<StyledMarkdown>{crlfList}</StyledMarkdown>);
    expect(container.querySelector("ol li")?.textContent).toContain("A");
    expect(container.textContent).toContain("d");
  });

  /*
   * 30a: 38 real recipes put an ingredient-style `{type: "heading", name}` in
   * `instructions`, so a step renders with `text` undefined. Before the CRLF
   * fix that rendered nothing; after it, `.replace` on undefined 500'd the
   * page and failed the export.
   */
  it("StyledMarkdown renders nothing, without throwing, for missing text", () => {
    const missing = undefined as unknown as string;
    const { container } = render(<StyledMarkdown>{missing}</StyledMarkdown>);
    expect(container.textContent).toBe("");
  });

  it("flattenMarkdown flattens missing text to an empty string", () => {
    expect(flattenMarkdown(undefined as unknown as string)).toBe("");
  });
});
