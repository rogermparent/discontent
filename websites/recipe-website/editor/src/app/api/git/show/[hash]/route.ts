/**
 * `GET /api/git/show/<hash>?maxChars` — one commit's diff (23d/D23).
 *
 * The hash is a path segment rather than a query parameter because it is the
 * resource's identity, and it is validated inside `gitShow` (hex, 7–40 chars)
 * before it can reach git's argv (T45). `maxChars` exists because a diff is
 * the one answer here that can be arbitrarily large; the default truncates at
 * 50 000 characters with the same marker the `/git` page has always shown.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  intParam,
} from "recipe-editor/controller/curation/http";
import { gitShow } from "recipe-editor/controller/curation/git";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const ctx = await requireCurationContext(request);
    const { hash } = await params;
    const maxChars = intParam(new URL(request.url), "maxChars");
    return Response.json(
      await gitShow(ctx, hash, maxChars === undefined ? {} : { maxChars }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
