/**
 * The agent's tools (epic 44, 44b): the `recipes` server's own definitions,
 * narrowed to Claude Code's grant (E1), plus `web_fetch` and `web_search`.
 *
 * Each recipes tool is the MCP tool with the transport taken away: the same
 * name and description, the same zod schema (rendered as the SDK renders it,
 * `schema.ts`), the same handler over the same `CuratorBackend`. What `run`
 * answers is the MCP result's `structuredContent` — the compact JSON an MCP
 * client gets, success or `{error: {code, message, …}}` — returned, never
 * thrown, so a failure is something the model reads and works around.
 *
 * Input the schema refuses is the one place the agent differs from MCP: the
 * SDK answers it with a protocol error before dispatch (T28); here it is a
 * `validation` error object like any other (`parseToolInput`).
 *
 * The backend the editor hands this is `createLocalBackend({inProcess:
 * true})` (44c), as MCP over HTTP uses — so writes commit one per call
 * exactly as Claude Code's do, and the Git page can revert any of them.
 */
import type { CuratorBackend } from "../../../cli/backend/types";
import { recipeToolDefinitions } from "../../../mcp/registry";
import { toErrorObject } from "../../curation/errors";
import type { AgentTool } from "../types";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./names";
import { parseToolInput, toolError, toolInputSchema } from "./schema";
import { webFetchTool, type WebFetchOptions } from "./webFetch";
import { webSearchTool, type WebSearchOptions } from "./webSearch";

/**
 * Tools whose results are page text (E7): `page_inspect` and
 * `page_inspect_list` read a site, and their drafts, descriptions and
 * names are the site's words.
 */
const UNTRUSTED_RECIPE_TOOLS: ReadonlySet<string> = new Set([
  "page_inspect",
  "page_inspect_list",
]);

export interface AgentToolsOptions {
  /**
   * `web_fetch`'s options, or `false` to leave it out (when the model is
   * Claude and 44a declares Anthropic's server-side fetch instead).
   */
  webFetch?: false | WebFetchOptions;
  /**
   * `web_search`'s options, or `false`. Without a SearXNG URL
   * (`RECIPE_SEARCH_URL`) it is left out anyway (E6).
   */
  webSearch?: false | WebSearchOptions;
  /**
   * A subset of the 45 to offer, in this order (Eb5): the whole list's
   * schemas and descriptions are ~41k characters, about qwen3:8b's whole
   * 12k-token context, so 44e may hand a local model fewer. Never wider than
   * `AGENT_TOOL_NAMES`: the type allows only those names.
   */
  only?: readonly AgentToolName[];
}

/** The 45 recipes tools of E1 (or `only`), in `AGENT_TOOL_NAMES`' order. */
export function recipeAgentTools(
  backend: CuratorBackend,
  only: readonly AgentToolName[] = AGENT_TOOL_NAMES,
): AgentTool[] {
  const byName = new Map(
    recipeToolDefinitions(backend).map((tool) => [tool.name, tool] as const),
  );
  const names = AGENT_TOOL_NAMES.filter((name) => only.includes(name));
  return names.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`No recipes tool named ${name}`);
    return {
      name,
      description: tool.description,
      inputSchema: toolInputSchema(tool.inputSchema),
      ...(UNTRUSTED_RECIPE_TOOLS.has(name) ? { untrusted: true } : {}),
      async run(input, ctx) {
        if (ctx.signal.aborted) {
          return toolError("cancelled", "The run was stopped");
        }
        const parsed = await parseToolInput(name, tool.inputSchema, input);
        if (!parsed.ok) return parsed.error;
        try {
          const result = await tool.handler(parsed.data);
          if (result.structuredContent !== undefined) {
            return result.structuredContent;
          }
          const text = result.content?.find((part) => part.type === "text");
          return text && "text" in text ? JSON.parse(text.text) : {};
        } catch (error) {
          /* The SDK would have answered a throw as a tool error, too. */
          return toErrorObject(error);
        }
      },
    } satisfies AgentTool;
  });
}

/**
 * Everything the agent may call: the 45, then `web_fetch`, then
 * `web_search` when a SearXNG URL is configured.
 */
export function agentTools(
  backend: CuratorBackend,
  options: AgentToolsOptions = {},
): AgentTool[] {
  const tools = recipeAgentTools(backend, options.only);
  if (options.webFetch !== false) {
    tools.push(webFetchTool(options.webFetch ?? {}));
  }
  if (options.webSearch !== false) {
    const search = webSearchTool(options.webSearch ?? {});
    if (search) tools.push(search);
  }
  return tools;
}
