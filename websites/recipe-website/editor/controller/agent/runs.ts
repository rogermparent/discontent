/**
 * Agent runs as their surfaces see them (epic 44, 44c): `POST /api/agent`
 * and `GET /api/agent/<id>`, `recipes agent`, and 44d's curator page.
 *
 * - `startAgentRun` starts a run, or a follow-up of one (`runId`): the run
 *   must be an agent job that has ended — a continue while it (or another
 *   follow-up of it) is live is `job_live` (409), naming the live one —
 *   and must have a transcript. Answers at once with the new job's id; the
 *   work goes on in this process.
 * - `getAgentRunView` is `/api/jobs/<id>`'s view (the record, the step log
 *   from `from`) plus the transcript from its own byte offset
 *   (`transcriptFrom`, Ec4), Claude's raw blocks left out (`readableRecord`).
 *
 * Cancel is the jobs route's (`POST /api/jobs/<id>/cancel`): a run is a job.
 */
import type { CurationContext } from "../curation/context";
import {
  JobLiveError,
  NotFoundError,
  UsageError,
  withJob,
} from "../curation/errors";
import { corpusOf, startSpec } from "../jobs/kinds";
import { jobsDirectory } from "../jobs/location";
import {
  LIVE_STATUSES,
  listJobs,
  settleOrphanedJob,
  type JobMeta,
} from "../jobs/store";
import { getJobView, requireJob } from "../jobs/views";
import type { AgentRunInput, AgentRunView, AgentStartResult } from "./follow";
import { DEFAULT_AGENT_BUDGETS } from "./loop";
import {
  agentAvailable,
  agentUnavailableMessage,
  checkAgentPrompt,
} from "./job";
import {
  readTranscript,
  readTranscriptText,
  readableRecord,
} from "./transcript";

export type {
  AgentRunInput,
  AgentRunOutcome,
  AgentRunView,
  AgentStartResult,
} from "./follow";

/** A whole number of turns, 1 to E3's default (Ec7: a caller may only lower it). */
export function checkMaxTurns(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > DEFAULT_AGENT_BUDGETS.maxTurns
  ) {
    throw new UsageError(
      `maxTurns is a whole number from 1 to ${DEFAULT_AGENT_BUDGETS.maxTurns}.`,
    );
  }
  return value;
}

/** A meta read as live is checked against its process first (37c review). */
async function stillLive(dir: string, meta: JobMeta): Promise<boolean> {
  if (!LIVE_STATUSES.includes(meta.status)) return false;
  const settled = await settleOrphanedJob(dir, meta).then(
    (result) => result.meta,
    () => meta,
  );
  return LIVE_STATUSES.includes(settled.status);
}

/** A live follow-up of `id`, if one runs. */
async function liveFollowUpOf(
  id: string,
  dir: string,
): Promise<JobMeta | undefined> {
  for (const meta of await listJobs(dir)) {
    if (meta.kind !== "agent") continue;
    if ((meta.spec as { continues?: unknown } | undefined)?.continues !== id) {
      continue;
    }
    if (await stillLive(dir, meta)) return meta;
  }
  return undefined;
}

interface StartingGlobal {
  /** Per run, a follow-up being started in this process now (as Retry's guard). */
  __discontentAgentFollowUps?: Set<string>;
}

function followUpsStarting(): Set<string> {
  const global = globalThis as StartingGlobal;
  return (global.__discontentAgentFollowUps ??= new Set());
}

/** The run a follow-up continues, checked: an agent run, ended, with a transcript. */
async function continuable(runId: string, dir: string): Promise<JobMeta> {
  const meta = await requireJob(runId, dir);
  if (meta.kind !== "agent") {
    throw new UsageError(
      `Job ${meta.id} is a ${meta.kind} job, not an agent run: only an agent run can be continued.`,
    );
  }
  if (await stillLive(dir, meta)) {
    throw withJob(
      new JobLiveError(
        `Run ${meta.id} is still ${meta.status}: follow up once it has ended (or stop it first).`,
      ),
      meta.id,
    );
  }
  const live = await liveFollowUpOf(meta.id, dir);
  if (live) {
    throw withJob(
      new JobLiveError(
        `Run ${meta.id} is already being continued by ${live.id}: follow that one.`,
      ),
      live.id,
    );
  }
  if ((await readTranscriptText(dir, meta.id)) === undefined) {
    throw new UsageError(
      `Run ${meta.id} has no transcript to continue: ask again instead.`,
    );
  }
  return meta;
}

/**
 * Start a run (or a follow-up) with `ctx` — the caller as author, the
 * editor's caches revalidated by its writes. `background` is handed the
 * run's outcome so the route can keep its revalidation alive (`after()`,
 * as Retry does); without it the caller may await `done`.
 */
export async function startAgentRun(
  ctx: CurationContext,
  input: AgentRunInput,
  {
    dir = jobsDirectory(),
    background,
  }: {
    dir?: string;
    background?: (done: Promise<unknown>) => void;
  } = {},
): Promise<AgentStartResult & { done: Promise<unknown> }> {
  if (!agentAvailable()) throw new UsageError(agentUnavailableMessage());
  const prompt = checkAgentPrompt(input.prompt);
  const maxTurns = checkMaxTurns(input.maxTurns);
  const starting = followUpsStarting();
  let continues: string | undefined;
  if (input.runId !== undefined) {
    const meta = await continuable(input.runId, dir);
    if (starting.has(meta.id)) {
      throw withJob(
        new JobLiveError(
          `Run ${meta.id} is already being continued: follow that one.`,
        ),
        meta.id,
      );
    }
    continues = meta.id;
    starting.add(meta.id);
  }
  try {
    const started = await startSpec(
      {
        kind: "agent",
        ...corpusOf(ctx),
        prompt,
        ...(continues ? { continues } : {}),
        ...(maxTurns ? { maxTurns } : {}),
      },
      { ctx, dir },
    );
    background?.(started.done);
    return {
      job: started.job,
      status: "running",
      ...(continues ? { continues } : {}),
      done: started.done,
    };
  } finally {
    if (continues) starting.delete(continues);
  }
}

/** One run: the job's view, and its transcript from `transcriptFrom`. */
export async function getAgentRunView(
  id: string,
  {
    from = 0,
    transcriptFrom = 0,
    dir = jobsDirectory(),
  }: { from?: number; transcriptFrom?: number; dir?: string } = {},
): Promise<AgentRunView> {
  const view = await getJobView(id, { from, dir });
  if (view.meta.kind !== "agent") {
    throw new NotFoundError(`Job ${view.job} is not an agent run.`);
  }
  const { records, next } = await readTranscript(dir, view.job, transcriptFrom);
  return {
    ...view,
    transcript: records.map(readableRecord),
    transcriptNext: next,
  };
}
