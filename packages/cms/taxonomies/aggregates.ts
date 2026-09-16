import type { Key } from "lmdb";
import type { AggregateConfig, AggregateEntry } from "../aggregates/types";
import type { AnyContentTypeConfig } from "../content/types";
import { normalizeTerm, termSlug } from "./slug";
import type {
  TaxonomyByTerm,
  TaxonomyByTermEntry,
  TaxonomyConfig,
  TaxonomyTerm,
} from "./types";

/**
 * The engine's half of every taxonomy's spec version.
 *
 * Bump it when either fold below changes what it produces, and every site's
 * stored terms and by-term records recompute at their next write without any
 * site editing its own `version`. The stored spec version is
 * `` `${TAXONOMY_FOLD_VERSION}.${taxonomy.version}` ``, so the two halves are
 * independent: this one is the engine's, the suffix is the site's.
 *
 * `test/specVersions.test.ts` pins this module's source, so an edit here has to
 * be looked at before it lands (T1).
 */
export const TAXONOMY_FOLD_VERSION = "1";

/** What both folds store under one term slug while accumulating. */
interface TermAccumulator {
  label: string;
  count: number;
}

function specVersion(taxonomy: Pick<TaxonomyConfig, "version">): string {
  return `${TAXONOMY_FOLD_VERSION}.${taxonomy.version}`;
}

/**
 * The terms one carrier contributes, as `slug -> label`, in first-seen order.
 *
 * Three rules live here and nowhere else, so both folds cannot disagree about
 * them:
 *
 * - A `field` that is not an array is **no terms**, not an error. That is what
 *   lets a type declare a taxonomy over a field its older index values never
 *   carried.
 * - Every raw term is normalised and then slugged, and an empty slug is
 *   dropped — punctuation-only terms have no page to be on.
 * - Within one carrier, duplicate slugs collapse: `count` is a count of
 *   carriers, and a carrier must appear once in a term's `items`.
 */
function termsOf<TIndexValue>(
  taxonomy: Pick<TaxonomyConfig<TIndexValue>, "field" | "slugOf">,
  value: TIndexValue,
): Map<string, string> {
  const raw = (value as Record<string, unknown> | undefined)?.[taxonomy.field];
  if (!Array.isArray(raw)) return new Map();

  const slugOf = taxonomy.slugOf ?? termSlug;
  const terms = new Map<string, string>();
  for (const candidate of raw) {
    if (typeof candidate !== "string") continue;
    const label = normalizeTerm(candidate);
    if (!label) continue;
    const slug = slugOf(label);
    if (!slug) continue;
    /* First spelling wins, here and in the corpus-wide folds below. */
    if (!terms.has(slug)) terms.set(slug, label);
  }
  return terms;
}

