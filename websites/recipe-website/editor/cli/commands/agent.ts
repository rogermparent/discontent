/**
 * `recipes agent "<ask>"` — the editor's agent from the shell (epic 44,
 * 44c): the configured model with the curator's tools, as the curator page
 * runs it. Locally it runs in this process against this content directory
 * (a committer is preflighted, as for any write); with `--remote` (or
 * `RECIPE_API_URL`) the editor runs it and this follows it.
 *
 * - Plain: the run as it happens on stdout — the model's words, each tool
 *   call (`→`) and its answer (`←`) — then how it ended. The job's step
 *   lines go to stderr as every job's do (a terminal, or `--verbose`).
 * - `--json`: one object at the end (`AgentRunOutcome`): `job`, `status`,
 *   `text`, `stopReason`, `error?`, `usage`, `turns`, `toolCalls`, `model`…
 * - `--run <id>` follows up on a run: its conversation is the history.
 * - `--max-turns N` lowers E3's 40.
 * - `--newer-web-tools` (46d) gives a Claude run the newer server web
 *   tools (dynamic filtering); a follow-up keeps its conversation's, and a
 *   local model ignores it (the job log says so).
 *
 * A Claude run stops at its cost budget (46d: `RECIPE_AGENT_MAX_COST_USD`,
 * default $1) with `stopReason: "budget:cost"`.
 *
 * Exits 1 when the run failed (`stopReason: "error"`, or no run at all),
 * 130 when it was cancelled. No MCP tool does this: an MCP client is an
 * agent already.
 */
import { UsageError } from "../../controller/curation/errors";
import {
  AGENT_PROMPT_MAX,
  type AgentRunOutcome,
  type AgentRunView,
} from "../../controller/agent/follow";
import type { TranscriptRecord } from "../../controller/agent/transcript";
import { formatJobLine } from "../../controller/jobs/log";
import {
  VERBOSE_OPTION,
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

/** How much of a tool call's input or answer a plain line shows. */
const LINE_CHARS = 160;

function oneLine(text: string, max = LINE_CHARS): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** A transcript record as the plain output prints it, or nothing. */
export function agentRecordLines(record: TranscriptRecord): string[] {
  if (record.type !== "message") return [];
  const { message } = record;
  if (message.role === "user") return [`> ${oneLine(message.text, 400)}`];
  if (message.role === "tool") {
    let summary = "ok";
    if (message.isError) {
      summary = `error: ${oneLine(message.content)}`;
    } else {
      try {
        const parsed = JSON.parse(message.content) as {
          error?: { code?: string; message?: string };
        };
        if (parsed?.error?.message) {
          summary = `error (${parsed.error.code ?? "?"}): ${oneLine(parsed.error.message)}`;
        }
      } catch {
        /* Page text, or JSON cut short: not an error object. */
      }
      if (summary === "ok") summary = `ok (${message.content.length} chars)`;
    }
    return [`  ← ${message.name}: ${summary}`];
  }
  const lines: string[] = [];
  if (message.text.trim()) lines.push(message.text.trim());
  for (const use of message.serverToolUses ?? []) {
    lines.push(
      `  → ${use.name} (server) ${oneLine(JSON.stringify(use.input))}`,
    );
  }
  for (const call of message.toolCalls) {
    lines.push(`  → ${call.name} ${oneLine(JSON.stringify(call.input))}`);
  }
  return lines;
}

/** Prints each new read of the run (plain mode). */
function printer(remoteSteps: boolean): (view: AgentRunView) => void {
  return (view) => {
    if (remoteSteps) {
      for (const line of view.lines) {
        process.stderr.write(`${formatJobLine(view.job, line)}\n`);
      }
    }
    for (const record of view.transcript) {
      /* A follow-up's transcript begins with the earlier conversation: shown already. */
      if (record.job !== view.job) continue;
      for (const line of agentRecordLines(record)) {
        process.stdout.write(`${line}\n`);
      }
    }
  };
}

function usageLine(outcome: AgentRunOutcome): string | undefined {
  const usage = outcome.usage;
  if (!usage) return undefined;
  const tokens = `${usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens} in / ${usage.outputTokens} out tokens`;
  const cost =
    usage.costEstimateUsd !== undefined
      ? `, ~$${usage.costEstimateUsd.toFixed(3)}`
      : "";
  return `${outcome.turns ?? 0} turns, ${outcome.toolCalls ?? 0} tool calls, ${tokens}${cost}`;
}

export const agentCommand: CommandDef<AgentRunOutcome> = {
  name: "agent",
  usage:
    'recipes agent "<ask>" [--run <id>] [--max-turns 1-40] [--newer-web-tools] [--verbose] [--json]',
  options: {
    run: { type: "string" },
    "max-turns": { type: "string" },
    "newer-web-tools": { type: "boolean" },
    ...VERBOSE_OPTION,
  },
  write: true,
  async run({ backend, positionals, options, json }) {
    const prompt = positionals.join(" ").trim();
    if (!prompt) {
      throw new UsageError(
        'recipes agent needs an ask: recipes agent "find three vegetarian dinners under 45 minutes"',
      );
    }
    if (prompt.length > AGENT_PROMPT_MAX) {
      throw new UsageError(
        `The ask is ${prompt.length} characters, over the ${AGENT_PROMPT_MAX}-character cap.`,
      );
    }
    const rawTurns = stringOption(options, "max-turns");
    const maxTurns = numberOption(options, "max-turns");
    if (
      rawTurns !== undefined &&
      (maxTurns === undefined || !Number.isInteger(maxTurns) || maxTurns < 1)
    ) {
      throw new UsageError("--max-turns takes a whole number from 1 to 40.");
    }
    const runId = stringOption(options, "run");
    return backend.runAgent(
      {
        prompt,
        ...(runId ? { runId } : {}),
        ...(maxTurns !== undefined ? { maxTurns } : {}),
        ...(booleanOption(options, "newer-web-tools")
          ? { newerWebTools: true }
          : {}),
      },
      json
        ? {}
        : {
            onProgress: printer(
              backend.kind === "http" && booleanOption(options, "verbose"),
            ),
          },
    );
  },
  format(outcome) {
    const lines: string[] = [""];
    if (outcome.failure) {
      lines.push(`failed: ${outcome.failure.message}`);
    } else if (outcome.status === "running") {
      lines.push(
        `still running in the editor: recipes jobs log ${outcome.job} --follow (or recipes jobs cancel ${outcome.job})`,
      );
    } else {
      const stop = outcome.stopReason ?? outcome.status;
      lines.push(
        `${stop === "done" ? "done" : `stopped: ${stop}`}${outcome.error ? ` — ${outcome.error}` : ""}`,
      );
    }
    const usage = usageLine(outcome);
    if (usage) lines.push(usage);
    lines.push(
      `run ${outcome.job}${outcome.model ? ` (${outcome.model})` : ""} — follow up: recipes agent --run ${outcome.job} "…"`,
    );
    return lines.join("\n");
  },
  exitCode(outcome) {
    if (outcome.status === "cancelled" || outcome.stopReason === "cancelled") {
      return 130;
    }
    if (
      outcome.failure ||
      outcome.stopReason === "error" ||
      outcome.status === "failed" ||
      outcome.status === "interrupted"
    ) {
      return 1;
    }
    return 0;
  },
};
