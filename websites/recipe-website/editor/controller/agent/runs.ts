/**
 * Agent runs as their surfaces see them (epic 44, 44c): `POST /api/agent`
 * and `GET /api/agent/<id>`, `recipes agent`, and 44d's curator page.
 *
 * - `startAgentRun` starts a run, or a follow-up of one (`runId`): the run
 *   must be an agent job that has ended — a continue while it (or another
 *   follow-up of it) is live is `job_live` (409), naming the live one —
 *   and must have a transcript no longer than `AGENT_TRANSCRIPT_MAX_BYTES`,
 *   recorded against this content directory. The check and the start are
 *   one step (44c review): in this process a set of runs being continued,
 *   across processes (the CLI beside the editor) a lock file per run
 *   (epic 37's `fileLock`), so two follow-ups of one run never both start.
 *   Answers at once with the new job's id; the work goes on in this
 *   process.
 * - `getAgentRunView` is `/api/jobs/<id>`'s view (the record, the step log
 *   from `from`) plus the transcript from its own byte offset
 *   (`transcriptFrom`, Ec4), Claude's raw blocks left out (`readableRecord`).
 *
 * Cancel is the jobs route's (`POST /api/jobs/<id>/cancel`): a run is a job.
 */
import path from "node:path";
import {
  LockTimeoutError,
  acquireLock,
  processIdentity,
  releaseLock,
  type LockRecord,
} from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import type { CurationContext } from "../curation/context";
import {
  JobLiveError,
  NotFoundError,
  UsageError,
  ValidationError,
  withJob,
} from "../curation/errors";
import { corpusOf, resolvedDirectory, startSpec } from "../jobs/kinds";
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
import { readTranscript, readableRecord, transcriptSize } from "./transcript";

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

/**
 * The longest conversation a follow-up continues (44c review): 2 MB of
 * transcript. Each follow-up copies the whole conversation (Ec3) and sends
 * it to the model again; past this it is time to start afresh.
 */
export const AGENT_TRANSCRIPT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * A follow-up refused because the conversation is too long (Ec11):
 * `validation`, and 413 from `POST /api/agent`.
 */
export class ConversationTooLongError extends ValidationError {
  constructor(runId: string, bytes: number) {
    super(
      `This conversation is long (run ${runId}'s transcript is ${Math.round(bytes / 1024)} KB, over ${AGENT_TRANSCRIPT_MAX_BYTES / 1024 / 1024} MB) — start a new one.`,
    );
    this.name = "ConversationTooLongError";
  }
}

interface StartingGlobal {
  /** Per run, a follow-up being started in this process now (as Retry's guard). */
  __discontentAgentFollowUps?: Set<string>;
}

function followUpsStarting(): Set<string> {
  const global = globalThis as StartingGlobal;
  return (global.__discontentAgentFollowUps ??= new Set());
}

/** The lock record's id field. */
const CONTINUE_LOCK_ID = "continueId";
/** How long a follow-up waits for another process's check-and-start. */
export const CONTINUE_LOCK_WAIT_MS = 10_000;
/** A continue lock this old is a crashed holder's (a start takes well under it). */
const CONTINUE_LOCK_STALE_MS = 60_000;

/** `<run id>.continue.lock` in the job store: one per run being continued. */
export function continueLockPath(dir: string, runId: string): string {
  return path.join(dir, `${runId}.continue.lock`);
}

/**
 * Run `fn` holding the run's continue lock: the check-and-start across
 * processes. Another process's start in flight is waited for (it is short);
 * one that outlasts `waitMs` is `job_live`.
 */
async function withContinueLock<T>(
  dir: string,
  runId: string,
  waitMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const file = continueLockPath(dir, runId);
  const id = ulid();
  const record: LockRecord & Record<string, unknown> = {
    ...processIdentity(),
    [CONTINUE_LOCK_ID]: id,
    op: "agent follow-up",
  };
  try {
    await acquireLock(file, record, {
      idKey: CONTINUE_LOCK_ID,
      deadline: Date.now() + waitMs,
      staleMs: CONTINUE_LOCK_STALE_MS,
    });
  } catch (error) {
    if (error instanceof LockTimeoutError) {
      throw withJob(
        new JobLiveError(
          `Run ${runId} is being continued by another process: follow that one.`,
        ),
        runId,
      );
    }
    throw error;
  }
  try {
    return await fn();
  } finally {
    await releaseLock(file, CONTINUE_LOCK_ID, id).catch(() => undefined);
  }
}

