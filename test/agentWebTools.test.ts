// @vitest-environment node
//
// The agent's web tools (epic 44, 44b; E6, E7): `web_fetch` against a local
// HTTP server — readable text, the byte and character caps, redirects to
// private hosts and other schemes refused, a resolved private address
// refused, the polite 403 retry — and `web_search` against a stub SearXNG.
//
// The fixture server listens on 127.0.0.1 and is reached as `localhost`,
// the one host the tests exempt (`allowHosts`); a redirect to the literal
// `127.0.0.1` is still refused, which is the point. Loopback is never paced
// (`sitePacing.ts`), so nothing here waits or touches the machine's queue.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  isBlockedAddress,
  webFetchTool,
} from "../websites/recipe-website/editor/controller/agent/tools/webFetch";
import {
  searchEndpoint,
  webSearchTool,
} from "../websites/recipe-website/editor/controller/agent/tools/webSearch";

const ctx = () => ({ signal: new AbortController().signal });

type Handler = (
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
) => void;

async function listen(
  handler: Handler,
): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { server, port: (server.address() as AddressInfo).port };
}

const RECIPE_PAGE = `<!doctype html><html><head><title>Brown Butter Cookies &amp; More</title></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About us</a></nav>
<article>
<h1>Brown Butter Cookies</h1>
<p>A long story about cookies.</p>
<div class="wprm-recipe-container">
<h3>Ingredients</h3>
<ul><li>1 cup butter, browned</li><li>2 cups flour</li></ul>
<h3>Instructions</h3>
<ol><li>Brown the butter.</li><li>Mix and bake at 350F.</li></ol>
</div>
<p>See also <a href="/sugar-cookies">Sugar cookies</a>.</p>
</article>
</body></html>`;

