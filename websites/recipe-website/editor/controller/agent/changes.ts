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
 * Pure and dependency-free (type imports only): it runs in the browser too.
 */
import type {
  AgentAssistantMessage,
  AgentMessage,
  AgentToolCall,
  AgentToolResultMessage,
} from "./types";

export type RecipeChange = "created" | "imported" | "updated";

export interface ChangedRecipe {
  slug: string;
  /** The name the call gave (a create's input, an import's list), when it said. */
  name?: string;
  change: RecipeChange;
}

export interface ChangedTerm {
  slug: string;
}

export interface ChangedGroup {
  slug: string;
}

/** A write that is not a recipe, a term or a plan: where it landed. */
export type ChangedPlace = "featured" | "inventory" | "shopping";

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

class Collector {
  private readonly recipes = new Map<string, ChangedRecipe>();
  private readonly terms = new Set<string>();
  private readonly groups = new Set<string>();
  private readonly places = new Set<ChangedPlace>();
  commits = 0;

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

  done(): RunChanges {
    return {
      recipes: [...this.recipes.values()],
      terms: [...this.terms].map((slug) => ({ slug })),
      groups: [...this.groups].map((slug) => ({ slug })),
      places: [...this.places],
      commits: this.commits,
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
      const updated = Array.isArray(result.updated)
        ? result.updated.filter(
            (slug): slug is string => typeof slug === "string",
          )
        : [];
      if (updated.length === 0) return;
      into.term(str(result.slug) ?? str(input.slug));
      for (const slug of updated) {
        if (input.type === "group") into.group(slug);
        else into.recipe(slug, "updated");
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

/** What the conversation's tool calls wrote (the rules above). */
export function runChanges(messages: readonly AgentMessage[]): RunChanges {
  const into = new Collector();
  for (const { call, result } of callsWithResults(messages)) {
    if (!result) continue;
    const parsed = parseToolResult(result);
    if (!parsed) continue;
    collect(into, call.name, isObject(call.input) ? call.input : {}, parsed);
  }
  return into.done();
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
