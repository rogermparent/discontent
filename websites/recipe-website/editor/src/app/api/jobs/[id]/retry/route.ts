/**
 * `POST /api/jobs/<id>/retry` — run a job again (epic 37, 37c, D7).
 *
 * The recorded spec, replayed through `startSpec` with **this editor's own
 * context** (`requireCurationContext`: the caller as author, the editor's
 * caches revalidated) — never one built from the spec. A corpus job
 * recorded against another content directory (a CLI run against a scratch
 * clone) is refused with `usage` (400), saying why: it must not be replayed
 * into this one.
 *
 * Answers 202 at once with `{job, retryOf, status: "running"}`: the new job
 * runs on in the editor, and `GET /api/jobs/<job>` follows it. A job still
 * live, or one a live job already runs again, is refused with `job_live`
 * (409) and that live job's id as `error.job`.
 *
 * **The job's revalidation outlives the answer** (37c review, T26): Next
 * runs a route's pending `revalidatePath`/`revalidateTag` once, when the
 * handler returns, and a write the job makes later would be dropped. The
 * job's outcome is handed to `after()`, whose callbacks Next runs inside
 * `withExecuteRevalidates` — the tags the job's writes queued meanwhile
 * are executed when it ends.
 *
 * An optional JSON body `{"fresh": true}` (39a, `/jobs/<id>`'s "Read it
 * again" box, `recipes jobs retry --fresh`) makes an import skip its kept
 * reading; no body, or `fresh` false, is a plain retry. The answer echoes
 * `fresh: true` when it was honoured, so a client can tell this editor
 * from one that predates it.
 *
 * Curation auth, write scope.
 */
import { after } from "next/server";
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { retryJobById } from "recipe-editor/controller/jobs/views";

const RetryBodySchema = z.strictObject({ fresh: z.boolean().optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { id } = await params;
    const body = await readJsonBody(request, { optional: true });
    const { fresh } =
      body === undefined ? {} : parseInput(RetryBodySchema, body);
    return Response.json(
      await retryJobById(id, ctx, {
        ...(fresh ? { fresh: true } : {}),
        /* The job records its own failure: nothing to rethrow here. */
        background: (done) =>
          after(() =>
            done.then(
              () => undefined,
              () => undefined,
            ),
          ),
      }),
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
