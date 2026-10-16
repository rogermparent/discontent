/**
 * `recipes jobs …` — the job store (epic 37): `list`, `show`, `log
 * [--follow]`, `cancel`, `retry`.
 *
 * Through the backend like every other command (37c): locally, this
 * machine's store (`RECIPE_JOBS_DIR`, else `editor/jobs/`), where every
 * process here — the editor, the CLI, the stdio MCP server — writes its
 * jobs; with `--remote`, the editor's, over `/api/jobs`. `<id>` is the
 * whole ULID, or the eight characters the step lines show
 * (`[job 4V2Q9K7M]`), or any unique end or start of it.
 *
 * - `cancel` stops a job wherever it runs (`requestJobCancel`: its own
 *   process's abort, or `<id>.cancel` for another's).
 * - `retry` runs a job's recorded spec again with **this** process's
 *   context; a corpus job recorded against another content directory is
 *   refused (`usage`). Locally it runs here and prints its end; remotely
 *   the editor starts it and the answer is its new id (`jobs log <id>
 *   --follow` watches it).
 */
import { UsageError } from "../../controller/curation/errors";
import { formatJobLine, type JobLine } from "../../controller/jobs/log";
import type { JobMeta, JobStatus } from "../../controller/jobs/store";
import type {
  JobCancelResult,
  JobListResult,
  JobRecord,
  JobRetryResult,
  JobSummary,
} from "../../controller/jobs/views";
import {
  JOB_LIST_MAX_LIMIT,
  JOB_STATUS_FILTERS,
} from "../../controller/jobs/listing";
import {
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

export interface JobShowResult {
  /** The job's id, as `job` is in every other result. */
  job: string;
  /** Its record: kind, label, status, times, the spec summarised, result or error. */
  meta: JobRecord;
  /** The step log, line by line (`log.ts`'s `JobLine`). */
  steps: JobLine[];
}

export interface JobLogResult {
  job: string;
  status: JobStatus;
  /** Every line read (with `--follow`, until the job ended). */
  lines: JobLine[];
  /** The byte offset after the last line: `--from` for the next read. */
  next: number;
}

const STATUSES: readonly string[] = JOB_STATUS_FILTERS;

/** How often `jobs log --follow` asks (`RECIPE_JOBS_FOLLOW_MS` for tests). */
function followMs(): number {
  const set = Number(process.env.RECIPE_JOBS_FOLLOW_MS);
  return Number.isFinite(set) && set > 0 ? set : 1_000;
}

function when(epoch: number | undefined): string | undefined {
  return epoch === undefined ? undefined : new Date(epoch).toISOString();
}

function seconds(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : `${(ms / 1000).toFixed(1)} s`;
}

function needId(positionals: string[], command: string): string {
  const id = positionals[0];
  if (!id) {
    throw new UsageError(
      `jobs ${command} needs a job id (or the eight characters its step lines show).`,
    );
  }
  return id;
}

/** How long it took, once it ended. */
function tookLine(meta: Pick<JobMeta, "startedAt" | "endedAt">) {
  return meta.startedAt !== undefined && meta.endedAt !== undefined
    ? seconds(meta.endedAt - meta.startedAt)
    : undefined;
}

export const jobsListCommand: CommandDef<JobListResult> = {
  name: "jobs list",
  usage: `recipes jobs list [--status ${STATUSES.join("|")}] [--kind <kind>] [--limit 1-${JOB_LIST_MAX_LIMIT}] [--json]`,
  options: {
    status: { type: "string" },
    kind: { type: "string" },
    limit: { type: "string" },
  },
  async run({ backend, options }) {
    const status = stringOption(options, "status");
    if (status !== undefined && !STATUSES.includes(status)) {
      throw new UsageError(
        `--status takes ${STATUSES.join(", ")} — not "${status}".`,
      );
    }
    const limit = numberOption(options, "limit");
    if (
      stringOption(options, "limit") !== undefined &&
      (limit === undefined ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > JOB_LIST_MAX_LIMIT)
    ) {
      throw new UsageError(
        `--limit takes a whole number from 1 to ${JOB_LIST_MAX_LIMIT}.`,
      );
    }
    const kind = stringOption(options, "kind");
    return backend.listJobs({
      ...(status ? { status: status as JobStatus | "live" } : {}),
      ...(kind ? { kind } : {}),
      ...(limit ? { limit } : {}),
    });
  },
  format({ jobs, total, more }) {
    if (jobs.length === 0) return "No jobs.";
    const rows = jobs.map((job: JobSummary) => [
      job.id,
      job.status,
      job.kind,
      seconds(job.durationMs) ?? "",
      when(job.startedAt ?? job.queuedAt)
        ?.slice(0, 19)
        .replace("T", " ") ?? "",
      job.label,
    ]);
    const widths = rows[0].map((_, column) =>
      Math.max(...rows.map((row) => row[column].length)),
    );
    const lines = rows.map((row) =>
      row
        .map((cell, column) =>
          column === row.length - 1 ? cell : cell.padEnd(widths[column]),
        )
        .join("  "),
    );
    if (more) lines.push(`… ${total - jobs.length} more (--limit)`);
    return lines.join("\n");
  },
};

export const jobsShowCommand: CommandDef<JobShowResult> = {
  name: "jobs show",
  usage: "recipes jobs show <id> [--json]",
  options: {},
  async run({ backend, positionals }) {
    const view = await backend.getJob(needId(positionals, "show"));
    return { job: view.job, meta: view.meta, steps: view.lines };
  },
  format({ meta: job, steps }) {
    const took = tookLine(job);
    return [
      `${job.id}  ${job.kind}  ${job.status}${took ? `  ${took}` : ""}`,
      `  ${job.label}`,
      `  started ${when(job.startedAt ?? job.queuedAt)}${job.endedAt ? `, ended ${when(job.endedAt)}` : ""}`,
      `  pid ${job.pid} on ${job.host}, ${job.tier}`,
      job.retryOf ? `  runs ${job.retryOf} again` : undefined,
      job.error
        ? `  error: ${job.error.code}: ${job.error.message}`
        : undefined,
      ...steps.map((line) => formatJobLine(job.id, line)),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const jobsLogCommand: CommandDef<JobLogResult> = {
  name: "jobs log",
  usage: "recipes jobs log <id> [--follow] [--from <byte>] [--json]",
  options: {
    follow: { type: "boolean", short: "f" },
    from: { type: "string" },
  },
  /*
   * `--follow` asks from `next` until the job ends, then once more for the
   * last lines. Without `--json` each batch is printed as it arrives (the
   * format then adds only the status); with it, stdout stays one object.
   */
  async run({ backend, positionals, options, json }) {
    const id = needId(positionals, "log");
    const follow = booleanOption(options, "follow");
    const rawFrom = stringOption(options, "from");
    if (rawFrom !== undefined && !/^\d+$/.test(rawFrom)) {
      throw new UsageError(`--from takes a byte offset (0 or more).`);
    }
    let from = rawFrom === undefined ? 0 : Number(rawFrom);
    const lines: JobLine[] = [];
    let view = await backend.getJob(id, { from });
    const print = (batch: JobLine[], jobId: string) => {
      if (!follow || json) return;
      for (const line of batch) {
        process.stdout.write(`${formatJobLine(jobId, line)}\n`);
      }
    };
    lines.push(...view.lines);
    print(view.lines, view.job);
    from = view.next;
    while (follow && view.live) {
      await new Promise((resolve) => setTimeout(resolve, followMs()));
      view = await backend.getJob(view.job, { from });
      lines.push(...view.lines);
      print(view.lines, view.job);
      from = view.next;
      if (!view.live) {
        /* Ended: whatever was written after that read. */
        const last = await backend.getJob(view.job, { from });
        lines.push(...last.lines);
        print(last.lines, view.job);
        from = last.next;
      }
    }
    return {
      job: view.job,
      status: view.meta.status,
      lines,
      next: from,
      ...(follow && !json ? { printed: true } : {}),
    } as JobLogResult;
  },
  format(result) {
    const printed = (result as { printed?: boolean }).printed === true;
    return [
      ...(printed
        ? []
        : result.lines.map((line) => formatJobLine(result.job, line))),
      `${result.job} ${result.status}`,
    ].join("\n");
  },
  exitCode({ status }) {
    return status === "done" || status === "running" || status === "queued"
      ? 0
      : 1;
  },
};

export const jobsCancelCommand: CommandDef<JobCancelResult> = {
  name: "jobs cancel",
  usage: "recipes jobs cancel <id> [--json]",
  options: {},
  async run({ backend, positionals }) {
    return backend.cancelJob(needId(positionals, "cancel"));
  },
  format({ job, outcome, status }) {
    switch (outcome) {
      case "cancelled":
        return `${job} cancelled.`;
      case "requested":
        return `${job}: cancel asked of the process that runs it — it stops within a second.`;
      default:
        return `${job} had already ended (${status}).`;
    }
  },
};

export const jobsRetryCommand: CommandDef<JobRetryResult> = {
  name: "jobs retry",
  usage: "recipes jobs retry <id> [--json]",
  options: {},
  write: true,
  async run({ backend, positionals }) {
    return backend.retryJob(needId(positionals, "retry"));
  },
  format({ job, retryOf, status, error }) {
    return [
      `${job} runs ${retryOf} again: ${status}`,
      error ? `  error: ${error.code}: ${error.message}` : undefined,
      status === "running"
        ? `  follow it: recipes jobs log ${job} --follow`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  },
  exitCode({ status }) {
    return status === "done" || status === "running" ? 0 : 1;
  },
};

export const jobsCommands: Record<string, CommandDef<unknown>> = {
  list: jobsListCommand as CommandDef<unknown>,
  show: jobsShowCommand as CommandDef<unknown>,
  log: jobsLogCommand as CommandDef<unknown>,
  cancel: jobsCancelCommand as CommandDef<unknown>,
  retry: jobsRetryCommand as CommandDef<unknown>,
};
