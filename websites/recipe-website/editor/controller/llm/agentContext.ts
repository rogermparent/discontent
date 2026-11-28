/**
 * The curator's model and context, visible to the imports it starts (51a,
 * Da2). An import a tool runs from an agent run reads the page with the
 * local model; when that is the agent's own model, asking Ollama for a
 * different `num_ctx` than the run's reloads it (measured once at 14 s, epic
 * 51's context). So the agent run sets its model and `num_ctx` here, around
 * the loop, and an import on the same model asks for the run's — never
 * smaller than its own need, since a run's context is the largest step.
 * Nothing sets it outside an agent run, so an import in the editor, the CLI
 * or a test sizes its context as before.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface AgentModel {
  model: string;
  numCtx: number;
}

const store = new AsyncLocalStorage<AgentModel>();

/** Run `work` as an agent run on `model` at `numCtx` (a local model's). */
export function withAgentModel<T>(agent: AgentModel, work: () => T): T {
  return store.run(agent, work);
}

/**
 * The `num_ctx` an import on `config` should ask for inside an agent run on
 * the same model; nothing for another model or outside a run.
 */
export function agentNumCtxFor(config: {
  model: string;
  api: string;
}): number | undefined {
  const agent = store.getStore();
  if (!agent || config.api === "anthropic") return undefined;
  return agent.model === config.model ? agent.numCtx : undefined;
}
