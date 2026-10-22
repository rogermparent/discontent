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
import { llmConfig } from "../llm/client";
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
import { modelWords } from "./conversation";
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
}

/** What runs the curator here, or `undefined` with no model (no page, Ec9). */
export function curatorSetup(
  env: NodeJS.ProcessEnv = process.env,
): CuratorSetup | undefined {
  const config = llmConfig(env);
  if (!config) return undefined;
  const searchUrl = env.RECIPE_SEARCH_URL?.trim();
  return {
    model: modelWords(config),
    api: config.api === "anthropic" ? "anthropic" : "local",
    search:
      config.api === "anthropic" || (!!searchUrl && URL.canParse(searchUrl)),
  };
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
  const messages = text ? historyOf(transcriptRecords(text)) : [];
  const asks = messages.filter((message) => message.role === "user");
  const summary: Summary = {
    size,
    ...(asks[0] ? { firstAsk: asks[0].text } : {}),
    asks: asks.length,
    changes: changeCount(runChanges(messages)),
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
      }));
      const result = (meta.result ?? {}) as { stopReason?: AgentStopReason };
      return {
        id: meta.id,
        ask: askLine(summary.firstAsk ?? specOf(meta).prompt ?? meta.label),
        asks: Math.max(1, summary.asks),
        status: meta.status,
        ...(result.stopReason ? { stopReason: result.stopReason } : {}),
        queuedAt: meta.queuedAt,
        ...(meta.endedAt !== undefined ? { endedAt: meta.endedAt } : {}),
        changes: summary.changes,
      };
    }),
  );
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
  const changes = runChanges(text ? historyOf(transcriptRecords(text)) : []);
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