/** Sorted by slug, so the stored value's hash does not depend on walk order. */
function bySlug<T>(entries: Iterable<[string, T]>): [string, T][] {
  return [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The vocabulary itself: every term in the corpus with its label and how many
 * carriers name it.
 *
 * Named `${taxonomy.name}s` — `tags` for the `tag` vocabulary — which is the
 * string the recipe site's hand-written `recipeTags` already uses, so adopting
 * this moves neither the cache tag nor the LMDB directory. The *shape* moves
 * (`string[]` becomes `TaxonomyTerm[]`), which is what the site's own `version`
 * bump at adoption is for.
 */
export function termsAggregate<TIndexValue, TKey extends Key>(
  taxonomy: TaxonomyConfig<TIndexValue, TKey, unknown>,
): AggregateConfig<
  TIndexValue,
  TKey,
  Map<string, TermAccumulator>,
  TaxonomyTerm[]
> {
  return {
    name: `${taxonomy.name}s`,
    version: specVersion(taxonomy),
    initial: () => new Map<string, TermAccumulator>(),
    fold: (terms, { value }) => {
      for (const [slug, label] of termsOf(taxonomy, value)) {
        const existing = terms.get(slug);
        if (existing) existing.count += 1;
        else terms.set(slug, { label, count: 1 });
      }
      return terms;
    },
    finalize: (terms) =>
      bySlug(terms.entries()).map(([slug, { label, count }]) => ({
        slug,
        label,
        count,
      })),
  };
}

/**
 * The inverted index: every term mapped to the carriers naming it.
 *
 * Named `by-${taxonomy.name}`, again matching what the recipe site already has.
 * One record for the whole vocabulary — the corpus-document trade (F8): a write
 * that moves any term's list invalidates every term page, and the value grows
 * as `carriers x terms-per-carrier`. `project` is the lever that keeps it
 * small, and F8b's ~150 KB threshold is what eventually partitions it.
 *
 * The walk is ascending by content-index key, which for every config in this
 * repo is oldest first, so each list is reversed in `finalize` to arrive
 * newest-first. Keys are inserted in sorted-slug order for the same reason the
 * terms array is sorted: the stored value is hashed, and an order that depended
 * on the walk would read as a change.
 */
export function byTermAggregate<TIndexValue, TKey extends Key, TItem>(
  taxonomy: TaxonomyConfig<TIndexValue, TKey, TItem>,
): AggregateConfig<
  TIndexValue,
  TKey,
  Map<string, TaxonomyByTermEntry<TItem>>,
  TaxonomyByTerm<TItem>
> {
  const project =
    taxonomy.project ??
    (({ id }: AggregateEntry<TIndexValue, TKey>) => ({ id }) as TItem);

  return {
    name: `by-${taxonomy.name}`,
    version: specVersion(taxonomy),
    initial: () => new Map<string, TaxonomyByTermEntry<TItem>>(),
    fold: (byTerm, entry) => {
      const terms = termsOf(taxonomy, entry.value);
      if (terms.size === 0) return byTerm;
      /*
       * Projected once per carrier however many of its terms match — the
       * projection is a site function and may be doing real work, and every
       * term's list gets the identical row anyway.
       */
      const item = project(entry);
      for (const [slug, label] of terms) {
        const existing = byTerm.get(slug);
        if (existing) existing.items.push(item);
        else byTerm.set(slug, { label, items: [item] });
      }
      return byTerm;
    },
    finalize: (byTerm) =>
      Object.fromEntries(
        bySlug(byTerm.entries()).map(([slug, entry]) => [
          slug,
          { label: entry.label, items: [...entry.items].reverse() },
        ]),
      ),
  };
}

/** Both derived aggregates of one taxonomy, terms first. */
export function taxonomyAggregates<TIndexValue, TKey extends Key, TItem>(
  taxonomy: TaxonomyConfig<TIndexValue, TKey, TItem>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AggregateConfig<any, any, any, any>[] {
  return [termsAggregate(taxonomy), byTermAggregate(taxonomy)];
}

/**
 * Every aggregate a content type actually has — declared and derived.
 *
 * **The single derivation.** Exactly two seats read it: `updateAggregates`,
 * which folds them, and `derivedTagsOf`, which names their cache tags.
 * Everything else — `rebuildIndex`, `rebuildFixtureIndexes`, `derivedPaths`,
 * the write path's changes artifact — inherits through those two, which is why
 * declaring a taxonomy needed no other engine edit.
 *
 * **Order is the contract** (T4): declared aggregates first, then taxonomies in
 * declaration order, each one's terms before its by-term. `derivedTagsOf`'s
 * output is pinned with `toEqual`, and cache tags are matched by string, so
 * appending is safe and reordering is not.
 */
export function aggregatesOf(
  config: AnyContentTypeConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AggregateConfig<any, any, any, any>[] {
  const declared = config.aggregates ?? [];
  const taxonomies = config.taxonomies ?? [];
  if (taxonomies.length === 0) return declared;
  return [...declared, ...taxonomies.flatMap((t) => taxonomyAggregates(t))];
}

export default aggregatesOf;
