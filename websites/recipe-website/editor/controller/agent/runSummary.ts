/**
 * The curator page's run, as variant B tells it (epic 48, 48b): a
 * conversation split into its asks (`askSegments`), what each ask's run did
 * in plain words grouped by kind (`didLines`: looked in your recipes, read
 * the web, read nothing, wants to change…), the model's **heads-up** lifted
 * out of its answer into a callout of its own (`splitHeadsUp`, 47h row 3,
 * Roger "fix"), and the recipes its answer found on the web as Import
 * buttons (`foundRecipes`).
 *
 * Pure and dependency-free (type imports and pure helpers): it runs in the
 * browser.
 */
import type {
  AssistantItem,
  Conversation,
  EndItem,
  ToolRow,
  UserItem,
} from "./conversation";
import { serverToolPhrase, siteOf } from "./conversation";
import { isHeldTool } from "./held";
import type { ServerToolUse } from "./types";

/* ------------------------------------------------------------------ */
/* Asks                                                                 */
/* ------------------------------------------------------------------ */

/** One ask and what its run did: the turns until the next ask. */
export interface AskSegment {
  key: string;
  ask: UserItem;
  turns: AssistantItem[];
  /** The run's end, when an earlier run of the conversation ended here. */
  end?: EndItem;
}

/** The conversation's items as asks, in order (an item before any ask is dropped). */
export function askSegments(conversation: Conversation): AskSegment[] {
  const segments: AskSegment[] = [];
  for (const item of conversation.items) {
    if (item.kind === "user") {
      segments.push({ key: item.key, ask: item, turns: [] });
      continue;
    }
    const current = segments.at(-1);
    if (!current) continue;
    if (item.kind === "assistant") current.turns.push(item);
    else current.end = item;
  }
  return segments;
}

