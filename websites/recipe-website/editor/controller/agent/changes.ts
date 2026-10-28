/**
 * What a curator run changed (epic 44, 44d): read off the conversation's
 * tool results — never guessed from the model's words. The curator page's
 * "What changed" card, the recent-runs list's count, and anything else that
 * wants "what did it write" read it from here.
 *
 * The rule per write tool (E1's grant; the held-back deletes never run):
 *
 * - a call counts only when it **wrote**: its result parses as an object
 *   with no `error`, it was not a `dryRun`, and a write that reports
 *   `changed: false` (the list was already so) wrote nothing;
 * - **one commit per write call** (the curation layer's rule), except where
 *   a call reports several: a several-recipe import commits each recipe it
 *   imported, a roundup import each recipe plus one for its term;
 * - recipes are `created` (recipe_create), `imported` (recipe_import,
 *   recipe_import_list) or `updated` (recipe_update, recipe_set_image, a
 *   term_assign that tagged them) — a recipe keeps the first of these it
 *   earned in that order of strength, so one created then tagged reads
 *   "created";
 * - terms and plans touched are listed by slug; the homepage strip, what's
 *   on hand and the shopping list as places.
 *
 * The loop applies these rules to each write's **uncut** result as it runs
 * (`writeSummary`) and keeps the answer on the tool-result message as its
 * `summary`: the content the transcript keeps may be cut for the model's
 * context (Ea6) and no longer parse, which would drop a write that landed.
 *
 * Pure and dependency-free (type imports only): it runs in the browser too.
 */
import type {
  AgentAssistantMessage,
  AgentMessage,
  AgentToolCall,
  AgentToolResultMessage,
  AgentWriteRecipe,
  AgentWriteSummary,
} from "./types";

export type RecipeChange = AgentWriteRecipe["change"];

export interface ChangedRecipe {
  slug: string;
  /** The name the call gave (a create's input, an import's list), when it said. */
  name?: string;
  change: RecipeChange;
}

export interface ChangedTerm {
  slug: string;
  /**
   * What `term_assign` calls did with it (46d), summed over the run: the
   * carriers they put it on, and those that already carried it. Absent when
   * no assign touched it (or an older transcript's did).
   */
  added?: number;
  alreadyTagged?: number;
}

export interface ChangedGroup {
  slug: string;
}

/** A write that is not a recipe, a term or a plan: where it landed. */
export type ChangedPlace = NonNullable<AgentWriteSummary["places"]>[number];

export interface RunChanges {
  recipes: ChangedRecipe[];
  terms: ChangedTerm[];
  groups: ChangedGroup[];
  places: ChangedPlace[];
  /** Commits the writes made (one per write call, see above). */
  commits: number;
}

