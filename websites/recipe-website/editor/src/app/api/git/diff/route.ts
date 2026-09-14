/**
 * `GET /api/git/diff?from&to&path` — what changed between two revisions
 * (23d/D23).
 *
 * `to` defaults to `HEAD`, which makes the common question — "how far has this
 * drifted from the revision I remember" — a one-parameter call. `path` narrows
 * it; both revisions and the path are refused if they begin with `-`, which
 * git would read as an option (T45).
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { gitDiff } from "recipe-editor/controller/curation/git";
import {
  GitDiffQuerySchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const path = url.searchParams.get("path");
    const options = parseInput(GitDiffQuerySchema, {
      from: from ?? undefined,
      ...(to === null ? {} : { to }),
      ...(path === null ? {} : { path }),
    });
    return Response.json(await gitDiff(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
