/**
 * The step log (epic 37, D2): what a job did, step by step, as JSON lines.
 *
 * - `log.step(name, data?, fn)` writes a `start` line, runs `fn`, and writes
 *   an `end` line with `ms`, `ok` and the step's data — what `fn` added
 *   through its handle (`step.set`) merged over what it started with. A
 *   thrown error ends the step `{ok: false, error}` and is rethrown; a step
 *   that failed without throwing (yt-dlp's `{status: "error"}`) says so with
 *   `step.fail(reason)`.
 * - `log.info` / `log.warn` write a `note` line.
 * - `log.surface(message)` is a warning the job's result carries too (D6's
 *   placement): `runJob` merges the surfaced ones into the result's
 *   `warnings`, once each.
 *
 * Line shape: `{t, step, phase: "start"|"end"|"note", level, n?, parent?,
 * ms?, ok?, msg?, error?, data?}`, `t` an ISO timestamp. A step's `start`
 * and `end` lines carry its `n`, a sequence number per job, so two steps of
 * one name running at once still pair; `parent` is the enclosing step's `n`
 * (on notes too) — tracked through async context, so concurrent steps nest
 * correctly.
 *
 * **Redaction happens here, in one place** (`redactLine`), on every line
 * before it is written or mirrored: a string longer than
 * `LOG_TEXT_MAX_CHARS` becomes its length and a hash (page and model text
 * never reach the log), `msg` and `error` are cut to that length, a field
 * named like a secret is blanked, a URL loses its `user:password@`, and
 * the value of every environment variable named like a secret is replaced
 * wherever it appears.
 *
 * **The console mirror** (D2): each line also goes out as one text line,
 * `[job <id8>] llm.extract 2/4 "Stuffing" 13/13 grounded · 11.3 s · 412 tok
 * @ 37 tok/s · GPU` — the bracketed-tag convention journald greps. `<id8>`
 * is the id's last eight characters: a ULID's first ten are its time, so two
 * jobs started in the same quarter second would share their first eight.
 * Where it goes is the process's choice (`setJobMirror`): the editor writes
 * stdout (journald), the CLI stderr when it is a TTY or with `--verbose`,
 * the stdio MCP server nowhere (its stdout is the protocol).
 *
 * `NO_LOG` is every seat's default: steps just run, nothing is written, and
 * `live` is false — so a seat called outside a job (a unit test, a script)
 * behaves exactly as before, and costs nothing extra (no `/api/ps` check).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";

export type StepData = Record<string, unknown>;

export type LineLevel = "info" | "warn" | "error";

export interface JobLine {
  /** ISO timestamp. */
  t: string;
  step: string;
  phase: "start" | "end" | "note";
  level: LineLevel;
  /** `start`/`end` lines: the step's sequence number in its job (from 1). */
  n?: number;
  /** The enclosing step's `n`; absent at the top. */
  parent?: number;
  /** `end` lines: the step's wall time. */
  ms?: number;
  /** `end` lines: whether it did what it set out to. */
  ok?: boolean;
  msg?: string;
  /** `end` lines that failed: why, at most `LOG_TEXT_MAX_CHARS`. */
  error?: string;
  data?: StepData;
}

/** What a step's function gets: a way to add to its end line. */
export interface StepHandle {
  /** Merge into the step's end data. */
  set(data: StepData): void;
  /** End the step `ok: false` with this reason, without throwing. */
  fail(reason: string): void;
  /** The job's log, for notes and nested steps. */
  readonly log: JobLog;
}

export type StepFn<T> = (step: StepHandle) => T | Promise<T>;

export interface JobLog {
  /** The job's id; undefined for `NO_LOG`. */
  readonly jobId?: string;
  /** False for `NO_LOG`: nothing is written, so nothing worth measuring. */
  readonly live: boolean;
  step<T>(name: string, fn: StepFn<T>): Promise<T>;
  step<T>(name: string, data: StepData | undefined, fn: StepFn<T>): Promise<T>;
  info(step: string, msg?: string, data?: StepData): void;
  warn(step: string, msg?: string, data?: StepData): void;
  /**
   * A warning the job's result carries too, once. With a `kind`, a later
   * warning of the same kind replaces the earlier one (D6's placement: 2%
   * then 3% is one warning, the latest reading).
   */
  surface(message: string, kind?: string): void;
  readonly surfaced: readonly string[];
}

/* ------------------------------------------------------------------ */
/* The no-op log                                                       */
/* ------------------------------------------------------------------ */

