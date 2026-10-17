/**
 * `POST /api/git/sync {remote?}` — sync with a mirror (epic 28, D3/D4).
 *
 * Fetch, merge the mirror's commits in, push ours back. Always 200 with an
 * `outcome` for the expected failures (`conflict`, `mirror_dirty`, `raced`,
 * `unreachable`, `blocked`); errors are misuse: 403 on a mirror, 422 for an
 * unknown remote. A merge rebuilds every index.
 *
 * This is the endpoint a mirror pings after its own commits (28c). When the
 * workstation's instance is running, the sync goes through it — queued
 * behind any run in progress, under the repository lock, with the mirror's
 * ssh preflight read off the remote URL — and the HEAD it produces is noted
 * so the ref watcher does not start a second run for it. It runs as a
 * `git-sync` job (epic 39 D2) and the answer carries its id as `job`.
 *
 * Epic 39, D4: the answer also carries `standing` — the workstation's
 * standing state for that mirror (`{asOf, conflict: {since, job?} | null}`),
 * whatever this run's outcome, so a ping that answers `busy` or `blocked`
 * still tells the mirror a conflict stands, and one that answers `nothing`
 * tells it the conflict is gone.
 *
 * Several mirrors (39d review): a ping names its remote when the mirror has
 * `WORKSTATION_REMOTE` set (`{remote}`), and the sync and its `standing` are
 * that mirror's; a ping without one (`{}`, every mirror before 39d) syncs —
 * and answers for — the first mirror in the workstation's settings.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { gitSync } from "recipe-editor/controller/curation/sync";
import {
  GitSyncSchema,
  parseInput,
} from "recipe-editor/controller/curation/schema";
import {
  getInstance,
  syncMirror,
} from "recipe-editor/controller/instance/start";
import { standingOf } from "recipe-editor/controller/instance/standing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitSyncSchema, body ?? {});
    const instance = getInstance();
    if (instance && instance.role === "workstation") {
      const result = await syncMirror(ctx.contentDirectory, options.remote, [
        "ping",
      ]);
      instance.runner?.noteOwnHead(result.head);
      return Response.json({ ...result, standing: standingOf(result.state) });
    }
    const result = await gitSync(ctx, options);
    return Response.json({ ...result, standing: standingOf(result.state) });
  } catch (error) {
    return errorResponse(error);
  }
}
