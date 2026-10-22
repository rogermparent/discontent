/**
 * An agent run's conversation on disk (epic 44, 44c, E2):
 * `<id>.transcript.jsonl` beside the job's meta and step log
 * (`transcriptPath`). The step log redacts any text over 200 characters by
 * design (37), so the conversation cannot live there.
 *
 * One JSON object per line, appended **as it happens** (a crash keeps what
 * happened up to it):
 *
 * - `start` — a run segment begins: the model, its API, the tools offered
 *   (names only) and, for a follow-up, the run it continues;
 * - `message` — one neutral message (`AgentMessage`), the prompt, each
 *   assistant turn (Claude's raw blocks included, Ea4 — a follow-up replays
 *   them), each tool result, and the "not run" answers a stop leaves;
 * - `end` — how it ended: `stop`, `error?`, `usage`, `costEstimate?`,
 *   `model`, the counts.
 *
 * **A follow-up's transcript is whole** (Ec3): it starts with the run it
 * continues copied verbatim — whose records keep their own `job` — then its
 * own. So the newest run of a conversation holds all of it, and pruning an
 * older run never breaks a newer one. Its history is every `message`
 * record's message, in order (`historyOf`).
 *
 * Nothing secret is written: no API key or header ever reaches a message,
 * and each line has the environment's secret-looking values scrubbed
 * (`scrubSecretValues`) on the way out — a token pasted into a prompt
 * included.
 */
import { appendFileSync } from "node:fs";
import { open, readFile, stat, type FileHandle } from "node:fs/promises";
import type { LlmApi } from "../llm/client";
import { scrubSecretValues } from "../jobs/log";
import { transcriptPath } from "../jobs/store";
import type {
  AgentMessage,
  AgentStopReason,
  AgentUsage,
  ServerTool,
} from "./types";

export interface TranscriptStart {
  t: string;
  type: "start";
  /** The run this segment belongs to. */
  job: string;
  /** The run it continues (a follow-up). */
  continues?: string;
  model: string;
  api: LlmApi;
  /** The tools the model was offered, by name. */
  tools: string[];
  /** Claude's server tools (E6), by kind. */
  serverTools?: ServerTool["kind"][];
}

export interface TranscriptMessage {
  t: string;
  type: "message";
  job: string;
  message: AgentMessage;
}

export interface TranscriptEnd {
  t: string;
  type: "end";
  job: string;
  stop: AgentStopReason;
  error?: string;
  usage: AgentUsage;
  /** The Claude API's cost in USD, estimated (Ea7); absent otherwise. */
  costEstimate?: number;
  model: string;
  api: LlmApi;
  turns: number;
  toolCalls: number;
  trimmed: number;
  durationMs: number;
}

export type TranscriptRecord =
  TranscriptStart | TranscriptMessage | TranscriptEnd;

/** A record without its time: what a writer is handed. */
export type TranscriptEntry =
  | Omit<TranscriptStart, "t">
  | Omit<TranscriptMessage, "t">
  | Omit<TranscriptEnd, "t">;

export interface TranscriptWriter {
  /** Append one record (with its time). */
  write(entry: TranscriptEntry): void;
  /** Append lines as they are (a run being continued, copied). */
  copy(text: string): void;
}

/** Writes nowhere: a job with no store (37-T6). */
const NO_WRITER: TranscriptWriter = { write() {}, copy() {} };

/**
 * A run's transcript writer. Appends synchronously, line by line, so a crash
 * keeps every line written before it. A file that cannot be written is said
 * once on stderr and the run goes on unrecorded — a run is worth more than
 * its record, as a job is (37-T6).
 */
