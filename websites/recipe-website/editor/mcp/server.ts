/**
 * `pnpm --filter recipe-editor mcp` — the curation layer as an MCP stdio
 * server (D14).
 *
 * ## stdout belongs to the protocol
 *
 * This process's stdout carries newline-delimited JSON-RPC frames and nothing
 * else. One stray byte — a `console.log` anywhere in the import graph, pnpm's
 * script banner, a library's startup chatter — lands in the middle of the
 * handshake and the client's parser gives up (T21). So:
 *
 * - every diagnostic here goes through `console.error`;
 * - `.mcp.json` runs the script with `pnpm --silent`;
 * - this file must never import `cli/output.ts`, whose whole job is writing to
 *   stdout.
 *
 * `test/mcpStdio.test.ts` spawns this exact command and completes a handshake,
 * which is the only check that actually proves the property.
 *
 * ## Shape
 *
 * CJS under `tsx` (the editor package has no `"type": "module"`), so no
 * top-level await: everything runs inside `main()`, which returns as soon as
 * `serveStdio` — which is synchronous — has taken the transport.
 *
 * Mode resolution is `cli/backend/resolve.ts`, the same function the CLI calls
 * (D11), so `RECIPE_API_URL` turns this into a remote driver and everything
 * else opens the local content directory. **The default is the real content
 * repository**, through `editor/content`; a test or a smoke run must export
 * `CONTENT_DIRECTORY`.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import process from "node:process";
import {
  createBackend,
  resolveBackendConfig,
  type BackendConfig,
} from "../cli/backend/resolve";
import { createRecipeServer } from "./registry";

function describe(config: BackendConfig): string {
  return config.kind === "http"
    ? `remote ${config.baseUrl}`
    : `local ${config.contentDirectory}`;
}

export function main(): void {
  const config = resolveBackendConfig({}, process.env);
  const backend = createBackend(config);

  /* The one line of output that is not a protocol frame, and it is on stderr. */
  console.error(`recipes MCP: ${describe(config)}`);

  const handle = serveStdio(() => createRecipeServer(backend), {
    onerror: (error) => {
      console.error(`recipes MCP: ${error.stack ?? error.message}`);
    },
  });

  /*
   * Closing order matters and the guard is not paranoia.
   *
   * LMDB environments are mapped files held per process (T5/T16): exiting
   * before `backend.close()` resolves leaves a lock another process trips
   * over. And a client that closes the pipe *and* sends SIGTERM — which is
   * what a supervisor does on shutdown — would otherwise run this twice and
   * close the same environments underneath the first pass.
   */
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      try {
        await handle.close();
      } catch (error) {
        console.error(`recipes MCP: transport close failed: ${String(error)}`);
      }
      try {
        await backend.close();
      } catch (error) {
        console.error(`recipes MCP: backend close failed: ${String(error)}`);
      }
      process.exit(0);
    })();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  /*
   * The transport has stdin flowing, so `end` fires when the client closes its
   * side — which is how an MCP client says goodbye. `close` covers the pipe
   * being torn down without an orderly end.
   */
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
}

/* Same guard `cli/index.ts` uses: tsx runs this file as CJS. */
if (require.main === module) {
  main();
}

export default main;
