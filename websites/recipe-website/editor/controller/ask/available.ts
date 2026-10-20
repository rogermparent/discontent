import { llmConfig } from "../llm/client";

/**
 * Whether Ask is offered (43q): a model is set up — the local one
 * (`RECIPE_LLM_URL`) or the Claude API (38g). The caller adds "signed in".
 * With neither, there is no Ask row in ⌘K and no toggle on `/search`, the
 * same rule that keeps an import's `--llm` off on a machine with no model.
 */
export function askAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return llmConfig(env) !== undefined;
}
