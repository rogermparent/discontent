/**
 * D6's GPU hooks (37b): free the GPU of another program for the length of a
 * busy spell, and give it back after.
 *
 * - `RECIPE_GPU_ACQUIRE_CMD` runs before the first `gpu` grant of a spell;
 * - `RECIPE_GPU_RELEASE_CMD` runs once the `gpu` slot has been idle for
 *   `RECIPE_GPU_IDLE_MS` (default 60 000).
 *
 * Both are shell commands (`/bin/sh -c`), off unless set, killed — the
 * whole process group — after 30 s. Each run is a `gpu.hook` step: which
 * hook, its exit, the output's length and a capped excerpt (D2's
 * redaction applies; the command itself is never logged, so nothing from
 * the environment is echoed). A hook that fails or hangs is a failed step,
 * never a failed import: the queue goes on.
 *
 * **The spell is shared by every process** (`<queue dir>/gpu/hooks.json`:
 * `active`, `since`, `releasedAt`), read and written only while holding the
 * `gpu` slot, so an acquire and a release never interleave. The idle clock
 * is the slot's own `lastRelease`.
 *
 * **Who runs the release (D6 amended).** A process that let the slot go
 * sets a timer for `idleMs` (unref'd); when it fires and the slot is still
 * idle, with nobody waiting, it takes the slot briefly and runs the release.
 * That covers the long-lived editor. A short-lived CLI or stdio MCP process
 * usually exits before its timer fires, so:
 *
 * 1. **The editor is the keeper.** A process with a release command that
 *    lives on (the editor, `startGpuKeeper` at boot) registers under
 *    `gpu/keepers/` and checks every 10 s, so it releases a spell another
 *    process began.
 * 2. **No keeper alive: release at exit.** `settleGpuAtExit` — the CLI after
 *    its command, the stdio MCP server at shutdown — runs the release at
 *    once when this process used the GPU, the spell is active, the slot is
 *    free and nobody waits. (Back-to-back CLI runs without an editor pause
 *    and resume once each: the price of not lingering.)
 * 3. **A spell nobody closed** (a process killed before its exit) is
 *    noticed by the next grant: active, but idle longer than `idleMs`, so it
 *    is a new spell and the acquire hook runs again — pausing a program that
 *    is already paused is harmless, and this spell's release follows.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";
import {
  processGone,
  processIdentity,
  releaseLock,
  tryCreateLock,
} from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import type { JobContext } from "./context";
import { gpuUsedHere, markGpuUsed, queueDirectory } from "./location";
import { createJobLog, defaultJobMirror, type JobLog } from "./log";
import {
  SLOT_ID_KEY,
  currentHolder,
  liveWaiters,
  processHolds,
  readResourceState,
  resourceDirectory,
  slotLockPath,
  type SlotRecord,
} from "./queue";

export const GPU_IDLE_MS = 60_000;
export const GPU_HOOK_TIMEOUT_MS = 30_000;
/** How often a keeper looks, and touches its file. */
export const GPU_KEEPER_EVERY_MS = 10_000;
/** A keeper file untouched for this long is not a keeper. */
export const GPU_KEEPER_STALE_MS = 30_000;
/** Output kept in memory per hook run; the log gets the length and an excerpt. */
const OUTPUT_KEEP_CHARS = 16_384;
const EXCERPT_CHARS = 160;

export interface GpuHookConfig {
  acquire?: string;
  release?: string;
  idleMs: number;
  timeoutMs: number;
}

function envNumber(value: string | undefined, fallback: number): number {
  const number = Number(value?.trim());
  return value?.trim() && Number.isFinite(number) && number >= 0
    ? number
    : fallback;
}

/** The hooks as this process's environment sets them; read at each use. */
export function gpuHookConfig(
  env: NodeJS.ProcessEnv = process.env,
): GpuHookConfig {
  const acquire = env.RECIPE_GPU_ACQUIRE_CMD?.trim();
  const release = env.RECIPE_GPU_RELEASE_CMD?.trim();
  return {
    ...(acquire ? { acquire } : {}),
    ...(release ? { release } : {}),
    idleMs: envNumber(env.RECIPE_GPU_IDLE_MS, GPU_IDLE_MS),
    /* Tests only: the 30 s rule, shortened. */
    timeoutMs:
      envNumber(env.RECIPE_GPU_HOOK_TIMEOUT_MS, GPU_HOOK_TIMEOUT_MS) ||
      GPU_HOOK_TIMEOUT_MS,
  };
}

interface HookState {
  /** A spell is on: the acquire hook ran (or there is none) and no release yet. */
  active: boolean;
  since?: number;
  releasedAt?: number;
}

function gpuDirectory(dir: string): string {
  return resourceDirectory("gpu", dir);
}

function hookFile(dir: string): string {
  return path.join(gpuDirectory(dir), "hooks.json");
}

