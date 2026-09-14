// @vitest-environment node
//
// The MCP registry over HTTP, driven by a real client (23e/D24–D26).
//
// `mcp.test.ts` already proves the registry answers correctly over a transport,
// so nothing here re-checks a tool's result shape. What is worth pinning is
// everything the *HTTP* leg adds and nothing else covers: that the in-process
// backend drops the three local-only jobs (T52/T53), that consecutive requests
// against one content directory keep working (each builds its own backend), and
// the wire shape itself — the legacy SSE-per-POST answer, the modern JSON one,
// and the four ways a malformed body is refused before any of it happens.
//
// The route is deliberately absent: a route file cannot be loaded under vitest
// (T17), so this drives `handleMcpRequest` and `mcp-http.spec.ts` covers the
// route, the auth gate and Next's 405.

import { mkdtemp, pathExists, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  Client,
  StreamableHTTPClientTransport,
  type FetchLike,
} from "@modelcontextprotocol/client";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type {
  ContentWriteEvent,
  CurationContext,
} from "../websites/recipe-website/editor/controller/curation/context";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { handleMcpRequest } from "../websites/recipe-website/editor/mcp/http";
import { TOOL_NAMES } from "../websites/recipe-website/editor/mcp/registry";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

/** The URL is arbitrary: nothing below ever opens a socket. */
const ENDPOINT = "http://editor.test/api/mcp";

/** One captured exchange, for the cases that assert on the raw wire. */
interface Exchange {
  method: string;
  status: number;
  contentType: string | null;
  sessionId: string | null;
  body: string;
}