describe("web_fetch", () => {
  let server: Server;
  let base: string;
  const hits: string[] = [];

  beforeAll(async () => {
    const started = await listen((req, res) => {
      const path = req.url ?? "/";
      hits.push(path);
      if (path === "/recipe") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(RECIPE_PAGE);
      } else if (path === "/hop") {
        res.writeHead(302, { location: "/recipe" });
        res.end();
      } else if (path === "/to-loopback") {
        res.writeHead(302, {
          location: `http://127.0.0.1:${started.port}/recipe`,
        });
        res.end();
      } else if (path === "/to-lan") {
        res.writeHead(301, { location: "http://10.0.0.7/admin" });
        res.end();
      } else if (path === "/to-file") {
        res.writeHead(302, { location: "file:///etc/passwd" });
        res.end();
      } else if (path === "/loop") {
        res.writeHead(302, { location: "/loop" });
        res.end();
      } else if (path === "/big") {
        res.writeHead(200, { "content-type": "text/plain" });
        const line = "flour sugar butter eggs\n";
        for (let i = 0; i < 20_000; i += 1) res.write(line);
        res.end();
      } else if (path === "/picture") {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(Buffer.alloc(64));
      } else if (path === "/gone") {
        res.writeHead(404, { "content-type": "text/html" });
        res.end("<p>Not here</p>");
      } else if (path === "/browsers-only") {
        /* The polite retry (epic 31): plain fetch refused, a browser served. */
        const browser = /Chrome\//.test(req.headers["user-agent"] ?? "");
        res.writeHead(browser ? 200 : 403, { "content-type": "text/html" });
        res.end(browser ? "<p>Served to a browser.</p>" : "no");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server = started.server;
    base = `http://localhost:${started.port}`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((done) => server.close(done));
  });

  const tool = (options: Parameters<typeof webFetchTool>[0] = {}) =>
    webFetchTool({ allowHosts: ["localhost"], ...options });

  it("is an untrusted tool with an object schema", () => {
    const fetchTool = tool();
    expect(fetchTool.name).toBe("web_fetch");
    expect(fetchTool.untrusted).toBe(true);
    expect(fetchTool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["url"],
    });
    expect(fetchTool.inputSchema).not.toHaveProperty("$schema");
  });

  it("reads a page as text: the recipe card, the title, the links", async () => {
    const result = (await tool().run(
      { url: `${base}/recipe`, links: true },
      ctx(),
    )) as Record<string, unknown>;
    expect(result).toMatchObject({
      url: `${base}/recipe`,
      finalUrl: `${base}/recipe`,
      status: 200,
      title: "Brown Butter Cookies & More",
      container: "recipe-card",
      truncated: false,
    });
    const text = result.text as string;
    expect(text).toContain("1 cup butter, browned");
    expect(text).toContain("Mix and bake at 350F.");
    expect(text).not.toContain("About us");
    expect(result.links).toEqual(
      expect.arrayContaining([
        { text: "Sugar cookies", url: `${base}/sugar-cookies` },
      ]),
    );
  });

  it("follows a redirect on the same host", async () => {
    expect(await tool().run({ url: `${base}/hop` }, ctx())).toMatchObject({
      finalUrl: `${base}/recipe`,
      status: 200,
    });
  });

  it("refuses a redirect to 127.0.0.1 or a 10.x address, fetching nothing there", async () => {
    hits.length = 0;
    expect(
      await tool().run({ url: `${base}/to-loopback` }, ctx()),
    ).toMatchObject({ error: { code: "blocked" } });
    expect(hits).toEqual(["/to-loopback"]);

    const lan = (await tool().run({ url: `${base}/to-lan` }, ctx())) as {
      error: { code: string; message: string };
    };
    expect(lan.error.code).toBe("blocked");
    expect(lan.error.message).toContain("10.0.0.7");
  });

  it("refuses a non-http scheme, asked for or redirected to", async () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "javascript:alert(1)",
    ]) {
      expect(await tool().run({ url }, ctx()), url).toMatchObject({
        error: { code: "usage" },
      });
    }
    expect(await tool().run({ url: `${base}/to-file` }, ctx())).toMatchObject({
      error: { code: "blocked" },
    });
  });

  it("refuses a private host without the test exemption, and a name that resolves privately", async () => {
    const plain = webFetchTool();
    expect(await plain.run({ url: `${base}/recipe` }, ctx())).toMatchObject({
      error: { code: "blocked" },
    });
    expect(
      await plain.run({ url: "http://192.168.1.1/" }, ctx()),
    ).toMatchObject({ error: { code: "blocked" } });

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const rebinding = webFetchTool({
        lookup: async () => ["93.184.216.34", "10.1.2.3"],
      });
      const refused = (await rebinding.run(
        { url: "https://looks-public.example/" },
        ctx(),
      )) as { error: { code: string; message: string } };
      expect(refused.error.code).toBe("blocked");
      expect(refused.error.message).toContain("10.1.2.3");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("caps the bytes read and the characters returned", async () => {
    const result = (await tool({ maxBytes: 64 * 1024 }).run(
      { url: `${base}/big`, maxChars: 2_000 },
      ctx(),
    )) as Record<string, unknown>;
    expect(result.bytesCapped).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.container).toBe("plain");
    expect((result.text as string).length).toBeLessThanOrEqual(2_010);
    expect(result.text).toContain("flour sugar butter eggs");
  });

  it("answers an HTTP error, a picture and a redirect loop as fetch_failed", async () => {
    expect(await tool().run({ url: `${base}/gone` }, ctx())).toMatchObject({
      error: { code: "fetch_failed", status: 404 },
    });
    expect(await tool().run({ url: `${base}/picture` }, ctx())).toMatchObject({
      error: { code: "fetch_failed" },
    });
    expect(await tool().run({ url: `${base}/loop` }, ctx())).toMatchObject({
      error: { code: "fetch_failed" },
    });
  });

  it("retries a 403 once as a browser (the polite retry)", async () => {
    vi.stubEnv("RECIPE_FETCH_403_DELAY_MS", "0");
    const result = (await tool().run(
      { url: `${base}/browsers-only` },
      ctx(),
    )) as Record<string, unknown>;
    expect(result.status).toBe(200);
    expect(result.text).toContain("Served to a browser.");
  });

  it("returns bad input and a stopped run as error objects", async () => {
    expect(await tool().run({}, ctx())).toMatchObject({
      error: { code: "validation" },
    });
    expect(
      await tool().run({ url: `${base}/recipe`, maxChars: 10 }, ctx()),
    ).toMatchObject({ error: { code: "validation" } });
    const stopped = new AbortController();
    stopped.abort();
    expect(
      await tool().run({ url: `${base}/recipe` }, { signal: stopped.signal }),
    ).toMatchObject({ error: { code: "cancelled" } });
  });

  it("knows which addresses are private", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.5.4",
      "192.168.0.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "ff02::1",
      "not-an-ip",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});

