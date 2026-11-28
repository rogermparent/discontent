/**
 * The curator page's server side (epic 44, 44d): what runs it, its recent
 * conversations, and what a run changed with the recipes' cards.
 *
 * - `curatorSetup` — the model in words and whether web search is on
 *   (Claude: always, E6/Ec6; a local model: `RECIPE_SEARCH_URL` set). Never
 *   the key, never a URL.
 * - `listCuratorRuns` — the `agent` jobs as **conversations** (Ed3): a run
 *   another run continues is left out, since the newest run of a
 *   conversation holds all of it (Ec3); each row names the conversation's
 *   first ask, how many asks it holds, its newest run's status and how many
 *   things it changed (`runChanges` over the whole transcript).
 * - `curatorRunChanges` — `runChanges` for one run, each recipe with its
 *   card's fields read from the content (a recipe since deleted or renamed
 *   away is marked `missing`).
 */
import { getRecipeBySlug } from "recipe-website-common/controller/data/read";
import {
  DEFAULT_CLAUDE_MODEL,
  takesNewerWebTools,
  type LlmConfig,
} from "../llm/client";
import {
  agentCostBudget,
  CURATOR_CLAUDE_KEY_ENV,
  CURATOR_CLAUDE_MODEL_ENV,
  curatorModels,
  type CuratorModelId,
} from "./job";
import { heldCalls } from "./held";
import { readDecisions } from "./reviewStore";
import { appliedSummaries } from "./review";
import { hasHeadsUp } from "./runSummary";
import { jobsDirectory } from "../jobs/location";
import {
  LIVE_STATUSES,
  listJobs,
  settleOrphanedJob,
  type JobMeta,
  type JobStatus,
} from "../jobs/store";
import { requireJob } from "../jobs/views";
import { NotFoundError } from "../curation/errors";
import { changeCount, runChanges, type ChangedRecipe } from "./changes";
import type { RunChanges } from "./changes";
import { claudeModelName, modelWords } from "./conversation";
import { readReviewNotes } from "./reviewNoteStore";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
  transcriptSize,
} from "./transcript";
import type { AgentStopReason } from "./types";

export interface CuratorSetup {
  /** "Claude Sonnet 5 through the API", "qwen3:8b on this machine". */
  model: string;
  /** Claude's API, or a local model's. */
  api: "anthropic" | "local";
  /** Whether the curator can search the web (E6). */
  search: boolean;
  /**
   * Whether a run can take Claude's newer web tools (46d): Claude, on a
   * model that has them (`takesNewerWebTools`). The ask box's checkbox.
   */
  newerWebTools: boolean;
  /**
   * 48b (Db5): who may answer an ask, the editor's own model first — two
   * where the editor has both a local model and the Claude API. The fields
   * above are the first's.
   */
  models?: CuratorModelOption[];
  /**
   * Models this editor could offer but can't yet, each with why (Roger,
   * 2026-11-20, 48-close #12): on a local-model editor with no Claude key,
   * Claude shows as a disabled choice that says what to set, so the option
   * is apparent. Kept apart from `models`, which lists only what a run may
   * pick.
   */
  unavailable?: CuratorUnavailableModel[];
}

/** A model shown but not offered (48-close #12). */
export interface CuratorUnavailableModel {
  id: CuratorModelId;
  /** "Claude Sonnet 5 through the API". */
  words: string;
  /** What to set to offer it; never a key. */
  why: string;
}

/** One model an ask may pick (48b, Db5). */
export interface CuratorModelOption {
  id: CuratorModelId;
  /** "Claude Sonnet 5 through the API", "qwen3:8b on this machine". */
  words: string;
  /** "Claude Sonnet 5", "qwen3:8b": its name alone. */
  name: string;
  api: "anthropic" | "local";
  search: boolean;
  newerWebTools: boolean;
  /** A run's cost budget (46d), for a priced model. */
  maxCostUsd?: number;
  /** What its recent runs here cost, cheapest to dearest (Claude only). */
  costRange?: { min: number; max: number; runs: number };
}

