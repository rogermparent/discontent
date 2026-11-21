/**
 * 49b: the check a `shopping-merge` job's answer goes through before the
 * shopping page sees it — the "AI changes need approval" rule's first half
 * (the second is that only Accept, Merge or Keep apart writes).
 *
 * **revise** (Db1), all or nothing as 47i's Di6: the verdict is `merge` or
 * `apart`; a merge names two or more of the asked rows by number and no
 * other (no item is invented), a name that is not empty, and an amount that
 * `ingredientAmount` reads (or none: the list's sum). One bad part refuses
 * the answer and says why.
 *
 * **find** (Db2), group by group: an unknown number is dropped, a number in
 * two groups stays in the first, and a group left under two names, with no
 * name, already kept apart, merged or proposed by the table is dropped —
 * each with a line saying why. What is left are proposals in 49a's shape.
 *
 * Pure: no model, no file.
 */
import { parseAmount } from "recipe-website-common/util/ingredientAmount";
import {
  isNamed,
  shoppingNameOf,
} from "recipe-website-common/util/shoppingView";
import {
  MERGE_LIMITS,
  mergeIdOf,
  normalizeMergeKeys,
  type ShoppingMerge,
} from "recipe-website-common/util/shoppingMerges";
import {
  proposalForKeys,
  type ShoppingProposalRow,
} from "recipe-website-common/util/shoppingConsolidate";
import type {
  ShoppingAskDecision,
  ShoppingAskTarget,
  ShoppingModelProposal,
} from "recipe-website-common/util/shoppingAsk";
import type { ShoppingProposal } from "recipe-website-common/util/shoppingConsolidate";
import type {
  ShoppingItem,
  ShoppingSettings,
} from "recipe-website-common/util/shoppingTypes";

/** How long a reason may be, as the panel shows it. */
export const ASK_REASON_MAX = 300;

/** At most this many groups are read from a find answer. */
export const FIND_MAX_GROUPS = 30;

/** revise: what the model answers (Ollama `format`, Claude's structured output). */
export const REVISE_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["merge", "apart"] },
    items: { type: "array", items: { type: "integer" } },
    name: { type: "string" },
    amount: { type: "string" },
    estimated: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["verdict", "items", "name", "amount", "estimated", "reason"],
  additionalProperties: false,
} as const;

