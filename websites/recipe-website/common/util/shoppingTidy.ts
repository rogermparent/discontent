/**
 * 50b: "Tidy with the model" — a whole-list pass by a model that proposes
 * the judgement calls 49's checker refused: leave off what a step makes,
 * fry in the oil already on the list, make the cinnamon sugar, buy store
 * sizes, check the cupboard first. Types and pure helpers only: the page,
 * the CLI and the MCP read runs with them; the job (the model client,
 * `node:fs`) never reaches the browser (47i's Ti7).
 *
 * A **run** is one pass, kept as one file under this list's directory
 * (`SHOPPING_LIST_PATHS.tidy`): the model, what it read the list as
 * (`on`), its suggestions and each one's status. A suggestion is a set of
 * 50a ops on item ids with one reason; **Accept** writes it as one layer
 * (`from: <suggestion id>`, `by: {kind: "model", model}`), **Skip** says
 * so, and a suggestion whose items have left the list is **stale**.
 * Nothing the model says reaches the list until a person accepts it (the
 * "AI changes need approval" rule).
 */
import { describeOp } from "./shoppingChanges";
import { parseShoppingLayerOp, type ShoppingLayerOp } from "./shoppingLayers";
import type { ShoppingItem } from "./shoppingTypes";

/** What a suggestion is (Db4), each with the words a card heads with. */
export const TIDY_KINDS = [
  "drop",
  "combine",
  "make",
  "merge",
  "store-size",
  "check",
  "swap",
  "rename",
  "other",
] as const;

export type TidyKind = (typeof TIDY_KINDS)[number];

export const TIDY_KIND_LABELS: Record<TidyKind, string> = {
  drop: "Leave off",
  combine: "Combine",
  make: "Make it",
  merge: "Merge",
  "store-size": "Store sizes",
  check: "Check at home",
  swap: "Swap",
  rename: "Rename",
  other: "Change",
};

export function isTidyKind(value: unknown): value is TidyKind {
  return (TIDY_KINDS as readonly unknown[]).includes(value);
}

/** What a run read: the list with its accepted changes, or as written plus rules. */
export type TidyOn = "current" | "original";

/** A suggestion's state in its run: stored, but `stale` is worked out on read. */
export type TidyStatus = "pending" | "accepted" | "skipped" | "stale";

/** The warning a store-size suggestion always carries (Db4). */
export const PACKAGE_GUESS_WARNING = "Package size is the model's guess";

/** Bounds a run is read within (and the job writes). */
export const TIDY_LIMITS = {
  suggestions: 40,
  title: 120,
  reason: 600,
  warning: 200,
  warnings: 8,
  note: 1000,
  leftOut: 40,
  model: 80,
} as const;

/** One judgement call, as a card shows it. */
export interface TidySuggestion {
  /** `<run id>-<n>`: what Accept, Skip and Ask name. */
  id: string;
  kind: TidyKind;
  /** "Fry in the vegetable oil you're already buying". */
  title: string;
  reason: string;
  /** 50a's ops on item ids: what Accept writes as one layer. */
  ops: ShoppingLayerOp[];
  /** Said on the card, never a refusal: "49's rules keep salts apart". */
  warnings: string[];
  /** The model's own 0–1, when it gave one. */
  confidence?: number;
  /** Db6: the card was asked again with a note, and this is the answer. */
  revised?: { note: string; at: string; model: string };
}

/** What a run stores about one suggestion: its state, and what Accept wrote. */
export interface TidySuggestionState {
  status: "pending" | "accepted" | "skipped";
  at?: string;
  /** The layer Accept wrote. */
  layer?: string;
  /** 50c: accepted as the person edited it (the layer keeps the model's). */
  edited?: true;
}

/** One numbered row the model read, for the record (scoring, 50c's cards). */
export interface TidyRunRow {
  n: number;
  key: string;
  label: string;
  ids: string[];
}

