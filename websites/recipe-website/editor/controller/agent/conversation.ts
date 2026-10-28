/**
 * A curator run as the page reads it (epic 44, 44d): the transcript's
 * records (`GET /api/agent/<id>`, 44c's Ec4) folded into a conversation —
 * each ask, each model turn with its tool calls as rows (a readable phrase,
 * a status, a duration), each earlier run's end — plus the words for how a
 * run stopped and what ran it.
 *
 * Pure and dependency-free (type imports only): it runs in the browser.
 */
import type { LlmApi } from "../llm/client";
import { costBudgetWords } from "../llm/cost";
import type {
  TranscriptEnd,
  TranscriptRecord,
  TranscriptStart,
} from "./transcript";
import type {
  AgentMessage,
  AgentStopReason,
  AgentToolCall,
  ServerToolUse,
} from "./types";

export type ToolRowStatus =
  /** Running now: the first call of the newest turn without a result. */
  | "running"
  /** Waiting behind it (calls run one at a time, Ea10). */
  | "waiting"
  | "done"
  | "error"
  /** A stop answered it "not run", or the run ended without its result. */
  | "not_run";

export interface ToolRow {
  id: string;
  name: string;
  input: unknown;
  status: ToolRowStatus;
  /** What the model was sent back (compact JSON, or E7's wrapped page text). */
  result?: string;
  /** From the turn's record (or the call before) to its result's. */
  durationMs?: number;
  /** "Searched your recipes for “pork”": `toolPhrase`. */
  phrase: string;
}

export interface UserItem {
  kind: "user";
  key: string;
  text: string;
  t: string;
}

export interface AssistantItem {
  kind: "assistant";
  key: string;
  text: string;
  t: string;
  tools: ToolRow[];
  serverTools: ServerToolUse[];
}

/**
 * An earlier run of the conversation ended here (a follow-up comes next).
 * The newest run's own end is not an item: the footer says it.
 */
export interface EndItem {
  kind: "end";
  key: string;
  end: TranscriptEnd;
}

export type ConversationItem = UserItem | AssistantItem | EndItem;

export interface Conversation {
  items: ConversationItem[];
  /** The newest run's `start` record: its model and tools. */
  start?: TranscriptStart;
  /** The newest run's `end` record, once it has ended. */
  end?: TranscriptEnd;
  /** The newest run's model turns and tool calls so far. */
  turns: number;
  toolCalls: number;
  /** The conversation's first ask, and how many asks it holds. */
  firstAsk?: string;
  asks: number;
  /** Every message, in order (what `runChanges` reads). */
  messages: AgentMessage[];
}

