/**
 * `/api/groups` — meal plans and collections, listed and created.
 *
 * `?force=1` is the group equivalent of the CLI's `--force`: items naming a
 * recipe that does not exist are a legitimate state (groups declare no
 * `references`, D3), so the default is to refuse with 422 and the flag
 * downgrades it to `warnings` on the response.
 */
import {
  readContext,
  requireCurationContext,
} from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  intParam,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  createGroup,
  listGroups,
} from "recipe-editor/controller/curation/groups";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json(
      await listGroups(readContext(), {
        limit: intParam(url, "limit"),
        offset: intParam(url, "offset"),
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    const result = await createGroup(ctx, body, {
      force: boolParam(url, "force"),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
