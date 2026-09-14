import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { test, expect } from "../support/test";
import { TOOL_NAMES } from "../../mcp/registry";

/**
 * `POST /api/mcp` — the curation registry over HTTP (23e).
 *
 * The only tests the route has. `mcpHttp.test.ts` drives `handleMcpRequest`
 * directly, because a route file cannot be loaded under vitest at all (T17), so
 * everything that is *route* rather than handler is only observable here: the
 * auth gate in front of it, Next's empty 405 for the methods it does not export
 * (which is exactly what a streamable-HTTP client's post-initialize GET needs,
 * T58), the `runtime = "nodejs"` declaration (without it LMDB and `simple-git`
 * cannot run at all), and whether a write through a tool reaches the render
 * cache the way a write through `/api/recipes` does.
 *
 * A real `@modelcontextprotocol/client` over real HTTP, not a hand-written POST:
 * the handshake is three exchanges with a content negotiation in the middle, and
 * a hand-written one would pass while every actual client failed.
 *
 * No `initializeContentGit` here — the corpus is deliberately *not* a
 * repository, which is what makes `git_status` a one-line assertion that the
 * eight git tools are reachable over this transport at all.
 */
test.describe("the MCP endpoint", () => {
  let token: string;

  test.beforeEach(async ({ resetData, createApiToken }) => {
    await resetData("three-recipes-groups");
    /* After `resetData`, which recreates `test-content/users/` from the fixture. */
    token = await createApiToken();
  });

  const toolsList = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  };

  /** A connected client, and the transport to close afterwards. */
  async function connect(
    baseURL: string,
    bearer?: string,
  ): Promise<{ client: Client; close: () => Promise<void> }> {
    const transport = new StreamableHTTPClientTransport(
      new URL("/api/mcp", baseURL),
      bearer
        ? { requestInit: { headers: { authorization: `Bearer ${bearer}` } } }
        : {},
    );
    const client = new Client({ name: "mcp-http-e2e", version: "0" });
    await client.connect(transport);
    return { client, close: () => client.close() };
  }

  test("refuses every call without a token", async ({ request }) => {
    const anonymous = await request.post("/api/mcp", {
      headers: { accept: "application/json, text/event-stream" },
      data: toolsList,
    });
    expect(anonymous.status()).toBe(401);
    expect((await anonymous.json()).error.code).toBe("unauthenticated");

    const bad = await request.post("/api/mcp", {
      headers: {
        accept: "application/json, text/event-stream",
        authorization: "Bearer rcp_deadbeef_nope",
      },
      data: toolsList,
    });
    expect(bad.status()).toBe(401);
    expect((await bad.json()).error.code).toBe("unauthenticated");
  });

  test("exports POST and nothing else", async ({ request }) => {
    /*
     * Next's default for an unexported method: 405, empty body, no `Allow`.
     * The client fires a standalone GET after `notifications/initialized` and
     * swallows exactly a 405 — anything else turns every connect into an
     * error-and-reconnect loop (T58).
     */
    const get = await request.get("/api/mcp", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.status()).toBe(405);
    expect(await get.text()).toBe("");

    const options = await request.fetch("/api/mcp", { method: "OPTIONS" });
    expect(options.status()).toBe(204);
    expect(options.headers()["allow"]).toBe("OPTIONS, POST");
  });

  test("a client without a token cannot connect", async ({ baseURL }) => {
    const transport = new StreamableHTTPClientTransport(
      new URL("/api/mcp", baseURL!),
    );
    const client = new Client({ name: "mcp-http-e2e", version: "0" });
    /* A 401 with no `authProvider` is an `SdkHttpError`, not `UnauthorizedError` (T60). */
    const error = await client.connect(transport).then(
      () => undefined,
      (reason: unknown) => reason as { name?: string; status?: number },
    );
    expect(error?.name).toBe("SdkHttpError");
    expect(error?.status).toBe(401);
  });

  test("serves the same 28 tools stdio serves", async ({ baseURL }) => {
    const { client, close } = await connect(baseURL!, token);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    } finally {
      await close();
    }
  });

  test("a tool write revalidates the pages it moved", async ({
    baseURL,
    page,
  }) => {
    const { client, close } = await connect(baseURL!, token);
    try {
      const created = await client.callTool({
        name: "group_create",
        arguments: { group: { name: "MCP Week", kind: "meal-plan" } },
      });
      expect(created.isError).not.toBe(true);
      const result = created.structuredContent as {
        slug: string;
        warnings?: string[];
      };
      expect(result.slug).toBe("mcp-week");
      /*
       * No stale-editor hint: this write happened *inside* the process that
       * owns the render cache, so the CLI's warning would be a lie (T53).
       */
      expect(result.warnings).toBeUndefined();
    } finally {
      await close();
    }

    /* No `resetData`, no cache reload — the route's `onWrite` did this. */
    await page.goto("/group/mcp-week");
    await expect(page.getByTestId("group-kind")).toHaveText("Meal plan");
    await page.goto("/groups");
    await expect(
      page.getByTestId("group-list").getByText("MCP Week"),
    ).toBeVisible();
  });

  test("reaches the git seats", async ({ baseURL }) => {
    const { client, close } = await connect(baseURL!, token);
    try {
      const status = await client.callTool({ name: "git_status" });
      expect(status.isError).not.toBe(true);
      /* The fixture is a plain directory: the tools are reachable, the repo is not there. */
      expect(status.structuredContent).toMatchObject({ isRepo: false });
    } finally {
      await close();
    }
  });

  test("answers a curation failure with the layer's error object", async ({
    baseURL,
  }) => {
    const { client, close } = await connect(baseURL!, token);
    try {
      const result = await client.callTool({
        name: "recipe_get",
        arguments: { slug: "nope" },
      });
      expect(result.isError).toBe(true);
      const { error } = result.structuredContent as {
        error: { code: string; slug?: string };
      };
      expect(error.code).toBe("not_found");
      expect(error.slug).toBe("nope");
    } finally {
      await close();
    }
  });

  test("refuses a malformed body past the auth gate", async ({ request }) => {
    const response = await request.post("/api/mcp", {
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      /*
       * A `Buffer`, not the string: given a JSON content type Playwright
       * re-encodes an unparsable string as a JSON *string* (`"{"`), which
       * parses fine and lands on `-32600` instead — the truncated body never
       * leaves the test process.
       */
      data: Buffer.from("{"),
    });
    /* A JSON-RPC parse error, not the route's `{error: {code}}` shape. */
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe(-32700);
  });
});
