/**
 * The MCP registry over HTTP — the transport half of `POST /api/mcp` (23e/D26).
 *
 * Next-free on purpose: `src/app/api/mcp/route.ts` is the four lines Next needs
 * (the `runtime` declaration, the `POST` export, the auth gate), and everything
 * that can be tested without a server lives here. A route file that imports a
 * cached read cannot be loaded under vitest at all (T17), so `test/
 * mcpHttp.test.ts` drives `handleMcpRequest` directly and Playwright covers the
 * route.
 *
 * ## What a client actually gets back
 *
 * `createMcpHandler` serves two protocol eras off one entry point, and which
 * one a caller lands on decides the wire shape:
 *
 * - **Legacy (2025-era) — the common case.** The SDK's own v2 `Client`
 *   negotiates in legacy mode by default, and so does Claude Code. Such a
 *   request is answered by the handler's stateless fallback: a fresh server
 *   from the factory per POST, over a `WebStandardStreamableHTTPServerTransport`
 *   built with `sessionIdGenerator: undefined`. That transport defaults
 *   `enableJsonResponse` to `false`, so **every legacy POST comes back as
 *   `200 text/event-stream` carrying exactly one `event: message` frame, and
 *   the stream then closes** — a complete answer per request, never a session
 *   (no `mcp-session-id` header is ever sent) and never a long-lived stream.
 *   A notification-only POST is `202` with an empty body. `responseMode` does
 *   not reach this leg at all (T55), which is why it is not set below.
 * - **Modern (2026-07-28).** A client that opts into version negotiation gets
 *   a single `application/json` body, because `responseMode` defaults to
 *   `"auto"` and no tool in the registry emits a notification before its
 *   result (T56: adding progress or logging to one would flip it to SSE).
 *
 * `legacy` stays at its default `"stateless"`: `"reject"` would 400 every
 * 2025-era client, which is every client we have. The one consequence is that
 * GET and DELETE on the legacy leg are 405s — which is what the client's
 * post-initialize standalone GET wants anyway (it swallows a 405 silently and
 * reconnect-loops on anything else, T58), and the route exports no `GET`, so
 * Next answers that before the handler is ever reached.
 *
 * ### If `next dev` ever mishandles the streamed legacy body
 *
 * The fallback, should a streamed response ever fail to reach a client through
 * Next: branch in front of the handler on `isLegacyRequest(request)` (exported
 * by the SDK; it classifies from an internal clone, so the request stays
 * readable), serve the legacy leg from a hand-wired
 * `WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined,
 * enableJsonResponse: true})` — connect, `handleRequest`, close when the
 * response resolves — and keep `createMcpHandler(factory, {legacy: "reject"})`
 * for the modern leg. That is ~25 lines replicating the SDK's own
 * `createLegacyStatelessFallback` with JSON responses, and it is deliberately
 * **not built**: Playwright would have to force it.
 *
 * ## One handler per request
 *
 * Building the backend, the server and the handler per request is not a
 * pessimisation to fix later: the `CurationContext` is per request (it carries
 * the caller's email as the commit author and that request's revalidation
 * hooks), so a shared handler would have to smuggle the context in some other
 * way. A `createMcpHandler` allocates an in-memory bus, a listen router and an
 * `inflight` set and nothing else; the legacy leg tears its transport and
 * server down when the response body drains and the modern leg closes after
 * the terminal response, so nothing is retained and `handler.close()` is never
 * needed here — calling it before the SSE body drains would abort the exchange
 * outright (T59).
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createLocalBackend } from "../cli/backend/local";
import type { CurationContext } from "../controller/curation/context";
import { createRecipeServer } from "./registry";

/**
 * Serve one MCP request against one authenticated curation context.
 *
 * Never throws: the SDK converts a handler failure into a JSON-RPC error
 * response, which is why the route returns this directly rather than wrapping
 * it in the `errorResponse` a 401 goes through.
 *
 * The body is untouched here and in the route — `handler.fetch` clones the
 * request and reads the clone, and a body somebody else already consumed makes
 * that clone throw (T54). `authenticateRequest` reads headers only, so the
 * gate in front of this is safe.
 */
export async function handleMcpRequest(
  request: Request,
  ctx: CurationContext,
): Promise<Response> {
  /*
   * The same backend the CLI and the stdio server build, minus the three
   * things only an out-of-process caller does: the committer-identity
   * preflight, the stale-editor hint, and closing the process-wide LMDB cache
   * (D25 — that last one would close the server's own environments, T52).
   */
  const backend = createLocalBackend({ ...ctx, inProcess: true });

  const handler = createMcpHandler(() => createRecipeServer(backend), {
    /*
     * No keepalive comments. Every stream this serves carries one frame and
     * closes immediately, so the 15 s default would only ever fire on a
     * response that has already ended.
     */
    keepAliveMs: 0,
    /*
     * `console.error`, never stdout: the stdio server shares this registry and
     * its stdout belongs to the protocol (T21), and the grep that enforces that
     * covers this directory.
     */
    onerror: (error) =>
      console.error(`recipes MCP (http): ${error.stack ?? error.message}`),
  });

  return handler.fetch(request);
}