describe("the MCP registry over HTTP", () => {
  let contentDirectory: string;
  let previousContentDirectory: string | undefined;
  let events: ContentWriteEvent[];
  let bulk: number;
  let ctx: CurationContext;
  let client: Client;
  let transport: StreamableHTTPClientTransport;
  let exchanges: Exchange[];

  /**
   * The client's socket, replaced by a direct call into the handler.
   *
   * Everything the route does other than authenticate is here: a `POST` reaches
   * `handleMcpRequest` with the request untouched (T54 — the handler clones and
   * reads the clone, so nothing may consume the body first), and every other
   * method gets the empty 405 Next answers with for an unexported method. That
   * 405 is load-bearing: the client fires a standalone GET after
   * `notifications/initialized` and swallows exactly a 405, reconnect-looping on
   * anything else (T58).
   */
  function fetchVia(context: CurationContext): FetchLike {
    return async (url, init) => {
      const request = new Request(url, init);
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const response = await handleMcpRequest(request, context);
      /*
       * Recorded from a clone so the client still gets an untouched body. Safe
       * to await here: every stream this handler serves carries one frame and
       * closes, so the clone drains without the client reading anything.
       */
      const copy = response.clone();
      exchanges.push({
        method: request.method,
        status: copy.status,
        contentType: copy.headers.get("content-type"),
        sessionId: copy.headers.get("mcp-session-id"),
        body: await copy.text(),
      });
      return response;
    };
  }

  function transportFor(
    context: CurationContext,
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      fetch: fetchVia(context),
    });
  }

  /** A raw POST, bypassing the client — the only way to see a refusal. */
  async function post(
    body: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return handleMcpRequest(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
        body,
      }),
      ctx,
    );
  }

  /** The JSON-RPC object inside a legacy leg's single `event: message` frame. */
  function frameData(text: string): Record<string, unknown> {
    const line = text
      .split("\n")
      .find((candidate) => candidate.startsWith("data:"));
    expect(line, `no data line in ${JSON.stringify(text)}`).toBeDefined();
    return JSON.parse(line!.slice("data:".length).trim());
  }

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "mcp-http-"));
    /*
     * Not a git repository, so `commitContentChanges` no-ops and the identity
     * question does not arise — the one case that needs a real repo makes its
     * own. The env is set as well because `getContentDirectory()` reads it at
     * import time (T16) and a regression that reached for the ambient directory
     * would otherwise find the developer's own content.
     */
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;

    events = [];
    bulk = 0;
    exchanges = [];
    ctx = {
      contentDirectory,
      author: { name: "mcp@test", email: "mcp@test" },
      onWrite: (event) => events.push(event),
      onBulkChange: () => {
        bulk += 1;
      },
    };

    transport = transportFor(ctx);
    client = new Client({ name: "mcp-http-test", version: "0" });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client.close();
    /*
     * The handler's own backends never touch this (T52); the *test process*
     * owns the cache, so it is the one that has to hand the mappings back.
     */
    await closeCachedEnvironments();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  const cake = {
    name: "Chocolate Cake",
    tags: ["Dessert"],
    description: "Rich and dark.",
    ingredients: ["2 cups flour", "1 cup cocoa"],
    totalTime: 90,
    prepTime: 20,
  };

  /* ---------------------------------------------------------------- */
  /* 1. The same surface stdio serves, and no session                  */
  /* ---------------------------------------------------------------- */

  it("serves the whole registry, statelessly", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    /*
     * The legacy stateless fallback never issues one, so the client has nothing
     * to echo back — which is the observable form of "every POST is a complete
     * exchange".
     */
    expect(transport.sessionId).toBeUndefined();
    expect(exchanges.every((exchange) => exchange.sessionId === null)).toBe(
      true,
    );
  });

  /* ---------------------------------------------------------------- */
  /* 2. A write reaches the context's hooks, and carries no hint       */
  /* ---------------------------------------------------------------- */

  it("writes through the request's own context, with no stale-editor hint", async () => {
    const result = await client.callTool({
      name: "recipe_create",
      arguments: { recipe: cake },
    });
    expect(result.isError).not.toBe(true);

    /* The route's `onWrite` is what makes a browser page correct afterwards. */
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "create", contentType: "recipes" });
    expect(bulk).toBe(0);

    /*
     * The hint the CLI prints would be a lie here: this *is* the process that
     * owns the caches and has just invalidated them (T53). A `warnings` entry
     * over HTTP means the wrong backend was built.
     */
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.slug).toBe("chocolate-cake");
    expect(structured.warnings).toBeUndefined();
  });

  /* ---------------------------------------------------------------- */
  /* 3. Per-request backends do not evict each other                   */
  /* ---------------------------------------------------------------- */

  it("keeps the LMDB cache alive across requests", async () => {
    await client.callTool({
      name: "recipe_create",
      arguments: { recipe: cake },
    });

    /*
     * Two more requests, each building its own backend over the same content
     * directory. If any of them closed the process-wide environment cache the
     * next read would reopen — or fail — rather than answer.
     */
    const recipes = await client.callTool({ name: "recipe_list" });
    expect(
      (recipes.structuredContent as { recipes: unknown[] }).recipes,
    ).toHaveLength(1);
    const groups = await client.callTool({ name: "group_list" });
    expect(
      (groups.structuredContent as { groups: unknown[] }).groups,
    ).toHaveLength(0);

    /* And the seam itself, directly: absent hint, inert close (T52/T53). */
    const inProcess = createLocalBackend({ contentDirectory, inProcess: true });
    expect(inProcess.afterWrite).toBeUndefined();
    await inProcess.close();

    const plain = createLocalBackend({ contentDirectory });
    expect(plain.afterWrite).toBeDefined();
    expect((await plain.listRecipes()).recipes).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /* 4. A failure from below keeps the layer's own shape               */
  /* ---------------------------------------------------------------- */

  it("answers a curation failure with the CLI's error object", async () => {
    const result = await client.callTool({
      name: "group_get",
      arguments: { slug: "nope" },
    });
    expect(result.isError).toBe(true);
    /* A curation-layer failure, not one the SDK's schema caught first (T28). */
    const { error } = result.structuredContent as {
      error: { code: string; slug?: string };
    };
    expect(error.code).toBe("not_found");
    expect(error.slug).toBe("nope");
  });

  /* ---------------------------------------------------------------- */
  /* 5. The legacy leg's wire shape                                    */
  /* ---------------------------------------------------------------- */

  it("answers a 2025-era POST with one SSE frame and no session", async () => {
    const initialize = await post(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "raw", version: "0" },
        },
      }),
    );
    expect(initialize.status).toBe(200);
    /* SSE per POST regardless of `responseMode`, which never reaches here (T55). */
    expect(initialize.headers.get("content-type")).toMatch(
      /^text\/event-stream/,
    );
    expect(initialize.headers.get("mcp-session-id")).toBeNull();

    const text = await initialize.text();
    expect(text).toContain("event: message");
    expect(frameData(text)).toMatchObject({
      id: 1,
      result: { serverInfo: { name: "recipes" } },
    });

    /* A notification carries no answer, so there is nothing to stream. */
    const initialized = await post(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(initialized.status).toBe(202);
    expect(await initialized.text()).toBe("");
  });

  /* ---------------------------------------------------------------- */
  /* 6. The four refusals that precede any dispatch                    */
  /* ---------------------------------------------------------------- */

  it("refuses a malformed request before it reaches a tool", async () => {
    const wrongType = await post("hello", { "content-type": "text/plain" });
    expect(wrongType.status).toBe(415);
    expect((await wrongType.json()).error.code).toBe(-32000);

    const unparseable = await post("{");
    expect(unparseable.status).toBe(400);
    expect((await unparseable.json()).error.code).toBe(-32700);

    const notJsonRpc = await post("{}");
    expect(notJsonRpc.status).toBe(400);
    expect((await notJsonRpc.json()).error.code).toBe(-32600);

    /*
     * The dual `Accept` is not optional on this leg: without it the transport
     * answers 406 before it parses anything at all (T57), which is how a
     * hand-written curl of this endpoint fails first.
     */
    const wrongAccept = await handleMcpRequest(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "*/*" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      ctx,
    );
    expect(wrongAccept.status).toBe(406);
  });

  /* ---------------------------------------------------------------- */
  /* 7. The modern leg answers the same tools, as JSON                 */
  /* ---------------------------------------------------------------- */

  it("serves a 2026-era client a single JSON body", async () => {
    const modernTransport = transportFor(ctx);
    const modern = new Client(
      { name: "mcp-http-modern", version: "0" },
      { versionNegotiation: { mode: "auto" } },
    );
    await modern.connect(modernTransport);
    try {
      const { tools } = await modern.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);

      exchanges.length = 0;
      const called = await modern.callTool({ name: "tag_list" });
      expect(called.isError).not.toBe(true);

      /*
       * `responseMode` defaults to `"auto"` and no tool emits a notification
       * before its result, so the answer is one JSON body rather than a stream
       * (T56: adding progress or logging to a tool would change this).
       */
      const call = exchanges.at(-1)!;
      expect(call.status).toBe(200);
      expect(call.contentType).toMatch(/^application\/json/);
      expect(JSON.parse(call.body)).toMatchObject({ jsonrpc: "2.0" });
    } finally {
      await modern.close();
    }
  });

  /* ---------------------------------------------------------------- */
  /* 8. The identity preflight does not run in-process                 */
  /* ---------------------------------------------------------------- */

  describe("against a repository with no committer identity", () => {
    let repoDirectory: string;
    let savedEnv: Record<string, string | undefined>;

    /**
     * A content repository git will not commit to.
     *
     * "No identity" is not a state git lets you *arrive* at casually: a global
     * or system config would supply one, so both are scrubbed for the duration
     * (T61), and the initial commit has to carry its identity in the
     * environment of that one child process — after which nothing anywhere
     * names a committer. `assertCommitIdentity` also returns early on a
     * non-repo, which is why this cannot reuse the suite's tmpdir.
     */
    beforeEach(async () => {
      savedEnv = {
        GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
        GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
      };
      process.env.GIT_CONFIG_GLOBAL = "/dev/null";
      process.env.GIT_CONFIG_NOSYSTEM = "1";
      delete process.env.GIT_COMMITTER_EMAIL;
      delete process.env.GIT_COMMITTER_NAME;

      repoDirectory = await mkdtemp(join(tmpdir(), "mcp-http-repo-"));
      const repo = simpleGit({ baseDir: repoDirectory }).env({
        ...process.env,
        GIT_AUTHOR_NAME: "Setup",
        GIT_AUTHOR_EMAIL: "setup@test.local",
        GIT_COMMITTER_NAME: "Setup",
        GIT_COMMITTER_EMAIL: "setup@test.local",
      });
      await repo.init();
      await repo.addConfig("commit.gpgsign", "false");
      /* Before the first LMDB open, or the indexes land in the commit (T49). */
      await writeFile(
        join(repoDirectory, ".gitignore"),
        derivedContentPaths(recipeContentTypes),
      );
      await repo.add(".");
      await repo.commit("Initial commit");
    });

    afterEach(async () => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await closeCachedEnvironments();
      await rm(repoDirectory, { recursive: true, force: true });
    });

    it("refuses a CLI write and lets an HTTP one reach git", async () => {
      const recipePath = join(
        repoDirectory,
        "recipes",
        "data",
        "chocolate-cake",
        "recipe.json",
      );

      /* The CLI's backend preflights and stops before touching disk. */
      const cli = createLocalBackend({ contentDirectory: repoDirectory });
      const refused = await cli
        .createRecipe(cake)
        .then(() => undefined)
        .catch((error: unknown) => toErrorObject(error));
      expect(refused?.error.code).toBe("no_git_identity");
      expect(await pathExists(recipePath)).toBe(false);

      /*
       * The same write over HTTP gets past the guard — which is the whole point
       * of `inProcess` — and is then refused by git itself, *after*
       * `createContent` has written the file. Whatever the code is, it is not
       * the preflight's.
       */
      const repoCtx: CurationContext = {
        contentDirectory: repoDirectory,
        author: { name: "mcp@test", email: "mcp@test" },
      };
      const httpTransport = transportFor(repoCtx);
      const httpClient = new Client({ name: "mcp-http-repo", version: "0" });
      await httpClient.connect(httpTransport);
      try {
        const result = await httpClient.callTool({
          name: "recipe_create",
          arguments: { recipe: cake },
        });
        if (result.isError === true) {
          const { error } = result.structuredContent as {
            error: { code: string };
          };
          expect(error.code).not.toBe("no_git_identity");
        }
        expect(await pathExists(recipePath)).toBe(true);
      } finally {
        await httpClient.close();
      }
    });
  });
});
