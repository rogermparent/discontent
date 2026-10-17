/**
 * `PUT /api/git/standing` — a mirror is told the workstation's standing sync
 * state for it (epic 39, D4): `{asOf, conflict: {since, job?} | null}`.
 *
 * The workstation sends it after a sync whose standing state differs from
 * what this mirror last accepted (`pushStanding`), to the same URL and with
 * the same token as the site settings (28-D7). The mirror keeps the newest
 * (`asOf`) for its `/git` and Maintenance banner. It changes nothing else:
 * no merge, no push (28-D1). Write token required; a workstation answers
 * 403, since the state is its own.
 */
import { isMirror } from "recipe-website-common/config/role";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  ForbiddenError,
  ValidationError,
} from "recipe-editor/controller/curation/errors";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  parseStanding,
  recordStanding,
} from "recipe-editor/controller/instance/standing";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    if (!isMirror()) {
      throw new ForbiddenError(
        "This editor is a workstation: the standing sync state is its own, not received.",
      );
    }
    const standing = parseStanding(await readJsonBody(request));
    if (!standing) {
      throw new ValidationError(
        "The body must be {asOf, conflict: {since, job?} | null}, with ISO times.",
      );
    }
    const kept = await recordStanding(ctx.contentDirectory, standing, "push");
    return Response.json({ ok: true, kept });
  } catch (error) {
    return errorResponse(error);
  }
}
