/**
 * 50b (Db4): the check on a "Tidy with the model" answer — structural only.
 * A suggestion is left out, with a plain sentence, only when:
 *
 * - it names a row that is not on the list, or changes a row an earlier op
 *   of the same suggestion left off;
 * - an op is malformed (an op the list has no word for, no rows, a merge of
 *   one row, an empty name or note), or an amount, a delta or a package
 *   size has no number the list reads;
 * - or it leaves a row off without saying why.
 *
 * Everything 49c refused on judgement — a known-different pair, a group
 * over three, two names neither of which is the other with words in front —
 * is a **warning** on the card now ("49's rules keep salts apart"), never a
 * refusal: the person reads it and decides. Arithmetic stays in code
 * (49c's Dc1): the model names a delta ("+1 tbsp") or a unit, and the list
 * adds or converts.
 */
import {
  formatAmount,
  isAsNeeded,
  parseAmount,
  unitSize,
} from "recipe-website-common/util/ingredientAmount";
import type { ShoppingPromptRow } from "recipe-website-common/util/shoppingChanges";
import {
  LAYER_LIMITS,
  type ShoppingLayerOp,
} from "recipe-website-common/util/shoppingLayers";
import { knownDifferentPair } from "recipe-website-common/util/shoppingMerges";
import {
  PACKAGE_GUESS_WARNING,
  TIDY_KINDS,
  TIDY_KIND_LABELS,
  TIDY_LIMITS,
  isTidyKind,
  tidySuggestionId,
  type TidyKind,
  type TidySuggestion,
} from "recipe-website-common/util/shoppingTidy";
import { askedUnit, shareHead } from "./shoppingAskCheck";

/** A row as the model reads it: its number, and 50a's compact form. */
export interface TidyPromptRow extends ShoppingPromptRow {
  n: number;
  /** The name key it routes and merges by (49's rules read it). */
  nameKey: string;
}

/** The ops a model may answer, each `{op, rows, text}` (Db3). */
export const TIDY_MODEL_OPS = [
  "drop",
  "add",
  "merge",
  "rename",
  "package",
  "check",
  "note",
  "unit",
] as const;

export type TidyModelOp = (typeof TIDY_MODEL_OPS)[number];

