/**
 * The agent's tool contract (epic 44, "Interfaces"): 44a's loop calls these,
 * 44b's bridge and web tools implement them.
 */
import type { JobContext as JobHandle } from "../jobs/context";

/** A tool the agent may call. `inputSchema` is JSON Schema (an object). */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Untrusted page text (E7): wrapped before the model sees it. */
  untrusted?: boolean;
  run(input: unknown, ctx: AgentToolContext): Promise<unknown>;
}
export interface AgentToolContext {
  signal: AbortSignal;
  /** The run's job, for nested steps (an import inside a tool call). */
  job?: JobHandle;
}
/** A provider-side tool (Claude's web_search): declared, not run by us. */
export interface ServerTool {
  kind: "web_search" | "web_fetch";
  maxUses?: number;
  allowedDomains?: string[];
}
