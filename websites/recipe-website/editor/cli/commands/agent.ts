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
 *   tools (dynamic filtering) on a model that takes them; a follow-up keeps
 *   its conversation's, and any other model ignores it (the job log says so).
 * - `--intent online|mine|plan|organize|any|auto` (51b, D1): what the ask is
 *   for — the first three run as plans in code — or `auto` for a guess.
 *   Unset: the open loop, as before.
 * - `--hold` (51e) holds the run's writes for review, as the curator page's
 *   runs do: they wait in `/curator` (and `/api/agent/<id>/review`) and
 *   nothing is written until they are approved. Without it the CLI writes
 *   as before (48b, Db9). `--claude` asks Claude where the editor has it
 *   beside a local model (48b, Db5); unset, the editor's own model.
 *
 * `recipes agent note <run> --verdict … --text …` (51e) adds a review note
 * to an ended run, kept beside it in the job store (with `--remote`, the
 * editor's): what Claude Code (or you, `--by you`) made of it. `--text-file
 * <file|->` reads a longer note; `--case <id>` (repeatable) names the cases
 * in `curator-cases.json` a miss became. Plain text, at most 4,000
 * characters, no HTML tags.
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
import {
  AGENT_INTENT_CHOICES,
  INTENT_LABELS,
  isAgentIntentChoice,
} from "../../controller/agent/intents/guess";
import { formatJobLine } from "../../controller/jobs/log";
import {
  REVIEW_NOTE_AUTHORS,
  REVIEW_NOTE_AUTHOR_LABELS,
  REVIEW_NOTE_VERDICTS,
  REVIEW_NOTE_VERDICT_LABELS,
  type ReviewNoteAuthor,
  type ReviewNoteVerdict,
} from "../../controller/agent/reviewNotes";
import type { AddReviewNoteResult } from "../../controller/agent/reviewNoteStore";
import { readTextInput } from "../input";
import {
  VERBOSE_OPTION,
  booleanOption,
  numberOption,
  stringListOption,
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
    'recipes agent "<ask>" [--run <id>] [--max-turns 1-40] [--newer-web-tools] [--intent online|mine|plan|organize|any|auto] [--hold] [--claude] [--verbose] [--json]\nrecipes agent note <run> --verdict approved|left-for-you|rerun|miss (--text "<note>" | --text-file <file|->) [--case <id> …] [--by claude-code|you] [--json]',
  options: {
    run: { type: "string" },
    intent: { type: "string" },
    "max-turns": { type: "string" },
    "newer-web-tools": { type: "boolean" },
    hold: { type: "boolean" },
    claude: { type: "boolean" },
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
    const intent = stringOption(options, "intent");
    if (intent !== undefined && !isAgentIntentChoice(intent)) {
      throw new UsageError(
        `--intent takes ${AGENT_INTENT_CHOICES.join(", ")} — not "${intent}".`,
      );
    }
    return backend.runAgent(
      {
        prompt,
        ...(runId ? { runId } : {}),
        ...(maxTurns !== undefined ? { maxTurns } : {}),
        ...(booleanOption(options, "newer-web-tools")
          ? { newerWebTools: true }
          : {}),
        ...(intent ? { intent } : {}),
        /* 51e: hold its writes for the review (the curator page's way). */
        ...(booleanOption(options, "hold") ? { hold: true } : {}),
        /* 51e: Claude where the editor has it beside a local model. */
        ...(booleanOption(options, "claude")
          ? { model: "claude" as const }
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
    /* 51b: the intent the run took, and how it was settled. */
    if (outcome.intent) {
      const how =
        outcome.intent.by === "asked"
          ? "as asked"
          : outcome.intent.by === "default"
            ? "the default"
            : `guessed by the ${outcome.intent.by === "model" ? "model" : "rules"}`;
      lines.push(
        `intent: ${INTENT_LABELS[outcome.intent.id]} (${how}${outcome.intent.why ? `: ${outcome.intent.why}` : ""})${outcome.intent.fellBack ? ` — ${outcome.intent.fellBack}` : ""}`,
      );
    }
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

/**
 * `recipes agent note <run> --verdict … --text …` (51e): a review note on
 * an ended run. Writes no content (no commit): the note is the job store's.
 */
export const agentNoteCommand: CommandDef<AddReviewNoteResult> = {
  name: "agent note",
  usage:
    'recipes agent note <run> --verdict approved|left-for-you|rerun|miss (--text "<note>" | --text-file <file|->) [--case <id> …] [--by claude-code|you] [--json]',
  options: {
    verdict: { type: "string" },
    text: { type: "string" },
    "text-file": { type: "string" },
    case: { type: "string", multiple: true },
    by: { type: "string" },
  },
  async run({ backend, positionals, options }) {
    const [id, ...extra] = positionals;
    if (!id || extra.length > 0) {
      throw new UsageError(
        'recipes agent note takes one run id: recipes agent note <run> --verdict left-for-you --text "…"',
      );
    }
    const verdict = stringOption(options, "verdict");
    if (
      !verdict ||
      !(REVIEW_NOTE_VERDICTS as readonly string[]).includes(verdict)
    ) {
      throw new UsageError(
        `--verdict takes ${REVIEW_NOTE_VERDICTS.join(", ")}${verdict ? ` — not "${verdict}"` : ""}.`,
      );
    }
    const inline = stringOption(options, "text");
    const file = stringOption(options, "text-file");
    if ((inline === undefined) === (file === undefined)) {
      throw new UsageError(
        "Give the note as --text or --text-file (one of them).",
      );
    }
    const by = stringOption(options, "by");
    if (
      by !== undefined &&
      !(REVIEW_NOTE_AUTHORS as readonly string[]).includes(by)
    ) {
      throw new UsageError(
        `--by takes ${REVIEW_NOTE_AUTHORS.join(" or ")} — not "${by}".`,
      );
    }
    const cases = stringListOption(options, "case").flatMap((entry) =>
      entry
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    const text = inline ?? (await readTextInput(file!, { what: "the note" }));
    return backend.noteAgentRun(id, {
      verdict: verdict as ReviewNoteVerdict,
      text,
      ...(by ? { by: by as ReviewNoteAuthor } : {}),
      ...(cases.length > 0 ? { cases } : {}),
    });
  },
  format({ job, note, notes }) {
    const lines = [
      `noted run ${job}: ${REVIEW_NOTE_VERDICT_LABELS[note.verdict]} (${REVIEW_NOTE_AUTHOR_LABELS[note.by]}, ${note.at})`,
    ];
    if (note.cases?.length) lines.push(`cases: ${note.cases.join(", ")}`);
    lines.push(
      `${notes.length} note${notes.length === 1 ? "" : "s"} on this run`,
    );
    return lines.join("\n");
  },
};
