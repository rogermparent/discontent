/**
 * `POST /api/import-list` — import a roundup's picks (34f, D11).
 *
 * The body is `{url, pick?: number[], all?: true, term?, termLabel?, dryRun?,
 * limit?}`; the answer is `ImportListResult`: one result per pick, the picks
 * the per-call cap left in `remaining`, any dropped site, and the term's
 * create-and-assign. Requests to one site are 15 s apart, so a call takes
 * minutes, not seconds — `limit` keeps it near 90 s.
 *
 * Always 200: a call is a batch report, and one may import nothing (every
 * pick `existing`) or fail per item while the call itself succeeds. Each
 * imported recipe was its own commit and its own `onWrite`, so the caches
 * were invalidated as the call went.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { importList } from "recipe-editor/controller/curation/importList";
import { ValidationError } from "recipe-editor/controller/curation/errors";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("The body must be a JSON object");
    }
    const { url, ...options } = body as Record<string, unknown>;
    if (typeof url !== "string" || !url) {
      throw new ValidationError("import-list needs a url", [
        { path: "url", message: "Required" },
      ]);
    }
    return Response.json(await importList(ctx, url, options));
  } catch (error) {
    return errorResponse(error);
  }
}
