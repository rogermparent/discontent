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
import {
  addAmounts,
  parseAmount,
  scaleAmount,
  type Amount,
} from "./ingredientAmount";
import {
  activeMerges,
  amountInUnit,
  consolidateAmounts,
  countsAs,
  equivalenceOf,
  gramsPerCupFor,
  knownDifferentPair,
  mergeIdOf,
  normalizeMergeKeys,
  type AskableUnit,
  type InUnit,
  type ShoppingEquivalence,
  type ShoppingMerge,
} from "./shoppingMerges";
import type { ShoppingItem, ShoppingSettings } from "./shoppingTypes";
import {
  buildShoppingView,
  factorOf,
  lineFor,
  orParents,
  quantityFor,
  shoppingNameOf,
  sourceOf,
  type ShoppingRow,
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
  /** A merged decision's own name, when the person gave one. */
  name?: string;
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
 * The list's items by name key, as the view groups them (in the order
 * added): an `OR:` line rides on its parent's row, so it is no name of its
 * own.
 */
function nameGroups(items: readonly ShoppingItem[]): Map<string, KeyGroup> {
  const sorted = [...items].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
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
  return groups;
}

/** One name's row as a proposal shows it: its lines and their amount. */
function proposalRowOf(
  group: KeyGroup,
  settings: ShoppingSettings,
  countUnit?: string,
): ShoppingProposalRow {
  const { amount } = consolidateAmounts(
    settings.features.quantities ? amountOf(group.items, countUnit) : [],
  );
  return {
    key: group.key,
    name: group.label,
    amountText: amount.parts.length > 0 ? quantityFor(amount) : "as needed",
    sources: group.items.map(sourceOf),
  };
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
  const groups = nameGroups(items);
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
      units.push({ keys, ...(decision?.name ? { name: decision.name } : {}) });
    }
    if (units.length < 2) continue;

    const keys = [...new Set(units.flatMap((unit) => unit.keys))];
    const covered = apart.some((decision) =>
      keys.every((key) => decision.keys.includes(key)),
    );
    if (covered) continue;
    /* 49c (Dc3): the list the model's check reads too — never in the table. */
    if (knownDifferentPair(keys)) continue;

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
    /*
     * A merged row's own name carries over (49a review): Merge keeps it, so
     * the proposal says it. The set's name otherwise.
     */
    const ownName = units.find((unit) => unit.name)?.name;
    const name = ownName ?? set.name;
    /* Quantities off: the list shows no amounts, nor does the proposal. */
    const counted = (items: readonly ShoppingItem[], unit?: string) =>
      settings.features.quantities ? amountOf(items, unit) : [];
    const proposalRows = rows.map((row) => proposalRowOf(row, settings));
    const { amount, estimated } = consolidateAmounts(
      rows.flatMap((row) => counted(row.items, countUnits[row.key])),
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
        name,
        amount: hasAmount ? approx(quantityFor(amount)) : "as needed",
        estimated,
        line: hasAmount
          ? approx(lineFor(name, amount, texts, [], ownName !== undefined))
          : name,
        reason: reasonFor(set, rows.length),
      },
    });
  }
  return proposals
    .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0))
    .map((entry) => entry.proposal);
}

// --- 49b: a proposal for any names -------------------------------------------

/** Every row of a view: the store lists', the probably-at-home fold's, the ticked. */
function rowsOf(view: ReturnType<typeof buildShoppingView>): ShoppingRow[] {
  return [
    ...view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    ),
    ...view.onHand,
    ...view.checked,
  ];
}

/**
 * 49b: the list's rows for these name keys, as a proposal lists them (in
 * the order their first line was added) — what the model is asked about.
 * Names not on the list are left out.
 */