/** find: groups of numbered names. */
export const FIND_JSON_SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "integer" } },
          name: { type: "string" },
          reason: { type: "string" },
        },
        required: ["items", "name", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One line, spaces collapsed. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * A name the list would read as the same: one name key ("all purpose flour"
 * for "all-purpose flour"), or the same words, case and spacing aside. The
 * model saying the list's own name again is no name of its own.
 */
function sameName(a: string, b: string): boolean {
  if (oneLine(a).toLowerCase() === oneLine(b).toLowerCase()) return true;
  const key = shoppingNameOf(a).key;
  return isNamed(key) && key === shoppingNameOf(b).key;
}

/** `≈`, `~` or "about" in front of an amount. */
const APPROX = /^(?:≈|~|about\s+|approx(?:\.|imately)?\s+)\s*/i;

/** An amount the list can show: one that `parseAmount` reads a number in. */
export function readableAmount(text: string): boolean {
  const amount = parseAmount(text.replace(APPROX, ""));
  return !!amount && amount.parts.some((part) => part.qty > 0);
}

/** Two amounts that say the same, "≈" aside. */
function sameAmount(a: string, b: string): boolean {
  const left = parseAmount(a.replace(APPROX, ""));
  const right = parseAmount(b.replace(APPROX, ""));
  if (!left || !right) return oneLine(a) === oneLine(b);
  return JSON.stringify(left.parts) === JSON.stringify(right.parts);
}

/** The list a revise reads: its items, switches and decisions. */
export interface AskList {
  items: readonly ShoppingItem[];
  settings: ShoppingSettings;
  merges: readonly ShoppingMerge[];
}

export type ReviseCheck =
  | {
      status: "merge";
      proposal: ShoppingProposal;
      amountFromModel: boolean;
      decision: ShoppingAskDecision;
    }
  | { status: "apart"; reason: string; decision: ShoppingAskDecision }
  | { status: "refused"; problem: string };

/**
 * A revise answer (Db1), checked against what was asked: the rows by number,
 * the list it was asked over, and the person's note (saved with the
 * decision, if accepted).
 */
export function checkReviseAnswer(
  data: unknown,
  target: ShoppingAskTarget,
  list: AskList,
  note: string,
): ReviseCheck {
  if (!isRecord(data)) {
    return { status: "refused", problem: "the answer is not a JSON object" };
  }
  const reason = oneLine(data.reason).slice(0, ASK_REASON_MAX);
  const replaces = (keys: readonly string[]) =>
    target.merged && mergeIdOf(keys) !== target.id
      ? { replaces: target.id }
      : {};
  if (data.verdict === "apart") {
    const keys = normalizeMergeKeys(target.keys);
    return {
      status: "apart",
      reason,
      decision: {
        keys,
        status: "apart",
        ...(note ? { note } : {}),
        ...replaces(keys),
      },
    };
  }
  if (data.verdict !== "merge") {
    return {
      status: "refused",
      problem: "it answered neither “merge” nor “apart”",
    };
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const numbers: number[] = [];
  for (const item of items) {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < 1 ||
      item > target.rows.length
    ) {
      return {
        status: "refused",
        problem: `it names item ${JSON.stringify(item)}, which is not one of the ${target.rows.length} lines asked about`,
      };
    }
    if (!numbers.includes(item)) numbers.push(item);
  }
  if (numbers.length < 2) {
    return {
      status: "refused",
      problem: "a merge needs two or more of the lines asked about",
    };
  }
  const name = oneLine(data.name);
  if (!name) return { status: "refused", problem: "the name is empty" };
  if (name.length > MERGE_LIMITS.name) {
    return {
      status: "refused",
      problem: `the name is over ${MERGE_LIMITS.name} characters`,
    };
  }
  const quantities = list.settings.features.quantities;
  let amount = quantities ? oneLine(data.amount) : "";
  if (amount && !readableAmount(amount)) {
    return {
      status: "refused",
      problem: `the amount “${amount}” can't be read as an amount`,
    };
  }
  if (
    amount &&
    data.estimated === true &&
    !APPROX.test(amount) &&
    `≈ ${amount}`.length <= MERGE_LIMITS.amount
  ) {
    amount = `≈ ${amount}`;
  }
  if (amount.length > MERGE_LIMITS.amount) {
    return {
      status: "refused",
      problem: `the amount is over ${MERGE_LIMITS.amount} characters`,
    };
  }

  const keys = normalizeMergeKeys(
    numbers.map((number) => target.rows[number - 1].key),
  );
  /* The decision asked about gives way to the answer (it may be narrower). */
  const merges = list.merges.filter((merge) => merge.id !== target.id);
  const plain = proposalForKeys(list.items, list.settings, merges, keys, {
    reason,
  });
  if (!plain) {
    return {
      status: "refused",
      problem: "those lines are no longer two names on the list",
    };
  }
  const amountFromModel = !!amount && !sameAmount(amount, plain.amount);
  const named = target.merged || !sameName(name, plain.name);
  const proposal =
    named || amountFromModel
      ? proposalForKeys(list.items, list.settings, merges, keys, {
          ...(named ? { name } : {}),
          ...(amountFromModel ? { amount } : {}),
          reason,
        })!
      : plain;
  return {
    status: "merge",
    proposal,
    amountFromModel,
    decision: {
      keys,
      status: "merged",
      ...(named ? { name } : {}),
      ...(amountFromModel ? { amount } : {}),
      ...(note ? { note } : {}),
      ...replaces(keys),
    },
  };
}

/** The names a find sends, numbered from 1 in this order. */
export type FindNames = readonly ShoppingProposalRow[];

export type FindCheck =
  | { status: "found"; proposals: ShoppingModelProposal[]; dropped: string[] }
  | { status: "refused"; problem: string };

/**
 * A find answer (Db2): the groups the check keeps, as proposals, and a line
 * for each one it drops. `proposed` are the name sets the table proposes
 * now.
 */
export function checkFindAnswer(
  data: unknown,
  names: FindNames,
  list: AskList,
  proposed: readonly (readonly string[])[] = [],
): FindCheck {
  if (!isRecord(data) || !Array.isArray(data.groups)) {
    return { status: "refused", problem: "the answer has no “groups” list" };
  }
  const dropped: string[] = [];
  const used = new Set<number>();
  const proposals: ShoppingModelProposal[] = [];
  const taken = new Set<string>();
  const proposedIds = new Set(proposed.map((keys) => mergeIdOf(keys)));
  for (const [index, group] of data.groups
    .slice(0, FIND_MAX_GROUPS)
    .entries()) {
    const label = `group ${index + 1}`;
    if (!isRecord(group)) {
      dropped.push(`${label}: not an object`);
      continue;
    }
    const raw = Array.isArray(group.items) ? group.items : [];
    const numbers: number[] = [];
    for (const item of raw) {
      if (
        typeof item !== "number" ||
        !Number.isInteger(item) ||
        item < 1 ||
        item > names.length
      ) {
        dropped.push(
          `${label}: item ${JSON.stringify(item)} is not one of the ${names.length} names`,
        );
        continue;
      }
      if (used.has(item) || numbers.includes(item)) continue;
      numbers.push(item);
    }
    const name = oneLine(group.name).slice(0, MERGE_LIMITS.name);
    if (numbers.length < 2) {
      dropped.push(`${label}: fewer than two names`);
      continue;
    }
    if (!name) {
      dropped.push(`${label}: no name`);
      continue;
    }
    const keys = normalizeMergeKeys(
      numbers.map((number) => names[number - 1].key),
    );
    const id = mergeIdOf(keys);
    const words = keys.join(" + ");
    if (taken.has(id) || proposedIds.has(id)) {
      dropped.push(`${label} (${words}): already proposed`);
      continue;
    }
    const decided = list.merges.find((merge) =>
      merge.status === "merged"
        ? merge.keys.some((key) => keys.includes(key))
        : keys.every((key) => merge.keys.includes(key)),
    );
    if (decided) {
      dropped.push(
        `${label} (${words}): ${decided.status === "merged" ? "merged already" : "kept apart already"}`,
      );
      continue;
    }
    const reason = oneLine(group.reason).slice(0, ASK_REASON_MAX);
    const plain = proposalForKeys(
      list.items,
      list.settings,
      list.merges,
      keys,
      {
        reason,
      },
    );
    if (!plain) {
      dropped.push(`${label} (${words}): not two names on the list`);
      continue;
    }
    const named = !sameName(name, plain.name);
    const proposal = named
      ? proposalForKeys(list.items, list.settings, list.merges, keys, {
          name,
          reason,
        })!
      : plain;
    for (const number of numbers) used.add(number);
    taken.add(id);
    proposals.push({
      proposal,
      decision: { keys, status: "merged", ...(named ? { name } : {}) },
    });
  }
  return { status: "found", proposals, dropped };
}
