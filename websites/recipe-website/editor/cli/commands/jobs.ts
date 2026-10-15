/**
 * `recipes jobs show <id>` — one job's record and its step log (epic 37).
 *
 * Reads this machine's job store (`RECIPE_JOBS_DIR`, else `editor/jobs/`),
 * where every process here — the editor, the CLI, the stdio MCP server —
 * writes its jobs. `<id>` is the whole ULID, or the eight characters the
 * step lines show (`[job 4V2Q9K7M]`), or any unique end or start of it.
 * The rest of `jobs …` (list, log --follow, cancel, retry) is 37c.
 */
import { NotFoundError, UsageError } from "../../controller/curation/errors";
import { formatJobLine, type JobLine } from "../../controller/jobs/log";
import type { JobMeta } from "../../controller/jobs/store";
import type { CommandDef } from "./types";

export interface JobShowResult {
  job: JobMeta;
  /** The step log, line by line (`log.ts`'s `JobLine`). */
  steps: JobLine[];
}

function when(epoch: number | undefined): string | undefined {
  return epoch === undefined ? undefined : new Date(epoch).toISOString();
}

export const jobsShowCommand: CommandDef<JobShowResult> = {
  name: "jobs show",
  usage: "recipes jobs show <id> [--json]",
  options: {},
  async run({ backend, positionals }) {
    const id = positionals[0];
    if (!id) {
      throw new UsageError(
        "jobs show needs a job id (or the eight characters its step lines show).",
      );
    }
    if (backend.kind === "http") {
      throw new UsageError(
        "jobs show reads this machine's job store (RECIPE_JOBS_DIR); a remote editor's jobs are not served over its API yet.",
      );
    }
    const { jobsDirectory } = await import("../../controller/jobs/location");
    const { findJob, readJobLog } = await import("../../controller/jobs/store");
    const dir = jobsDirectory();
    const job = await findJob(dir, id);
    if (!job) {
      throw new NotFoundError(
        `No job "${id}" in ${dir} (or more than one matches: give more of its id).`,
      );
    }
    const { lines } = await readJobLog(dir, job.id);
    return { job, steps: lines };
  },
  format({ job, steps }) {
    const took =
      job.startedAt !== undefined && job.endedAt !== undefined
        ? `${((job.endedAt - job.startedAt) / 1000).toFixed(1)} s`
        : undefined;
    return [
      `${job.id}  ${job.kind}  ${job.status}${took ? `  ${took}` : ""}`,
      `  ${job.label}`,
      `  started ${when(job.startedAt ?? job.queuedAt)}${job.endedAt ? `, ended ${when(job.endedAt)}` : ""}`,
      `  pid ${job.pid} on ${job.host}, ${job.tier}`,
      job.error
        ? `  error: ${job.error.code}: ${job.error.message}`
        : undefined,
      ...steps.map((line) => formatJobLine(job.id, line)),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const jobsCommands: Record<string, CommandDef<unknown>> = {
  show: jobsShowCommand as CommandDef<unknown>,
};