describe("web_search (SearXNG)", () => {
  let server: Server;
  let base: string;
  let lastQuery: URLSearchParams | undefined;
  let answer: { status: number; body: unknown } = { status: 200, body: {} };

  beforeAll(async () => {
    const started = await listen((req, res) => {
      const url = new URL(req.url ?? "/", "http://stub");
      if (url.pathname !== "/search") {
        res.writeHead(404);
        res.end();
        return;
      }
      lastQuery = url.searchParams;
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.body));
    });
    server = started.server;
    base = `http://127.0.0.1:${started.port}`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((done) => server.close(done));
  });

  it("is absent without RECIPE_SEARCH_URL, present with it", () => {
    vi.stubEnv("RECIPE_SEARCH_URL", "");
    expect(webSearchTool()).toBeUndefined();
    vi.stubEnv("RECIPE_SEARCH_URL", base);
    const tool = webSearchTool();
    expect(tool?.name).toBe("web_search");
    expect(tool?.untrusted).toBe(true);
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      required: ["query"],
    });
  });

  it("asks SearXNG for JSON, passes site: through, and keeps the top http(s) results", async () => {
    answer = {
      status: 200,
      body: {
        query: "brown butter cookies site:sallysbakingaddiction.com",
        results: [
          {
            url: "https://sallysbakingaddiction.com/brown-butter-cookies/",
            title: "Brown Butter Cookies",
            content: "  Chewy   brown butter cookies. ",
            engine: "duckduckgo",
          },
          {
            url: "https://sallysbakingaddiction.com/brown-butter-cookies/",
            title: "Duplicate",
          },
          { url: "javascript:alert(1)", title: "Not a page" },
          {
            url: "https://sallysbakingaddiction.com/salted-caramel/",
            title: "Salted Caramel Cookies",
          },
          {
            url: "https://sallysbakingaddiction.com/third/",
            title: "Third",
          },
        ],
        suggestions: ["brown butter chocolate chip cookies"],
      },
    };
    const tool = webSearchTool({ searchUrl: `${base}/`, maxResults: 2 });
    const result = await tool?.run(
      {
        query: "brown butter cookies",
        site: "https://sallysbakingaddiction.com/",
      },
      ctx(),
    );
    expect(lastQuery?.get("format")).toBe("json");
    expect(lastQuery?.get("q")).toBe(
      "brown butter cookies site:sallysbakingaddiction.com",
    );
    expect(result).toEqual({
      query: "brown butter cookies site:sallysbakingaddiction.com",
      results: [
        {
          title: "Brown Butter Cookies",
          url: "https://sallysbakingaddiction.com/brown-butter-cookies/",
          snippet: "Chewy brown butter cookies.",
        },
        {
          title: "Salted Caramel Cookies",
          url: "https://sallysbakingaddiction.com/salted-caramel/",
        },
      ],
      suggestions: ["brown butter chocolate chip cookies"],
    });
  });

  it("says what a 403 means (JSON not enabled) and answers an unreachable service", async () => {
    answer = { status: 403, body: {} };
    const refused = (await webSearchTool({ searchUrl: base })?.run(
      { query: "pie" },
      ctx(),
    )) as { error: { code: string; message: string } };
    expect(refused.error.code).toBe("search_failed");
    expect(refused.error.message).toContain("search.formats");

    const down = (await webSearchTool({
      searchUrl: "http://127.0.0.1:9/",
    })?.run({ query: "pie" }, ctx())) as { error: { code: string } };
    expect(down.error.code).toBe("search_failed");
  });

  it("finds /search under the base URL", () => {
    expect(searchEndpoint("http://h:8888").href).toBe("http://h:8888/search");
    expect(searchEndpoint("http://h/searx/").href).toBe(
      "http://h/searx/search",
    );
    expect(searchEndpoint("http://h/search").href).toBe("http://h/search");
  });
});
