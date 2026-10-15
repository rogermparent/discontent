/**
 * Run work as a job (epic 37, 37a): a meta and a step log in the store, the
 * work run **inline** — no queue yet (37b) — so every import has a job id
 * and a step log, whatever surface started it.
 *
 * `runJob(init, fn)` writes the meta (`running`), opens the log, runs
 * `fn(log, signal)` inside a top-level `job` step, and writes the outcome:
 * `done` with the result, or `failed` with the error (rethrown). D6's
 * surfaced warnings (`log.surface`) are merged into the result's `warnings`.
 *
 * The store never fails the work: a jobs directory that cannot be written
 * (a read-only disk, a bad `RECIPE_JOBS_DIR`) is said once on stderr and the
 * job runs with a log that writes nowhere — an import is worth more than its
 * record.
 *
 * The first job in a process sweeps the store first (D5: dead writers'
 * jobs become `interrupted`) and prunes it (D1, at most hourly). The editor
 * also sweeps at boot (`src/instrumentation.ts`).
 */
import { ulid } from "@discontent/cms/util/ulid";
import { toErrorObject } from "../curation/errors";
import { jobsDirectory } from "./location";
import {
  createJobLog,
  defaultJobMirror,
  type JobLog,
  type JobMirror,
} from "./log";
import {
  logPath,
  newJobMeta,
  pruneJobs,
  sweepJobs,
  updateJobMeta,
  writeJobMeta,
  type JobMeta,
  type JobTier,
} from "./store";

export interface JobInit {
  kind: string;
  label: string;
  /** JSON, no secrets, enough to run it again (`kinds.ts`). */
  spec: unknown;
  tier?: JobTier;
  resources?: string[];
}

export interface RunJobOptions {
  /** Default `jobsDirectory()`. */
  dir?: string;
  /** Default the process's (`defaultJobMirror`); `null` mirrors nowhere. */
  mirror?: JobMirror | null;
}

export interface JobOutcome<T> {
  job: string;
  result: T;
}

/** Directories this process has swept and pruned. */
const maintained = new Map<string, Promise<void>>();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sweep and prune `dir` once per process (the prune itself is hourly).
 * Housekeeping only: a failure is a line on stderr.
 */
export function maintainJobs(dir: string = jobsDirectory()): Promise<void> {
  let done = maintained.get(dir);
  if (!done) {
    done = (async () => {
      try {
        await sweepJobs(dir);
        await pruneJobs(dir);
      } catch (error) {
        console.warn(`[jobs] could not tidy ${dir}: ${describe(error)}`);
      }
    })();
    maintained.set(dir, done);
  }
  return done;
}

/** The result with the surfaced warnings added to its `warnings`, once each. */
export function withSurfacedWarnings<T>(
  result: T,
  surfaced: readonly string[],
): T {
  if (surfaced.length === 0) return result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const own = (result as { warnings?: unknown }).warnings;
  const warnings = Array.isArray(own) ? [...(own as string[])] : [];
  for (const message of surfaced) {
    if (!warnings.includes(message)) warnings.push(message);
  }
  return { ...result, warnings };
}

let storeWarned = false;

/**
 * Run `fn` as a job. Resolves with the job's id and its result; a failure
 * is recorded and rethrown as it was.
 */
export async function runJob<T>(
  init: JobInit,
  fn: (log: JobLog, signal: AbortSignal) => Promise<T>,
  { dir = jobsDirectory(), mirror }: RunJobOptions = {},
): Promise<JobOutcome<T>> {
  await maintainJobs(dir);
  const id = ulid();
  const now = Date.now();
  const meta: JobMeta = {
    ...newJobMeta(id, { ...init, status: "running" }, now),
    startedAt: now,
  };
  let stored = true;
  try {
    await writeJobMeta(dir, meta);
  } catch (error) {
    stored = false;
    if (!storeWarned) {
      storeWarned = true;
      console.warn(
        `[jobs] could not write to ${dir} (${describe(error)}); jobs run without a record`,
      );
    }
  }
  const log = createJobLog({
    id,
    ...(stored ? { file: logPath(dir, id) } : {}),
    mirror: mirror === null ? undefined : (mirror ?? defaultJobMirror()),
  });
  const record = async (patch: Partial<JobMeta>) => {
    if (!stored) return;
    await updateJobMeta(dir, id, patch).catch((error) => {
      console.warn(
        `[job ${id}] could not record its outcome: ${describe(error)}`,
      );
    });
  };
  /* 37b's cancel aborts it; nothing does yet. */
  const controller = new AbortController();
  try {
    const result = withSurfacedWarnings(
      await log.step("job", { kind: init.kind, label: init.label }, () =>
        fn(log, controller.signal),
      ),
      log.surfaced,
    );
    await record({ status: "done", endedAt: Date.now(), result });
    return { job: id, result };
  } catch (error) {
    await record({
      status: "failed",
      endedAt: Date.now(),
      error: toErrorObject(error).error,
    });
    throw error;
  }
}
