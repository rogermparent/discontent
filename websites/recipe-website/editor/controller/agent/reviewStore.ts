/**
 * Where the person's decisions on held writes live (48b, Db2):
 * `<job>.review.json` in the job store, beside the run each call was made
 * in (`reviewPath`) — not in the transcript, which only its run appends to:
 * a follow-up's transcript copies the conversation once (Ec3), and a
 * decision made later, from either run's view, must reach both. Pruned with
 * its job.
 *
 * Writes are atomic (`writeJsonAtomic`) and serialised per file in this
 * process (`withReviewLock`): only the editor's own route decides, so two
 * Saves in one process never interleave a read-modify-write.
 */
import { mkdir, readFile } from "node:fs/promises";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";
import { reviewPath } from "../jobs/store";
import type { HeldCall, HeldDecision, HeldReviewFile } from "./held";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** One run's review file, or an empty one (none yet, or unreadable). */
export async function readReviewFile(
  dir: string,
  job: string,
): Promise<HeldReviewFile> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(/*turbopackIgnore: true*/ reviewPath(dir, job), "utf8"),
    );
    if (isObject(parsed) && isObject(parsed.calls)) {
      return { v: 1, calls: parsed.calls as Record<string, HeldDecision> };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[review ${job}] unreadable review file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { v: 1, calls: {} };
}

/** The decisions on `calls`, by call id, read from each call's own run. */
export async function readDecisions(
  dir: string,
  calls: readonly Pick<HeldCall, "id" | "job">[],
): Promise<Map<string, HeldDecision>> {
  const jobs = [...new Set(calls.map((call) => call.job))];
  const files = new Map(
    await Promise.all(
      jobs.map(async (job) => [job, await readReviewFile(dir, job)] as const),
    ),
  );
  const decisions = new Map<string, HeldDecision>();
  for (const call of calls) {
    const decision = files.get(call.job)?.calls[call.id];
    if (decision) decisions.set(call.id, decision);
  }
  return decisions;
}

interface ReviewLockGlobal {
  __discontentReviewLocks?: Map<string, Promise<unknown>>;
}

function locks(): Map<string, Promise<unknown>> {
  const global = globalThis as ReviewLockGlobal;
  return (global.__discontentReviewLocks ??= new Map());
}

/**
 * Run `fn` alone for `key` (a conversation's newest run) in this process:
 * a Save that applies calls and records them is one step, so a double
 * click cannot apply a call twice.
 */
export async function withReviewLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const held = locks();
  const before = held.get(key) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  held.set(key, tail);
  try {
    return await run;
  } finally {
    if (held.get(key) === tail) held.delete(key);
  }
}

/** Record `decisions` (by call id) in run `job`'s review file. */
export async function recordDecisions(
  dir: string,
  job: string,
  decisions: Record<string, HeldDecision>,
): Promise<void> {
  const file = await readReviewFile(dir, job);
  await mkdir(dir, { recursive: true });
  await writeJsonAtomic(
    reviewPath(dir, job),
    { v: 1, calls: { ...file.calls, ...decisions } } satisfies HeldReviewFile,
    { spaces: 2 },
  );
}