export function proposalRowsFor(
  items: readonly ShoppingItem[],
  settings: ShoppingSettings,
  keys: readonly string[],
): ShoppingProposalRow[] {
  const groups = nameGroups(items);
  return normalizeMergeKeys(keys)
    .flatMap((key) => {
      const group = groups.get(key);
      return group ? [group] : [];
    })
    .sort((a, b) =>
      a.items[0].id < b.items[0].id
        ? -1
        : a.items[0].id > b.items[0].id
          ? 1
          : 0,
    )
    .map((group) => proposalRowOf(group, settings));
}

/**
 * 49b: the proposal for exactly these names, in Da3's shape, as the list
 * would show them merged — the model's grouping and name, the list's own
 * sum and line (`buildShoppingView` with that decision), or the model's
 * `amount` when one is given (an edited amount). `undefined` when fewer
 * than two of the names are on the list, or merge is off.
 */
export function proposalForKeys(
  items: readonly ShoppingItem[],
  settings: ShoppingSettings,
  merges: readonly ShoppingMerge[],
  keys: readonly string[],
  { name, amount, reason }: { name?: string; amount?: string; reason: string },
): ShoppingProposal | undefined {
  if (!settings.features.merge) return undefined;
  const rows = proposalRowsFor(items, settings, keys);
  if (rows.length < 2) return undefined;
  const present = normalizeMergeKeys(rows.map((row) => row.key));
  const id = mergeIdOf(present);
  const decision: ShoppingMerge = {
    id,
    keys: present,
    status: "merged",
    ...(name ? { name } : {}),
    decidedAt: "",
  };
  /* Every other merge stays as it is, but one that shares a name. */
  const others = merges.filter(
    (merge) =>
      merge.id !== id && !merge.keys.some((key) => present.includes(key)),
  );
  const row = rowsOf(
    buildShoppingView([...items], settings, [], [], [...others, decision]),
  ).find((each) => each.key === `merge:${id}`);
  if (!row) return undefined;
  const own = settings.features.quantities ? amount?.trim() : undefined;
  const estimated = !own && row.merge?.estimated === true;
  const sum = row.quantity ?? "as needed";
  /* A partly ticked row's label is what is left: the proposal says the whole. */
  const line = own
    ? `${own} ${row.name}`
    : row.quantity
      ? row.partial
        ? `${row.quantity} ${row.name}`
        : row.label
      : row.name;
  return {
    id,
    rows,
    name: name ?? mergedNameOf(present, rows),
    amount: own ?? sum,
    estimated,
    line,
    reason,
  };
}

/**
 * The name a merge of these keys reads as with no name of its own — the
 * curated set's, else the name with the most lines — as the view names it.
 */
function mergedNameOf(
  keys: readonly string[],
  rows: readonly ShoppingProposalRow[],
): string {
  const sets = new Set(keys.map((key) => equivalenceOf(key)));
  const set = sets.size === 1 ? [...sets][0] : undefined;
  if (set) return set.name;
  let best = rows[0];
  for (const row of rows) {
    if (row.sources.length > best.sources.length) best = row;
  }
  return best.name;
}

/**
 * 49c (Dc1): what these names come to, as one row, in the unit a note asked
 * for — the code's arithmetic, never the model's. Every line of the names
 * counts (scaled, a counted name's container as the view reads it, ticked
 * ones too, as the merged row's whole amount does); the density is the
 * curated set's, else `nameKey`'s (the name the row is called), else one
 * every name shares (`gramsPerCupFor`).
 */
export function mergedAmountInUnit(
  items: readonly ShoppingItem[],
  keys: readonly string[],
  unit: AskableUnit,
  nameKey?: string,
): InUnit {
  const groups = nameGroups(items);
  const sets = new Set(keys.map((key) => equivalenceOf(key)));
  const set = sets.size === 1 ? [...sets][0] : undefined;
  const amounts = keys.flatMap((key) => {
    const group = groups.get(key);
    return group ? amountOf(group.items, set?.countUnits?.[key]) : [];
  });
  return amountInUnit(
    addAmounts(...amounts),
    unit,
    gramsPerCupFor(set?.key ?? nameKey ?? keys[0], keys),
  );
}
