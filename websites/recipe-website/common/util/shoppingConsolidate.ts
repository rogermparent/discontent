/**
 * "Same thing, different names" (epic 49, 49a): the proposals the
 * `/shopping` page, the CLI and `shopping_get` show — rows of the list whose
 * names `SHOPPING_EQUIVALENTS` says a shopper buys as one, put side by side
 * with what they would come to as one row.
 *
 * **Derived, never stored** (Da1, 35-D3): `findShoppingProposals` runs over
 * the stored items, settings and decisions on every read, like
 * `buildShoppingView`; only a person's answer — Merge, Keep apart — is a
 * file. The proposal's shape is the one 49b's model will return too.
 *
 * - Rows that already merge (one name key) are one row here, as on the list.
 * - A merged decision's rows count as one: a third name joining them
 *   proposes the three together, and Merge replaces the old decision.
 * - An `apart` decision hides every proposal whose names it covers; a new
 *   name changes the question, so it is asked again.
 * - Ticked rows are bought: a name whose every line is ticked proposes
 *   nothing.
 * - The merge switch off proposes nothing (Da8): there are no merged rows.
 *
 * Pure, and safe in the browser.
 */
import { parseAmount, scaleAmount, type Amount } from "./ingredientAmount";
import {
  activeMerges,
  consolidateAmounts,
  countsAs,
  equivalenceOf,
  gramsPerCupFor,
  mergeIdOf,
  type ShoppingEquivalence,
  type ShoppingMerge,
} from "./shoppingMerges";
import type { ShoppingItem, ShoppingSettings } from "./shoppingTypes";
import {
  factorOf,
  lineFor,
  orParents,
  quantityFor,
  shoppingNameOf,
  sourceOf,
  type ShoppingRowSource,
} from "./shoppingView";

/** One row a proposal would merge: one name on the list (Da3). */
export interface ShoppingProposalRow {
  /** Its name key. */
  key: string;
  /** Its name, as the list labels it. */
  name: string;
  /** Its amount as the row shows it ("1 cup", "as needed"). */
  amountText: string;
  /** The items behind it: each line as written, with its recipe. */
  sources: ShoppingRowSource[];
}

/** Rows that look like one thing, and what they would be as one (Da3). */
export interface ShoppingProposal {
  /** `mergeIdOf` of every row's key: what Merge and Keep apart answer. */
  id: string;
  rows: ShoppingProposalRow[];
  /** The merged row's name: the more generic or more common one. */
  name: string;
  /** The sum, formatted, "≈" first when `estimated`. */
  amount: string;
  /** A volume and a weight were added through a density. */
  estimated: boolean;
  /** The after line: "3 cups all-purpose flour", "≈ 2 cups all-purpose flour". */
  line: string;
  /** Why: "Both are all-purpose flour". */
  reason: string;
}

interface KeyGroup {
  key: string;
  label: string;
  items: ShoppingItem[];
}

/** One row of the list: a name, or a merged decision's names. */
interface Unit {
  keys: string[];
}

function amountOf(
  items: readonly ShoppingItem[],
  countUnit?: string,
): Amount[] {
  return items.flatMap((item) => {
    const amount = parseAmount(item.text);
    return amount
      ? [countsAs(scaleAmount(amount, factorOf(item)), countUnit)]
      : [];
  });
}

function reasonFor(set: ShoppingEquivalence, rows: number): string {
  return rows === 2 ? `Both are ${set.name}` : `All ${rows} are ${set.name}`;
}

/**
 * The open proposals for a list: one per curated set with two or more of
 * the list's rows in it, unless a decision answered it. In the order their
 * first line was added.
 */
export function findShoppingProposals(
  items: readonly ShoppingItem[],
  settings: ShoppingSettings,
  merges: readonly ShoppingMerge[] = [],
): ShoppingProposal[] {
  if (!settings.features.merge) return [];
  const sorted = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  /* An `OR:` line rides on its parent's row: it is no name of its own. */
  const alternativeOf = orParents(sorted, true);
  const groups = new Map<string, KeyGroup>();
  for (const item of sorted) {
    if (alternativeOf.has(item.id)) continue;
    const name = shoppingNameOf(item.text);
    const group = groups.get(name.key);
    if (group) group.items.push(item);
    else
      groups.set(name.key, { key: name.key, label: name.label, items: [item] });
  }
  /* Bought already: nothing to decide. */
  for (const [key, group] of groups) {
    if (group.items.every((item) => item.checked)) groups.delete(key);
  }

  const merged = activeMerges(merges, new Set(groups.keys()));
  const apart = merges.filter((merge) => merge.status === "apart");

  /* Each curated set → the rows of the list in it, merged ones as one. */
  const proposals: { first: string; proposal: ShoppingProposal }[] = [];
  const seenSets = new Set<ShoppingEquivalence>();
  for (const group of groups.values()) {
    const set = equivalenceOf(group.key);
    if (!set || seenSets.has(set)) continue;
    seenSets.add(set);

    const units: Unit[] = [];
    const claimed = new Set<string>();
    for (const member of groups.values()) {
      if (equivalenceOf(member.key) !== set || claimed.has(member.key)) {
        continue;
      }
      const decision = merged.get(member.key);
      const keys = decision
        ? decision.keys.filter((key) => groups.has(key))
        : [member.key];
      for (const key of keys) claimed.add(key);
      units.push({ keys });
    }
    if (units.length < 2) continue;

    const keys = [...new Set(units.flatMap((unit) => unit.keys))];
    const covered = apart.some((decision) =>
      keys.every((key) => decision.keys.includes(key)),
    );
    if (covered) continue;

    const rows = keys
      .map((key) => groups.get(key)!)
      .sort((a, b) =>
        a.items[0].id < b.items[0].id
          ? -1
          : a.items[0].id > b.items[0].id
            ? 1
            : 0,
      );
    const countUnits = set.countUnits ?? {};
    const proposalRows: ShoppingProposalRow[] = rows.map((row) => {
      const { amount } = consolidateAmounts(amountOf(row.items));
      return {
        key: row.key,
        name: row.label,
        amountText: amount.parts.length > 0 ? quantityFor(amount) : "as needed",
        sources: row.items.map(sourceOf),
      };
    });
    const { amount, estimated } = consolidateAmounts(
      rows.flatMap((row) => amountOf(row.items, countUnits[row.key])),
      gramsPerCupFor(set.key, keys),
    );
    const texts = rows.flatMap((row) => row.items.map((item) => item.text));
    const approx = (text: string) => (estimated ? `≈ ${text}` : text);
    const hasAmount = amount.parts.length > 0;
    proposals.push({
      first: rows[0].items[0].id,
      proposal: {
        id: mergeIdOf(keys),
        rows: proposalRows,
        name: set.name,
        amount: hasAmount ? approx(quantityFor(amount)) : "as needed",
        estimated,
        line: hasAmount ? approx(lineFor(set.name, amount, texts)) : set.name,
        reason: reasonFor(set, rows.length),
      },
    });
  }
  return proposals
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
    .map((entry) => entry.proposal);
}
