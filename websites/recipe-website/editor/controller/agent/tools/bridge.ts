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
import {
  parseToolInput,
  toolError,
  toolInputSchema,
  type ToolErrorObject,
} from "./schema";
import { urlRefusal, type UrlGuardOptions } from "./urlGuard";
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
  /**
   * The SSRF guard's DNS lookup and test exemptions (Eb9), for the recipes
   * tools' URL arguments; `web_fetch` takes its own in `webFetch`.
   */
  guard?: UrlGuardOptions;
}

type Args = Record<string, unknown>;
const field = (value: unknown, key: string): unknown =>
  value && typeof value === "object" ? (value as Args)[key] : undefined;

/**
 * The URLs each recipes tool downloads, from its parsed arguments (Eb9):
 * the page an inspect or import reads, a roundup's list page and its picks
 * named by URL, an image URL, an `imageImportUrl`. A recipe's `source` and
 * `videoImportUrl` are cited, never fetched, so they are not here.
 */
const FETCHED_URLS: Partial<Record<AgentToolName, (args: Args) => unknown[]>> =
  {
    page_inspect: (args) => [args.url],
    recipe_import: (args) => [args.url, args.image],
    page_inspect_list: (args) => [args.url],
    recipe_import_list: (args) => [
      args.url,
      ...(Array.isArray(args.pick)
        ? args.pick.map((pick) =>
            typeof pick === "string" ? pick : field(pick, "url"),
          )
        : []),
    ],
    recipe_set_image: (args) => [args.url],
    term_set_image: (args) => [args.url],
    recipe_create: (args) => [field(args.recipe, "imageImportUrl")],
    recipe_update: (args) => [field(args.patch, "imageImportUrl")],
    group_create: (args) => [field(args.group, "imageImportUrl")],
    group_update: (args) => [field(args.patch, "imageImportUrl")],
    term_create: (args) => [field(args.term, "imageImportUrl")],
    term_update: (args) => [field(args.patch, "imageImportUrl")],
  };

/** Schemes a downloader might honour that are never the web's. */
const OTHER_SCHEME = /^(file|ftp|data|gopher|dict|ldap|smb|wss?):/i;

/**
 * The first of `values` the guard refuses, as `forbidden`. Only strings that
 * parse as URLs are checked — the importer adds no scheme, so a bare
 * `10.0.0.1/x` fails in its handler without a request — and a URL of
 * another scheme (`file:`, `ftp:`…) is refused outright.
 */
async function urlsRefusal(
  values: unknown[],
  guard: UrlGuardOptions,
): Promise<ToolErrorObject | undefined> {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!URL.canParse(text)) continue;
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      if (OTHER_SCHEME.test(text) || text.includes("://")) {
        return toolError(
          "forbidden",
          `Only http and https URLs are fetched: ${text}`,
        );
      }
      continue;
    }
    const refused = await urlRefusal(url, guard);
    if (refused?.error.code === "forbidden") return refused;
  }
  return undefined;
}

export interface RecipeAgentToolsOptions {
  only?: readonly AgentToolName[];
  guard?: UrlGuardOptions;
}

/** The 45 recipes tools of E1 (or `only`), in `AGENT_TOOL_NAMES`' order. */
export function recipeAgentTools(
  backend: CuratorBackend,
  { only = AGENT_TOOL_NAMES, guard = {} }: RecipeAgentToolsOptions = {},
): AgentTool[] {
  const byName = new Map(
    recipeToolDefinitions(backend).map((tool) => [tool.name, tool] as const),
  );
  const names = AGENT_TOOL_NAMES.filter((name) => only.includes(name));
  return names.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`No recipes tool named ${name}`);
    const fetched = FETCHED_URLS[name];
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
        if (fetched) {
          const refused = await urlsRefusal(
            fetched(parsed.data as Args),
            guard,
          );
          if (refused) return refused;
        }
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
  const tools = recipeAgentTools(backend, {
    only: options.only,
    guard: options.guard,
  });
  if (options.webFetch !== false) {
    tools.push(webFetchTool(options.webFetch ?? {}));
  }
  if (options.webSearch !== false) {
    const search = webSearchTool(options.webSearch ?? {});
    if (search) tools.push(search);
  }
  return tools;
}
