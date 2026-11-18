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
 * Pure, and safe in the browser (it runs there too): type imports and the
 * site's `tagSlug` only.
 */
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import type {
  AgentAssistantMessage,
  AgentFound,
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
  /**
   * Nothing was written to it (46d): its only `term_assign` calls found
   * every recipe already tagged. Shown with its "N already tagged", never
   * counted as a change.
   */
  unchanged?: true;
  /**
   * The tagging post-check (48a, Roger's pick 46-d-tag): recipes the run's
   * own searches found that its `term_assign` calls for this term left out
   * — not named, not removed, not already carrying it (`tagMisses`). Capped
   * at `MISSED_MAX`; `missedCount` is the whole count. A list for the
   * person to look over, never written.
   */
  missed?: { slug: string; name?: string }[];
  missedCount?: number;
  /**
   * Matches those searches had beyond the rows they returned, which the
   * check could not see (the most any one of them had).
   */
  unseen?: number;
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
    /* 46d: a term only an all-already-tagged assign touched is listed too. */
    const untouched = [...this.assignments.keys()].filter(
      (slug) => !this.terms.has(slug),
    );
    return {
      recipes: [...this.recipes.values()],
      terms: [
        ...[...this.terms].map((slug) => ({
          slug,
          ...this.assignments.get(slug),
        })),
        ...untouched.map((slug) => ({
          slug,
          ...this.assignments.get(slug),
          unchanged: true as const,
        })),
      ],
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
      done.places.length === 0 &&
      this.assignments.size === 0
    ) {
      return undefined;
    }
    const capped = <T>(items: T[]) => items.slice(0, WRITE_SUMMARY_MAX_ITEMS);
    const recipes = capped(done.recipes).map((recipe) =>
      recipe.name && recipe.name.length > SUMMARY_NAME_MAX
        ? { ...recipe, name: `${recipe.name.slice(0, SUMMARY_NAME_MAX)}…` }
        : recipe,
    );
    const terms = capped(
      done.terms.filter((term) => !term.unchanged).map(({ slug }) => slug),
    );
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
      const term = str(result.slug) ?? str(input.slug);
      /* 46d: what the call added, and what already carried the term — said
       * even when it added nothing (and so wrote and committed nothing). */
      if (term && Array.isArray(result.added)) {
        into.assigned(
          term,
          strings(result.added).length,
          strings(result.alreadyTagged).length,
        );
      }
      if (updated.length === 0) return;
      into.term(term);
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

/** At most this many rows of one search are kept for the post-check. */
export const FOUND_MAX = 200;

/** A term's missed recipes listed by name; the rest are counted. */
export const MISSED_MAX = 24;

/**
 * What a `recipe_search` found (48a), from its uncut result: the rows'
 * slug, name and tags, and its total — the tagging post-check's input,
 * kept on the tool-result message as `found`. `undefined` for any other
 * tool or a result that is not a search's answer.
 */
export function searchFound(
  name: string,
  result: unknown,
): AgentFound | undefined {
  if (name !== "recipe_search") return undefined;
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!isObject(value) || "error" in value || !Array.isArray(value.recipes)) {
    return undefined;
  }
  const recipes = value.recipes
    .filter(isObject)
    .flatMap((row) => {
      const slug = str(row.slug);
      if (!slug) return [];
      const name = str(row.name);
      const tags = strings(row.tags);
      return [
        {
          slug,
          ...(name ? { name: name.slice(0, SUMMARY_NAME_MAX) } : {}),
          ...(tags.length ? { tags } : {}),
        },
      ];
    })
    .slice(0, FOUND_MAX);
  const total =
    typeof value.total === "number" && value.total >= recipes.length
      ? value.total
      : recipes.length;
  return { total, recipes };
}

export interface TagMiss {
  term: string;
  missed: { slug: string; name?: string }[];
  missedCount: number;
  unseen: number;
}

/**
 * The term a `term_assign` wrote, as `runChanges` keys it: the result's slug
 * (its summary's, when the content was cut), else the asked-for slug as the
 * site slugifies it — "Korean" is `korean`.
 */
function assignedTerm(
  input: Record<string, unknown>,
  result: AgentToolResultMessage,
): string | undefined {
  const summary = result.summary;
  const parsed = parseToolResult(result);
  const asked = str(input.slug);
  return (
    summary?.assigned?.[0]?.term ??
    summary?.terms?.[0] ??
    str(parsed?.slug) ??
    (asked ? tagSlug(asked) || undefined : undefined)
  );
}

/**
 * The tagging post-check (48a, Roger's pick 46-d-tag; backlog "Local
 * tagging writes: completeness"): for each term a run's `term_assign`
 * calls put on recipes, the recipes its own `recipe_search` calls found
 * that those calls left out.
 *
 * - Checked: a term some assign **added** to recipes; a remove-only assign
 *   is not a tagging run, though what it took off still counts below.
 * - A search counts for a term when it found at least one recipe an
 *   assign added it to — the search the tagging came from, not every
 *   search of the run.
 * - Left out of the list: what an assign named (`add`) or took the term
 *   off (`remove`), and a row whose tags already carry the term (compared
 *   as `tagSlug`s). A row tagged only with an alias or a child of the term
 *   still reads as missed: the check has no term records.
 * - Only assigns that answered (not an error, not a dry run), and only on
 *   recipes (a plan's assign is not checked).
 * - `unseen`: the matches those searches had beyond what they returned —
 *   the largest total less the distinct rows seen, so a search paged with
 *   `offset` counts its pages together.
 *
 * A search row is not a promise the recipe belongs: "thai" also finds a
 * Thai-basil pesto. The list is for the person to look over.
 */
