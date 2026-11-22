/**
 * Held writes (epic 48, 48b, Db1): on the curator page a run's writes wait
 * for the person. A write tool the model calls is not run; it answers the
 * model that it is held — with a dry run's answer where the tool has one
 * (`DRY_RUN_TOOLS`), so an import still says what it would make — and the
 * call stays in the transcript for the review, which applies it exactly as
 * asked (a `term_assign`'s `add` may be narrowed, never widened) when the
 * person saves it. Memory "AI changes need approval": every model-made
 * change in the editor is marked and approved before it is written.
 *
 * Pure and browser-safe (type imports only): the page reads the held calls
 * and their decisions with it; the server applies them (`review.ts`).
 */
import type { TranscriptRecord } from "./transcript";
import type {
  AgentHeld,
  AgentMessage,
  AgentToolCall,
  AgentToolResultMessage,
  AgentWriteSummary,
} from "./types";
import type { AgentToolName } from "./tools/names";

/**
 * The writes a held run holds: every tool of the grant (E1) the registry
 * marks as not read-only, but `git_fetch`, which moves only the remote's
 * refs (CLAUDE.md: pre-approved for that reason). `test/curatorHeld.test.ts`
 * holds this list to the registry's annotations, so a new write tool is
 * held unless it is added here deliberately as a read.
 */
export const HELD_WRITE_TOOLS = [
  "recipe_import",
  "recipe_import_list",
  "recipe_create",
  "recipe_update",
  "recipe_set_image",
  "term_create",
  "term_update",
  "term_set_image",
  "term_assign",
  "term_rename",
  "group_create",
  "group_update",
  "group_set_items",
  "group_add_item",
  "group_remove_item",
  "feature",
  "inventory_add",
  "inventory_remove",
  "shopping_add",
  "shopping_check",
  "shopping_remove",
] as const satisfies readonly AgentToolName[];

/** The one write of the grant that is not held: it writes no content. */
export const UNHELD_WRITES = ["git_fetch"] as const;

const HELD: ReadonlySet<string> = new Set(HELD_WRITE_TOOLS);

/** Whether a held run holds `name`. */
export function isHeldTool(name: string): boolean {
  return HELD.has(name);
}

/**
 * The held writes that take `dryRun`: held, they run as a dry run and the
 * model reads its answer (the slug an import would land at, a create's
 * record) inside the held one.
 */
export const DRY_RUN_TOOLS: ReadonlySet<string> = new Set([
  "recipe_import",
  "recipe_import_list",
  "recipe_create",
  "recipe_update",
]);

/** The held writes whose dry run reads a web page: its answer is page text (E7). */
export const PAGE_TEXT_DRY_RUNS: ReadonlySet<string> = new Set([
  "recipe_import",
  "recipe_import_list",
]);

/** What a held call answers the model (Db1), besides `held: true`. */
export const HELD_NOTE =
  "Held for the person's review: nothing was written. It runs exactly as you asked when they approve it on the curator page. Treat it as proposed, not done: don't call it again, and don't read it back — a recipe it would make does not exist yet.";

/** The held answer's mark: `{held: true, note, dryRun?, …}`. */
export function isHeldAnswer(value: unknown): value is {
  held: true;
  note: string;
  dryRun?: unknown;
} {
  return isObject(value) && value.held === true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** A preview's name is cut to this (it is the page's words). */
const PREVIEW_NAME_MAX = 120;
/** A batch preview lists at most this many recipes. */
const PREVIEW_RECIPES_MAX = 24;

function name(value: unknown): string | undefined {
  const text = str(value);
  return text && text.length > PREVIEW_NAME_MAX
    ? `${text.slice(0, PREVIEW_NAME_MAX)}…`
    : text;
}

/**
 * What the review shows of a held call (Db1), from its **uncut** answer
 * (as a write's summary is, 44d): the slug and name a create or import
 * would write, a batch's recipes, a `term_assign`'s split. Empty fields are
 * left out.
 */
