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
    expect(issues({})).toEqual([
      "url: Give exactly one of `url`, `text` or `photos`",
    ]);
    expect(
      issues({ url: "https://example.com/naan", text: "2 cups flour" }),
    ).toEqual(["url: Give exactly one of `url`, `text` or `photos`"]);
    expect(issues({ text: "" })).toContain("text: An import needs text");
  });

  it("keeps source with text, and llm with a url", () => {
    expect(
      issues({
        url: "https://example.com/naan",
        source: "https://example.com/naan",
      }),
    ).toEqual([
      "source: `source` is a pasted text's (or a photo's) URL: it goes with `text` or `photos`",
    ]);
    expect(issues({ text: "2 cups flour", llm: "force" })).toEqual([
      "llm: `llm` is for a URL import: `text` and `photos` always use the local model",
    ]);
  });

  it("takes photos (38e): 1–4 paths, a source, photoAsImage", () => {
    const body = {
      photos: ["/tmp/card-front.jpg", "/tmp/card-back.jpg"],
      source: "https://example.com/cookbook",
      photoAsImage: true,
      dryRun: true,
    };
    expect(issues(body)).toEqual([]);
    expect(importTarget(ImportRequestSchema.parse(body))).toEqual({
      kind: "photos",
      photos: ["/tmp/card-front.jpg", "/tmp/card-back.jpg"],
      source: "https://example.com/cookbook",
      options: { dryRun: true, photoAsImage: true },
    });
    expect(issues({ photos: ["a", "b", "c", "d", "e"] })).toEqual([
      "photos: A photo import takes at most 4 photos",
    ]);
    expect(issues({ photos: [] })).toEqual(["photos: photos names no photo"]);
    expect(issues({ photos: ["a.jpg"], text: "x" })).toEqual([
      "url: Give exactly one of `url`, `text` or `photos`",
    ]);
    expect(
      issues({ url: "https://example.com/x", photoAsImage: true }),
    ).toEqual(["photoAsImage: `photoAsImage` goes with `photos`"]);
    expect(
      issues({
        photos: ["a.jpg"],
        photoAsImage: true,
        image: "https://x/y.jpg",
      }),
    ).toEqual([
      "photoAsImage: `photoAsImage` or `image`, not both: the recipe has one image",
    ]);
    expect(issues({ photos: ["a.jpg"], llm: "off" })).toEqual([
      "llm: `llm` is for a URL import: `text` and `photos` always use the local model",
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