const NO_HANDLE: StepHandle = {
  set() {},
  fail() {},
  get log() {
    return NO_LOG;
  },
};

export const NO_LOG: JobLog = {
  live: false,
  async step<T>(
    _name: string,
    dataOrFn: StepData | undefined | StepFn<T>,
    maybeFn?: StepFn<T>,
  ): Promise<T> {
    const fn = (typeof dataOrFn === "function" ? dataOrFn : maybeFn)!;
    return fn(NO_HANDLE);
  },
  info() {},
  warn() {},
  surface() {},
  surfaced: [],
};

/* ------------------------------------------------------------------ */
/* Redaction (D2)                                                      */
/* ------------------------------------------------------------------ */

/** Longer strings are logged as their length and hash; `msg`/`error` are cut here. */
export const LOG_TEXT_MAX_CHARS = 200;

/** Arrays in a line keep this many entries. */
const LOG_ARRAY_MAX = 20;

/** A field named like a secret (`apiToken`, `password`) — not `outputTokens`. */
const SECRET_NAME =
  /(token|secret|passw(or)?d|authori[sz]ation|cookie|api[-_]?key|bearer)$/i;
/** An environment variable named like a secret: `RECIPE_API_TOKEN`, `AUTH_SECRET`. */
const SECRET_ENV_NAME = /(TOKEN|SECRET|PASSW(OR)?D|API_?KEY)$/i;

/** The values of the environment's secret-looking variables, longest first. */
function secretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(
      ([name, value]) =>
        SECRET_ENV_NAME.test(name) &&
        typeof value === "string" &&
        value.length >= 8,
    )
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Secrets out: env values, and a URL's `user:password@`. */
function scrub(text: string, secrets: readonly string[]): string {
  let out = text.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1");
  for (const secret of secrets) {
    if (out.includes(secret)) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function cut(text: string): string {
  return text.length > LOG_TEXT_MAX_CHARS
    ? `${text.slice(0, LOG_TEXT_MAX_CHARS - 1)}…`
    : text;
}

function redactValue(
  value: unknown,
  secrets: readonly string[],
  depth: number,
): unknown {
  if (typeof value === "string") {
    const clean = scrub(value, secrets);
    return clean.length > LOG_TEXT_MAX_CHARS
      ? `[text ${clean.length} chars sha256:${hash(value)}]`
      : clean;
  }
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol"
      ? undefined
      : typeof value === "bigint"
        ? Number(value)
        : value;
  }
  if (depth >= 4) return "[nested]";
  if (Array.isArray(value)) {
    const kept = value
      .slice(0, LOG_ARRAY_MAX)
      .map((entry) => redactValue(entry, secrets, depth + 1));
    return value.length > LOG_ARRAY_MAX
      ? [...kept, `… ${value.length - LOG_ARRAY_MAX} more`]
      : kept;
  }
  const out: StepData = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    out[key] = SECRET_NAME.test(key)
      ? "[redacted]"
      : redactValue(entry, secrets, depth + 1);
  }
  return out;
}

/**
 * A message as the log would keep it (secrets out, cut to
 * `LOG_TEXT_MAX_CHARS`): what a job's meta records as its `error`, so the
 * meta says no more than the log does.
 */
export function redactText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return cut(scrub(text, secretValues(env)));
}

/**
 * A line as it may be written: the one place redaction happens (D2). Every
 * line passes here before the file and the console see it.
 */
