/**
 * `POST /api/mcp` — the 28-tool curation registry over HTTP (23e/D8, D24).
 *
 * The same `mcp/registry.ts` the stdio server serves, so a remote MCP client —
 * a Claude Code on another machine, a connector — can curate this editor with
 * no checkout at all.
 *
 * **The whole endpoint is authenticated**, `tools/list` included: one MCP entry
 * point cannot know a call is a read before it dispatches it, and the stdio
 * server has no anonymous mode either. `requireCurationContext` is the same
 * gate every `/api/git/*` route uses — a bearer token or a session — and it
 * reads headers only, which matters here: the MCP handler clones the request
 * and reads the clone, so a gate that touched the body would break every call
 * (T54).
 *
 * **`POST` only, on purpose.** No `GET`/`DELETE`/`HEAD` export, so Next answers
 * those with an empty 405 — exactly what a streamable-HTTP client's
 * post-initialize standalone GET expects (it swallows a 405 and reconnect-loops
 * on anything else, T58). Sessions, resumability and the standalone SSE stream
 * are not part of this: every POST is one complete answer.
 *
 * **Two returns, and they are not interchangeable.** An unauthenticated request
 * gets the usual `{error: {code: "unauthenticated"}}` 401 that every other
 * route answers with — not a JSON-RPC error, because the caller is not yet in a
 * protocol conversation. Past the gate, `handleMcpRequest` never throws: the
 * SDK turns a failure into a JSON-RPC error response, and re-shaping that
 * through `errorResponse` would corrupt it.
 *
 * `export const runtime = "nodejs"` for the same reason its eight `/api/git/*`
 * siblings have it (T23): the tools underneath spawn `simple-git` and map LMDB
 * files, neither of which the edge runtime can do.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import type { CurationContext } from "recipe-editor/controller/curation/context";
import { handleMcpRequest } from "recipe-editor/mcp/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let ctx: CurationContext;
  try {
    ctx = await requireCurationContext(request);
  } catch (error) {
    return errorResponse(error);
  }
  return handleMcpRequest(request, ctx);
}