export function transcriptWriter(
  dir: string | undefined,
  id: string | undefined,
): TranscriptWriter {
  if (!dir || !id) return NO_WRITER;
  const file = transcriptPath(dir, id);
  let broken = false;
  const append = (text: string) => {
    if (broken || !text) return;
    try {
      appendFileSync(/*turbopackIgnore: true*/ file, text);
    } catch (error) {
      broken = true;
      console.warn(
        `[job ${id}] could not write its transcript: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return {
    write(entry) {
      append(
        `${scrubSecretValues(JSON.stringify({ t: new Date().toISOString(), ...entry }))}\n`,
      );
    },
    copy(text) {
      append(text.endsWith("\n") || !text ? text : `${text}\n`);
    },
  };
}

function parseLines(text: string): TranscriptRecord[] {
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line): TranscriptRecord[] => {
      try {
        const record = JSON.parse(line) as TranscriptRecord;
        return record && typeof record === "object" && "type" in record
          ? [record]
          : [];
      } catch {
        return [];
      }
    });
}

/** The most of a transcript one read hands back (a poll catching up reads again). */
export const TRANSCRIPT_READ_MAX_BYTES = 1024 * 1024;

/**
 * A run's transcript from byte `from` on, and the offset to ask from next
 * (as `readJobLog` reads a log): a last line still being written is left
 * for next time. No file is no records. Only the bytes from `from` are
 * read (`open` + `read` at the offset, 44c review), at most
 * `TRANSCRIPT_READ_MAX_BYTES` at a time, so a poll of a long conversation
 * reads what is new, not the whole file each second. A single line longer
 * than that cap is read whole (the read doubles until it holds a line end).
 * `more` says the cap cut the read: there is more to read at once.
 */
export async function readTranscript(
  dir: string,
  id: string,
  rawFrom = 0,
  { maxBytes = TRANSCRIPT_READ_MAX_BYTES }: { maxBytes?: number } = {},
): Promise<{ records: TranscriptRecord[]; next: number; more?: boolean }> {
  const from =
    Number.isFinite(rawFrom) && rawFrom > 0 ? Math.floor(rawFrom) : 0;
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ transcriptPath(dir, id), "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [], next: from };
    }
    throw error;
  }
  try {
    const { size } = await handle.stat();
    if (from >= size) return { records: [], next: from };
    let length = Math.min(size - from, Math.max(1, maxBytes));
    for (;;) {
      const chunk = Buffer.alloc(length);
      const { bytesRead } = await handle.read(chunk, 0, length, from);
      const read = chunk.subarray(0, bytesRead);
      const end = read.lastIndexOf(0x0a);
      if (end >= 0) {
        return {
          records: parseLines(read.subarray(0, end).toString("utf8")),
          next: from + end + 1,
          /* The cap cut this read: ask again at once for the rest. */
          ...(from + bytesRead < size ? { more: true } : {}),
        };
      }
      /* No whole line yet: the file ends mid-line, or one line is longer than the cap. */
      if (from + bytesRead >= size || bytesRead < length) {
        return { records: [], next: from };
      }
      length = Math.min(size - from, length * 2);
    }
  } finally {
    await handle.close();
  }
}

/** A run's transcript's size in bytes, or `undefined` when it has none. */
export async function transcriptSize(
  dir: string,
  id: string,
): Promise<number | undefined> {
  try {
    return (await stat(/*turbopackIgnore: true*/ transcriptPath(dir, id))).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * A run's whole transcript as text (complete lines only) — what a follow-up
 * copies — or `undefined` when it has none.
 */
export async function readTranscriptText(
  dir: string,
  id: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(
      /*turbopackIgnore: true*/ transcriptPath(dir, id),
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const end = text.lastIndexOf("\n");
  return end < 0 ? "" : text.slice(0, end + 1);
}

/** The conversation a transcript holds: every `message` record's message, in order. */
export function historyOf(
  records: readonly TranscriptRecord[],
): AgentMessage[] {
  return records.flatMap((record) =>
    record.type === "message" ? [record.message] : [],
  );
}

/** Text as records (a transcript read whole). */
export function transcriptRecords(text: string): TranscriptRecord[] {
  return parseLines(text);
}

/**
 * A record as a reader is sent it (44d's conversation view, the CLI): an
 * assistant message without Claude's `raw` blocks — encrypted search
 * results and thinking signatures, kept on disk for a follow-up to replay
 * (Ea4) and of no use to read; its text, tool calls and server-tool uses
 * are already beside them.
 */
export function readableRecord(record: TranscriptRecord): TranscriptRecord {
  if (record.type !== "message" || record.message.role !== "assistant") {
    return record;
  }
  if (!record.message.raw) return record;
  const { raw: _raw, ...message } = record.message;
  void _raw;
  return { ...record, message };
}
