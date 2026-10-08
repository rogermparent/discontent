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
 * so the ref watcher does not start a second run for it.
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

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request, { optional: true });
    const options = parseInput(GitSyncSchema, body ?? {});
    const instance = getInstance();
    if (instance && instance.role === "workstation") {
      const result = await syncMirror(
        ctx.contentDirectory,
        options.remote,
        instance.exclusive,
      );
      instance.runner?.noteOwnHead(result.head);
      return Response.json(result);
    }
    return Response.json(await gitSync(ctx, options));
  } catch (error) {
    return errorResponse(error);
  }
}