export function tagMisses(messages: readonly AgentMessage[]): TagMiss[] {
  const named = new Map<string, Set<string>>();
  const added = new Map<string, Set<string>>();
  const searches: AgentFound[] = [];
  for (const { call, result } of callsWithResults(messages)) {
    if (!result || result.isError) continue;
    if (call.name === "recipe_search") {
      const found =
        result.found ?? searchFound(call.name, parseToolResult(result));
      if (found) searches.push(found);
      continue;
    }
    if (call.name !== "term_assign") continue;
    const input = isObject(call.input) ? call.input : {};
    if (input.dryRun === true || input.type === "group") continue;
    if (!result.summary && !parseToolResult(result)) continue;
    const term = assignedTerm(input, result);
    if (!term) continue;
    const adds = strings(input.add);
    const set = named.get(term) ?? new Set<string>();
    for (const slug of [...adds, ...strings(input.remove)]) set.add(slug);
    named.set(term, set);
    if (adds.length > 0) {
      const addSet = added.get(term) ?? new Set<string>();
      for (const slug of adds) addSet.add(slug);
      added.set(term, addSet);
    }
  }
  const misses: TagMiss[] = [];
  for (const [term, adds] of added) {
    const slugs = named.get(term) ?? adds;
    const missed = new Map<string, { slug: string; name?: string }>();
    const seen = new Set<string>();
    let total = 0;
    for (const found of searches) {
      if (!found.recipes.some((row) => adds.has(row.slug))) continue;
      total = Math.max(total, found.total);
      for (const row of found.recipes) {
        seen.add(row.slug);
        if (slugs.has(row.slug) || missed.has(row.slug)) continue;
        if ((row.tags ?? []).some((tag) => tagSlug(tag) === term)) continue;
        missed.set(row.slug, {
          slug: row.slug,
          ...(row.name ? { name: row.name } : {}),
        });
      }
    }
    const unseen = Math.max(0, total - seen.size);
    if (missed.size === 0 && unseen === 0) continue;
    misses.push({
      term,
      missed: [...missed.values()].slice(0, MISSED_MAX),
      missedCount: missed.size,
      unseen,
    });
  }
  return misses;
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
  const done = into.done();
  /* 48a: each assigned term's post-check, on the term it checks. */
  const misses = new Map(tagMisses(messages).map((miss) => [miss.term, miss]));
  if (misses.size === 0) return done;
  return {
    ...done,
    terms: done.terms.map((term) => {
      const miss = misses.get(term.slug);
      if (!miss) return term;
      return {
        ...term,
        ...(miss.missedCount > 0
          ? { missed: miss.missed, missedCount: miss.missedCount }
          : {}),
        ...(miss.unseen > 0 ? { unseen: miss.unseen } : {}),
      };
    }),
  };
}

/**
 * A term's post-check in words (48a), in two parts so a list of names can
 * follow the first: `found` — "The search also found 3 recipes it did not
 * tag" — and `unseen` — "It had 14 more matches than it returned" (or "The
 * search had …" alone). `undefined` when the check has nothing to say.
 */
export function missedParts(
  term: Pick<ChangedTerm, "missedCount" | "unseen">,
): { found?: string; unseen?: string } | undefined {
  const count = term.missedCount ?? 0;
  const unseen = term.unseen ?? 0;
  if (count === 0 && unseen === 0) return undefined;
  return {
    ...(count > 0
      ? {
          found: `The search also found ${count} ${count === 1 ? "recipe" : "recipes"} it did not tag`,
        }
      : {}),
    ...(unseen > 0
      ? {
          unseen: `${count > 0 ? "It" : "The search"} had ${unseen} more ${unseen === 1 ? "match" : "matches"} than it returned`,
        }
      : {}),
  };
}

/**
 * The post-check as one line of text, the names right after the clause
 * they belong to: "The search also found 3 recipes it did not tag:
 * Bibimbap, Japchae, and 1 more. It had 14 more matches than it returned."
 */
export function missedNote(
  term: Pick<ChangedTerm, "missed" | "missedCount" | "unseen">,
): string | undefined {
  const parts = missedParts(term);
  if (!parts) return undefined;
  const sentences: string[] = [];
  if (parts.found) {
    const names = (term.missed ?? []).map(
      (recipe) => recipe.name ?? recipe.slug,
    );
    const rest = (term.missedCount ?? 0) - names.length;
    sentences.push(
      names.length > 0
        ? `${parts.found}: ${names.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}.`
        : `${parts.found}.`,
    );
  }
  if (parts.unseen) sentences.push(`${parts.unseen}.`);
  return sentences.join(" ");
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
  if (term.added === 0 && term.alreadyTagged) {
    return `${term.alreadyTagged} already tagged`;
  }
  const parts = [`added ${term.added}`];
  if (term.alreadyTagged) parts.push(`${term.alreadyTagged} already tagged`);
  return parts.join(", ");
}

/** How many things changed: recipes, terms, plans and places (a term nothing was written to is not one). */
export function changeCount(changes: RunChanges): number {
  return (
    changes.recipes.length +
    changes.terms.filter((term) => !term.unchanged).length +
    changes.groups.length +
    changes.places.length
  );
}

/**
 * Whether "What changed" has anything to say (46d): a change, a commit, or
 * a `term_assign` that found recipes already tagged.
 */
export function changesToShow(changes: RunChanges): boolean {
  return (
    changeCount(changes) + changes.commits > 0 ||
    changes.terms.some((term) => (term.alreadyTagged ?? 0) > 0)
  );
}