/** What the model answers (Ollama `format`, Claude's structured output). */
export const TIDY_JSON_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: TIDY_KINDS.filter((kind) => kind !== "other"),
          },
          title: { type: "string" },
          reason: { type: "string" },
          ops: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: [...TIDY_MODEL_OPS] },
                rows: { type: "array", items: { type: "integer" } },
                text: { type: "string" },
              },
              required: ["op", "rows", "text"],
              additionalProperties: false,
            },
          },
          confidence: { type: "number" },
        },
        required: ["kind", "title", "reason", "ops", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

export interface TidyCheck {
  suggestions: TidySuggestion[];
  /** Each suggestion left out, as a sentence. */
  leftOut: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** `≈`, `~`, "about" or a `+` in front of an amount. */
const LEAD = /^(?:\+|≈|~|about\s+|approx(?:\.|imately)?\s+|roughly\s+)\s*/i;

/** An amount the list can add: a number it reads, in a unit or a count. */
function readDelta(text: string): string | undefined {
  const plain = text.replace(LEAD, "").replace(LEAD, "").trim();
  const amount = parseAmount(plain);
  if (!amount || isAsNeeded(amount)) return undefined;
  return amount.parts.some((part) => part.qty > 0) ? plain : undefined;
}

/** Two amounts the list reads alike ("8 oz" and "8 ounces"). */
function sameAmount(a: string, b: string): boolean {
  const left = parseAmount(a.replace(LEAD, ""));
  const right = parseAmount(b.replace(LEAD, ""));
  return !!left && !!right && formatAmount(left) === formatAmount(right);
}

/** `a` is less than `b`, both in one family of units (a quart and 11 cups). */
function smallerThan(a: string, b: string): boolean {
  const left = parseAmount(a.replace(LEAD, ""));
  const right = parseAmount(b.replace(LEAD, ""));
  if (left?.parts.length !== 1 || right?.parts.length !== 1) return false;
  const [x] = left.parts;
  const [y] = right.parts;
  return (
    x.family === y.family &&
    x.family !== "container" &&
    x.qty * unitSize(x.unit) < y.qty * unitSize(y.unit)
  );
}

/** "1 quart heavy cream" → "1 quart" for the heavy cream row. */
function packageText(text: string, row: TidyPromptRow): string {
  const plain = text.replace(/^(?:≈|~|about\s+)\s*/i, "").trim();
  for (const name of [row.name, row.label.replace(/^≈\s*/, "")]) {
    if (name && plain.toLowerCase().endsWith(` ${name.toLowerCase()}`)) {
      return plain.slice(0, plain.length - name.length).trim();
    }
  }
  return plain;
}

/** The rows' names for a sentence: "salt and table salt". */
function namesOf(rows: readonly TidyPromptRow[]): string {
  const names = rows.map((row) => row.name);
  return names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** 49's judgement on a merge, as warnings (Db4): never a refusal now. */
function mergeWarnings(rows: readonly TidyPromptRow[]): string[] {
  const keys = rows.map((row) => row.name.toLowerCase());
  const nameKeys = rows.map((row) => row.nameKey);
  const warnings: string[] = [];
  const different = knownDifferentPair(nameKeys);
  if (different) {
    warnings.push(
      `49's rules keep ${different.what} apart (${different.a} and ${different.b})`,
    );
  } else {
    for (let i = 0; i < rows.length && warnings.length === 0; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (!shareHead({ key: nameKeys[i] }, { key: nameKeys[j] })) {
          warnings.push(
            `49's rules would not merge these: neither ${keys[i]} nor ${keys[j]} is the other with words in front`,
          );
          break;
        }
      }
    }
  }
  if (rows.length > 3) {
    warnings.push(`Merges ${rows.length} rows; 49's check took at most 3`);
  }
  return warnings;
}

/** A signature of a suggestion's ops: the same change asked twice reads alike. */
export function opsSignature(ops: readonly ShoppingLayerOp[]): string {
  return JSON.stringify(
    ops
      .map((op) => {
        const { ids, ...rest } = op;
        return JSON.stringify({ ...rest, ids: [...ids].sort() });
      })
      .sort(),
  );
}

/** "the 40th row" → a sentence's subject: the suggestion's title in quotes. */
function quoted(title: string): string {
  return `“${title}”`;
}

/**
 * Check a tidy answer against the rows it was asked over. `skipped` is the
 * earlier suggestions a person skipped (by ops): one the model repeats is
 * left out too, saying so.
 */
export function checkTidyAnswer(
  data: unknown,
  rows: readonly TidyPromptRow[],
  runId: string,
  {
    skipped = [],
    firstIndex = 0,
  }: {
    skipped?: readonly { ops: readonly ShoppingLayerOp[] }[];
    /** Where this answer's suggestion numbers start in its run. */
    firstIndex?: number;
  } = {},
): TidyCheck {
  const leftOut: string[] = [];
  const suggestions: TidySuggestion[] = [];
  if (!isRecord(data) || !Array.isArray(data.suggestions)) {
    return {
      suggestions,
      leftOut: ["The answer was not a list of suggestions."],
    };
  }
  const byNumber = new Map(rows.map((row) => [row.n, row]));
  const seen = new Set(skipped.map((each) => opsSignature(each.ops)));
  const raw = data.suggestions.slice(0, TIDY_LIMITS.suggestions);
  if (data.suggestions.length > raw.length) {
    leftOut.push(
      `${data.suggestions.length - raw.length} more suggestions past the first ${TIDY_LIMITS.suggestions} were not read.`,
    );
  }
  for (const [index, entry] of raw.entries()) {
    const got = checkSuggestion(entry, index);
    if (typeof got === "string") {
      leftOut.push(got);
      continue;
    }
    const signature = opsSignature(got.ops);
    if (seen.has(signature)) {
      leftOut.push(
        `${quoted(got.title)} repeats a suggestion skipped or made already.`,
      );
      continue;
    }
    seen.add(signature);
    suggestions.push({
      ...got,
      id: tidySuggestionId(runId, firstIndex + suggestions.length),
    });
  }
  return { suggestions, leftOut };

  function checkSuggestion(
    entry: unknown,
    index: number,
  ): Omit<TidySuggestion, "id"> | string {
    if (!isRecord(entry)) return `Suggestion ${index + 1} was not an object.`;
    const kind: TidyKind = isTidyKind(entry.kind) ? entry.kind : "other";
    const reason = oneLine(entry.reason).slice(0, TIDY_LIMITS.reason);
    const rawOps = Array.isArray(entry.ops) ? entry.ops : [];
    let title = oneLine(entry.title).slice(0, TIDY_LIMITS.title);
    const named = () => title || `Suggestion ${index + 1}`;
    if (rawOps.length === 0) return `${quoted(named())} changes nothing.`;
    if (rawOps.length > LAYER_LIMITS.ops) {
      return `${quoted(named())} has ${rawOps.length} changes; a change holds at most ${LAYER_LIMITS.ops}.`;
    }
    const ops: ShoppingLayerOp[] = [];
    const warnings: string[] = [];
    const dropped = new Set<number>();
    const touched: TidyPromptRow[] = [];
    for (const rawOp of rawOps) {
      if (!isRecord(rawOp))
        return `${quoted(named())} has a change that is not an object.`;
      const op = rawOp.op;
      if (!(TIDY_MODEL_OPS as readonly unknown[]).includes(op)) {
        return `${quoted(named())} asks for “${oneLine(op)}”, which the list has no change for.`;
      }
      const numbers = Array.isArray(rawOp.rows) ? rawOp.rows : [];
      if (
        numbers.length === 0 ||
        !numbers.every((n) => typeof n === "number" && Number.isInteger(n))
      ) {
        return `${quoted(named())} has a ${op as string} that names no rows.`;
      }
      const wanted = [...new Set(numbers as number[])];
      const missing = wanted.find((n) => !byNumber.has(n));
      if (missing !== undefined) {
        return `${quoted(named())} names row ${missing}, which is not on the list.`;
      }
      const gone = wanted.find((n) => dropped.has(n));
      if (gone !== undefined) {
        return `${quoted(named())} changes ${byNumber.get(gone)!.name} after leaving it off.`;
      }
      const reached = wanted.map((n) => byNumber.get(n)!);
      touched.push(...reached);
      const ids = [...new Set(reached.flatMap((row) => row.ids))];
      const text = oneLine(rawOp.text);
      switch (op as TidyModelOp) {
        case "drop":
          if (!text) {
            return `${quoted(named())} leaves ${namesOf(reached)} off without saying why.`;
          }
          ops.push({
            op: "drop",
            ids,
            reason: text.slice(0, LAYER_LIMITS.reason),
          });
          for (const n of wanted) dropped.add(n);
          break;
        case "add": {
          const delta = readDelta(
            reached.length === 1 ? packageText(text, reached[0]) : text,
          );
          if (!delta) {
            return `${quoted(named())} adds “${text}” to ${namesOf(reached)}, which is not an amount the list reads.`;
          }
          ops.push({
            op: "amount",
            ids,
            add: delta.slice(0, LAYER_LIMITS.amount),
          });
          break;
        }
        case "merge":
          if (reached.length < 2) {
            return `${quoted(named())} merges ${namesOf(reached)} with nothing.`;
          }
          ops.push({
            op: "merge",
            ids,
            ...(text ? { name: text.slice(0, LAYER_LIMITS.name) } : {}),
          });
          warnings.push(...mergeWarnings(reached));
          break;
        case "rename":
          if (!text) {
            return `${quoted(named())} renames ${namesOf(reached)} to nothing.`;
          }
          ops.push({
            op: "rename",
            ids,
            name: text.slice(0, LAYER_LIMITS.name),
          });
          break;
        case "package": {
          if (reached.length > 1) {
            return `${quoted(named())} gives one package size for ${namesOf(reached)}: each row needs its own.`;
          }
          const row = reached[0];
          const size = packageText(text, row);
          if (!/\d/.test(size) || !readDelta(size)) {
            return `${quoted(named())} gives “${text}” for ${row.name}, which has no size the list reads.`;
          }
          /* The amount the list says already is no package size: nothing to do. */
          if (row.amount && sameAmount(size, row.amount)) break;
          ops.push({
            op: "amount",
            ids,
            amount: size.slice(0, LAYER_LIMITS.amount),
          });
          if (row.amount && smallerThan(size, row.amount)) {
            warnings.push(
              `The package (${size}) is less than the list needs (${row.amount.replace(/^≈\s*/, "")})`,
            );
          }
          /* The amount the recipes need stays under the row (Db4). */
          if (row.amount) {
            const needed = row.amount.replace(/^≈\s*/, "");
            ops.push({
              op: "note",
              ids,
              text: `${row.label.startsWith("≈") ? "≈ " : ""}${needed} needed`,
            });
          }
          if (!warnings.includes(PACKAGE_GUESS_WARNING)) {
            warnings.push(PACKAGE_GUESS_WARNING);
          }
          break;
        }
        case "check":
          ops.push({ op: "aisle", ids, aisle: "check" });
          break;
        case "note":
          if (!text) {
            return `${quoted(named())} adds an empty note to ${namesOf(reached)}.`;
          }
          ops.push({ op: "note", ids, text: text.slice(0, LAYER_LIMITS.text) });
          break;
        case "unit": {
          const asked = askedUnit(text);
          if (!asked.unit) {
            return `${quoted(named())} asks for ${namesOf(reached)} in “${text}”, a unit the list can't give.`;
          }
          ops.push({ op: "amount", ids, unit: asked.unit });
          break;
        }
      }
    }
    if (ops.length === 0) {
      return `${quoted(named())} changes nothing: each size it gives is the amount the list says already.`;
    }
    if (ops.length > LAYER_LIMITS.ops) {
      return `${quoted(named())} makes ${ops.length} changes; a change holds at most ${LAYER_LIMITS.ops}.`;
    }
    /* More of a row with nothing left off or made: the list counts every line already. */
    if (
      ops.some((op) => op.op === "amount" && op.add) &&
      !ops.some((op) => op.op === "drop" || op.op === "merge")
    ) {
      warnings.push(
        "Adds to a row without leaving anything off: the list already counts every recipe's lines",
      );
    }
    /* A drop with nothing else, of a line a recipe needs: said, not refused. */
    if (ops.every((op) => op.op === "drop")) {
      const needed = touched.filter((row) => !row.optional);
      if (needed.length > 0) {
        warnings.push(
          `Leaves off ${namesOf(needed)}, which a recipe needs, with nothing else on the list for it`,
        );
      }
    }
    if (!title) {
      title = `${TIDY_KIND_LABELS[kind]}: ${namesOf(touched.slice(0, 3))}`;
    }
    const confidence =
      typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? Math.min(1, Math.max(0, entry.confidence))
        : undefined;
    return {
      kind,
      title,
      reason,
      ops,
      warnings: [...new Set(warnings)].slice(0, TIDY_LIMITS.warnings),
      ...(confidence !== undefined ? { confidence } : {}),
    };
  }
}