function modelOption(
  id: CuratorModelId,
  config: LlmConfig,
  env: NodeJS.ProcessEnv,
): CuratorModelOption {
  const searchUrl = env.RECIPE_SEARCH_URL?.trim();
  const claude = config.api === "anthropic";
  const budget = agentCostBudget(config, env).maxCostUsd;
  return {
    id,
    words: modelWords(config),
    name: claude ? claudeModelName(config.model) : config.model,
    api: claude ? "anthropic" : "local",
    search: claude || (!!searchUrl && URL.canParse(searchUrl)),
    newerWebTools: claude && takesNewerWebTools(config.model),
    ...(budget !== undefined ? { maxCostUsd: budget } : {}),
  };
}

/** What runs the curator here, or `undefined` with no model (no page, Ec9). */
export function curatorSetup(
  env: NodeJS.ProcessEnv = process.env,
): CuratorSetup | undefined {
  const models = curatorModels(env);
  if (!models.primary) return undefined;
  /* 51d (Dd2): the curator's own model, then the import model, then Claude. */
  const order: CuratorModelId[] =
    models.primary === "claude"
      ? ["claude", "local"]
      : ["local", "import", "claude"];
  const options = order.flatMap((id) => {
    const config = models[id];
    return config ? [modelOption(id, config, env)] : [];
  });
  const first = options[0];
  const unavailable: CuratorUnavailableModel[] = models.claude
    ? []
    : [
        {
          id: "claude",
          words: `${claudeModelName(
            env[CURATOR_CLAUDE_MODEL_ENV]?.trim() || DEFAULT_CLAUDE_MODEL,
          )} through the API`,
          why: `Not set up here: add ${CURATOR_CLAUDE_KEY_ENV} to this editor's editor/.env to offer it`,
        },
      ];
  return {
    model: first.words,
    api: first.api,
    search: first.search,
    newerWebTools: first.newerWebTools,
    models: options,
    ...(unavailable.length ? { unavailable } : {}),
  };
}

/**
 * The setup with each priced model's recent cost range (48b): the
 * cheapest and dearest of the listed runs it answered.
 */
export function withCostRanges(
  setup: CuratorSetup,
  runs: readonly CuratorRunRow[],
): CuratorSetup {
  const models = (setup.models ?? []).map((option) => {
    if (option.api !== "anthropic") return option;
    const costs = runs.flatMap((run) =>
      run.api === "anthropic" && run.costUsd !== undefined ? [run.costUsd] : [],
    );
    if (costs.length === 0) return option;
    return {
      ...option,
      costRange: {
        min: Math.min(...costs),
        max: Math.max(...costs),
        runs: costs.length,
      },
    };
  });
  return { ...setup, models };
}

export interface CuratorRunRow {
  /** The newest run of the conversation: what `?run=` opens. */
  id: string;
  /** The conversation's first ask, its first line (≤ 120 characters). */
  ask: string;
  /** Asks in the conversation: the first and each follow-up. */
  asks: number;
  status: JobStatus;
  stopReason?: AgentStopReason;
  queuedAt: number;
  endedAt?: number;
  /** Recipes, terms, plans and places it changed (`changeCount`). */
  changes: number;
  /** 48b: held writes still waiting for the person's review. */
  review: number;
  /** 48b: held writes the person saved. */
  saved: number;
  /** 48b: the model its newest run answered on, by name ("Claude Sonnet 5"). */
  model?: string;
  api?: "anthropic" | "local";
  /** 48b: the conversation's estimated cost (Claude), every run's summed. */
  costUsd?: number;
  /** 48b: its last answer carries a heads-up (Db7). */
  headsUp?: true;
  /** 51e2: Claude Code left a review note on this run. */
  reviewed?: true;
}