/** One pass of the model over the list (Db5), one file. */
export interface TidyRun {
  /** A lowercase ULID: names the file, sorts by when it ran. */
  id: string;
  /** The model's label: "qwen3:8b", "Claude Sonnet 5". */
  model: string;
  /** The choice it ran on (`TidyModelChoice.id`): what "run it again" picks. */
  choice: string;
  on: TidyOn;
  /** ISO time it was asked. */
  at: string;
  /** Whether the model thought first. */
  think?: boolean;
  suggestions: TidySuggestion[];
  status: Record<string, TidySuggestionState>;
  /** What the structural check left out, as sentences (Db4). */
  leftOut: string[];
  rows?: TidyRunRow[];
  durationMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

/** A model a run may pick (Db2): 50c's picker reads these. */
export interface TidyModelChoice {
  /** "qwen3:8b", "qwen3:14b", "claude": what `model` names. */
  id: string;
  /** "qwen3:8b on this machine", "Claude Sonnet 5 through the API". */
  words: string;
  /** Its name alone. */
  name: string;
  api: "anthropic" | "local";
  /** The one a run takes when none is named. */
  default?: boolean;
}

/** A model shown but not offered, and why (48-close #12's shape). */
export interface TidyUnavailableModel {
  id: string;
  words: string;
  /** What to do to offer it; never a key. */
  why: string;
}

export interface TidyModels {
  models: TidyModelChoice[];
  unavailable: TidyUnavailableModel[];
}

/** What starts a run (the page, the API, the CLI). */
export interface TidyStart {
  /** A choice's id; the default when absent. */
  model?: string;
  on?: TidyOn;
  /** Keep nothing: the run is in the job's result only (the measurement). */
  dryRun?: boolean;
}

/** One suggestion as the surfaces show it: its state now, and its ops in words. */
export interface TidySuggestionView extends TidySuggestion {
  status: TidyStatus;
  /** Its ops, as the Changes panel would say them. */
  text: string[];
  /** Accepted: the layer it wrote. */
  layer?: string;
  /** 50c: accepted as the person edited it. */
  edited?: true;
}

export interface TidyRunView extends Omit<TidyRun, "suggestions" | "status"> {
  suggestions: TidySuggestionView[];
  counts: Record<TidyStatus, number>;
}

/** A suggestion's id: the run's, then its place. */
export function tidySuggestionId(runId: string, index: number): string {
  return `${runId}-${index + 1}`;
}

export const TIDY_RUN_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/;
export const TIDY_SUGGESTION_ID_PATTERN =
  /^([0-9a-hjkmnp-tv-z]{26})-(\d{1,3})$/;

/** The run a suggestion id belongs to, or `undefined` when it is none. */
export function runIdOfSuggestion(id: string): string | undefined {
  return TIDY_SUGGESTION_ID_PATTERN.exec(id.trim().toLowerCase())?.[1];
}

/**
 * A signature of a set of ops (Db4, Db5): the same change asked twice reads
 * alike. A leave-off, an aisle and a note are signed by what they do to
 * which items, not by their words ("a step makes it" and "the recipe makes
 * it" are one leave-off); an amount, a merge's or a rename's name by value.
 */
export function opsSignature(ops: readonly ShoppingLayerOp[]): string {
  return JSON.stringify(
    ops
      .map((op) => {
        const ids = [...op.ids].sort();
        switch (op.op) {
          case "drop":
          case "note":
            return JSON.stringify({ op: op.op, ids });
          case "aisle":
            return JSON.stringify({ op: op.op, ids, aisle: op.aisle });
          default: {
            const { ids: _ids, ...rest } = op;
            void _ids;
            return JSON.stringify({ ...rest, ids });
          }
        }
      })
      .sort(),
  );
}

/** Every item id a suggestion's ops name. */
export function suggestionItemIds(suggestion: TidySuggestion): string[] {
  return [...new Set(suggestion.ops.flatMap((op) => op.ids))];
}

/**
 * A suggestion's status now (Db5): what is stored, or — still pending —
 * `stale` once any of its items has left the list (Accept would name an
 * item that is not there, and the seat refuses that).
 */
export function tidyStatusOf(
  run: TidyRun,
  suggestion: TidySuggestion,
  present: ReadonlySet<string>,
): TidyStatus {
  const stored = run.status[suggestion.id]?.status ?? "pending";
  if (stored !== "pending") return stored;
  return suggestionItemIds(suggestion).every((id) => present.has(id))
    ? "pending"
    : "stale";
}

/** A run with each suggestion's status and its ops in words. */
export function tidyRunView(
  run: TidyRun,
  items: readonly ShoppingItem[],
): TidyRunView {
  const present = new Set(items.map((item) => item.id));
  const byId = new Map(items.map((item) => [item.id, item]));
  const counts: Record<TidyStatus, number> = {
    pending: 0,
    accepted: 0,
    skipped: 0,
    stale: 0,
  };
  const suggestions = run.suggestions.map((suggestion) => {
    const status = tidyStatusOf(run, suggestion, present);
    counts[status] += 1;
    const layer = run.status[suggestion.id]?.layer;
    return {
      ...suggestion,
      status,
      text: suggestion.ops.map((op) => describeOp(op, byId)),
      ...(layer ? { layer } : {}),
      ...(run.status[suggestion.id]?.edited ? { edited: true as const } : {}),
    };
  });
  const { suggestions: _s, status: _t, ...rest } = run;
  void _s;
  void _t;
  return { ...rest, suggestions, counts };
}

/** Runs newest first. */
export function sortTidyRuns(runs: readonly TidyRun[]): TidyRun[] {
  return [...runs].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

// --- reading a stored run, leniently --------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const line = value.replace(/\s+/g, " ").trim();
  return line ? line.slice(0, max) : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseSuggestion(raw: unknown): TidySuggestion | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().toLowerCase() : "";
  if (!TIDY_SUGGESTION_ID_PATTERN.test(id)) return null;
  const ops = (Array.isArray(raw.ops) ? raw.ops : [])
    .map(parseShoppingLayerOp)
    .filter((op): op is ShoppingLayerOp => op !== null);
  if (ops.length === 0) return null;
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : [])
    .map((each) => text(each, TIDY_LIMITS.warning))
    .filter((each): each is string => !!each)
    .slice(0, TIDY_LIMITS.warnings);
  const confidence =
    typeof raw.confidence === "number" &&
    raw.confidence >= 0 &&
    raw.confidence <= 1
      ? raw.confidence
      : undefined;
  const revised =
    isRecord(raw.revised) && typeof raw.revised.note === "string"
      ? {
          note: raw.revised.note.trim().slice(0, TIDY_LIMITS.note),
          at: typeof raw.revised.at === "string" ? raw.revised.at : "",
          model: text(raw.revised.model, TIDY_LIMITS.model) ?? "",
        }
      : undefined;
  return {
    id,
    kind: isTidyKind(raw.kind) ? raw.kind : "other",
    title: text(raw.title, TIDY_LIMITS.title) ?? TIDY_KIND_LABELS.other,
    reason: text(raw.reason, TIDY_LIMITS.reason) ?? "",
    ops,
    warnings,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(revised ? { revised } : {}),
  };
}

