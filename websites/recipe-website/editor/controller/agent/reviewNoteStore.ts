/**
 * Review notes, stored beside the run they judge (51e; `reviewNotes.ts`
 * has the shape): `<job>.notes.json` in the job store (`notesPath`), on
 * `reviewStore.ts`'s pattern — a file per run, pruned with it, written
 * atomically (`writeJsonAtomic`).
 *
 * Unlike a review's decisions, which only the editor's route makes, a note
 * may come from the editor (`POST /api/agent/<id>/note`) or from a local
 * `recipes agent note` sharing the job store, so the read-modify-write
 * holds a lock file per run (`<job>.notes.lock`, the cms `fileLock`) across
 * processes, as a follow-up's continue lock does (`runs.ts`).
 *
 * A note goes on an agent run that has ended: a run still working has
 * nothing to judge yet (`job_live`, 409).
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  LockTimeoutError,
  acquireLock,
  processIdentity,
  releaseLock,
  type LockRecord,
} from "@discontent/cms/git/fileLock";
import { writeJsonAtomic } from "@discontent/cms/fs/atomicWrite";
import { ulid } from "@discontent/cms/util/ulid";
import {
  CurationError,
  JobLiveError,
  NotFoundError,
  ValidationError,
  withJob,
} from "../curation/errors";
import { parseInput } from "../curation/schema";
import { jobsDirectory } from "../jobs/location";
import {
  LIVE_STATUSES,
  notesPath,
  settleOrphanedJob,
  type JobMeta,
} from "../jobs/store";
import { requireJob } from "../jobs/views";
import {
  REVIEW_NOTES_MAX,
  ReviewNoteInputSchema,
  readStoredNote,
  type ReviewNote,
} from "./reviewNotes";

interface NotesFile {
  v: 1;
  notes: ReviewNote[];
}

/** Run `job`'s notes, oldest first; none when there is no file (or it is unreadable). */
export async function readReviewNotes(
  dir: string,
  job: string,
): Promise<ReviewNote[]> {
  try {
    const parsed = JSON.parse(
      await readFile(/*turbopackIgnore: true*/ notesPath(dir, job), "utf8"),
    ) as { notes?: unknown } | null;
    const list = Array.isArray(parsed?.notes) ? parsed.notes : [];
    return list
      .map(readStoredNote)
      .filter((note): note is ReviewNote => !!note);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(
        `[notes ${job}] unreadable notes file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return [];
  }
}

/** `<job>.notes.lock`: one per run whose notes are being written. */
export function notesLockPath(dir: string, job: string): string {
  return path.join(dir, `${job}.notes.lock`);
}

const NOTES_LOCK_ID = "notesId";
/** A note's write takes milliseconds; this is a crashed holder's. */
const NOTES_LOCK_STALE_MS = 30_000;
export const NOTES_LOCK_WAIT_MS = 5_000;

async function withNotesLock<T>(
  dir: string,
  job: string,
  waitMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  await mkdir(dir, { recursive: true });
  const file = notesLockPath(dir, job);
  const id = ulid();
  const record: LockRecord & Record<string, unknown> = {
    ...processIdentity(),
    [NOTES_LOCK_ID]: id,
    op: "agent review note",
  };
  try {
    await acquireLock(file, record, {
      idKey: NOTES_LOCK_ID,
      deadline: Date.now() + waitMs,
      staleMs: NOTES_LOCK_STALE_MS,
    });
  } catch (error) {
    if (error instanceof LockTimeoutError) {
      throw new CurationError(
        "busy",
        `Another note on run ${job} is being written: try again in a moment.`,
      );
    }
    throw error;
  }
  try {
    return await fn();
  } finally {
    await releaseLock(file, NOTES_LOCK_ID, id).catch(() => undefined);
  }
}

async function stillLive(dir: string, meta: JobMeta): Promise<boolean> {
  if (!LIVE_STATUSES.includes(meta.status)) return false;
  const settled = await settleOrphanedJob(dir, meta).then(
    (result) => result.meta,
    () => meta,
  );
  return LIVE_STATUSES.includes(settled.status);
}

/** The agent run `id` names (a whole ULID or its first characters). */
export async function requireAgentRun(
  id: string,
  dir: string,
): Promise<JobMeta> {
  const meta = await requireJob(id, dir);
  if (meta.kind !== "agent") {
    throw new NotFoundError(`Job ${meta.id} is not an agent run.`);
  }
  return meta;
}

export interface AddReviewNoteResult {
  job: string;
  note: ReviewNote;
  /** Every note on the run now, oldest first. */
  notes: ReviewNote[];
}

/**
 * Add a note to run `id`: the body checked (`ReviewNoteInputSchema`;
 * `validation` with its issues), the run an ended agent run, at most
 * `REVIEW_NOTES_MAX` notes. `by` defaults to Claude Code.
 */
export async function addReviewNote(
  id: string,
  raw: unknown,
  {
    dir = jobsDirectory(),
    now = () => new Date(),
    lockWaitMs = NOTES_LOCK_WAIT_MS,
  }: {
    dir?: string;
    now?: () => Date;
    lockWaitMs?: number;
  } = {},
): Promise<AddReviewNoteResult> {
  const input = parseInput(ReviewNoteInputSchema, raw);
  const meta = await requireAgentRun(id, dir);
  if (await stillLive(dir, meta)) {
    throw withJob(
      new JobLiveError(
        `Run ${meta.id} is still ${meta.status}: note it once it has ended.`,
      ),
      meta.id,
    );
  }
  return withNotesLock(dir, meta.id, lockWaitMs, async () => {
    const notes = await readReviewNotes(dir, meta.id);
    if (notes.length >= REVIEW_NOTES_MAX) {
      throw new ValidationError(
        `Run ${meta.id} has ${REVIEW_NOTES_MAX} notes already: that is the most a run keeps.`,
      );
    }
    const note: ReviewNote = {
      id: ulid(),
      by: input.by ?? "claude-code",
      at: now().toISOString(),
      verdict: input.verdict,
      text: input.text,
      ...(input.cases && input.cases.length > 0
        ? { cases: [...new Set(input.cases)] }
        : {}),
    };
    const next = [...notes, note];
    await writeJsonAtomic(
      notesPath(dir, meta.id),
      { v: 1, notes: next } satisfies NotesFile,
      { spaces: 2 },
    );
    return { job: meta.id, note, notes: next };
  });
}

/** Run `id`'s notes, for `GET /api/agent/<id>/note`. */
export async function listReviewNotes(
  id: string,
  { dir = jobsDirectory() }: { dir?: string } = {},
): Promise<{ job: string; notes: ReviewNote[] }> {
  const meta = await requireAgentRun(id, dir);
  return { job: meta.id, notes: await readReviewNotes(dir, meta.id) };
}
