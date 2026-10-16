// @vitest-environment node
//
// `recipes import-list`'s human output names the model per item (39a), and
// the CLI's model line names the Claude API when it answered (38-Dg9).

import { describe, expect, it } from "vitest";

import { importListCommand } from "../websites/recipe-website/editor/cli/commands/importList";
import {
  formatLlm,
  partialReadingLine,
} from "../websites/recipe-website/editor/cli/output";
import type { ImportListResult } from "../websites/recipe-website/editor/controller/curation/importList";

const RESULT: ImportListResult = {
  url: "https://www.example.com/pies",
  finalUrl: "https://www.example.com/pies",
  title: "Pies",
  total: 3,
  requests: 4,
  remaining: [],
  results: [
    {
      n: 1,
      url: "https://a.example.com/apple",
      name: "Apple Pie",
      status: "imported",
      slug: "apple-pie",
    },
    {
      n: 2,
      url: "https://b.example.com/pear",
      name: "Pear Pie",
      status: "imported",
      slug: "pear-pie",
      llm: {
        model: "qwen3:8b",
        mode: "auto",
        found: true,
        grounded: 6,
        total: 6,
        durationMs: 9_400,
      },
    },
    {
      n: 3,
      url: "https://c.example.com/plum",
      name: "Plum Pie",
      status: "would-import",
      slug: "plum-pie",
      llm: {
        model: "claude-sonnet-5",
        api: "anthropic",
        mode: "auto",
        found: true,
        grounded: 5,
        total: 5,
      },
    },
  ],
} as unknown as ImportListResult;

describe("import-list's human output (39a)", () => {
  it("prints a model line under each item a model read", () => {
    const lines = importListCommand.format!(RESULT).split("\n");
    const at = (prefix: string) =>
      lines.findIndex((line) => line.trimStart().startsWith(prefix));
    expect(lines[at("2.") + 1]).toBe(
      "      local model (auto): qwen3:8b 6/6 ingredient lines grounded, 9.4 s",
    );
    expect(lines[at("3.") + 1]).toBe(
      "      Claude API (auto): claude-sonnet-5 5/5 ingredient lines grounded",
    );
    /* The schema-read item has none. */
    expect(lines[at("1.") + 1].trimStart().startsWith("2.")).toBe(true);
  });

  it("names the Claude API in the partial line too", () => {
    expect(
      partialReadingLine({
        model: "claude-sonnet-5",
        api: "anthropic",
        mode: "force",
        found: true,
      }),
    ).toBe("partial: the Claude API's reading is not trusted — check it");
    expect(formatLlm({ model: "qwen3:8b", mode: "force", found: false })).toBe(
      "local model (force): qwen3:8b found no recipe",
    );
  });
});