function parseState(raw: unknown): TidySuggestionState | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (status !== "pending" && status !== "accepted" && status !== "skipped") {
    return null;
  }
  return {
    status,
    ...(typeof raw.at === "string" ? { at: raw.at } : {}),
    ...(typeof raw.layer === "string" ? { layer: raw.layer } : {}),
    ...(raw.edited === true ? { edited: true as const } : {}),
  };
}

/**
 * A stored run, read leniently as a layer is: `null` without a usable id;
 * a suggestion that does not parse is dropped, the rest kept. The file
 * name is the id (`fallbackId`).
 */
export function parseTidyRun(
  raw: unknown,
  fallbackId?: string,
): TidyRun | null {
  if (!isRecord(raw)) return null;
  const id = (
    fallbackId ?? (typeof raw.id === "string" ? raw.id : "")
  ).toLowerCase();
  if (!TIDY_RUN_ID_PATTERN.test(id)) return null;
  const suggestions = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
    .slice(0, TIDY_LIMITS.suggestions)
    .map(parseSuggestion)
    .filter(
      (each): each is TidySuggestion =>
        each !== null && each.id.startsWith(`${id}-`),
    );
  const status: Record<string, TidySuggestionState> = {};
  if (isRecord(raw.status)) {
    for (const suggestion of suggestions) {
      const state = parseState(raw.status[suggestion.id]);
      if (state) status[suggestion.id] = state;
    }
  }
  const rows = Array.isArray(raw.rows)
    ? raw.rows.flatMap((row): TidyRunRow[] =>
        isRecord(row) &&
        typeof row.n === "number" &&
        typeof row.key === "string" &&
        typeof row.label === "string" &&
        Array.isArray(row.ids)
          ? [
              {
                n: row.n,
                key: row.key,
                label: row.label,
                ids: row.ids.filter(
                  (each): each is string => typeof each === "string",
                ),
              },
            ]
          : [],
      )
    : undefined;
  const numbers = {
    durationMs: count(raw.durationMs),
    promptTokens: count(raw.promptTokens),
    outputTokens: count(raw.outputTokens),
    costEstimateUsd: count(raw.costEstimateUsd),
  };
  return {
    id,
    model: text(raw.model, TIDY_LIMITS.model) ?? "a model",
    choice: text(raw.choice, TIDY_LIMITS.model) ?? "",
    on: raw.on === "original" ? "original" : "current",
    at: typeof raw.at === "string" ? raw.at : "",
    ...(typeof raw.think === "boolean" ? { think: raw.think } : {}),
    suggestions,
    status,
    leftOut: (Array.isArray(raw.leftOut) ? raw.leftOut : [])
      .map((each) => text(each, TIDY_LIMITS.reason))
      .filter((each): each is string => !!each)
      .slice(0, TIDY_LIMITS.leftOut),
    ...(rows ? { rows } : {}),
    ...Object.fromEntries(
      Object.entries(numbers).filter(([, value]) => value !== undefined),
    ),
  };
}