/** The ask's answer: its last turn's words (the turns before carry their calls). */
export function segmentAnswer(segment: AskSegment): string {
  for (let index = segment.turns.length - 1; index >= 0; index -= 1) {
    const text = segment.turns[index].text.trim();
    if (text) return text;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* The heads-up                                                         */
/* ------------------------------------------------------------------ */

/**
 * A paragraph that opens "Heads up:" — bold or not, quoted or not, "Heads-up"
 * or "Heads up!" — as the prompts ask the model to write one (Db7).
 */
const HEADS_UP =
  /^(?:>\s*)?(?:[*_]{1,2})?\s*heads[\s-]?up\s*(?:[:!.—–-]\s*)?(?:[*_]{1,2})?\s*(?:[:!.—–-]\s*)?/i;

/** The label must be whole words: "Heads up", not "heads upward". */
const HEADS_UP_WORD = /^(?:>\s*)?(?:[*_]{1,2})?\s*heads[\s-]?up(?![a-z])/i;

/**
 * The answer's heads-up paragraphs, lifted out (47h row 3, Db7): each
 * without its "Heads up:" label, and the rest of the answer as it was. A
 * paragraph is split on blank lines; one that only says "Heads up" is
 * dropped with its label.
 */
export function splitHeadsUp(text: string): {
  headsUps: string[];
  rest: string;
} {
  const paragraphs = text.split(/\n\s*\n/);
  const headsUps: string[] = [];
  const rest: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    const match = HEADS_UP.exec(trimmed);
    /* "Heads up" must be the paragraph's opening words, not "heads upward". */
    if (match && HEADS_UP_WORD.test(trimmed)) {
      const body = trimmed
        .slice(match[0].length)
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      if (body) headsUps.push(body);
      continue;
    }
    rest.push(paragraph);
  }
  return { headsUps, rest: rest.join("\n\n").trim() };
}

/** Whether an answer carries a heads-up (the recent runs' marker). */
export function hasHeadsUp(text: string): boolean {
  return splitHeadsUp(text).headsUps.length > 0;
}

/* ------------------------------------------------------------------ */
/* What it did                                                          */
/* ------------------------------------------------------------------ */

export type DidKind =
  | "looked"
  | "web"
  | "nothing"
  | "held"
  | "wrote"
  | "error"
  | "not_run"
  | "running";

/** One line of "What it did": a bold title and its detail. */
export interface DidLine {
  kind: DidKind;
  title: string;
  detail?: string;
}

/** The tools that read the web: a search, a fetch, an inspect. */
const WEB_TOOLS: ReadonlySet<string> = new Set([
  "web_search",
  "web_fetch",
  "page_inspect",
  "page_inspect_list",
]);

/** Phrases listed in a line before the rest are counted. */
const PHRASES_SHOWN = 3;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listed(phrases: string[]): string {
  const shown = phrases.slice(0, PHRASES_SHOWN);
  const more = phrases.length - shown.length;
  return `${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`;
}

function sitesOf(rows: ToolRow[], uses: ServerToolUse[]): string[] {
  const sites = new Set<string>();
  for (const row of rows) {
    const input = row.input as { url?: unknown } | undefined;
    const site = siteOf(input?.url);
    if (site) sites.add(site);
  }
  for (const use of uses) {
    const input = use.input as { url?: unknown } | undefined;
    const site = siteOf(input?.url);
    if (site) sites.add(site);
  }
  return [...sites];
}

/**
 * What an ask's run did, grouped by kind in plain words (variant B): the
 * corpus it read, the web it read (searches and pages, with their sites),
 * pages that read nothing (47h's outcome), the writes it holds for the
 * person (48b) or wrote, calls that failed or never ran, and what runs now.
 * The raw calls are one click away on the page.
 */
export function didLines(turns: readonly AssistantItem[]): DidLine[] {
  const rows = turns.flatMap((turn) => turn.tools);
  const uses = turns.flatMap((turn) => turn.serverTools);
  const lines: DidLine[] = [];

  const running = rows.filter(
    (row) => row.status === "running" || row.status === "waiting",
  );
  const looked = rows.filter(
    (row) =>
      !WEB_TOOLS.has(row.name) &&
      !isHeldTool(row.name) &&
      (row.status === "done" || row.status === "nothing"),
  );
  if (looked.length > 0) {
    lines.push({
      kind: "looked",
      title: "Looked in your recipes.",
      detail: listed(looked.map((row) => row.phrase)),
    });
  }

  const webRows = rows.filter(
    (row) => WEB_TOOLS.has(row.name) && row.status === "done",
  );
  const webUses = uses.filter((use) => use.result?.ok);
  if (webRows.length + webUses.length > 0) {
    const searches =
      webRows.filter((row) => row.name === "web_search").length +
      webUses.filter((use) => use.name === "web_search").length;
    const pages = webRows.length + webUses.length - searches;
    const parts = [
      ...(searches ? [plural(searches, "search", "searches")] : []),
      ...(pages ? [plural(pages, "page")] : []),
    ];
    const sites = sitesOf(
      webRows.filter((row) => row.name !== "web_search"),
      webUses.filter((use) => use.name !== "web_search"),
    );
    const searched = [
      ...webRows
        .filter((row) => row.name === "web_search")
        .map((row) => row.phrase),
      ...webUses
        .filter((use) => use.name === "web_search")
        .map(serverToolPhrase),
    ];
    lines.push({
      kind: "web",
      title: "Read the web.",
      detail: `${parts.join(", ")}${sites.length ? ` on ${sites.slice(0, PHRASES_SHOWN).join(", ")}${sites.length > PHRASES_SHOWN ? ` and ${sites.length - PHRASES_SHOWN} more` : ""}` : ""}.${searched.length ? ` ${listed(searched)}` : ""}`,
    });
  }

  const nothing = rows.filter((row) => row.status === "nothing");
  if (nothing.length > 0) {
    lines.push({
      kind: "nothing",
      title: `${plural(nothing.length, "page")} read nothing.`,
      detail: nothing
        .map((row) => row.note ?? row.phrase)
        .slice(0, PHRASES_SHOWN)
        .join(" "),
    });
  }

  const held = rows.filter((row) => row.status === "held");
  if (held.length > 0) {
    lines.push({
      kind: "held",
      title: `Wants to make ${plural(held.length, "change")}.`,
      detail: "Held for you to review — nothing is written yet.",
    });
  }

  const wrote = rows.filter(
    (row) => isHeldTool(row.name) && row.status === "done",
  );
  if (wrote.length > 0) {
    lines.push({
      kind: "wrote",
      title: `Wrote ${plural(wrote.length, "change")}.`,
      detail: listed(wrote.map((row) => row.phrase)),
    });
  }

  const failed = rows.filter((row) => row.status === "error");
  const failedUses = uses.filter((use) => use.result && !use.result.ok);
  if (failed.length + failedUses.length > 0) {
    lines.push({
      kind: "error",
      title: `${plural(failed.length + failedUses.length, "call")} failed.`,
      detail: listed([
        ...failed.map((row) => row.phrase),
        ...failedUses.map(serverToolPhrase),
      ]),
    });
  }

  const notRun = rows.filter((row) => row.status === "not_run");
  if (notRun.length > 0) {
    lines.push({
      kind: "not_run",
      title: `${plural(notRun.length, "call")} never ran.`,
      detail: listed(notRun.map((row) => row.phrase)),
    });
  }

  if (running.length > 0) {
    lines.push({
      kind: "running",
      title: "Working on it.",
      detail: `${running[0].phrase}…`,
    });
  }
  return lines;
}

/** How many tool calls an ask's run made, Claude's server searches included. */
export function callCount(turns: readonly AssistantItem[]): number {
  return turns.reduce(
    (sum, turn) => sum + turn.tools.length + turn.serverTools.length,
    0,
  );
}

/* ------------------------------------------------------------------ */
/* Found recipes                                                        */
/* ------------------------------------------------------------------ */

/** A recipe page the answer found on the web: an Import button (variant B). */
export interface FoundRecipe {
  url: string;
  /** The link's words in the answer. */
  name: string;
  site: string;
}

/** The most found recipes shown. */
export const FOUND_MAX = 6;

/** A Markdown link `[words](https://…)`, its words without emphasis. */
const LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/gi;

/**
 * The web pages an answer links that look like recipes found for the
 * person (Db8): `http(s)` links in Markdown on a host the conversation saw
 * (a search, a page, the person — never a host the model alone wrote), off
 * this site, with a path (not a home page), and not a page this
 * conversation imports already (held or done). At most `FOUND_MAX`, in the
 * answer's order.
 */
export function foundRecipes(
  answer: string,
  {
    hosts,
    origin,
    imported = new Set(),
  }: {
    /** Hosts the conversation saw (`hostsOf(conversationUrls(…))`). */
    hosts: ReadonlySet<string>;
    /** This page's origin: its own links are not found recipes. */
    origin?: string;
    /** URLs an import in the conversation already reads. */
    imported?: ReadonlySet<string>;
  },
): FoundRecipe[] {
  const out: FoundRecipe[] = [];
  const seen = new Set<string>();
  for (const match of answer.matchAll(LINK)) {
    const [, words, href] = match;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (origin && url.origin === origin) continue;
    const host = url.hostname.toLowerCase();
    if (!hosts.has(host)) continue;
    if (url.pathname === "/" || url.pathname === "") continue;
    const key = url.href.replace(/\/$/, "");
    if (seen.has(key) || imported.has(key) || imported.has(`${key}/`)) {
      continue;
    }
    seen.add(key);
    const name = words.replace(/[*_`]/g, "").trim();
    if (!name) continue;
    out.push({ url: url.href, name, site: host.replace(/^www\./, "") });
    if (out.length >= FOUND_MAX) break;
  }
  return out;
}

/** The URLs a conversation's imports read (held or done): not offered again. */
export function importedUrls(
  conversation: Pick<Conversation, "items">,
): Set<string> {
  const urls = new Set<string>();
  for (const item of conversation.items) {
    if (item.kind !== "assistant") continue;
    for (const row of item.tools) {
      if (row.name !== "recipe_import" && row.name !== "recipe_import_list") {
        continue;
      }
      if (row.status === "error" || row.status === "not_run") continue;
      const input = row.input as { url?: unknown; pick?: unknown } | undefined;
      const add = (value: unknown) => {
        if (typeof value === "string") urls.add(value.replace(/\/$/, ""));
      };
      add(input?.url);
      if (Array.isArray(input?.pick)) {
        for (const pick of input.pick) {
          add(
            typeof pick === "string" ? pick : (pick as { url?: unknown })?.url,
          );
        }
      }
    }
  }
  return urls;
}