export function redactLine(
  line: JobLine,
  env: NodeJS.ProcessEnv = process.env,
): JobLine {
  const secrets = secretValues(env);
  const out: JobLine = {
    t: line.t,
    step: cut(scrub(line.step, secrets)),
    phase: line.phase,
    level: line.level,
  };
  if (line.n !== undefined) out.n = line.n;
  if (line.parent !== undefined) out.parent = line.parent;
  if (line.ms !== undefined) out.ms = line.ms;
  if (line.ok !== undefined) out.ok = line.ok;
  if (line.msg !== undefined) out.msg = cut(scrub(line.msg, secrets));
  if (line.error !== undefined) out.error = cut(scrub(line.error, secrets));
  if (line.data && Object.keys(line.data).length > 0) {
    out.data = redactValue(line.data, secrets, 0) as StepData;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The console mirror                                                  */
/* ------------------------------------------------------------------ */

export type JobMirror = (text: string) => void;

interface MirrorGlobal {
  /** `null`: this process mirrors nowhere; undefined: the default. */
  __discontentJobMirror?: JobMirror | null;
}

/**
 * Where this process mirrors step lines: a function, or `null` for nowhere.
 * On `globalThis` because a Next route and a page are separate bundles.
 */
export function setJobMirror(mirror: JobMirror | null | undefined): void {
  (globalThis as MirrorGlobal).__discontentJobMirror = mirror;
}

/**
 * The process's mirror: what `setJobMirror` set, else stdout inside the
 * editor (Next sets `NEXT_RUNTIME`), else nowhere.
 */
export function defaultJobMirror(): JobMirror | undefined {
  const set = (globalThis as MirrorGlobal).__discontentJobMirror;
  if (set !== undefined) return set ?? undefined;
  if (process.env.NEXT_RUNTIME) {
    return (text) => process.stdout.write(`${text}\n`);
  }
  return undefined;
}

/** The mirror's short id: the ULID's random tail. */
export function shortJobId(id: string): string {
  return id.slice(-8);
}

function seconds(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  return ms < 100_000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.round(ms / 1000)} s`;
}

function kilobytes(bytes: unknown): string | undefined {
  if (typeof bytes !== "number") return undefined;
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} kB`;
}

function quoted(value: unknown): string | undefined {
  return typeof value === "string" && value ? `"${value}"` : undefined;
}

/** `llm.extract 2/4 "Stuffing"`, `fetch www.example.com`: the step and what it is about. */
function stepLabel(step: string, data: StepData = {}): string {
  const parts = [step];
  if (step.startsWith("llm.")) {
    if (typeof data.part === "string") parts.push(data.part);
    parts.push(quoted(data.name) ?? "");
  } else if (step === "job") {
    parts.push(String(data.kind ?? ""), quoted(data.label) ?? "");
  } else if (typeof data.host === "string") {
    parts.push(data.host);
  } else if (typeof data.site === "string") {
    parts.push(data.site);
  }
  return parts.filter(Boolean).join(" ");
}

/** The GPU share as the mirror says it: "GPU", or "2% GPU". */
function gpuText(gpu: unknown): string | undefined {
  if (typeof gpu !== "number") return undefined;
  return gpu >= 100 ? "GPU" : `${gpu}% GPU`;
}

/** What an `end` line says, by step. */
function summary(step: string, data: StepData = {}, ms?: number): string[] {
  if (step.startsWith("llm.")) {
    const tokens =
      typeof data.outputTokens === "number"
        ? `${data.outputTokens} tok${
            typeof data.tokPerSec === "number"
              ? ` @ ${Math.round(data.tokPerSec)} tok/s`
              : ""
          }`
        : undefined;
    return [
      typeof data.total === "number"
        ? `${data.grounded ?? 0}/${data.total} grounded`
        : undefined,
      data.found === false ? "no recipe" : undefined,
      Array.isArray(data.names) ? `${data.names.length} listed` : undefined,
      typeof data.oneDish === "boolean"
        ? data.oneDish
          ? "one dish"
          : "separate dishes"
        : undefined,
      seconds(ms),
      tokens,
      typeof data.loadMs === "number" && data.loadMs >= 1000
        ? `load ${seconds(data.loadMs)}`
        : undefined,
      gpuText(data.gpu),
    ].filter((part): part is string => !!part);
  }
  if (step === "fetch" || step === "image") {
    return [
      typeof data.status === "number" ? String(data.status) : undefined,
      typeof data.type === "string" ? data.type : undefined,
      kilobytes(data.bytes),
      data.retried403 ? "403 retried" : undefined,
      seconds(ms),
    ].filter((part): part is string => !!part);
  }
  const fields = Object.entries(data)
    .filter(
      ([key, value]) =>
        !["host", "site", "kind", "label"].includes(key) &&
        (typeof value === "number" ||
          typeof value === "boolean" ||
          (typeof value === "string" && value.length <= 60)),
    )
    .map(([key, value]) => `${key} ${value}`);
  return [...fields, seconds(ms)].filter((part): part is string => !!part);
}

/** One line as the console shows it. */
export function formatJobLine(id: string, line: JobLine): string {
  const tag = `[job ${shortJobId(id)}]`;
  if (line.phase === "note") {
    return [
      tag,
      `${line.step}${line.level === "info" ? "" : ` ${line.level}`}:`,
      line.msg ?? "",
      ...summary(line.step, line.data, line.ms),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (line.phase === "start") {
    return `${tag} ${stepLabel(line.step, line.data)} …`;
  }
  const label = `${tag} ${stepLabel(line.step, line.data)}`;
  const details = [
    ...summary(line.step, line.data, line.ms),
    line.ok === false ? `failed${line.error ? `: ${line.error}` : ""}` : "",
  ].filter(Boolean);
  return details.length ? `${label} ${details.join(" · ")}` : label;
}

/* ------------------------------------------------------------------ */
/* The writing log                                                     */
/* ------------------------------------------------------------------ */

export interface JobLogOptions {
  id: string;
  /** The `.log.jsonl` file; none writes nothing (a broken jobs dir). */
  file?: string;
  mirror?: JobMirror;
  /** Every line as written (tests). */
  onLine?: (line: JobLine) => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A log that writes its lines — to the file, the mirror and `onLine`. */
export function createJobLog({
  id,
  file,
  mirror,
  onLine,
}: JobLogOptions): JobLog {
  const surfaced: string[] = [];
  /* The kind each surfaced warning was given, by index. */
  const surfacedKinds: (string | undefined)[] = [];
  let fileFailed = false;
  /* Step numbers, and the step a line is written inside. */
  let sequence = 0;
  const enclosing = new AsyncLocalStorage<number>();

  const write = (raw: JobLine) => {
    const line = redactLine(raw);
    if (file && !fileFailed) {
      try {
        appendFileSync(file, `${JSON.stringify(line)}\n`);
      } catch (error) {
        /* The log is for watching; it never fails the job. */
        fileFailed = true;
        console.warn(
          `[job ${shortJobId(id)}] could not write its log (${describe(error)}); going on without it`,
        );
      }
    }
    onLine?.(line);
    if (mirror) {
      try {
        mirror(formatJobLine(id, line));
      } catch {
        /* A closed stream must not fail the job either. */
      }
    }
  };

  const note =
    (level: LineLevel) => (step: string, msg?: string, data?: StepData) => {
      const parent = enclosing.getStore();
      write({
        t: new Date().toISOString(),
        step,
        phase: "note",
        level,
        ...(parent !== undefined ? { parent } : {}),
        ...(msg !== undefined ? { msg } : {}),
        ...(data ? { data } : {}),
      });
    };

  const log: JobLog = {
    jobId: id,
    live: true,
    async step<T>(
      name: string,
      dataOrFn: StepData | undefined | StepFn<T>,
      maybeFn?: StepFn<T>,
    ): Promise<T> {
      const start = typeof dataOrFn === "function" ? undefined : dataOrFn;
      const fn = (typeof dataOrFn === "function" ? dataOrFn : maybeFn)!;
      const ended: StepData = { ...start };
      let failure: string | undefined;
      const handle: StepHandle = {
        set(data) {
          Object.assign(ended, data);
        },
        fail(reason) {
          failure = reason;
        },
        log,
      };
      sequence += 1;
      const n = sequence;
      const parent = enclosing.getStore();
      const place = { n, ...(parent !== undefined ? { parent } : {}) };
      write({
        t: new Date().toISOString(),
        step: name,
        phase: "start",
        level: "info",
        ...place,
        ...(start && Object.keys(start).length ? { data: start } : {}),
      });
      const began = performance.now();
      const end = (ok: boolean, error?: string) =>
        write({
          t: new Date().toISOString(),
          step: name,
          phase: "end",
          level: ok ? "info" : "warn",
          ...place,
          ms: Math.round(performance.now() - began),
          ok,
          ...(error !== undefined ? { error } : {}),
          ...(Object.keys(ended).length ? { data: ended } : {}),
        });
      let value: T;
      try {
        value = await enclosing.run(n, () => fn(handle));
      } catch (error) {
        end(false, describe(error));
        throw error;
      }
      end(failure === undefined, failure);
      return value;
    },
    info: note("info"),
    warn: note("warn"),
    surface(message, kind) {
      const same = kind === undefined ? -1 : surfacedKinds.indexOf(kind);
      if (same >= 0) {
        surfaced[same] = message;
        return;
      }
      if (surfaced.includes(message)) return;
      surfaced.push(message);
      surfacedKinds.push(kind);
    },
    surfaced,
  };
  return log;
}

/**
 * A log kept in memory (tests, and a job whose store could not be written):
 * the lines as they would be written, redacted.
 */
export function memoryJobLog(id = "01MEMORYMEMORYMEMORYMEMORY"): {
  log: JobLog;
  lines: JobLine[];
} {
  const lines: JobLine[] = [];
  return {
    log: createJobLog({ id, onLine: (line) => lines.push(line) }),
    lines,
  };
}
