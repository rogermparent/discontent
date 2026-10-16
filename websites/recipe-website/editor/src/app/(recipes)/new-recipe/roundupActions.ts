"use server";

/**
 * The roundup picker's two server actions (35r), over 34f's seats — the same
 * `inspectList` / `importList` that `/api/inspect-list`, `/api/import-list`,
 * the CLI and MCP reach, with the session's context in place of a token.
 *
 * - Signed in, or nothing: `authenticateUser`, as every editor action, and
 *   `unauthenticated` otherwise.
 * - The input is parsed strictly (`RoundupImportInputSchema`), so a bad shape
 *   is `validation`, never `internal`. The URL and picks are then the seat's
 *   to check: `inspectList` / `importList` refuse a non-http(s) URL, the
 *   importer's fetch keeps its own guards, and `ImportListOptionsSchema`
 *   validates the picks and the term exactly as the API body is validated.
 * - **At most `ROUNDUP_CHUNK` picks a call**, and passed as the seat's
 *   `limit` too. One call re-fetches the list page, then a page and an image
 *   per pick, each 15 s after the last request to that site: seven requests,
 *   so ≥ 105 s against one site when the previous call just ended there, and
 *   15 s more for each 403 retry.
 * - The term field may hold a label: it is resolved to the vocabulary's slug
 *   first (`resolveTermSlug`), so "Speed & effort" means `effort`.
 * - Revalidation is the context's: `curationContextFor` gives each write the
 *   `onWrite` the API routes use, so every recipe the call imports (its own
 *   commit) and the term's create-and-assign expire their pages as they land.
 *
 * Answers are plain objects — an error is `{error: {code, message}}`, never a
 * throw — because the client keeps looping and needs to know why it stopped.
 *
 * **Each call is two (38b): start, then read the answer.** The start action
 * enqueues the chunk's job (`inspect-list` / `import-list`) and answers its
 * id at once; the picker follows the job's steps live (`useJobPoll`, as the
 * form's import panel does) and, once it ends, asks the result action for
 * the answer — read back from the job's record, so a chunk's outcome is
 * the one the job recorded, whoever looks. A failed, cancelled or
 * interrupted job answers its error. The job's writes outlive the start
 * action's answer, so their revalidation is handed to `after()` (37-T26).
 *
 * **Without a job store** (37-T6: the jobs dir cannot be written) the job
 * runs with no record, and its id would answer 404 to the picker's poll —
 * read as the end, so a run would stop while its chunk went on importing,
 * and Resume would import the same picks again. So when the record was not
 * written, the start action awaits the job and answers inline (`answer`),
 * as it did before 38b; the picker then has nothing to follow.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { after } from "next/server";
import { z } from "zod";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  UnauthenticatedError,
  ValidationError,
  toErrorObject,
  type ErrorObject,
} from "recipe-editor/controller/curation/errors";
import {
  type ImportListResult,
  type ImportListTermResult,
  type InspectListResult,
} from "recipe-editor/controller/curation/importList";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { corpusOf, startSpec } from "recipe-editor/controller/jobs/kinds";
import { getJobView } from "recipe-editor/controller/jobs/views";
import { listTerms } from "recipe-editor/controller/curation/terms";
import {
  ROUNDUP_CHUNK,
  type RoundupOutcome,
  type RoundupPick,
} from "recipe-editor/controller/roundupPicker";
import {
  resolveTermSlug,
  settleChunk,
} from "recipe-editor/controller/roundupSettle";
import { authenticateUser } from "recipe-editor/controller/actions/shared";

type Failure = { error: ErrorObject["error"] };

async function context() {
  const email = await authenticateUser();
  if (!email) throw new UnauthenticatedError();
  return curationContextFor(email, getContentDirectory());
}

function failure(error: unknown): Failure {
  return { error: toErrorObject(error).error };
}

/** A started chunk: the job to follow. */
export interface RoundupJobStarted {
  job: string;
}

/** A chunk answered inline: the job had no record to follow (no store). */
export interface RoundupJobAnswered<T> {
  job: string;
  answer: T;
}

/**
 * The record of a job this picker started, once it has ended: its result,
 * or its error as the answer's (`job` naming it). `kind` guards against an
 * id of some other job (a stale tab, a typo'd address).
 */
async function endedResult<T>(
  job: string,
  kind: string,
): Promise<{ result: T & { job: string } } | Failure> {
  if (typeof job !== "string" || !job.trim()) {
    throw new ValidationError("No job given.");
  }
  const { meta, live } = await getJobView(job.trim());
  if (meta.kind !== kind) {
    throw new ValidationError(`Job ${meta.id} is a ${meta.kind} job.`);
  }
  if (live) throw new ValidationError(`Job ${meta.id} is still running.`);
  if (meta.status !== "done") {
    const error = meta.error ?? {
      code: "import_failed",
      message: `Job ${meta.id} ended ${meta.status}.`,
    };
    return {
      error: { ...error, job: meta.id } as Failure["error"],
    };
  }
  return { result: { ...(meta.result as T), job: meta.id } };
}

