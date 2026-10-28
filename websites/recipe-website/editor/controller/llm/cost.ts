/**
 * What a Claude API run costs, estimated (44a, Ea7). An estimate and named
 * so: the prices are copied from platform.claude.com/docs/en/about-claude/
 * pricing as it read on 2026-10-21, and Anthropic's invoice is the truth.
 * A Claude model the table does not list (a new one) is estimated at the
 * table's highest rates (46d), so a run's cost budget still holds; any
 * other model (a local one) gets no estimate.
 */
import type { AgentUsage } from "../agent/types";

/** USD per million tokens: base input, output, 5-minute cache write, cache read. */
export interface PriceEstimate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Per-model prices (USD / MTok), 2026-10-21. Claude Haiku 5.5 is priced by
 * prompt size; the table holds its lower tier (prompts up to 100,000
 * tokens), which an agent turn stays under. Keyed by model id without a
 * date suffix (`modelPriceKey`).
 */
export const CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK: Readonly<
  Record<string, PriceEstimate>
> = {
  "claude-fable-5-1": {
    input: 10,
    output: 50,
    cacheWrite: 12.5,
    cacheRead: 0.25,
  },
  "claude-mythos-5-1": {
    input: 10,
    output: 50,
    cacheWrite: 12.5,
    cacheRead: 0.25,
  },
  "claude-fable-5": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  "claude-mythos-5": { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheWrite: 2.5,
    cacheRead: 0.1,
  },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
  },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

/** Web search: $10 per 1,000 searches (web fetch costs only its tokens). */
export const WEB_SEARCH_PRICE_ESTIMATE_USD = 0.01;

/**
 * The table's highest rate of each kind (46d): what an unlisted Claude model
 * is estimated at — never less than it could cost.
 */
export const HIGHEST_PRICE_ESTIMATE_USD_PER_MTOK: Readonly<PriceEstimate> =
  (() => {
    const prices = Object.values(CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK);
    const most = (key: keyof PriceEstimate) =>
      Math.max(...prices.map((price) => price[key]));
    return {
      input: most("input"),
      output: most("output"),
      cacheWrite: most("cacheWrite"),
      cacheRead: most("cacheRead"),
    };
  })();

/** `claude-opus-4-5-20251101` → `claude-opus-4-5`: the table's key. */
export function modelPriceKey(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/-\d{8}$/, "");
}

/**
 * How `model` is priced (46d): its row of the table (`listed`), the
 * table's highest rates for a Claude model it does not list (`highest`),
 * or `undefined` for any other model — a local one has no price.
 */
export function modelPrice(
  model: string,
): { price: PriceEstimate; basis: "listed" | "highest" } | undefined {
  const key = modelPriceKey(model);
  const listed = CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK[key];
  if (listed) return { price: listed, basis: "listed" };
  if (key.startsWith("claude-")) {
    return { price: HIGHEST_PRICE_ESTIMATE_USD_PER_MTOK, basis: "highest" };
  }
  return undefined;
}

/**
 * A turn's (or a run's) estimated cost in USD, or `undefined` for a model
 * with no price (`modelPrice`: not Claude's). `inputTokens` is the uncached
 * input, as the Messages API reports it beside the cache counts.
 */
export function claudeCostEstimate(
  model: string,
  usage: Pick<
    AgentUsage,
    | "inputTokens"
    | "outputTokens"
    | "cacheReadTokens"
    | "cacheWriteTokens"
    | "webSearchRequests"
  >,
): number | undefined {
  const price = modelPrice(model)?.price;
  if (!price) return undefined;
  const dollars =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.cacheReadTokens * price.cacheRead) /
      1_000_000 +
    usage.webSearchRequests * WEB_SEARCH_PRICE_ESTIMATE_USD;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

/**
 * A run's cost budget (46d): about $1 a run, Roger's figure for the Claude
 * curator (epic 46's context), unless `RECIPE_AGENT_MAX_COST_USD` says
 * otherwise. A model with no price gets no cap: it has no estimate to check.
 */
export const DEFAULT_AGENT_MAX_COST_USD = 1;

/** "$1.00": a budget in dollars, to the cent. */
export function dollarText(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** How a run the cost budget ended is said, everywhere (46d). */
export function costBudgetWords(maxUsd: number): string {
  return `Stopped at the cost budget (${dollarText(maxUsd)})`;
}