/** The first line of an ask, for a list. */
export function askLine(text: string, max = 120): string {
  const line =
    text
      .split("\n")
      .find((part) => part.trim())
      ?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A transcript read once per size: an ended run's never changes. */
interface Summary {
  size: number;
  firstAsk?: string;
  asks: number;
  changes: number;
  /** 48b: the conversation's held calls, by id and the run each was made in. */
  held: { id: string; job: string }[];
  costUsd?: number;
  headsUp: boolean;
  model?: string;
  api?: "anthropic" | "local";
}

interface SummaryGlobal {
  __discontentCuratorSummaries?: Map<string, Summary>;
}

/** At most this many summaries are kept (a long-lived editor's store). */
const SUMMARY_CACHE_MAX = 500;

function summaryCache(): Map<string, Summary> {
  const global = globalThis as SummaryGlobal;
  return (global.__discontentCuratorSummaries ??= new Map());
}

async function summarize(dir: string, id: string): Promise<Summary> {
  const size = (await transcriptSize(dir, id)) ?? 0;
  const cache = summaryCache();
  const known = cache.get(`${dir}\0${id}`);
  if (known && known.size === size) return known;
  const text = size > 0 ? await readTranscriptText(dir, id) : undefined;
  const records = text ? transcriptRecords(text) : [];
  const messages = historyOf(records);
  const asks = messages.filter((message) => message.role === "user");
  let costUsd: number | undefined;
  let model: string | undefined;
  let api: "anthropic" | "local" | undefined;
  for (const record of records) {
    if (record.type === "end" && record.costEstimate !== undefined) {
      costUsd = (costUsd ?? 0) + record.costEstimate;
    }
    if (record.type === "start") {
      api = record.api === "anthropic" ? "anthropic" : "local";
      model =
        record.api === "anthropic"
          ? claudeModelName(record.model)
          : record.model;
    }
  }
  const lastAnswer = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.text.trim());
  const summary: Summary = {
    size,
    ...(asks[0] ? { firstAsk: asks[0].text } : {}),
    asks: asks.length,
    changes: changeCount(runChanges(messages)),
    held: heldCalls(records).map((call) => ({ id: call.id, job: call.job })),
    ...(costUsd !== undefined ? { costUsd } : {}),
    headsUp:
      lastAnswer?.role === "assistant" ? hasHeadsUp(lastAnswer.text) : false,
    ...(model ? { model } : {}),
    ...(api ? { api } : {}),
  };
  if (cache.size >= SUMMARY_CACHE_MAX) cache.clear();
  cache.set(`${dir}\0${id}`, summary);
  return summary;
}

/** A meta as a reader should see it: a dead live job closed first (37c). */
async function settled(dir: string, meta: JobMeta): Promise<JobMeta> {
  if (!LIVE_STATUSES.includes(meta.status)) return meta;
  return settleOrphanedJob(dir, meta).then(
    (result) => result.meta,
    () => meta,
  );
}

function specOf(meta: JobMeta): { prompt?: string; continues?: string } {
  const spec = (meta.spec ?? {}) as { prompt?: unknown; continues?: unknown };
  return {
    ...(typeof spec.prompt === "string" ? { prompt: spec.prompt } : {}),
    ...(typeof spec.continues === "string"
      ? { continues: spec.continues }
      : {}),
  };
}

/** The recent conversations, newest first (Ed3). */
export async function listCuratorRuns({
  dir = jobsDirectory(),
  limit = 20,
}: { dir?: string; limit?: number } = {}): Promise<CuratorRunRow[]> {
  const agents = (await listJobs(dir)).filter((meta) => meta.kind === "agent");
  const continued = new Set(
    agents.flatMap((meta) => {
      const { continues } = specOf(meta);
      return continues ? [continues] : [];
    }),
  );
  const heads = agents
    .filter((meta) => !continued.has(meta.id))
    .slice(0, Math.max(1, limit));
  return Promise.all(
    heads.map(async (raw): Promise<CuratorRunRow> => {
      const meta = await settled(dir, raw);
      const summary = await summarize(dir, meta.id).catch((): Summary => ({
        size: 0,
        asks: 0,
        changes: 0,
        held: [],
        headsUp: false,
      }));
      const result = (meta.result ?? {}) as { stopReason?: AgentStopReason };
      /* 48b: the held calls' decisions are read fresh (they change). */
      const decisions =
        summary.held.length > 0
          ? await readDecisions(dir, summary.held).catch(() => new Map())
          : new Map();
      const applied = [...decisions.values()].filter(
        (decision) => decision.state === "applied",
      );
      const appliedChanges = changeCount(
        runChanges(
          [],
          applied.flatMap((decision) =>
            decision.summary ? [decision.summary] : [],
          ),
        ),
      );
      /* 51e2: a note by Claude Code on the newest run marks the row. */
      const notes = await readReviewNotes(dir, meta.id).catch(() => []);
      return {
        id: meta.id,
        ask: askLine(summary.firstAsk ?? specOf(meta).prompt ?? meta.label),
        asks: Math.max(1, summary.asks),
        status: meta.status,
        ...(result.stopReason ? { stopReason: result.stopReason } : {}),
        queuedAt: meta.queuedAt,
        ...(meta.endedAt !== undefined ? { endedAt: meta.endedAt } : {}),
        changes: summary.changes + appliedChanges,
        review: summary.held.filter((call) => !decisions.has(call.id)).length,
        saved: applied.length,
        ...(summary.model ? { model: summary.model } : {}),
        ...(summary.api ? { api: summary.api } : {}),
        ...(summary.costUsd !== undefined ? { costUsd: summary.costUsd } : {}),
        ...(summary.headsUp ? { headsUp: true as const } : {}),
        ...(notes.some((note) => note.by === "claude-code")
          ? { reviewed: true as const }
          : {}),
      };
    }),
  );
}