/**
 * The run a follow-up continues, checked: an agent run, ended, recorded
 * against this content directory (as Retry checks, 37c), with a transcript
 * under the cap. Read afresh: the caller holds the run's continue guard.
 */
async function continuable(
  runId: string,
  dir: string,
  ctx: CurationContext,
): Promise<JobMeta> {
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
  const recorded = (meta.spec as { contentDirectory?: unknown } | undefined)
    ?.contentDirectory;
  if (typeof recorded === "string") {
    const [there, here] = await Promise.all([
      resolvedDirectory(recorded),
      resolvedDirectory(ctx.contentDirectory),
    ]);
    if (there !== here) {
      throw new UsageError(
        `Run ${meta.id} ran against ${recorded}, not this content directory (${ctx.contentDirectory}): follow it up from a process that uses that directory, or ask afresh here.`,
      );
    }
  }
  const bytes = await transcriptSize(dir, meta.id);
  if (bytes === undefined) {
    throw new UsageError(
      `Run ${meta.id} has no transcript to continue: ask again instead.`,
    );
  }
  if (bytes > AGENT_TRANSCRIPT_MAX_BYTES) {
    throw new ConversationTooLongError(meta.id, bytes);
  }
  return meta;
}

/**
 * Start a run (or a follow-up) with `ctx` — the caller as author, the
 * editor's caches revalidated by its writes. `background` is handed the
 * run's outcome so the route can keep its revalidation alive (`after()`,
 * as Retry does); without it the caller may await `done`.
 *
 * A follow-up's run id is resolved first and marked as being continued
 * **before** any check (44c review: checks across awaits let a double-click
 * start two), in this process and — through the run's continue lock — in
 * every process sharing the store; the mark is held until the new job's
 * record is written (`startSpec` answers after it), so a later check sees
 * it as a live follow-up.
 */
export async function startAgentRun(
  ctx: CurationContext,
  input: AgentRunInput,
  {
    dir = jobsDirectory(),
    background,
    continueLockWaitMs = CONTINUE_LOCK_WAIT_MS,
  }: {
    dir?: string;
    background?: (done: Promise<unknown>) => void;
    /** How long to wait for another process's follow-up start (tests). */
    continueLockWaitMs?: number;
  } = {},
): Promise<AgentStartResult & { done: Promise<unknown> }> {
  if (!agentAvailable()) throw new UsageError(agentUnavailableMessage());
  const prompt = checkAgentPrompt(input.prompt);
  const maxTurns = checkMaxTurns(input.maxTurns);
  if (
    input.newerWebTools !== undefined &&
    typeof input.newerWebTools !== "boolean"
  ) {
    throw new UsageError("newerWebTools is true or false.");
  }

  const start = async (
    continues: string | undefined,
    /** The conversation's setting: a follow-up keeps the newer web tools (46d). */
    inheritedNewer = false,
  ) => {
    const newerWebTools = inheritedNewer || input.newerWebTools === true;
    const started = await startSpec(
      {
        kind: "agent",
        ...corpusOf(ctx),
        prompt,
        ...(continues ? { continues } : {}),
        ...(maxTurns ? { maxTurns } : {}),
        ...(newerWebTools ? { newerWebTools: true } : {}),
      },
      { ctx, dir },
    );
    background?.(started.done);
    return {
      job: started.job,
      status: "running" as const,
      ...(continues ? { continues } : {}),
      done: started.done,
    };
  };

  if (input.runId === undefined) return start(undefined);

  const runId = (await requireJob(input.runId, dir)).id;
  const starting = followUpsStarting();
  if (starting.has(runId)) {
    throw withJob(
      new JobLiveError(
        `Run ${runId} is already being continued: follow that one.`,
      ),
      runId,
    );
  }
  starting.add(runId);
  try {
    return await withContinueLock(dir, runId, continueLockWaitMs, async () => {
      const earlier = await continuable(runId, dir, ctx);
      return start(
        runId,
        (earlier.spec as { newerWebTools?: unknown } | undefined)
          ?.newerWebTools === true,
      );
    });
  } finally {
    starting.delete(runId);
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
  const { records, next, more } = await readTranscript(
    dir,
    view.job,
    transcriptFrom,
  );
  return {
    ...view,
    transcript: records.map(readableRecord),
    transcriptNext: next,
    ...(more ? { transcriptMore: true } : {}),
  };
}
