// @vitest-environment node
//
// 36c: the body of `/api/import` and the MCP `recipe_import` tool — exactly
// one of `url` or pasted `text` (D8), `source` only with text, `llm` only
// with a URL — and how a checked body splits into the seat it goes to.

import { describe, expect, it } from "vitest";

import {
  ImportRequestSchema,
  PASTED_TEXT_MAX_CHARS,
  importTarget,
} from "../websites/recipe-website/editor/controller/curation/importRequest";

function issues(body: unknown): string[] {
  const result = ImportRequestSchema.safeParse(body);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}

describe("ImportRequestSchema (36c)", () => {
  it("takes a URL with its options, as before", () => {
    const body = {
      url: "https://example.com/naan",
      tags: ["bread"],
      dryRun: true,
      llm: "force",
    };
    expect(issues(body)).toEqual([]);
    expect(importTarget(ImportRequestSchema.parse(body))).toEqual({
      kind: "url",
      url: "https://example.com/naan",
      options: { tags: ["bread"], dryRun: true, llm: "force" },
    });
  });

  it("takes pasted text, with or without a source URL", () => {
    expect(issues({ text: "2 cups flour" })).toEqual([]);
    const body = {
      text: "2 cups flour",
      source: "https://www.youtube.com/watch?v=abc",
      name: "Scones",
      allowPartial: true,
    };
    expect(issues(body)).toEqual([]);
    expect(importTarget(ImportRequestSchema.parse(body))).toEqual({
      kind: "text",
      text: "2 cups flour",
      source: "https://www.youtube.com/watch?v=abc",
      options: { name: "Scones", allowPartial: true },
    });
  });

  it("wants exactly one of url or text", () => {
    expect(issues({})).toEqual(["url: Give exactly one of `url` or `text`"]);
    expect(
      issues({ url: "https://example.com/naan", text: "2 cups flour" }),
    ).toEqual(["url: Give exactly one of `url` or `text`"]);
    expect(issues({ text: "" })).toContain("text: An import needs text");
  });

  it("keeps source with text, and llm with a url", () => {
    expect(
      issues({
        url: "https://example.com/naan",
        source: "https://example.com/naan",
      }),
    ).toEqual(["source: `source` is a pasted text's URL: it goes with `text`"]);
    expect(issues({ text: "2 cups flour", llm: "force" })).toEqual([
      "llm: `llm` is for a URL import: `text` always uses the local model",
    ]);
  });

  it("refuses unknown keys, a bad mode, and a paste past the limit", () => {
    expect(issues({ url: "https://example.com/naan", bogus: 1 })).toHaveLength(
      1,
    );
    expect(issues({ url: "https://example.com/naan", llm: "always" })).toEqual([
      expect.stringMatching(/^llm: /),
    ]);
    expect(issues({ text: "x".repeat(PASTED_TEXT_MAX_CHARS) })).toEqual([]);
    /* Counted as the model reads it, CRLF as LF: HTTP and local agree. */
    const crlf = "x\r\n".repeat(PASTED_TEXT_MAX_CHARS / 2);
    expect(crlf.length).toBeGreaterThan(PASTED_TEXT_MAX_CHARS);
    expect(issues({ text: crlf })).toEqual([]);
    expect(
      issues({ text: "x".repeat(PASTED_TEXT_MAX_CHARS + 1) }),
    ).toHaveLength(1);
  });
});
