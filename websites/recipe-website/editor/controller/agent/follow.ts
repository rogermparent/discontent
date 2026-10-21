/**
 * Following an agent run to its end (epic 44, 44c): what `recipes agent`
 * does through either backend — the local one reads this machine's store,
 * the HTTP one `GET /api/agent/<id>` — and the shapes they share.
 *
 * Light on purpose (types and a loop): the HTTP backend loads it without the
 * job store, the loop or the tools.
 */
import type { JobView } from "../jobs/views";
import type { AgentJobResult } from "./job";
import type { TranscriptRecord } from "./transcript";

/** The longest ask the agent takes (Ec7): a prompt, not a document. */
export const AGENT_PROMPT_MAX = 4_000;

export interface AgentRunInput {
  prompt: string;
  /** The run to continue (a follow-up). */
  runId?: string;
  /** A lower turn budget than E3's 40. */
  maxTurns?: number;
}

export interface AgentStartResult {
  /** The new run's job id. */
  job: string;
  status: "running";
  /** The run it continues. */
  continues?: string;
}

export interface AgentRunView extends JobView {
  /** The transcript's records from `transcriptFrom` on (raw blocks left out). */
  transcript: TranscriptRecord[];
  /** The offset to ask the transcript from next. */
  transcriptNext: number;
}

/** How a run ended, as `recipes agent --json` prints it. */
export interface AgentRunOutcome extends Partial<AgentJobResult> {
  job: string;
  status: JobView["meta"]["status"];
  /** The job's own error when it failed outright (no model, a bad run id…). */
  failure?: { code: string; message: string };
}

export interface FollowOptions {
  /** Hears each read: the new step lines and transcript records. */
  onProgress?: (view: AgentRunView) => void;
  /**
   * Waits between reads; answers false to stop following (a Ctrl-C on a
   * remote run: the run goes on in the editor).
   */
  wait: () => Promise<boolean>;
}

/**
 * How often a followed run is read: a second, or `RECIPE_JOBS_FOLLOW_MS`
 * (as `jobs log --follow`; tests).
 */
export function agentFollowMs(env: NodeJS.ProcessEnv = process.env): number {
  const set = Number(env.RECIPE_JOBS_FOLLOW_MS);
  return Number.isFinite(set) && set > 0 ? set : 1_000;
}

/** A view's run as it ended: its result's fields, or the job's failure. */
export function agentOutcome(view: JobView): AgentRunOutcome {
  const result = (view.meta.result ?? {}) as Partial<AgentJobResult>;
  return {
    job: view.job,
    status: view.meta.status,
    ...result,
    ...(view.meta.error && result.stopReason === undefined
      ? {
          failure: {
            code: view.meta.error.code,
            message: view.meta.error.message,
          },
        }
      : {}),
  };
}

/**
 * Read a run from the start until it is no longer live, handing each read
 * to `onProgress`, and answer how it ended — or how it stood when `wait`
 * said stop.
 */
export async function followAgentRun(
  read: (from: number, transcriptFrom: number) => Promise<AgentRunView>,
  { onProgress, wait }: FollowOptions,
): Promise<AgentRunOutcome> {
  let from = 0;
  let transcriptFrom = 0;
  for (;;) {
    const view = await read(from, transcriptFrom);
    from = view.next;
    transcriptFrom = view.transcriptNext;
    onProgress?.(view);
    if (!view.live || !(await wait())) return agentOutcome(view);
  }
}
