/**
 * A new plan filled in from a link (48e): the homepage's "Start a plan from
 * the menu" opens `/group/new` with the holiday's name, its tag and a dish
 * per course, each labelled with its course. Nothing is saved until the
 * editor submits the form — the link only fills it in, as `?recipe=` (a
 * recipe page's "Group" button) always has.
 *
 * Both halves live here so they cannot drift: `groupPrefillHref` writes the
 * query, `groupPrefill` reads it back, bounded and checked.
 */

export interface GroupPrefill {
  name?: string;
  tags?: string[];
  items?: Array<{ recipe: string; label?: string }>;
}

/** At most this many rows, tags and characters come from a link. */
export const PREFILL_MAX_ITEMS = 24;
export const PREFILL_MAX_TAGS = 12;
export const PREFILL_MAX_TEXT = 120;

/** A recipe slug as the site makes them: lower-case words and dashes. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `/group/new` with `prefill` in its query. */
export function groupPrefillHref(prefill: GroupPrefill): string {
  const params = new URLSearchParams();
  if (prefill.name) params.set("name", prefill.name);
  for (const tag of prefill.tags ?? []) params.append("tags", tag);
  const items = prefill.items ?? [];
  /* Labels pair with recipes by position, so either every row has one
   * (empty for none) or none does: `?recipe=x` stays the plain link. */
  const labelled = items.some((item) => item.label);
  for (const item of items) params.append("recipe", item.recipe);
  if (labelled) {
    for (const item of items) params.append("label", item.label ?? "");
  }
  const query = params.toString();
  return query ? `/group/new?${query}` : "/group/new";
}

type Param = string | string[] | undefined;

function list(value: Param): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim().slice(0, PREFILL_MAX_TEXT);
  return trimmed ? trimmed : undefined;
}

/**
 * The form's starting values from `/group/new`'s query: `name`, each `tags`,
 * and each `recipe` with the `label` at the same position. A slug that is not
 * one, an empty tag and anything past the caps is dropped; `undefined` when
 * nothing is left.
 */
export function groupPrefill(query: {
  name?: Param;
  tags?: Param;
  recipe?: Param;
  label?: Param;
}): GroupPrefill | undefined {
  const name = text(list(query.name)[0]);
  const tags = list(query.tags)
    .map((tag) => text(tag))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, PREFILL_MAX_TAGS);
  const labels = list(query.label);
  const items = list(query.recipe)
    .map((recipe, index) => ({ recipe: recipe.trim(), label: labels[index] }))
    .filter(({ recipe }) => SLUG.test(recipe))
    .slice(0, PREFILL_MAX_ITEMS)
    .map(({ recipe, label }) => {
      const kept = text(label);
      return kept ? { recipe, label: kept } : { recipe };
    });
  if (!name && tags.length === 0 && items.length === 0) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(tags.length ? { tags } : {}),
    ...(items.length ? { items } : {}),
  };
}
