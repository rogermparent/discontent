import {
  CLAUDE_NO_KEY_MESSAGE,
  displayUrl,
  llmConfig,
  llmStatus,
} from "recipe-editor/controller/llm/client";
import {
  RECOMMENDED_VISION_MODEL,
  visionConfig,
} from "recipe-editor/controller/llm/vision";

/**
 * The "Local model" line (epic 36, 36b): read-only, from the environment
 * (`RECIPE_LLM_*` in `editor/.env`, D1), with one short probe of the server's
 * model list. A machine with none of it says "not configured".
 *
 * 38g: the Claude API (`RECIPE_LLM_API=anthropic`) shows as such — its
 * model, whether the API knows it, whether the key was refused — and never
 * the key itself, only that one is set. Shown on Settings → Tools (the
 * workstation's) and on `/jobs` (every role) when a model is configured, so
 * the Pi shows it too (Dg8).
 */
export async function LocalModelStatus() {
  const config = llmConfig();
  if (!config) {
    if (process.env.RECIPE_LLM_API?.trim().toLowerCase() === "anthropic") {
      return (
        <p className="text-sm" data-testid="local-model-status">
          {capitalised(CLAUDE_NO_KEY_MESSAGE)} (in <code>editor/.env</code>, or
          the Pi&apos;s <code>.env</code>).
        </p>
      );
    }
    return (
      <p className="text-sm" data-testid="local-model-status">
        No local model configured. Set <code>RECIPE_LLM_URL</code> (and
        optionally <code>RECIPE_LLM_MODEL</code>) in <code>editor/.env</code> to
        have imports read pages that carry no recipe data — or use the Claude
        API: <code>RECIPE_LLM_API=anthropic</code> and{" "}
        <code>RECIPE_LLM_API_KEY</code>.
      </p>
    );
  }
  const claude = config.api === "anthropic";
  const status = await llmStatus(config);
  const vision = visionConfig();
  const state = status.keyRefused
    ? `${status.error ?? "the API key was refused"} — check RECIPE_LLM_API_KEY`
    : !status.reachable
      ? `unreachable (${status.error ?? "no answer"})`
      : status.modelAvailable === false
        ? claude
          ? `reachable, but the API knows no model ${config.model}`
          : `reachable, but ${config.model} is not pulled`
        : "reachable";
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
      data-testid="local-model-status"
    >
      <dt className="text-muted-foreground">Server</dt>
      <dd>
        {claude ? "The Claude API at " : null}
        <code>{displayUrl(config.url)}</code> ({config.api})
      </dd>
      <dt className="text-muted-foreground">Model</dt>
      <dd>
        <code>{config.model}</code>
      </dd>
      {config.apiKey ? (
        <>
          <dt className="text-muted-foreground">API key</dt>
          <dd>
            set (<code>RECIPE_LLM_API_KEY</code>)
          </dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">Status</dt>
      <dd>{state}</dd>
      {/* 38e: photo import's model, on the same server. */}
      <dt className="text-muted-foreground">Vision model</dt>
      <dd>
        {vision ? (
          <>
            <code>{vision.model}</code>
            {claude && vision.model === config.model
              ? " (the text model — Claude reads photos itself)"
              : null}
          </>
        ) : (
          <>
            None — photo import is off. Set <code>RECIPE_LLM_VISION_MODEL</code>{" "}
            (e.g. <code>{RECOMMENDED_VISION_MODEL}</code>) to read recipe cards.
          </>
        )}
      </dd>
    </dl>
  );
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
