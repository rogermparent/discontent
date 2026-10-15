/**
 * The local model's import mode (epic 36, D3) — names only.
 *
 * Its own module, with no imports, so the CLI's option parsing, the zod
 * bodies and the MCP `inputSchema`s can name the modes without loading the
 * model client or the extractor at startup (35q). What each mode *does* is
 * decided in `importWithLlm.ts` (`applyLlm`) and nowhere else.
 */
export const LLM_MODES = ["auto", "force", "off"] as const;

export type LlmMode = (typeof LLM_MODES)[number];

export const DEFAULT_LLM_MODE: LlmMode = "auto";

export function isLlmMode(value: unknown): value is LlmMode {
  return (
    typeof value === "string" &&
    (LLM_MODES as readonly string[]).includes(value)
  );
}
