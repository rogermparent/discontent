/**
 * `/api/agent/<id>/note` — review notes on a curator run (epic 51, 51e).
 *
 * - `GET` — `{job, notes}`: the run's notes, oldest first. Read scope (as
 *   the run view, which carries them too as `reviewNotes`).
 * - `POST` `{verdict, text, by?, cases?}` — add one. `verdict` is
 *   `approved`, `left-for-you`, `rerun` or `miss`; `text` is plain text, at
 *   most 4,000 characters, no HTML tags; `by` is `claude-code` (the
 *   default) or `you`; `cases` names the case ids a miss became. Answers
 *   201 `{job, note, notes}`. Write scope (De1): a signed-in session or a
 *   write token — the same as approving the run's held writes
 *   (`/review`'s `POST`), the narrowest scope that can approve; a read
 *   token is 403. A run still working is 409 `job_live`; not an agent run
 *   is 404; a bad body is 400 `validation` with its issues.
 *
 * `<id>` as `GET /api/agent/<id>` takes it. A note is data: it changes
 * nothing in the content repository and is pruned with its run.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  addReviewNote,
  listReviewNotes,
} from "recipe-editor/controller/agent/reviewNoteStore";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    return Response.json(await listReviewNotes(id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurationContext(request);
    const { id } = await params;
    return Response.json(await addReviewNote(id, await readJsonBody(request)), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
