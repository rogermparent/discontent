/**
 * The curator skill as the editor's agent reads it (epic 44, E4, 44c).
 *
 * `.claude/skills/recipe-curator/SKILL.md` stays the one source of truth.
 * Its parts that only make sense in Claude Code — `$ARGUMENTS`, the stdio
 * or HTTP MCP server, the CLI fallback — sit between marker comments:
 *
 * ```
 * <!-- claude-code-only -->
 * …
 * <!-- /claude-code-only -->
 * ```
 *
 * and are cut here (`stripClaudeCodeOnly`), with the YAML frontmatter, from
 * SKILL.md and examples.md alike. No second copy of the skill.
 *
 * **The Pi image carries it as code** (Ec5): the editor's Docker build
 * context leaves out every `*.md` (`.dockerignore`) and `.claude/` is not
 * the editor's, so the stripped text is generated into
 * `skillText.generated.ts` by `pnpm --filter recipe-editor
 * generate-skill-text` and committed; `test/agentSkillText.test.ts` fails
 * when it is out of date.
 *
 * Pure: no filesystem here, so the test and the script share it.
 */

export const CLAUDE_CODE_ONLY_OPEN = "<!-- claude-code-only -->";
export const CLAUDE_CODE_ONLY_CLOSE = "<!-- /claude-code-only -->";

/** The skill's files, relative to the repository root. */
export const SKILL_FILES = {
  skill: ".claude/skills/recipe-curator/SKILL.md",
  examples: ".claude/skills/recipe-curator/examples.md",
} as const;

/** The generated module, relative to the editor package. */
export const SKILL_MODULE = "controller/agent/skillText.generated.ts";

/** Markdown without its leading YAML frontmatter (`---` … `---`). */
export function withoutFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(markdown);
  return match ? markdown.slice(match[0].length) : markdown;
}

/**
 * Markdown with every `claude-code-only` section cut, markers included. An
 * opening marker with no closing one is an error, not a silent cut to the
 * end: a typo must not drop half the skill.
 */
export function stripClaudeCodeOnly(markdown: string): string {
  let out = "";
  let rest = markdown;
  for (;;) {
    const open = rest.indexOf(CLAUDE_CODE_ONLY_OPEN);
    if (open < 0) {
      if (rest.includes(CLAUDE_CODE_ONLY_CLOSE)) {
        throw new Error(
          `${CLAUDE_CODE_ONLY_CLOSE} without ${CLAUDE_CODE_ONLY_OPEN}`,
        );
      }
      out += rest;
      break;
    }
    const close = rest.indexOf(
      CLAUDE_CODE_ONLY_CLOSE,
      open + CLAUDE_CODE_ONLY_OPEN.length,
    );
    if (close < 0) {
      throw new Error(
        `${CLAUDE_CODE_ONLY_OPEN} without ${CLAUDE_CODE_ONLY_CLOSE}`,
      );
    }
    out += rest.slice(0, open);
    rest = rest.slice(close + CLAUDE_CODE_ONLY_CLOSE.length);
  }
  /* A cut leaves its blank lines behind: at most one blank line in a row. */
  return `${out.replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

/** One skill file as the agent reads it. */
export function agentSkillText(markdown: string): string {
  return stripClaudeCodeOnly(withoutFrontmatter(markdown));
}

/** The generated module's source, from the two files' contents. */
export function renderSkillModule(skill: string, examples: string): string {
  return [
    "/*",
    " * GENERATED — do not edit. The curator skill as the editor's agent reads it",
    ` * (epic 44, E4): ${SKILL_FILES.skill} and examples.md, frontmatter and`,
    " * claude-code-only sections cut (`skillText.ts`). Regenerate with",
    " * `pnpm --filter recipe-editor generate-skill-text`;",
    " * test/agentSkillText.test.ts fails while it is out of date.",
    " */",
    "",
    `export const CURATOR_SKILL_TEXT: string = ${JSON.stringify(agentSkillText(skill))};`,
    "",
    `export const CURATOR_EXAMPLES_TEXT: string = ${JSON.stringify(agentSkillText(examples))};`,
    "",
  ].join("\n");
}
