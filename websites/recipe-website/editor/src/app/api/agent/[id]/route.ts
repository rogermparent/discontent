/**
 * `GET /api/agent/<id>?from=<n>&transcriptFrom=<m>` — one agent run (epic
 * 44, 44c): what `/api/jobs/<id>` answers (its record, its step log from
 * byte `n`, `next`, `live`) plus its conversation — the transcript's
 * records from byte `m` on as `transcript`, and `transcriptNext` to ask
 * from next time (Ec4: two files, two offsets). Claude's raw blocks are
 * left out; nothing secret is in a transcript.
 *
 * `<id>` is the whole ULID, or the eight characters the step lines show. A
 * job that is not an agent run is 404. Curation auth, read scope (E5: a
 * read token may read runs).
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { parseFrom } from "recipe-editor/controller/jobs/views";
import { getAgentRunView } from "recipe-editor/controller/agent/runs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurationContext(request, { need: "read" });
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    return Response.json(
      await getAgentRunView(id, {
        from: parseFrom(query.get("from")),
        transcriptFrom: parseFrom(query.get("transcriptFrom")),
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
