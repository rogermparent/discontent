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
import type { CuratorBackend, SeatRun } from "../../../cli/backend/types";
import { recipeToolDefinitions } from "../../../mcp/registry";
import { toErrorObject } from "../../curation/errors";
import type { AgentTool, AgentToolContext } from "../types";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./names";
import {
  parseToolInput,
  toolError,
  toolInputSchema,
  type ToolErrorObject,
} from "./schema";
import {
  LOCAL_TOOL_TEXT,
  localResult,
  localSchema,
  refusedLocalArg,
} from "./local";
import { urlRefusal, type UrlGuardOptions } from "../../urlGuard";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import {
  DRY_RUN_TOOLS,
  HELD_NOTE,
  PAGE_TEXT_DRY_RUNS,
  isHeldAnswer,
  isHeldTool,
} from "../held";
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
  /**
   * The local model's view (44e, `local.ts`): short descriptions, lighter
   * schemas, a smaller `page_inspect` answer. Same names, same handlers,
   * same zod parse.
   */
  local?: boolean;
  /**
   * Hold every write for the person's review (48b, Db1): a held write is
   * checked as the real one is (its schema, its URLs, a local file) and
   * then answers `{held: true, note, dryRun?}` — a dry run's answer for a
   * tool that takes one — and writes nothing (`heldAnswer`).
   */
  hold?: boolean;
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

/**
 * The arguments that read a file on the editor's machine (Eb8 → Ec10): an
 * image's local `path` and an import's local `photos`. The MCP server takes
 * them (Claude Code's grant, a person at the keyboard); the editor's agent
 * does not — a page could ask for `~/.ssh/id_rsa` as a recipe image and
 * commit it into the content repo. Refused before the handler, nothing
 * written; a URL works as it always did (Eb9 guards it). Roger to confirm.
 */
const LOCAL_FILE_ARGS: Partial<Record<AgentToolName, readonly string[]>> = {
  recipe_set_image: ["path"],
  term_set_image: ["path"],
  recipe_import: ["photos"],
};

/** What a refused local-file argument answers (Ec10). */
export const LOCAL_FILE_REFUSAL =
  "local files aren't available to the curator; give a URL";

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
    if (refused?.code === "forbidden") {
      return toolError(refused.code, refused.message);
    }
  }
  return undefined;
}

/**
 * The importer's own SSRF refusal (46a, `url_refused` — a redirect to a
 * private address, which the bridge's up-front check cannot see) as the
 * agent's code for one (Eb7): `forbidden`, as the bridge and `web_fetch`
 * answer, so the prompts' one rule — never retry it — covers both.
 */
function asAgentError(value: unknown): unknown {
  const error = (value as { error?: { code?: unknown } } | null)?.error;
  if (error?.code !== "url_refused") return value;
  return {
    ...(value as object),
    error: { ...error, code: "forbidden" },
  };
}

/**
 * What a handler's job-running seat is handed (44c, Ec1): the call's
 * signal — the run's cancel and its wall-time budget together — and the
 * run's job with that signal, so an import the tool starts runs inside the
 * run's job (its steps nest under this call's step) and stops when the run
 * does. Without `beyondCancel`: a seat must never seal the whole run.
 */
function seatRun(ctx: AgentToolContext): SeatRun {
  if (!ctx.job) return { signal: ctx.signal };
  const { log, tier, jobId, waiting } = ctx.job;
  return {
    signal: ctx.signal,
    job: {
      log,
      tier,
      signal: ctx.signal,
      ...(jobId ? { jobId } : {}),
      ...(waiting ? { waiting } : {}),
    },
  };
}

export interface RecipeAgentToolsOptions {
  only?: readonly AgentToolName[];
  guard?: UrlGuardOptions;
  local?: boolean;
  /** Hold the writes (48b): see `AgentToolsOptions.hold`. */
  hold?: boolean;
}

/** A handler's answer as the agent reads it: `structuredContent`, else its text. */
function answerOf(result: {
  structuredContent?: unknown;
  content?: { type: string; text?: string }[];
}): unknown {
  if (result.structuredContent !== undefined) {
    return asAgentError(result.structuredContent);
  }
  const text = result.content?.find((part) => part.type === "text");
  return text && "text" in text && typeof text.text === "string"
    ? asAgentError(JSON.parse(text.text))
    : {};
}

/**
 * A held `term_assign`'s split (48b): its `add`s as the content stands —
 * would be tagged, already tagged, not a recipe (yet) — read from the
 * recipes, so the model and the review can say "add 2, 1 already tagged"
 * without writing. A remove is not split: the write says what it took off.
 */
async function assignSplit(
  backend: CuratorBackend,
  args: Args,
): Promise<{ wouldAdd: string[]; alreadyTagged: string[]; missing: string[] }> {
  const wouldAdd: string[] = [];
  const alreadyTagged: string[] = [];
  const missing: string[] = [];
  const add = Array.isArray(args.add)
    ? args.add.filter((slug): slug is string => typeof slug === "string")
    : [];
  if (args.type === "group") return { wouldAdd: add, alreadyTagged, missing };
  const term = tagSlug(String(args.slug ?? ""));
  for (const slug of add) {
    try {
      const detail = await backend.getRecipe(slug);
      const tags = Array.isArray(detail.recipe.tags) ? detail.recipe.tags : [];
      if (
        tags.some((tag) => typeof tag === "string" && tagSlug(tag) === term)
      ) {
        alreadyTagged.push(slug);
      } else {
        wouldAdd.push(slug);
      }
    } catch {
      missing.push(slug);
    }
  }
  return { wouldAdd, alreadyTagged, missing };
}