/** What ⌘K says of the curator (48b): runs waiting for review, and who answers. */
export interface CuratorPaletteSummary {
  review: {
    /** Conversations with held writes waiting. */
    runs: number;
    /** Held writes waiting, over them. */
    calls: number;
    /** The newest such conversation: its ask and its run. */
    first?: { id: string; ask: string };
  };
  /** The ask's default model, by name. */
  model: string;
  api: "anthropic" | "local";
  search: boolean;
  /** What its recent runs cost (Claude). */
  costRange?: { min: number; max: number; runs: number };
}

/** ⌘K's curator summary (48b): the review count and the hand-off's words. */
export async function curatorPaletteSummary({
  dir = jobsDirectory(),
  env = process.env,
}: { dir?: string; env?: NodeJS.ProcessEnv } = {}): Promise<
  CuratorPaletteSummary | undefined
> {
  const setup = curatorSetup(env);
  if (!setup) return undefined;
  const runs = await listCuratorRuns({ dir, limit: 20 });
  const waiting = runs.filter((run) => run.review > 0);
  const first = withCostRanges(setup, runs).models?.[0];
  return {
    review: {
      runs: waiting.length,
      calls: waiting.reduce((sum, run) => sum + run.review, 0),
      ...(waiting[0]
        ? { first: { id: waiting[0].id, ask: waiting[0].ask } }
        : {}),
    },
    model: first?.name ?? setup.model,
    api: setup.api,
    search: setup.search,
    ...(first?.costRange ? { costRange: first.costRange } : {}),
  };
}

/** A changed recipe with its card's fields, as the page draws it. */
export interface CuratorChangedRecipe extends ChangedRecipe {
  name: string;
  date?: number;
  image?: string;
  tags?: string[];
  /** Not in the content now: deleted, or renamed by a later write. */
  missing?: true;
}

export interface CuratorRunChanges extends Omit<RunChanges, "recipes"> {
  recipes: CuratorChangedRecipe[];
}

/** At most this many recipes get a card read (a run that tagged 300). */
export const CHANGED_RECIPE_CARDS_MAX = 48;

/**
 * What run `id` changed — over its whole conversation (the newest run's
 * transcript holds every earlier one, Ec3) — with each recipe's card read
 * from `contentDirectory`. Not an agent run is `not_found`.
 */
export async function curatorRunChanges(
  id: string,
  {
    dir = jobsDirectory(),
    contentDirectory,
  }: { dir?: string; contentDirectory: string },
): Promise<CuratorRunChanges> {
  const meta = await requireJob(id, dir);
  if (meta.kind !== "agent") {
    throw new NotFoundError(`Job ${meta.id} is not an agent run.`);
  }
  const text = await readTranscriptText(dir, meta.id);
  const records = text ? transcriptRecords(text) : [];
  /* 48b: and what the person's approvals of its held writes wrote. */
  const changes = runChanges(
    historyOf(records),
    await appliedSummaries(records, dir),
  );
  const recipes = await Promise.all(
    changes.recipes.map(
      async (recipe, index): Promise<CuratorChangedRecipe> => {
        const fallback = { ...recipe, name: recipe.name ?? recipe.slug };
        if (index >= CHANGED_RECIPE_CARDS_MAX) return fallback;
        try {
          const stored = await getRecipeBySlug({
            slug: recipe.slug,
            contentDirectory,
          });
          return {
            ...recipe,
            name: stored.name || fallback.name,
            ...(typeof stored.date === "number" ? { date: stored.date } : {}),
            ...(typeof stored.image === "string"
              ? { image: stored.image }
              : {}),
            ...(Array.isArray(stored.tags) ? { tags: stored.tags } : {}),
          };
        } catch {
          return { ...fallback, missing: true };
        }
      },
    ),
  );
  return { ...changes, recipes };
}
