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
 * runs on in the editor, and `GET /api/jobs/<job>` follows it.
 *
 * Curation auth, write scope.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { retryJobById } from "recipe-editor/controller/jobs/views";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { id } = await params;
    return Response.json(await retryJobById(id, ctx), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