/** A loop's answer that never ran (`not run: …`, Ea9) or never settled (Ea12). */
function notRun(content: string): boolean {
  return /^\{"error":"(?:not run|stopped while running)/.test(content);
}

function epoch(t: string): number {
  const value = Date.parse(t);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Fold `records` into a conversation. `live` says whether the newest run
 * is still going: a call with no result is then running (or waiting), and
 * otherwise was never run.
 */
export function buildConversation(
  records: readonly TranscriptRecord[],
  { live }: { live: boolean },
): Conversation {
  const items: ConversationItem[] = [];
  const messages: AgentMessage[] = [];
  let start: TranscriptStart | undefined;
  let end: TranscriptEnd | undefined;
  let turns = 0;
  let toolCalls = 0;
  let firstAsk: string | undefined;
  let asks = 0;
  /* The calls still waiting for a result, by id → their row and turn. */
  const open = new Map<string, { row: ToolRow; since: number }>();
  /* When the last thing in the newest turn happened (its record, a result). */
  let lastAt = 0;

  records.forEach((record, index) => {
    const key = `${record.job}:${index}`;
    if (record.type === "start") {
      start = record;
      end = undefined;
      turns = 0;
      toolCalls = 0;
      return;
    }
    if (record.type === "end") {
      if (record.job === start?.job) end = record;
      items.push({ kind: "end", key, end: record });
      return;
    }
    const { message } = record;
    messages.push(message);
    const at = epoch(record.t);
    if (message.role === "user") {
      asks += 1;
      firstAsk ??= message.text;
      items.push({ kind: "user", key, text: message.text, t: record.t });
      return;
    }
    if (message.role === "assistant") {
      if (record.job === start?.job) turns += 1;
      lastAt = at;
      const tools = message.toolCalls.map((call): ToolRow => ({
        id: call.id,
        name: call.name,
        input: call.input,
        status: "not_run",
        phrase: toolPhrase(call),
      }));
      for (const row of tools) open.set(row.id, { row, since: at });
      items.push({
        kind: "assistant",
        key,
        text: message.text,
        t: record.t,
        tools,
        serverTools: message.serverToolUses ?? [],
      });
      return;
    }
    /* A tool result. */
    if (record.job === start?.job) toolCalls += 1;
    const waiting = open.get(message.toolCallId);
    if (!waiting) return;
    open.delete(message.toolCallId);
    const { row } = waiting;
    row.result = message.content;
    row.status = notRun(message.content)
      ? "not_run"
      : message.isError
        ? "error"
        : "done";
    if (row.status !== "not_run") {
      row.durationMs = Math.max(0, at - Math.max(waiting.since, lastAt));
    }
    row.phrase = toolPhrase(
      { id: row.id, name: row.name, input: row.input },
      row.status === "done" ? message.content : undefined,
    );
    lastAt = at;
  });

  /* The newest run's end is the footer's to say, not a line of its own. */
  const tail = items.at(-1);
  if (tail?.kind === "end" && end && tail.end === end) items.pop();

  if (live && !end) {
    /* The newest turn's unanswered calls: the first runs, the rest wait. */
    let first = true;
    for (const { row } of open.values()) {
      row.status = first ? "running" : "waiting";
      first = false;
    }
  }

  return {
    items,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    turns,
    toolCalls,
    ...(firstAsk !== undefined ? { firstAsk } : {}),
    asks,
    messages,
  };
}

/* ------------------------------------------------------------------ */
/* Tool phrases                                                         */
/* ------------------------------------------------------------------ */

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A URL's site, as people say it ("sallysbakingaddiction.com"). */
export function siteOf(url: unknown): string | undefined {
  const text = str(url);
  if (!text) return undefined;
  try {
    return new URL(text).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** At most `max` characters of `text`, on one line. */
function short(text: string, max = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function parsedResult(content: string | undefined) {
  if (!content) return undefined;
  try {
    const value: unknown = JSON.parse(content);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function countArray(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

/**
 * A tool call in words: "Searched your recipes for “pork”", "Fetched
 * sallysbakingaddiction.com", "Imported …", "Tagged 4 recipes braises".
 * `result` (the content, when the call succeeded) sharpens a few — how
 * many a write touched, the slug an import landed at. Any other name is
 * itself: a tool this map does not know, or one the model made up.
 */
export function toolPhrase(
  call: Pick<AgentToolCall, "id" | "name" | "input">,
  result?: string,
): string {
  const input = isObject(call.input) ? call.input : {};
  const out = parsedResult(result);
  const slug = str(input.slug);
  const site = siteOf(input.url);
  switch (call.name) {
    case "recipe_search":
      return str(input.query)
        ? `Searched your recipes for “${short(String(input.query), 40)}”`
        : "Searched your recipes";
    case "recipe_list":
      return str(input.tag)
        ? `Listed your recipes tagged ${short(String(input.tag), 40)}`
        : "Listed your recipes";
    case "recipe_get":
      return slug ? `Read the recipe ${slug}` : "Read a recipe";
    case "page_inspect":
      return site ? `Inspected a page on ${site}` : "Inspected a page";
    case "page_inspect_list":
      return site ? `Read a roundup on ${site}` : "Read a roundup";
    case "recipe_import": {
      if (input.dryRun === true) {
        return site ? `Tried an import from ${site}` : "Tried an import";
      }
      if (out?.batch === true && Array.isArray(out.recipes)) {
        const imported = out.recipes.filter(
          (item) => isObject(item) && item.status === "imported",
        ).length;
        return `Imported ${plural(imported, "recipe")}${site ? ` from ${site}` : ""}`;
      }
      const landed = str(out?.slug);
      if (landed) return `Imported ${landed}${site ? ` from ${site}` : ""}`;
      if (str(input.text)) return "Imported pasted text";
      return site ? `Imported from ${site}` : "Imported a recipe";
    }
    case "recipe_import_list": {
      const results = Array.isArray(out?.results) ? out.results : undefined;
      if (results) {
        const imported = results.filter(
          (item) => isObject(item) && item.status === "imported",
        ).length;
        return `Imported ${plural(imported, "recipe")} from a roundup${site ? ` on ${site}` : ""}`;
      }
      return site ? `Imported from a roundup on ${site}` : "Imported a roundup";
    }
    case "recipe_create": {
      const recipe = isObject(input.recipe) ? input.recipe : {};
      const name = str(recipe.name);
      if (input.dryRun === true) return "Checked a new recipe";
      return name ? `Created “${short(name, 50)}”` : "Created a recipe";
    }
    case "recipe_update":
      return slug ? `Updated ${slug}` : "Updated a recipe";
    case "recipe_set_image":
      return slug ? `Set the picture of ${slug}` : "Set a recipe's picture";
    case "tag_list":
      return "Listed the tags";
    case "term_list":
      return "Listed the terms";
    case "term_get":
      return slug ? `Read the term ${slug}` : "Read a term";
    case "term_create":
      return slug ? `Created the term ${slug}` : "Created a term";
    case "term_update":
      return slug ? `Updated the term ${slug}` : "Updated a term";
    case "term_set_image":
      return slug ? `Set the picture of ${slug}` : "Set a term's picture";
    case "term_rename":
      return slug && str(input.to)
        ? `Renamed ${slug} to ${String(input.to)}`
        : "Renamed a term";
    case "term_assign": {
      const what = input.type === "group" ? "plan" : "recipe";
      const updated = countArray(out?.updated);
      const added = countArray(input.add) ?? 0;
      const removed = countArray(input.remove) ?? 0;
      if (removed > 0 && added === 0) {
        return `Untagged ${plural(updated ?? removed, what)}${slug ? ` ${slug}` : ""}`;
      }
      /* 46d: the result's own split — tagged now, and already tagged. */
      const tagged = countArray(out?.added);
      const already = countArray(out?.alreadyTagged) ?? 0;
      const tail =
        already > 0
          ? ` (${already} already ${already === 1 ? "was" : "were"})`
          : "";
      return `Tagged ${plural(tagged ?? updated ?? added, what)}${slug ? ` ${slug}` : ""}${tail}`;
    }
    case "group_list":
      return "Listed the plans";
    case "group_get":
      return slug ? `Read the plan ${slug}` : "Read a plan";
    case "group_create": {
      const group = isObject(input.group) ? input.group : {};
      const name = str(group.name);
      return name ? `Made the plan “${short(name, 50)}”` : "Made a plan";
    }
    case "group_update":
    case "group_set_items":
    case "group_add_item":
    case "group_remove_item":
      return slug ? `Changed the plan ${slug}` : "Changed a plan";
    case "featured_list":
      return "Read the homepage strip";
    case "feature":
      return "Put something on the homepage";
    case "inventory_get":
      return "Read what's on hand";
    case "inventory_add":
      return "Added to what's on hand";
    case "inventory_remove":
      return "Took things off what's on hand";
    case "inventory_makeable":
      return "Checked what you can make";
    case "holiday_list":
      return "Listed the holidays";
    case "holiday_get":
      return slug ? `Read the holiday ${slug}` : "Read a holiday";
    case "shopping_get":
      return "Read the shopping list";
    case "shopping_add":
      return "Added to the shopping list";
    case "shopping_check":
      return "Ticked the shopping list";
    case "shopping_remove":
      return "Took things off the shopping list";
    case "git_status":
      return "Checked the content's history";
    case "git_log":
    case "git_show":
    case "git_file_at":
    case "git_diff":
      return "Read the content's history";
    case "git_fetch":
      return "Fetched the remote's history";
    case "job_list":
      return "Listed the jobs";
    case "job_get":
      return "Read a job's steps";
    case "web_fetch":
      return site ? `Fetched ${site}` : "Fetched a page";
    case "web_search":
      return str(input.query)
        ? `Searched the web for “${short(String(input.query), 40)}”`
        : "Searched the web";
    default:
      return call.name || "A tool with no name";
  }
}

/** Claude's server-side tool in words (E6): its search, or its fetch. */
export function serverToolPhrase(use: ServerToolUse): string {
  const input = isObject(use.input) ? use.input : {};
  if (use.name === "web_search") {
    return str(input.query)
      ? `Searched the web for “${short(String(input.query), 40)}”`
      : "Searched the web";
  }
  if (use.name === "web_fetch") {
    const site = siteOf(input.url);
    return site ? `Fetched ${site}` : "Fetched a page";
  }
  return use.name;
}

/* ------------------------------------------------------------------ */
/* How it ended, and the numbers                                        */
/* ------------------------------------------------------------------ */

/**
 * How a run stopped, in words: "Finished", "Stopped: reached 40 turns",
 * "Stopped by you", "Error: …". `failure` is the job's own error when it
 * failed before the loop could write an end (no model, a bad run id).
 */
export function stopWords(
  end:
    | Pick<
        TranscriptEnd,
        "stop" | "error" | "turns" | "toolCalls" | "maxCostUsd"
      >
    | undefined,
  job?: { status?: string; failure?: string },
): string {
  if (!end) {
    if (job?.status === "cancelled") return "Stopped by you";
    if (job?.status === "interrupted") {
      return "Interrupted: the editor stopped while it ran";
    }
    if (job?.status === "failed") {
      return `Error: ${job.failure ?? "the run failed"}`;
    }
    return "Ended";
  }
  const stop: AgentStopReason = end.stop;
  switch (stop) {
    case "done":
      return "Finished";
    case "cancelled":
      return "Stopped by you";
    case "budget:turns":
      return `Stopped: reached ${plural(end.turns, "turn")}`;
    case "budget:tool_calls":
      return `Stopped: reached ${plural(end.toolCalls, "tool call")}`;
    case "budget:wall_time":
      return "Stopped: ran out of time";
    case "budget:tokens":
      return "Stopped: reached the token budget";
    case "budget:cost":
      return end.maxCostUsd !== undefined
        ? costBudgetWords(end.maxCostUsd)
        : "Stopped at the cost budget";
    case "budget:context":
      return "Stopped: the conversation outgrew the model's context";
    case "error":
      return `Error: ${end.error ?? "the model call failed"}`;
    default:
      return `Stopped: ${String(stop)}`;
  }
}

/** "12.3k" for a count of tokens. */
export function tokenText(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 100_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${Math.round(tokens / 1_000)}k`;
}

/** "about $0.42" for the Claude API's estimate (Ea7). */
export function costText(usd: number): string {
  if (usd < 0.01) return "under $0.01";
  return `about $${usd.toFixed(2)}`;
}

/**
 * A Claude model id as people say it: `claude-sonnet-5` → "Claude Sonnet
 * 5", `claude-haiku-4-5-20251001` → "Claude Haiku 4.5". Anything else is
 * itself.
 */
export function claudeModelName(model: string): string {
  const match = /^claude-([a-z]+)((?:-\d+)*?)(?:-\d{8})?$/.exec(model);
  if (!match) return model;
  const family = match[1][0].toUpperCase() + match[1].slice(1);
  const version = match[2].split("-").filter(Boolean).join(".");
  return `Claude ${family}${version ? ` ${version}` : ""}`;
}

/** Whether a model's address is this machine. */
function onThisMachine(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "[::1]" ||
      host === "::1" ||
      host.startsWith("127.")
    );
  } catch {
    return false;
  }
}

/**
 * What runs the curator, in words: "Claude Sonnet 5 through the API",
 * "qwen3:8b on this machine", "qwen3:14b on gpu-box". Never the key, never
 * a URL's path or port.
 */
export function modelWords(config: {
  model: string;
  api: LlmApi;
  url: string;
}): string {
  if (config.api === "anthropic") {
    return `${claudeModelName(config.model)} through the API`;
  }
  if (onThisMachine(config.url)) return `${config.model} on this machine`;
  let host: string | undefined;
  try {
    host = new URL(config.url).hostname;
  } catch {
    host = undefined;
  }
  return host ? `${config.model} on ${host}` : config.model;
}