/** A run as stored: its keys in this order (stable diffs). */
export function serializeTidyRun(run: TidyRun): string {
  const ordered = {
    id: run.id,
    model: run.model,
    choice: run.choice,
    on: run.on,
    at: run.at,
    ...(run.think !== undefined ? { think: run.think } : {}),
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    ...(run.promptTokens !== undefined
      ? { promptTokens: run.promptTokens }
      : {}),
    ...(run.outputTokens !== undefined
      ? { outputTokens: run.outputTokens }
      : {}),
    ...(run.costEstimateUsd !== undefined
      ? { costEstimateUsd: run.costEstimateUsd }
      : {}),
    suggestions: run.suggestions,
    status: run.status,
    leftOut: run.leftOut,
    ...(run.rows ? { rows: run.rows } : {}),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** What a model is told it was refused before, so it does not repeat it (Db5). */
export function skippedSuggestions(runs: readonly TidyRun[]): TidySuggestion[] {
  return runs.flatMap((run) =>
    run.suggestions.filter(
      (suggestion) => run.status[suggestion.id]?.status === "skipped",
    ),
  );
}

/** A note on one card, asked again (Db6). */
export interface TidyAskStart {
  /** The suggestion's id. */
  suggestion: string;
  note: string;
  /** A choice's id; the run's own model when absent. */
  model?: string;
}

/** The job's numbers, as an ask's are. */
export interface TidyNumbers {
  model?: string;
  choice?: string;
  durationMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
  /** The `num_ctx` asked of a local model. */
  numCtx?: number;
  think?: boolean;
}

/** What a `shopping-tidy` job answers. */
export type ShoppingTidyResult =
  | (TidyNumbers & {
      task: "tidy";
      status: "done";
      /** The run as kept (or, `dryRun`, as it would be). */
      run: TidyRun;
    })
  | (TidyNumbers & {
      task: "revise";
      status: "done";
      run: TidyRun;
      /** The card that took the old one's place. */
      suggestion: TidySuggestion;
    })
  | (TidyNumbers & {
      task: "tidy" | "revise";
      status: "failed";
      problem: string;
      /** What the check left out, when that is why. */
      leftOut?: string[];
    });

/** A result of this kind, read from a job record (the page's poll). */
export function isShoppingTidyResult(
  value: unknown,
): value is ShoppingTidyResult {
  return (
    isRecord(value) &&
    (value.task === "tidy" || value.task === "revise") &&
    (value.status === "done" || value.status === "failed")
  );
}

/** A note on a card is at most this long. */
export const TIDY_NOTE_MAX = TIDY_LIMITS.note;

/** 50c: the runs the page's "Earlier runs" lists, newest first (Dc8). */
export const TIDY_RUNS_SHOWN = 20;
