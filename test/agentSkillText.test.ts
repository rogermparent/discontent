// @vitest-environment node
//
// 44c (E4, Ec5): the curator skill as the editor's agent reads it. SKILL.md
// stays the one source; its Claude-Code-only parts sit between markers and
// are cut, and the result ships as code (the Pi's image has no `*.md`).
// Pinned: the generated module equals what the files make now (regenerate
// with `pnpm --filter recipe-editor generate-skill-text`), the strip rule,
// and that the agent's prompts name only tools the agent has.

import { readFile } from "fs-extra";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

import {
  CLAUDE_CODE_ONLY_CLOSE,
  CLAUDE_CODE_ONLY_OPEN,
  SKILL_FILES,
  SKILL_MODULE,
  agentSkillText,
  renderSkillModule,
  stripClaudeCodeOnly,
  withoutFrontmatter,
} from "../websites/recipe-website/editor/controller/agent/skillText";
import {
  CURATOR_EXAMPLES_TEXT,
  CURATOR_LOCAL_SKILL_TEXT,
  CURATOR_SKILL_TEXT,
} from "../websites/recipe-website/editor/controller/agent/skillText.generated";
import {
  LOCAL_AGENT_TOOLS,
  agentPreamble,
  agentToday,
  claudeSystemPrompt,
  localSystemPrompt,
} from "../websites/recipe-website/editor/controller/agent/prompt";
import {
  AGENT_HELD_BACK,
  AGENT_TOOL_NAMES,
} from "../websites/recipe-website/editor/controller/agent/tools";

const ROOT = resolve(__dirname, "..");
const EDITOR = join(ROOT, "websites/recipe-website/editor");

describe("the generated skill text", () => {
  it("is up to date with SKILL.md and examples.md", async () => {
    const [skill, examples, local, generated] = await Promise.all([
      readFile(join(ROOT, SKILL_FILES.skill), "utf8"),
      readFile(join(ROOT, SKILL_FILES.examples), "utf8"),
      readFile(join(ROOT, SKILL_FILES.local), "utf8"),
      readFile(join(EDITOR, SKILL_MODULE), "utf8"),
    ]);
    expect(
      generated,
      "skillText.generated.ts is stale: run `pnpm --filter recipe-editor generate-skill-text`",
    ).toBe(renderSkillModule(skill, examples, local));
    expect(CURATOR_SKILL_TEXT).toBe(agentSkillText(skill));
    expect(CURATOR_EXAMPLES_TEXT).toBe(agentSkillText(examples));
    /* 44e: the condensed curator, its editing note cut. */
    expect(CURATOR_LOCAL_SKILL_TEXT).toBe(agentSkillText(local));
    expect(CURATOR_LOCAL_SKILL_TEXT.startsWith("# Recipe curator\n")).toBe(
      true,
    );
    expect(CURATOR_LOCAL_SKILL_TEXT).not.toContain("generate-skill-text");
  });

  it("cuts the frontmatter and every claude-code-only part", () => {
    expect(CURATOR_SKILL_TEXT.startsWith("# Recipe curator\n")).toBe(true);
    for (const gone of [
      "allowed-tools:",
      "$ARGUMENTS",
      "## Fallback (CLI)",
      "pnpm --silent recipes",
      "registered under the same name",
      CLAUDE_CODE_ONLY_OPEN,
      CLAUDE_CODE_ONLY_CLOSE,
    ]) {
      expect(CURATOR_SKILL_TEXT).not.toContain(gone);
    }
    /* What the agent needs stays: the steps, the vocabulary, Held back. */
    for (const kept of [
      "## 1. Check where writes go, first",
      "## 6b. A roundup",
      "**Tag vocabulary (v4).**",
      "## 8b. The shopping list",
      "## Held back",
    ]) {
      expect(CURATOR_SKILL_TEXT).toContain(kept);
    }
  });

  it("strips by markers, and refuses an unclosed one", () => {
    expect(
      stripClaudeCodeOnly(
        `a\n\n${CLAUDE_CODE_ONLY_OPEN}\nhidden\n${CLAUDE_CODE_ONLY_CLOSE}\n\nb\n${CLAUDE_CODE_ONLY_OPEN}x${CLAUDE_CODE_ONLY_CLOSE}c`,
      ),
    ).toBe("a\n\nb\nc\n");
    expect(() => stripClaudeCodeOnly(`a ${CLAUDE_CODE_ONLY_OPEN} b`)).toThrow(
      /without/,
    );
    expect(() => stripClaudeCodeOnly(`a ${CLAUDE_CODE_ONLY_CLOSE} b`)).toThrow(
      /without/,
    );
    expect(withoutFrontmatter("---\nname: x\n---\n# Body\n")).toBe("# Body\n");
    expect(withoutFrontmatter("# No frontmatter\n")).toBe("# No frontmatter\n");
  });
});

describe("the agent's prompts", () => {
  const now = new Date(2026, 9, 21, 9, 30);

  it("give Claude the preamble, the date and the whole skill", () => {
    const prompt = claudeSystemPrompt({ now, search: true });
    expect(prompt).toContain("Today is 2026-10-21 (Wednesday).");
    expect(prompt).toContain("no shell");
    expect(prompt).toContain("<untrusted_page_text>");
    expect(prompt).toContain("Never pass `overwrite` or `force`");
    expect(prompt).toContain(CURATOR_SKILL_TEXT.trim());
    expect(prompt).toContain(CURATOR_EXAMPLES_TEXT.trim());
    expect(agentToday(now)).toBe("2026-10-21 (Wednesday)");
  });

  it("give a local model the short preamble and skill-local.md, not the skill", () => {
    const withSearch = localSystemPrompt({ now, search: true });
    expect(withSearch).toContain("`web_search` searches the web");
    expect(withSearch).toContain("Today is 2026-10-21 (Wednesday).");
    expect(withSearch).toContain(CURATOR_LOCAL_SKILL_TEXT.trim());
    expect(withSearch).not.toContain("## 6b. A roundup");
    /* E7 and the write rules are in it, said once. */
    expect(withSearch).toContain("<untrusted_page_text>");
    expect(withSearch).toContain("Never pass `overwrite` or `force`");
    expect(localSystemPrompt({ now, search: false })).toContain(
      "There is no web search here",
    );
    /* Ec6: a subset of the grant, writes limited to the three. */
    for (const name of LOCAL_AGENT_TOOLS) {
      expect(AGENT_TOOL_NAMES as readonly string[]).toContain(name);
    }
    expect(LOCAL_AGENT_TOOLS).toEqual(
      AGENT_TOOL_NAMES.filter((name) =>
        (LOCAL_AGENT_TOOLS as readonly string[]).includes(name),
      ),
    );
  });

  it("never name a held-back tool in the preambles or the local prompt", () => {
    const preambleAndWorkflow = `${agentPreamble({ now, search: true })}\n${localSystemPrompt({ now, search: true })}`;
    for (const name of AGENT_HELD_BACK) {
      /* As a name, not inside a word ("reindexing" is prose). */
      const named = new RegExp(`\\b${name}\\b`);
      expect(preambleAndWorkflow).not.toMatch(named);
      expect(
        claudeSystemPrompt({ now, search: true }).split("<curator_guide>")[0],
      ).not.toMatch(named);
    }
  });
});