/** Start listing the roundup (an `inspect-list` job); nothing written. */
export async function inspectRoundupAction(
  url: string,
): Promise<
  | RoundupJobStarted
  | RoundupJobAnswered<{ result: InspectListResult }>
  | Failure
> {
  try {
    const ctx = await context();
    if (typeof url !== "string" || !url.trim()) {
      throw new ValidationError("Paste the roundup's URL.");
    }
    const { job, stored, done } = await startSpec(
      { kind: "inspect-list", ...corpusOf(ctx), url: url.trim() },
      { ctx },
    );
    /* No record to follow: wait for the job here (a failure is thrown). */
    if (!stored) return { job, answer: { result: await done } };
    return { job };
  } catch (error) {
    return failure(error);
  }
}

/** The list, with `existing` marked: an ended `inspect-list` job's result. */
export async function inspectRoundupResult(
  job: string,
): Promise<{ result: InspectListResult } | Failure> {
  try {
    await context();
    return await endedResult<InspectListResult>(job, "inspect-list");
  } catch (error) {
    return failure(error);
  }
}

const RoundupImportInputSchema = z.strictObject({
  url: z.string().trim().min(1),
  picks: z
    .array(
      z.strictObject({
        n: z.number().int().min(1),
        url: z.string().min(1),
        name: z.string(),
      }),
    )
    .min(1)
    .max(ROUNDUP_CHUNK, `At most ${ROUNDUP_CHUNK} picks a call`),
  term: z.string().trim().optional(),
  termLabel: z.string().trim().optional(),
});

export type RoundupImportInput = z.input<typeof RoundupImportInputSchema>;

/** The picks a chunk was started with, to read its answer against. */
const RoundupPicksSchema = RoundupImportInputSchema.shape.picks;

export interface RoundupImportAnswer {
  outcomes: RoundupOutcome[];
  /** Picks to put back at the front of the queue. */
  requeue: RoundupPick[];
  /** The call made no progress: stop rather than ask again. */
  stalled: boolean;
  term?: ImportListTermResult;
  warnings?: string[];
}

/**
 * Start importing up to `ROUNDUP_CHUNK` picks, one commit each, then the
 * term: an `import-list` job, one per chunk.
 */
export async function importRoundupAction(
  raw: RoundupImportInput,
): Promise<
  RoundupJobStarted | RoundupJobAnswered<RoundupImportAnswer> | Failure
> {
  try {
    const ctx = await context();
    const input = parseInput(RoundupImportInputSchema, raw);
    const term = input.term
      ? resolveTermSlug((await listTerms(ctx)).terms, input.term)
      : undefined;
    const termLabel = (term && input.termLabel) || undefined;
    const { job, stored, done } = await startSpec(
      {
        kind: "import-list",
        ...corpusOf(ctx),
        url: input.url,
        options: {
          /* Back as the seat hands out `remaining`: checked against the list. */
          pick: input.picks.map(({ n, url }) => ({ n, url })),
          limit: ROUNDUP_CHUNK,
          ...(term ? { term } : {}),
          ...(termLabel ? { termLabel } : {}),
        },
      },
      { ctx },
    );
    /* No record to follow: wait for the job here, its writes included. */
    if (!stored) {
      return { job, answer: chunkAnswer(input.picks, await done) };
    }
    /* The writes land after this answer: their revalidation runs when the
     * job ends (37-T26). The job records its own failure. */
    after(() =>
      done.then(
        () => undefined,
        () => undefined,
      ),
    );
    return { job };
  } catch (error) {
    return failure(error);
  }
}

/** What an ended chunk's job means for each of its picks. */
export async function importRoundupResult(
  job: string,
  picks: RoundupImportInput["picks"],
): Promise<RoundupImportAnswer | Failure> {
  try {
    await context();
    const chunk = parseInput(RoundupPicksSchema, picks);
    const ended = await endedResult<ImportListResult>(job, "import-list");
    if ("error" in ended) return ended;
    return chunkAnswer(chunk, ended.result);
  } catch (error) {
    return failure(error);
  }
}

/** A chunk's picks against its job's result: the picker's answer. */
function chunkAnswer(
  chunk: RoundupPick[],
  result: ImportListResult,
): RoundupImportAnswer {
  const settled = settleChunk(chunk, result);
  const warnings = [
    ...(result.warnings ?? []),
    ...(result.term?.warnings ?? []),
    ...(result.term?.error ? [result.term.error.message] : []),
  ];
  return {
    ...settled,
    ...(result.term ? { term: result.term } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}