/** How strong a recipe's change is: a created recipe stays "created". */
const STRENGTH: Record<RecipeChange, number> = {
  created: 3,
  imported: 2,
  updated: 1,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * A tool result's content as the object it holds, or `undefined` — an
 * error, a cut or E7-wrapped text (no write answers so), anything not JSON.
 */
export function parseToolResult(
  message: Pick<AgentToolResultMessage, "content" | "isError">,
): Record<string, unknown> | undefined {
  if (message.isError) return undefined;
  try {
    const parsed: unknown = JSON.parse(message.content);
    if (!isObject(parsed) || "error" in parsed) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Every tool call of a conversation with its result, in order. */
export function callsWithResults(
  messages: readonly AgentMessage[],
): { call: AgentToolCall; result?: AgentToolResultMessage }[] {
  const results = new Map<string, AgentToolResultMessage>();
  for (const message of messages) {
    if (message.role === "tool") results.set(message.toolCallId, message);
  }
  return messages
    .filter(
      (message): message is AgentAssistantMessage =>
        message.role === "assistant",
    )
    .flatMap((message) =>
      message.toolCalls.map((call) => ({
        call,
        result: results.get(call.id),
      })),
    );
}

/** At most this many recipes, terms or plans in one call's summary. */
export const WRITE_SUMMARY_MAX_ITEMS = 48;

/** A recipe name in a summary is cut to this. */
const SUMMARY_NAME_MAX = 120;

class Collector {
  private readonly recipes = new Map<string, ChangedRecipe>();
  private readonly terms = new Set<string>();
  private readonly groups = new Set<string>();
  private readonly places = new Set<ChangedPlace>();
  private readonly assignments = new Map<
    string,
    { added: number; alreadyTagged: number }
  >();
  commits = 0;

  /** A term_assign's counts (46d), summed per term. */
  assigned(term: string, added: number, alreadyTagged: number) {
    const known = this.assignments.get(term) ?? { added: 0, alreadyTagged: 0 };
    known.added += added;
    known.alreadyTagged += alreadyTagged;
    this.assignments.set(term, known);
  }

  recipe(slug: string | undefined, change: RecipeChange, name?: string) {
    if (!slug) return;
    const known = this.recipes.get(slug);
    if (!known) {
      this.recipes.set(slug, { slug, change, ...(name ? { name } : {}) });
      return;
    }
    if (STRENGTH[change] > STRENGTH[known.change]) known.change = change;
    if (!known.name && name) known.name = name;
  }

  term(slug: string | undefined) {
    if (slug) this.terms.add(slug);
  }

  group(slug: string | undefined) {
    if (slug) this.groups.add(slug);
  }

  place(place: ChangedPlace) {
    this.places.add(place);
  }

  /** One call's summary folded in. */
  add(summary: AgentWriteSummary) {
    for (const recipe of summary.recipes ?? []) {
      this.recipe(recipe.slug, recipe.change, recipe.name);
    }
    for (const slug of summary.terms ?? []) this.term(slug);
    for (const slug of summary.groups ?? []) this.group(slug);
    for (const place of summary.places ?? []) this.place(place);
    for (const item of summary.assigned ?? []) {
      this.assigned(item.term, item.added, item.alreadyTagged);
    }
    this.commits += summary.commits;
  }

  done(): RunChanges {
    return {
      recipes: [...this.recipes.values()],
      terms: [...this.terms].map((slug) => ({
        slug,
        ...this.assignments.get(slug),
      })),
      groups: [...this.groups].map((slug) => ({ slug })),
      places: [...this.places],
      commits: this.commits,
    };
  }

  /** One call's changes as its summary: lists capped, empty ones left out. */
  summary(): AgentWriteSummary | undefined {
    const done = this.done();
    if (
      done.commits === 0 &&
      done.recipes.length + done.terms.length + done.groups.length === 0 &&
      done.places.length === 0
    ) {
      return undefined;
    }
    const capped = <T>(items: T[]) => items.slice(0, WRITE_SUMMARY_MAX_ITEMS);
    const recipes = capped(done.recipes).map((recipe) =>
      recipe.name && recipe.name.length > SUMMARY_NAME_MAX
        ? { ...recipe, name: `${recipe.name.slice(0, SUMMARY_NAME_MAX)}…` }
        : recipe,
    );
    const terms = capped(done.terms.map(({ slug }) => slug));
    const groups = capped(done.groups.map(({ slug }) => slug));
    const assigned = capped(
      [...this.assignments].map(([term, counts]) => ({ term, ...counts })),
    );
    return {
      commits: done.commits,
      ...(recipes.length ? { recipes } : {}),
      ...(terms.length ? { terms } : {}),
      ...(groups.length ? { groups } : {}),
      ...(done.places.length ? { places: done.places } : {}),
      ...(assigned.length ? { assigned } : {}),
    };
  }
}

const GROUP_WRITES = new Set([
  "group_create",
  "group_update",
  "group_set_items",
  "group_add_item",
  "group_remove_item",
]);

const TERM_WRITES = new Set([
  "term_create",
  "term_update",
  "term_set_image",
  "term_rename",
]);

/** One call's writes into `into`. */
function collect(
  into: Collector,
  name: string,
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  if (input.dryRun === true || result.dryRun === true) return;
  switch (name) {
    case "recipe_create": {
      const recipe = isObject(input.recipe) ? input.recipe : {};
      into.recipe(str(result.slug), "created", str(recipe.name));
      into.commits += 1;
      return;
    }
    case "recipe_update":
    case "recipe_set_image":
      into.recipe(str(result.slug) ?? str(input.slug), "updated");
      into.commits += 1;
      return;
    case "recipe_import": {
      if (result.batch === true && Array.isArray(result.recipes)) {
        for (const item of result.recipes) {
          if (!isObject(item) || item.status !== "imported") continue;
          into.recipe(str(item.slug), "imported", str(item.name));
          into.commits += 1;
        }
        return;
      }
      if (str(result.slug)) {
        into.recipe(str(result.slug), "imported");
        into.commits += 1;
      }
      return;
    }
    case "recipe_import_list": {
      for (const item of Array.isArray(result.results) ? result.results : []) {
        if (!isObject(item) || item.status !== "imported") continue;
        into.recipe(str(item.slug), "imported", str(item.name));
        into.commits += 1;
      }
      const term = isObject(result.term) ? result.term : undefined;
      if (
        term &&
        !term.error &&
        (term.created === true ||
          (Array.isArray(term.updated) && term.updated.length > 0))
      ) {
        into.term(str(term.slug));
        into.commits += 1;
      }
      return;
    }
    case "term_assign": {
      const updated = strings(result.updated);
      if (updated.length === 0) return;
      const term = str(result.slug) ?? str(input.slug);
      into.term(term);
      for (const slug of updated) {
        if (input.type === "group") into.group(slug);
        else into.recipe(slug, "updated");
      }
      /* 46d: what the call added, and what already carried the term. */
      if (term && Array.isArray(result.added)) {
        into.assigned(
          term,
          strings(result.added).length,
          strings(result.alreadyTagged).length,
        );
      }
      into.commits += 1;
      return;
    }
    case "feature":
      into.place("featured");
      into.commits += 1;
      return;
    case "inventory_add":
    case "inventory_remove":
      if (result.changed === false) return;
      into.place("inventory");
      into.commits += 1;
      return;
    case "shopping_add":
    case "shopping_check":
    case "shopping_remove":
      if (result.changed === false) return;
      into.place("shopping");
      into.commits += 1;
      return;
    default:
      if (TERM_WRITES.has(name)) {
        into.term(str(result.slug) ?? str(input.slug));
        into.commits += 1;
      } else if (GROUP_WRITES.has(name)) {
        into.group(str(result.slug) ?? str(input.slug));
        into.commits += 1;
      }
  }
}

/**
 * What one call wrote, from its **uncut** result (the loop's, before Ea6's
 * cut): the summary the loop stores on the tool-result message, or
 * `undefined` when the call wrote nothing (a read, an error, a dry run,
 * `changed: false`). A string result is read as JSON when it is.
 */
export function writeSummary(
  name: string,
  input: unknown,
  result: unknown,
): AgentWriteSummary | undefined {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isObject(value) || "error" in value) return undefined;
  const into = new Collector();
  collect(into, name, isObject(input) ? input : {}, value);
  return into.summary();
}

/**
 * What the conversation's tool calls wrote (the rules above). A result's
 * `summary` (the loop's, from the uncut result) is read first; a result
 * without one — older transcripts, a test's — is parsed from its content,
 * which a cut result fails (and counts nothing).
 */
export function runChanges(messages: readonly AgentMessage[]): RunChanges {
  const into = new Collector();
  for (const { call, result } of callsWithResults(messages)) {
    if (!result || result.isError) continue;
    if (result.summary) {
      into.add(result.summary);
      continue;
    }
    const parsed = parseToolResult(result);
    if (!parsed) continue;
    collect(into, call.name, isObject(call.input) ? call.input : {}, parsed);
  }
  return into.done();
}

/**
 * A term's assignment counts in words (46d), as "What changed" shows them:
 * "added 3, 2 already tagged", or nothing when no `term_assign` reported
 * them.
 */
export function assignedNote(
  term: Pick<ChangedTerm, "added" | "alreadyTagged">,
): string | undefined {
  if (term.added === undefined) return undefined;
  const parts = [`added ${term.added}`];
  if (term.alreadyTagged) parts.push(`${term.alreadyTagged} already tagged`);
  return parts.join(", ");
}

/** How many things changed: recipes, terms, plans and places. */
export function changeCount(changes: RunChanges): number {
  return (
    changes.recipes.length +
    changes.terms.length +
    changes.groups.length +
    changes.places.length
  );
}