export async function readHookState(
  dir: string = queueDirectory(),
): Promise<HookState> {
  try {
    const parsed = JSON.parse(await readFile(hookFile(dir), "utf8"));
    return parsed && typeof parsed === "object"
      ? { ...parsed, active: parsed.active === true }
      : { active: false };
  } catch {
    return { active: false };
  }
}

async function writeHookState(dir: string, state: HookState): Promise<void> {
  await mkdir(gpuDirectory(dir), { recursive: true });
  await writeJsonAtomic(hookFile(dir), state);
}

/* ------------------------------------------------------------------ */
/* This process                                                        */
/* ------------------------------------------------------------------ */

interface HookGlobal {
  /** This process's release timer (one, however many bundles). */
  __discontentGpuIdleTimer?: ReturnType<typeof setTimeout>;
}

function hookGlobal(): HookGlobal {
  return globalThis as HookGlobal;
}

/** Where a hook's lines go outside a job: the process's mirror, as `[queue]`. */
function queueLog(): JobLog {
  const mirror = defaultJobMirror();
  return createJobLog({
    id: "gpu",
    ...(mirror
      ? { mirror: (text) => mirror(text.replace(/^\[job gpu\]/, "[queue]")) }
      : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Running a hook                                                      */
/* ------------------------------------------------------------------ */

interface ShellResult {
  exit: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  output: string;
  outputChars: number;
  error?: string;
}

/**
 * `/bin/sh -c command` in its own process group, killed whole on timeout.
 * Resolves on the shell's exit, not on its pipes closing — a hook that
 * leaves something running in the background does not hold the queue.
 */
function runShell(command: string, timeoutMs: number): Promise<ShellResult> {
  return new Promise((resolve) => {
    let output = "";
    let outputChars = 0;
    let timedOut = false;
    let settled = false;
    const child = spawn("/bin/sh", ["-c", command], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const keep = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      outputChars += text.length;
      if (output.length < OUTPUT_KEEP_CHARS) {
        output = (output + text).slice(0, OUTPUT_KEEP_CHARS);
      }
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    const finish = (result: Partial<ShellResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        exit: null,
        signal: null,
        timedOut,
        output,
        outputChars,
        ...result,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    timer.unref?.();
    child.on("error", (error) => finish({ error: error.message }));
    child.on("exit", (exit, signal) => {
      /* Let the last of the output arrive. */
      setImmediate(() => finish({ exit, signal }));
    });
  });
}

/** One hook run as a `gpu.hook` step. Never throws (but for a cancel). */
async function runHook(
  which: "acquire" | "release",
  command: string,
  config: GpuHookConfig,
  log: JobLog,
): Promise<void> {
  await log
    .step("gpu.hook", { hook: which }, async (step) => {
      const result = await runShell(command, config.timeoutMs);
      const excerpt = result.output.trim().slice(0, EXCERPT_CHARS);
      step.set({
        ...(result.exit !== null ? { exit: result.exit } : {}),
        ...(result.signal ? { signal: result.signal } : {}),
        outputChars: result.outputChars,
        ...(excerpt ? { excerpt } : {}),
      });
      if (result.timedOut) {
        step.fail(`timed out after ${+(config.timeoutMs / 1000).toFixed(1)} s`);
      } else if (result.error) {
        step.fail(result.error);
      } else if (result.exit !== 0) {
        step.fail(`exit ${result.exit ?? result.signal}`);
      }
    })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* The queue's two calls                                               */
/* ------------------------------------------------------------------ */

/**
 * The queue granted `gpu` (the slot is held): start a spell if there is
 * none — or the last one was never closed — running the acquire hook.
 * Answers whether the hook ran (D6's `ollama stop` reload keys on it).
 */
export async function gpuGranted(
  job: JobContext,
  dir: string = queueDirectory(),
): Promise<boolean> {
  markGpuUsed();
  const config = gpuHookConfig();
  if (!config.acquire && !config.release) return false;
  try {
    const [state, { lastRelease }] = await Promise.all([
      readHookState(dir),
      readResourceState(gpuDirectory(dir)),
    ]);
    const now = Date.now();
    /* The slot's last use in this spell: idle past `idleMs` means unclosed. */
    const lastUse = Math.max(lastRelease ?? 0, state.since ?? 0);
    const unclosed = state.active && now - lastUse >= config.idleMs;
    if (state.active && !unclosed) return false;
    if (config.acquire) {
      await runHook(
        "acquire",
        config.acquire,
        config,
        job.log.live ? job.log : queueLog(),
      );
    }
    await writeHookState(dir, { active: true, since: now });
    return !!config.acquire;
  } catch (error) {
    job.log.warn(
      "gpu.hook",
      `could not read or write the hook state: ${(error as Error)?.message ?? error}`,
    );
    return false;
  }
}

/** The process let `gpu` go: its own release timer starts over. */
export function gpuReleased(dir: string = queueDirectory()): void {
  const config = gpuHookConfig();
  if (!config.release) return;
  scheduleRelease(dir, config.idleMs);
}

function scheduleRelease(dir: string, ms: number): void {
  const global = hookGlobal();
  if (global.__discontentGpuIdleTimer) {
    clearTimeout(global.__discontentGpuIdleTimer);
  }
  const timer = setTimeout(
    () => {
      global.__discontentGpuIdleTimer = undefined;
      void maybeReleaseGpu(dir).catch(() => undefined);
    },
    Math.max(0, ms) + 25,
  );
  timer.unref?.();
  global.__discontentGpuIdleTimer = timer;
}

/**
 * Run the release hook if a spell is on and the slot has been idle for
 * `idleMs` (`force`: however long) — taking the slot for the length of the
 * hook, and only when it is free and nobody waits. Answers whether it ran.
 */
export async function maybeReleaseGpu(
  dir: string = queueDirectory(),
  { force = false, log }: { force?: boolean; log?: JobLog } = {},
): Promise<boolean> {
  const config = gpuHookConfig();
  if (!config.release) return false;
  const gpuDir = gpuDirectory(dir);
  const idleFor = async () =>
    Date.now() - ((await readResourceState(gpuDir)).lastRelease ?? 0);
  if (!(await readHookState(dir)).active) return false;
  if (!force) {
    const idle = await idleFor();
    if (idle < config.idleMs) {
      scheduleRelease(dir, config.idleMs - idle);
      return false;
    }
  }
  if ((await liveWaiters(gpuDir)).length > 0) return false;
  if (await currentHolder(gpuDir)) return false;

  const id = ulid();
  const record: SlotRecord = {
    ...processIdentity(),
    holderId: id,
    resource: "gpu",
    tier: "batch",
    since: Date.now(),
    purpose: "release hook",
  };
  const lockPath = slotLockPath(gpuDir);
  if (!(await tryCreateLock(lockPath, record, id))) return false;
  processHolds().add(id);
  try {
    /* Under the slot: nothing can have started since we looked. */
    if (!(await readHookState(dir)).active) return false;
    if (!force && (await idleFor()) < config.idleMs) return false;
    await runHook("release", config.release, config, log ?? queueLog());
    await writeHookState(dir, { active: false, releasedAt: Date.now() });
    return true;
  } finally {
    processHolds().delete(id);
    await releaseLock(lockPath, SLOT_ID_KEY, id);
  }
}

/* ------------------------------------------------------------------ */
/* Keepers and the exit                                                */
/* ------------------------------------------------------------------ */

function keepersDirectory(dir: string): string {
  return path.join(gpuDirectory(dir), "keepers");
}

/** Whether another live process keeps the GPU's release (the editor). */
export async function liveKeeper(
  dir: string = queueDirectory(),
  now = Date.now(),
): Promise<boolean> {
  const keepers = keepersDirectory(dir);
  const self = processIdentity();
  let found = false;
  for (const name of await readdir(keepers).catch(() => [] as string[])) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const file = path.join(keepers, name);
    try {
      const [raw, info] = await Promise.all([
        readFile(file, "utf8"),
        stat(file),
      ]);
      const record = JSON.parse(raw);
      const dead =
        now - info.mtimeMs > GPU_KEEPER_STALE_MS ||
        processGone(record) === true;
      if (dead) {
        await rm(file, { force: true });
        continue;
      }
      if (record.nonce !== self.nonce) found = true;
    } catch {
      /* Gone while we looked, or not ours. */
    }
  }
  return found;
}

/**
 * Keep the GPU's release for this machine (D6 amended): a long-lived
 * process (the editor, at boot) registers itself and checks every
 * `everyMs`. Only with a release command set. Answers a stop function.
 */
export function startGpuKeeper(
  dir: string = queueDirectory(),
  everyMs: number = GPU_KEEPER_EVERY_MS,
): () => void {
  if (!gpuHookConfig().release) return () => {};
  const self = processIdentity();
  const file = path.join(keepersDirectory(dir), `${self.nonce}.json`);
  const register = async () => {
    const now = new Date();
    try {
      await utimes(file, now, now);
    } catch {
      await writeJsonAtomic(file, self).catch(() => undefined);
    }
  };
  void register();
  const timer = setInterval(() => {
    void register();
    void maybeReleaseGpu(dir).catch(() => undefined);
  }, everyMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    void rm(file, { force: true });
  };
}

/**
 * A short-lived process is ending (the CLI after its command, the stdio
 * MCP server at shutdown): if it used the GPU and no keeper is alive, close
 * the spell now rather than leave the other program paused. Answers whether
 * the release ran.
 */
export async function settleGpuAtExit(
  dir: string = queueDirectory(),
): Promise<boolean> {
  if (!gpuUsedHere()) return false;
  if (!gpuHookConfig().release) return false;
  const global = hookGlobal();
  if (global.__discontentGpuIdleTimer) {
    clearTimeout(global.__discontentGpuIdleTimer);
    global.__discontentGpuIdleTimer = undefined;
  }
  try {
    if (await liveKeeper(dir)) return false;
    return await maybeReleaseGpu(dir, { force: true });
  } catch {
    return false;
  }
}
