/**
 * `GET /api/git/log?type&slug&limit&offset` — a page of history (23d/D23).
 *
 * `type` and `slug` narrow it to one content type or one item, which is the
 * read a curator actually wants: "what has happened to this recipe" rather
 * than "what has happened". Each entry carries the content paths its commit
 * touched, so a caller can tell a rename from an edit without a second call.
 *
 * The query is assembled into an object and parsed by the same schema the MCP
 * tool publishes, so a typo is a 400 with zod's issue list rather than a
 * silently ignored parameter.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  intParam,
} from "recipe-editor/controller/curation/http";
import { gitLog } from "recipe-editor/controller/curation/git";
import {
  GitLogQuerySchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const slug = url.searchParams.get("slug");
    const limit = intParam(url, "limit");
    const offset = intParam(url, "offset");
    const options = parseInput(GitLogQuerySchema, {
      ...(type === null ? {} : { type }),
      ...(slug === null ? {} : { slug }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
    return Response.json(await gitLog(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
