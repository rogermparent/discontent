/**
 * What a Claude API run costs, estimated (44a, Ea7). An estimate and named
 * so: the prices are copied from platform.claude.com/docs/en/about-claude/
 * pricing as it read on 2026-10-21, and Anthropic's invoice is the truth.
 * A model the table does not list gets no estimate rather than a guess.
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

/** `claude-opus-4-5-20251101` → `claude-opus-4-5`: the table's key. */
export function modelPriceKey(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/-\d{8}$/, "");
}

/**
 * A turn's (or a run's) estimated cost in USD, or `undefined` for a model
 * the table does not list. `inputTokens` is the uncached input, as the
 * Messages API reports it beside the cache counts.
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
  const price = CLAUDE_PRICE_ESTIMATE_USD_PER_MTOK[modelPriceKey(model)];
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