export function heldPreview(
  tool: string,
  input: unknown,
  answer: unknown,
): AgentHeld {
  const args = isObject(input) ? input : {};
  const dry = isHeldAnswer(answer) ? answer.dryRun : undefined;
  const out: AgentHeld = {};
  const recipe = isObject(args.recipe) ? args.recipe : undefined;
  const url = str(args.url);
  if (url) out.url = url;
  if (tool === "recipe_create" && recipe) {
    const named = name(recipe.name);
    if (named) out.name = named;
  }
  if (isObject(dry)) {
    const slug = str(dry.slug);
    if (slug) out.slug = slug;
    if (dry.conflict === true) out.conflict = true;
    const dryRecipe = isObject(dry.recipe)
      ? dry.recipe
      : isObject(dry.draft)
        ? dry.draft
        : undefined;
    const named = name(dryRecipe?.name);
    if (named && !out.name) out.name = named;
    const list = Array.isArray(dry.recipes)
      ? dry.recipes
      : Array.isArray(dry.results)
        ? dry.results
        : undefined;
    if (list) {
      const recipes = list.filter(isObject).flatMap((item) => {
        const itemName = name(item.name);
        if (!itemName) return [];
        const slug = str(item.slug);
        const status = str(item.status);
        return [
          {
            name: itemName,
            ...(slug ? { slug } : {}),
            ...(status ? { status } : {}),
          },
        ];
      });
      if (recipes.length) out.recipes = recipes.slice(0, PREVIEW_RECIPES_MAX);
    }
  }
  if (tool === "term_assign" && isHeldAnswer(answer)) {
    const split = answer as unknown as Record<string, unknown>;
    for (const key of ["wouldAdd", "alreadyTagged", "missing"] as const) {
      const list = strings(split[key]);
      if (list.length) out[key] = list;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Phrases                                                              */
/* ------------------------------------------------------------------ */

function site(url: unknown): string | undefined {
  const text = str(url);
  if (!text) return undefined;
  try {
    return new URL(text).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function quoted(text: string, max = 50): string {
  const line = text.replace(/\s+/g, " ").trim();
  return `“${line.length > max ? `${line.slice(0, max - 1)}…` : line}”`;
}

/** 50d: " “Thanksgiving”" for a shopping call on a saved list; "" for main. */
function onList(input: Record<string, unknown>): string {
  const list = str(input.list);
  return list && list.toLowerCase() !== "main" ? ` ${quoted(list)}` : "";
}

/**
 * A held call in words, as a proposal (Db1): "Create “Pork Braise”",
 * "Import from example.com", "Tag 2 recipes middle-eastern". `names` turns
 * a recipe slug into its name where the conversation said it.
 */
export function heldPhrase(
  call: Pick<AgentToolCall, "name" | "input">,
  held: AgentHeld = {},
  names?: ReadonlyMap<string, string>,
): string {
  const input = isObject(call.input) ? call.input : {};
  const slug = str(input.slug);
  const recipeWords = (value: string) => {
    const known = names?.get(value);
    return known ? quoted(known) : value;
  };
  switch (call.name) {
    case "recipe_create": {
      const recipe = isObject(input.recipe) ? input.recipe : {};
      const named = str(recipe.name) ?? held.name;
      return named ? `Create ${quoted(named)}` : "Create a recipe";
    }
    case "recipe_import": {
      const from = site(input.url) ?? site(input.source);
      if (held.recipes?.length && held.recipes.length > 1) {
        return `Import ${plural(held.recipes.length, "recipe")}${from ? ` from ${from}` : ""}`;
      }
      if (held.name) {
        return `Import ${quoted(held.name)}${from ? ` from ${from}` : ""}`;
      }
      if (str(input.text)) return "Import pasted text";
      return from ? `Import a recipe from ${from}` : "Import a recipe";
    }
    case "recipe_import_list": {
      const from = site(input.url);
      return `Import from a roundup${from ? ` on ${from}` : ""}`;
    }
    case "recipe_update":
      return slug ? `Update ${recipeWords(slug)}` : "Update a recipe";
    case "recipe_set_image":
      return slug
        ? `Set the picture of ${recipeWords(slug)}`
        : "Set a recipe's picture";
    case "term_create": {
      const term = isObject(input.term) ? input.term : {};
      const label = str(term.label) ?? str(term.slug);
      return label ? `Create the term ${label}` : "Create a term";
    }
    case "term_update":
      return slug ? `Update the term ${slug}` : "Update a term";
    case "term_set_image":
      return slug
        ? `Set the picture of the term ${slug}`
        : "Set a term's picture";
    case "term_rename":
      return slug && str(input.to)
        ? `Rename the term ${slug} to ${String(input.to)}`
        : "Rename a term";
    case "term_assign": {
      const what = input.type === "group" ? "plan" : "recipe";
      const adds = strings(input.add).length;
      const removes = strings(input.remove).length;
      const term = slug ? ` ${slug}` : "";
      const parts: string[] = [];
      if (adds > 0) parts.push(`Tag ${plural(adds, what)}${term}`);
      if (removes > 0) {
        parts.push(
          `${adds > 0 ? "untag" : "Untag"} ${plural(removes, what)}${adds > 0 ? "" : term}`,
        );
      }
      return parts.join("; ") || `Tag${term}`;
    }
    case "group_create": {
      const group = isObject(input.group) ? input.group : {};
      const named = str(group.name);
      return named ? `Make the plan ${quoted(named)}` : "Make a plan";
    }
    case "group_update":
    case "group_set_items":
    case "group_add_item":
    case "group_remove_item":
      return slug ? `Change the plan ${slug}` : "Change a plan";
    case "feature":
      return "Put something on the homepage";
    case "inventory_add":
      return "Add to what's on hand";
    case "inventory_remove":
      return "Take things off what's on hand";
    /* 50d: a saved list is named; the main list reads as before. */
    case "shopping_add":
      return `Add to the shopping list${onList(input)}`;
    case "shopping_check":
      return `Tick the shopping list${onList(input)}`;
    case "shopping_remove":
      return `Take things off the shopping list${onList(input)}`;
    default:
      return `Run ${call.name}`;
  }
}

/* ------------------------------------------------------------------ */
/* The review                                                           */
/* ------------------------------------------------------------------ */

/** How a held call stands: waiting, or what the person decided. */
export type HeldState =
  | "pending"
  | "applied"
  | "discarded"
  | "failed"
  /**
   * 48b review: the run the call was made in has been pruned, and its
   * decision with it — so it is neither pending nor appliable any more.
   */
  | "expired";

/**
 * A person's decision on one held call (Db2), as `<job>.review.json`
 * keeps it beside the job the call was made in.
 */
export interface HeldDecision {
  state: Exclude<HeldState, "pending">;
  /** When it was decided (epoch ms). */
  at: number;
  /** Who decided (the signed-in person's email), when known. */
  by?: string;
  /** The input it ran with, when it differs from the model's (a narrowed `add`). */
  input?: unknown;
  /** What it wrote (applied): `changes.ts`'s summary of the real result. */
  summary?: AgentWriteSummary;
  /** Why it failed, in the tool's words. */
  error?: string;
}

/** A review file's contents: decisions by call id. */
export interface HeldReviewFile {
  v: 1;
  calls: Record<string, HeldDecision>;
}

/** One held call of a conversation, with the job it was made in. */
export interface HeldCall {
  /** The tool call's id. */
  id: string;
  /** The run (job) the call was made in: its review file holds the decision. */
  job: string;
  tool: string;
  input: unknown;
  held: AgentHeld;
  /** When it was held (the result record's time). */
  t: string;
}

/**
 * The held calls of a conversation's records, in order (Db1): each tool
 * result with `held`, paired with its call. A follow-up's transcript holds
 * every earlier run's (Ec3), each record keeping its own `job`.
 */
export function heldCalls(records: readonly TranscriptRecord[]): HeldCall[] {
  const calls = new Map<string, AgentToolCall>();
  const out: HeldCall[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.type !== "message") continue;
    const { message } = record;
    if (message.role === "assistant") {
      for (const call of message.toolCalls) calls.set(call.id, call);
      continue;
    }
    if (message.role !== "tool" || !message.held) continue;
    const call = calls.get(message.toolCallId);
    if (!call || seen.has(call.id)) continue;
    seen.add(call.id);
    out.push({
      id: call.id,
      job: record.job,
      tool: call.name,
      input: call.input,
      held: message.held,
      t: record.t,
    });
  }
  return out;
}

/** Whether a tool result message is a held write's answer. */
export function isHeldResult(
  message: Pick<AgentToolResultMessage, "held">,
): boolean {
  return message.held !== undefined;
}

/**
 * A list of a held `term_assign` (`add` or `remove`) as a person narrowed it
 * (Db3): only slugs the model asked for, in its order, each once — or why
 * not. A narrowed tag never names a recipe the model did not.
 */
export function narrowedList(
  input: unknown,
  key: "add" | "remove",
  list: unknown,
): { list: string[] } | { problem: string } {
  const asked = strings(isObject(input) ? input[key] : undefined);
  if (!Array.isArray(list) || list.some((slug) => typeof slug !== "string")) {
    return { problem: `${key} is a list of recipe slugs` };
  }
  const wanted = new Set(list as string[]);
  const unknown = [...wanted].filter((slug) => !asked.includes(slug));
  if (unknown.length > 0) {
    return {
      problem: `${key} may only narrow what the curator asked for; ${unknown.join(", ")} ${unknown.length === 1 ? "was" : "were"} not in it`,
    };
  }
  return { list: asked.filter((slug) => wanted.has(slug)) };
}

/** `narrowedList` for `add`. */
export function narrowedAdd(
  input: unknown,
  add: unknown,
): { add: string[] } | { problem: string } {
  const narrowed = narrowedList(input, "add", add);
  return "problem" in narrowed ? narrowed : { add: narrowed.list };
}

/**
 * The note a follow-up's model gets about held calls the person has
 * decided since (Db4): applied, skipped or failed, by phrase — so it does
 * not propose again what was saved, nor assume what was skipped.
 */
export function decisionsNote(
  calls: readonly HeldCall[],
  decisions: ReadonlyMap<string, HeldDecision>,
): string | undefined {
  const lines = calls.flatMap((call) => {
    const decision = decisions.get(call.id);
    if (!decision) return [];
    const phrase = heldPhrase(
      { name: call.tool, input: call.input },
      call.held,
    );
    const words =
      decision.state === "applied"
        ? "approved and written"
        : decision.state === "discarded"
          ? "skipped by the person: not written"
          : decision.state === "expired"
            ? "never reviewed, and its run has been pruned: not written"
            : `approved, but it failed: ${decision.error ?? "an error"}`;
    return [`- ${phrase} (call ${call.id}): ${words}.`];
  });
  const pending = calls.filter((call) => !decisions.has(call.id));
  if (lines.length === 0) return undefined;
  return [
    "Your held writes from earlier in this conversation, as the person has reviewed them:",
    ...lines,
    ...(pending.length
      ? [
          `${plural(pending.length, "held write")} ${pending.length === 1 ? "is" : "are"} still waiting for their review.`,
        ]
      : []),
  ].join("\n");
}

/** The messages of a conversation that held writes answered. */
export function heldMessages(
  messages: readonly AgentMessage[],
): AgentToolResultMessage[] {
  return messages.filter(
    (message): message is AgentToolResultMessage =>
      message.role === "tool" && message.held !== undefined,
  );
}
