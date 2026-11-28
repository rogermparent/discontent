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

/*
 * 51b review 6: the stores live on `globalThis`, as the queue's holds do
 * (`queue.ts`): Next bundles a module once per route, so a module-level
 * store set by the agent's job would be a different store from the one an
 * import's code reads in another bundle.
 */
interface AgentContextGlobal {
  __discontentAgentModel?: AsyncLocalStorage<AgentModel>;
  __discontentNotesLearningHeld?: AsyncLocalStorage<NotesHold>;
}

function contextGlobal(): AgentContextGlobal {
  return globalThis as AgentContextGlobal;
}

function modelStore(): AsyncLocalStorage<AgentModel> {
  return (contextGlobal().__discontentAgentModel ??= new AsyncLocalStorage());
}

/** One held dry run's notes: whether a learning was held back in it. */
interface NotesHold {
  heldBack: boolean;
}

function notesStore(): AsyncLocalStorage<NotesHold> {
  return (contextGlobal().__discontentNotesLearningHeld ??=
    new AsyncLocalStorage());
}

/** Run `work` as an agent run on `model` at `numCtx` (a local model's). */
export function withAgentModel<T>(agent: AgentModel, work: () => T): T {
  return modelStore().run(agent, work);
}

/**
 * The `num_ctx` an import on `config` should ask for inside an agent run on
 * the same model; nothing for another model or outside a run.
 */
export function agentNumCtxFor(config: {
  model: string;
  api: string;
}): number | undefined {
  const agent = modelStore().getStore();
  if (!agent || config.api === "anthropic") return undefined;
  return agent.model === config.model ? agent.numCtx : undefined;
}

/**
 * 51b (Db4): a curator plan's held dry run reads a page without teaching
 * the site's notes selector. Learning asks the edit model (`RECIPE_LLM_MODEL`,
 * qwen3:8b beside a qwen3.5:9b curator: a model swap on an 8 GB card, 51a's
 * baseline e run 1) and stores the selector in the settings, a write during
 * a dry run. The held dry run's preview never shows notes; the import the
 * person approves runs outside this and learns as ever.
 *
 * Run `work` with notes learning held back (a plan's held dry run).
 */
export function withoutNotesLearning<T>(work: () => T): T {
  return notesStore().run({ heldBack: false }, work);
}

/** Whether an import here must not ask a model to learn a notes selector. */
export function notesLearningHeld(): boolean {
  return notesStore().getStore() !== undefined;
}

/**
 * Say that this dry run held a notes learning back (51b review 7): the page
 * has a Notes heading the import would have asked a model to read, so the
 * import the person approves may carry notes the preview didn't.
 */
export function markNotesHeldBack(): void {
  const hold = notesStore().getStore();
  if (hold) hold.heldBack = true;
}

/** Whether this held dry run held a notes learning back. */
export function notesHeldBack(): boolean {
  return notesStore().getStore()?.heldBack === true;
}