/**
 * What a held write answers (48b, Db1): nothing written. A tool that takes
 * `dryRun` runs as one, and an error there is the answer (a held call that
 * could not run is no proposal); `term_assign` says how its `add`s split.
 */
async function heldAnswer(
  name: AgentToolName,
  definition: { handler: (args: unknown, run?: SeatRun) => Promise<unknown> },
  args: Args,
  backend: CuratorBackend,
  run: SeatRun,
  local: boolean,
): Promise<unknown> {
  if (DRY_RUN_TOOLS.has(name)) {
    const dry = answerOf(
      (await definition.handler({ ...args, dryRun: true }, run)) as {
        structuredContent?: unknown;
      },
    );
    if (dry && typeof dry === "object" && "error" in dry) return dry;
    return {
      held: true,
      note: HELD_NOTE,
      dryRun: local ? localResult(name, dry) : dry,
    };
  }
  if (name === "term_assign") {
    const split = await assignSplit(backend, args);
    return {
      held: true,
      note: `${HELD_NOTE}${split.missing.length ? " A slug under `missing` is not a recipe: fine if a held import or create makes it, else it fails when applied." : ""}`,
      ...split,
    };
  }
  return { held: true, note: HELD_NOTE };
}

/** A tool as a local model sees it (44e): its `LOCAL_TOOL_TEXT`, if any. */
function localized(tool: AgentTool): AgentTool {
  const text = LOCAL_TOOL_TEXT[tool.name as keyof typeof LOCAL_TOOL_TEXT];
  return {
    ...tool,
    description: text?.description ?? tool.description,
    inputSchema: localSchema(tool.inputSchema, text?.omit),
    async run(input, ctx) {
      /* A left-out flag that widens a write is refused, not just unshown. */
      const refused = refusedLocalArg(tool.name, input);
      if (refused) {
        return toolError(
          "forbidden",
          `\`${refused}\` isn't available to the curator here; leave it out`,
        );
      }
      return localResult(tool.name, await tool.run(input, ctx));
    },
  };
}

/** The 45 recipes tools of E1 (or `only`), in `AGENT_TOOL_NAMES`' order. */
export function recipeAgentTools(
  backend: CuratorBackend,
  {
    only = AGENT_TOOL_NAMES,
    guard = {},
    local = false,
    hold = false,
  }: RecipeAgentToolsOptions = {},
): AgentTool[] {
  const byName = new Map(
    recipeToolDefinitions(backend).map((tool) => [tool.name, tool] as const),
  );
  const names = AGENT_TOOL_NAMES.filter((name) => only.includes(name));
  const tools = names.map((name) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`No recipes tool named ${name}`);
    const fetched = FETCHED_URLS[name];
    const localFiles = LOCAL_FILE_ARGS[name];
    const held = hold && isHeldTool(name);
    return {
      name,
      description: tool.description,
      inputSchema: toolInputSchema(tool.inputSchema),
      ...(UNTRUSTED_RECIPE_TOOLS.has(name) ? { untrusted: true } : {}),
      /* 48b: an import's dry run — held, or the model's own — carries the
       * page's recipe (E7). */
      ...(PAGE_TEXT_DRY_RUNS.has(name)
        ? {
            untrustedResult: (result: unknown) =>
              isHeldAnswer(result) ||
              (!!result &&
                typeof result === "object" &&
                (result as Args).dryRun === true),
          }
        : {}),
      async run(input, ctx) {
        if (ctx.signal.aborted) {
          return toolError("cancelled", "The run was stopped");
        }
        const parsed = await parseToolInput(name, tool.inputSchema, input);
        if (!parsed.ok) return parsed.error;
        if (
          localFiles?.some((key) => (parsed.data as Args)[key] !== undefined)
        ) {
          return toolError("forbidden", LOCAL_FILE_REFUSAL);
        }
        if (fetched) {
          const refused = await urlsRefusal(
            fetched(parsed.data as Args),
            guard,
          );
          if (refused) return refused;
        }
        try {
          /* A dry run the model asked for itself is a read: it runs. */
          if (held && (parsed.data as Args).dryRun !== true) {
            return await heldAnswer(
              name,
              tool,
              parsed.data as Args,
              backend,
              seatRun(ctx),
              local,
            );
          }
          return answerOf(await tool.handler(parsed.data, seatRun(ctx)));
        } catch (error) {
          /* The SDK would have answered a throw as a tool error, too. */
          return asAgentError(toErrorObject(error));
        }
      },
    } satisfies AgentTool;
  });
  return local ? tools.map(localized) : tools;
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
    local: options.local,
    hold: options.hold,
  });
  const web: AgentTool[] = [];
  if (options.webFetch !== false) {
    web.push(webFetchTool(options.webFetch ?? {}));
  }
  if (options.webSearch !== false) {
    const search = webSearchTool(options.webSearch ?? {});
    if (search) web.push(search);
  }
  return [...tools, ...(options.local ? web.map(localized) : web)];
}
