import { llmConfig, llmStatus } from "recipe-editor/controller/llm/client";

/**
 * The "Local model" line (epic 36, 36b): read-only, from the environment
 * (`RECIPE_LLM_*` in `editor/.env`, D1), with one short probe of the server's
 * model list. The Pi sets none of it, so it says "not configured" there.
 */
export async function LocalModelStatus() {
  const config = llmConfig();
  if (!config) {
    return (
      <p className="text-sm" data-testid="local-model-status">
        No local model configured. Set <code>RECIPE_LLM_URL</code> (and
        optionally <code>RECIPE_LLM_MODEL</code>) in <code>editor/.env</code> to
        have imports read pages that carry no recipe data.
      </p>
    );
  }
  const status = await llmStatus(config);
  const state = !status.reachable
    ? `unreachable (${status.error ?? "no answer"})`
    : status.modelAvailable === false
      ? `reachable, but ${config.model} is not pulled`
      : "reachable";
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
      data-testid="local-model-status"
    >
      <dt className="text-muted-foreground">Server</dt>
      <dd>
        <code>{config.url}</code> ({config.api})
      </dd>
      <dt className="text-muted-foreground">Model</dt>
      <dd>
        <code>{config.model}</code>
      </dd>
      <dt className="text-muted-foreground">Status</dt>
      <dd>{state}</dd>
    </dl>
  );
}
