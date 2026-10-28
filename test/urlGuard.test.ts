// @vitest-environment node
//
// 46a: the SSRF guard on every importer and editor fetch.
//
// - `urlRefusal` and `guardedFetch` refuse every spelling of a local,
//   private or reserved host, a name that resolves to one (a stub DNS), and
//   a public URL that redirects to one — fetching nothing there.
// - The importer's fetches (`fetchPageStep`, `fetchImageFile`, a page
//   import, an inspect, yt-dlp) go through it: `UrlRefusedError`, code
//   `url_refused`, never `import_failed`.
// - The API routes answer a refused URL with 422 before a job starts.
// - The test allowance: an allowed fixture passes; `fetchGuardOptions` reads
//   the environment only under a test run; source scans keep every
//   production path from naming the allowance, and every editor-side fetch
//   of an outside URL on the guarded path (`CheckedFetch`).
//
// This file sets its own allowance (`setFetchGuardTesting`) over the suite's
// (`test/setupTests.js`: 127.0.0.1 and localhost, every name resolving to a
// TEST-NET-3 address), so the refusals are the editor's.

import { mkdtemp, readdir, readFile, rm } from "fs-extra";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "os";
import { join, relative, resolve } from "path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { parseRoundupPage } from "../websites/recipe-website/common/util/roundupPage";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { UrlRefusedError } from "../websites/recipe-website/editor/controller/curation/errors";
import { statusFor } from "../websites/recipe-website/editor/controller/curation/http";
import {
  FetchChainError,
  assertFetchableUrl,
  guardedFetch,
  importerFetch,
} from "../websites/recipe-website/editor/controller/guardedFetch";
import {
  fetchImageFile,
  fetchImageFilePaced,
} from "../websites/recipe-website/editor/controller/imageImport";
import { termFormStateFromError } from "../websites/recipe-website/editor/controller/termForm";
import { isVideoUrl } from "../websites/recipe-website/common/util/videoUrl";
import { fetchPageStep } from "../websites/recipe-website/editor/controller/jobs/steps";
import {
  TEST_DNS_ENV,
  TEST_FETCH_ALLOW_ENV,
  fetchGuardOptions,
  isBlockedAddress,
  isTestAllowedUrl,
  setFetchGuardTesting,
  urlRefusal,
} from "../websites/recipe-website/editor/controller/urlGuard";

const ROOT = resolve(__dirname, "..");
const SITE = join(ROOT, "websites/recipe-website");
const EDITOR = join(SITE, "editor");

/** A stub DNS: `inner.example` and friends resolve privately. */
const PRIVATE_NAMES: Record<string, string[]> = {
  "inner.example": ["10.9.8.7"],
  "mixed.example": ["93.184.216.34", "192.168.0.4"],
  "metadata.google.internal": ["169.254.169.254"],
  "v6.example": ["fd12::1"],
  "youtube.com.lan.example": ["10.0.0.20"],
};
const lookup = async (host: string) => PRIVATE_NAMES[host] ?? ["93.184.216.34"];

beforeEach(() => {
  /* Nothing let through; the stub DNS above. */
  setFetchGuardTesting({ lookup });
});

afterEach(() => {
  setFetchGuardTesting(undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Every spelling the guard must refuse, with a reason. */
const REFUSED: [url: string, reason: string][] = [
  ["http://10.1.2.3/", "private"],
  ["http://172.16.0.1/", "private"],
  ["http://172.31.255.254/", "private"],
  ["http://192.168.1.1/", "private"],
  ["http://127.0.0.1:3000/", "private"],
  ["http://127.9.9.9/", "private"],
  ["http://100.64.0.1/", "private"],
  ["http://0.0.0.0/", "private"],
  ["http://169.254.169.254/latest/meta-data/", "private"],
  ["http://localhost/", "private"],
  ["http://app.localhost/", "private"],
  ["http://[::1]/", "private"],
  ["http://[::]/", "private"],
  ["http://[fc00::1]/", "private"],
  ["http://[fd00::abcd]/", "private"],
  ["http://[fe80::1]/", "private"],
  ["http://[fec0::1]/", "reserved"],
  ["http://[ff02::1]/", "reserved"],
  ["http://[::ffff:10.0.0.1]/", "private"],
  ["http://[::ffff:7f00:1]/", "private"],
  ["http://[::7f00:1]/", "reserved"],
  ["http://[64:ff9b::a00:1]/", "reserved"],
  ["http://[2002:a00:1::]/", "reserved"],
  /* Decimal, hexadecimal and octal IPv4: `URL` normalises them. */
  ["http://2130706433/", "private"],
  ["http://0x7f000001/", "private"],
  ["http://0177.0.0.1/", "private"],
  ["http://017700000001/", "private"],
  ["http://10.1/", "private"],
  ["http://224.0.0.1/", "reserved"],
  ["http://255.255.255.255/", "reserved"],
  /* Names that resolve privately (the stub DNS). */
  ["https://inner.example/recipe", "resolves-private"],
  ["https://mixed.example/recipe", "resolves-private"],
  ["http://metadata.google.internal/computeMetadata/v1/", "resolves-private"],
  ["https://v6.example/", "resolves-private"],
];

describe("urlRefusal (46a, the shared guard)", () => {
  it("refuses every spelling of a local, private or reserved host", async () => {
    for (const [url, reason] of REFUSED) {
      const refusal = await urlRefusal(new URL(url), { lookup });
      expect(refusal, url).toMatchObject({ code: "forbidden", reason });
    }
  });

  it("lets a public host through, and refuses another scheme", async () => {
    expect(
      await urlRefusal(new URL("https://www.example.com/r"), { lookup }),
    ).toBeUndefined();
    expect(
      await urlRefusal(new URL("http://93.184.216.34/"), { lookup }),
    ).toBeUndefined();
    expect(await urlRefusal(new URL("file:///etc/passwd"))).toMatchObject({
      code: "usage",
      reason: "scheme",
    });
    expect(
      await urlRefusal(new URL("ftp://example.com/x"), { hop: 1 }),
    ).toMatchObject({ code: "forbidden", reason: "scheme" });
  });

  it("blocks the IETF, benchmarking, discard and translated ranges; TEST-NET-3 stays open (46a review)", async () => {
    for (const address of [
      "192.0.0.1",
      "192.0.0.170",
      "198.18.0.1",
      "198.19.255.254",
      "100::1",
      "100::ffff:1",
      "::ffff:0:808:808",
      "::ffff:0:10.0.0.1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    for (const address of [
      "203.0.113.10",
      "192.0.1.1",
      "198.20.0.1",
      "198.17.255.255",
      "100:0:0:1::1",
    ]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
    for (const url of [
      "http://192.0.0.8/",
      "http://198.18.4.4/",
      "http://[100::5]/",
      "http://[::ffff:0:808:808]/",
    ]) {
      expect(await urlRefusal(new URL(url)), url).toMatchObject({
        code: "forbidden",
      });
    }
    expect(
      await urlRefusal(new URL("https://example.com/"), {
        lookup: async () => ["203.0.113.10"],
      }),
    ).toBeUndefined();
  });

  it("calls a name that does not resolve fetch_failed, not a refusal", async () => {
    expect(
      await urlRefusal(new URL("https://nowhere.example/"), {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).toMatchObject({ code: "fetch_failed", reason: "unresolved" });
  });

  it("allows a host by name (any port) or by host:port (that port only)", async () => {
    const at = new URL("http://127.0.0.1:4100/x");
    expect(await urlRefusal(at, { allowHosts: ["127.0.0.1"] })).toBeUndefined();
    expect(
      await urlRefusal(at, { allowHosts: ["127.0.0.1:4100"] }),
    ).toBeUndefined();
    expect(
      await urlRefusal(at, { allowHosts: ["127.0.0.1:4101"] }),
    ).toMatchObject({ code: "forbidden" });
    expect(
      await urlRefusal(at, { allowHosts: ["localhost:4100"] }),
    ).toMatchObject({ code: "forbidden" });
  });
});

describe("guardedFetch", () => {
  it("refuses every refused spelling without sending a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const [url] of REFUSED) {
      const error = await guardedFetch(url, {}, { lookup }).catch((e) => e);
      expect(error, url).toBeInstanceOf(UrlRefusedError);
      expect((error as UrlRefusedError).code).toBe("url_refused");
      expect((error as UrlRefusedError).message).toMatch(
        /points inside your network.*; imports only read public sites/,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a public URL that redirects to a private one, fetching nothing there", async () => {
    for (const target of [
      "http://10.0.0.1/admin",
      "http://[::1]:8080/",
      "https://inner.example/x",
      "file:///etc/passwd",
    ]) {
      const fetchSpy = vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: target } }),
      );
      vi.stubGlobal("fetch", fetchSpy);
      const error = await guardedFetch(
        "https://public.example/r",
        {},
        { lookup },
      ).catch((e) => e);
      expect(error, target).toBeInstanceOf(UrlRefusedError);
      expect((error as UrlRefusedError).message).toMatch(/^It redirects to /);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]).toEqual([
        "https://public.example/r",
        expect.objectContaining({ redirect: "manual" }),
      ]);
    }
  });

  it("follows public redirects itself, the answer's url the last hop's", async () => {
    const fetchSpy = vi.fn(async (url: string) =>
      url === "https://a.example/one"
        ? new Response(null, {
            status: 301,
            headers: { location: "/two" },
          })
        : new Response("ok", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const response = await guardedFetch(
      "https://a.example/one",
      { method: "HEAD" },
      { lookup },
    );
    expect(response.status).toBe(200);
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "https://a.example/one",
      "https://a.example/two",
    ]);
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: "HEAD" });
  });

  it("follows five redirects and refuses a sixth", async () => {
    const chain = (hops: number) =>
      vi.fn(async (url: string) => {
        const at = Number(new URL(url).pathname.slice(1) || "0");
        return at < hops
          ? new Response(null, {
              status: 302,
              headers: { location: `/${at + 1}` },
            })
          : new Response("end", { status: 200 });
      });
    const five = chain(5);
    vi.stubGlobal("fetch", five);
    const response = await guardedFetch(
      "https://hops.example/0",
      {},
      {
        lookup,
      },
    );
    expect(response.status).toBe(200);
    expect(five).toHaveBeenCalledTimes(6);

    const six = chain(6);
    vi.stubGlobal("fetch", six);
    const error = await guardedFetch(
      "https://hops.example/0",
      {},
      {
        lookup,
      },
    ).catch((e) => e);
    expect(error).toBeInstanceOf(FetchChainError);
    expect((error as Error).message).toMatch(/redirected more than 5 times/);
    /* The sixth redirect's target is never asked for. */
    expect(six).toHaveBeenCalledTimes(6);
  });

  it("stops a redirect loop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: "/again" } }),
      ),
    );
    await expect(
      guardedFetch("https://loop.example/", {}, { lookup }),
    ).rejects.toBeInstanceOf(FetchChainError);
  });

  describe("an allowed fixture server", () => {
    let server: Server;
    let port: number;
    beforeAll(async () => {
      server = createServer((request, response) => {
        if (request.url === "/hop") {
          response.writeHead(302, { location: "/page" });
          response.end();
        } else if (request.url === "/to-localhost") {
          response.writeHead(302, {
            location: `http://localhost:${port}/page`,
          });
          response.end();
        } else {
          response.writeHead(200, { "content-type": "text/html" });
          response.end("<html><body>fixture</body></html>");
        }
      });
      await new Promise<void>((done) =>
        server.listen(0, "127.0.0.1", () => done()),
      );
      port = (server.address() as AddressInfo).port;
    });
    afterAll(async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    });

    it("passes through its exact host:port, redirects on it included", async () => {
      const allowHosts = [`127.0.0.1:${port}`];
      const response = await guardedFetch(
        `http://127.0.0.1:${port}/hop`,
        {},
        { allowHosts },
      );
      expect(response.status).toBe(200);
      expect(response.url).toBe(`http://127.0.0.1:${port}/page`);
      expect(await response.text()).toContain("fixture");
      /* Another spelling of the same machine is another host. */
      await expect(
        guardedFetch(
          `http://127.0.0.1:${port}/to-localhost`,
          {},
          {
            allowHosts,
          },
        ),
      ).rejects.toBeInstanceOf(UrlRefusedError);
    });

    it("is refused without the allowance", async () => {
      await expect(
        guardedFetch(`http://127.0.0.1:${port}/page`),
      ).rejects.toBeInstanceOf(UrlRefusedError);
    });

    it("passes through the importer with the suite's allowance, and not without", async () => {
      /* The suite's (`setupTests.js`): 127.0.0.1, any port. */
      setFetchGuardTesting(undefined);
      const page = await fetchPageStep(`http://127.0.0.1:${port}/hop`);
      expect(page).toMatchObject({
        ok: true,
        finalUrl: `http://127.0.0.1:${port}/page`,
      });
      setFetchGuardTesting({ lookup });
      await expect(
        fetchPageStep(`http://127.0.0.1:${port}/page`),
      ).rejects.toBeInstanceOf(UrlRefusedError);
    });
  });
});

describe("the importer's fetches", () => {
  const redirectingTo = (target: string) => {
    const fetchSpy = vi.fn(async (url: string) =>
      url.startsWith("https://public.example/")
        ? new Response(null, { status: 302, headers: { location: target } })
        : new Response("should not be fetched", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  };

  it("refuses a page whose redirect is private (fetchPageStep, importerFetch)", async () => {
    const fetchSpy = redirectingTo("http://192.168.1.10/admin");
    await expect(
      fetchPageStep("https://public.example/recipe"),
    ).rejects.toMatchObject({ code: "url_refused" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await expect(importerFetch("http://10.0.0.1/", {})).rejects.toBeInstanceOf(
      UrlRefusedError,
    );
  });

  it("refuses an image's redirect as url_refused, from the paced Save fetch too", async () => {
    let fetchSpy = redirectingTo("http://[fd00::5]/a.jpg");
    await expect(
      fetchImageFile("https://public.example/a.jpg"),
    ).rejects.toMatchObject({
      code: "url_refused",
      message: expect.stringMatching(/inside your network/),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy = redirectingTo("http://169.254.169.254/latest/");
    const refused = await fetchImageFilePaced(
      "https://public.example/b.jpg",
    ).catch((e) => e);
    expect(refused).toBeInstanceOf(UrlRefusedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    /* The term form files it under the image field. */
    expect(termFormStateFromError(refused).errors?.image).toEqual([
      refused.message,
    ]);
  });

  it("checks the 403 retry's redirects too", async () => {
    vi.stubEnv("RECIPE_FETCH_403_DELAY_MS", "0");
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://10.0.0.9/a.jpg" },
        }),
      )
      .mockResolvedValue(new Response("should not be fetched"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      fetchImageFile("https://public.example/a.jpg"),
    ).rejects.toMatchObject({ code: "url_refused" });
    /* Asked plainly, then as a browser; the private hop never. */
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][1].headers["user-agent"]).toMatch(/Mozilla/);
  });

  it("answers url_refused from an import and an inspect, not import_failed", async () => {
    const { importPage } =
      await import("../websites/recipe-website/editor/controller/curation/importRecipe");
    const { inspectUrl } =
      await import("../websites/recipe-website/editor/controller/curation/inspect");
    redirectingTo("http://127.0.0.1:9/");
    await expect(
      importPage("https://public.example/recipe", { llm: "off" }),
    ).rejects.toMatchObject({ code: "url_refused" });
    await expect(
      inspectUrl("https://public.example/recipe", { llm: "off" }),
    ).rejects.toMatchObject({ code: "url_refused" });
    await expect(
      inspectUrl("https://inner.example/recipe", { llm: "off" }),
    ).rejects.toMatchObject({ code: "url_refused" });
  });

  it("never calls a host that merely contains a platform's name a video", () => {
    for (const url of [
      "https://vimeo.com.attacker.example/x",
      "https://youtube.com.lan.example/watch?v=x",
      "https://notyoutube.com/watch?v=x",
      "https://myvimeo.company/x",
    ]) {
      expect(isVideoUrl(url), url).toBe(false);
    }
    for (const url of [
      "https://www.youtube.com/watch?v=x",
      "https://m.youtube.com/watch?v=x",
      "https://youtu.be/x",
      "https://player.vimeo.com/video/1",
      "https://VIMEO.com/1",
    ]) {
      expect(isVideoUrl(url), url).toBe(true);
    }
  });

  it("refuses a video URL that resolves privately before yt-dlp runs", async () => {
    const { fetchYtdlpMetadata } =
      await import("../websites/recipe-website/editor/controller/ytdlp");
    vi.stubEnv("YTDLP_PATH", "/nonexistent/yt-dlp");
    setFetchGuardTesting({
      lookup: async (host) =>
        host === "m.youtube.com" ? ["10.0.0.20"] : ["93.184.216.34"],
    });
    await expect(
      fetchYtdlpMetadata("https://m.youtube.com/watch?v=x"),
    ).rejects.toBeInstanceOf(UrlRefusedError);
    await expect(
      assertFetchableUrl("https://www.youtube.com/watch?v=x"),
    ).resolves.toBeUndefined();
  });
});

describe("a private roundup page's private links (46a)", () => {
  const html = [
    "<html><body><article>",
    '<a href="http://192.168.1.10/recipes/one/">One</a>',
    '<a href="http://192.168.1.10/recipes/two/">Two</a>',
    '<a href="https://example.com/recipes/three/">Three</a>',
    "</article></body></html>",
  ].join("");

  it("are dropped by default, kept only for an allowed test host", () => {
    const names = (allowPrivateLinks?: boolean) =>
      parseRoundupPage(html, "http://192.168.1.5/list/", {
        ...(allowPrivateLinks !== undefined ? { allowPrivateLinks } : {}),
      }).items.map((item) => item.name);
    expect(names()).not.toContain("One");
    expect(names(true)).toEqual(expect.arrayContaining(["One", "Two"]));
    expect(isTestAllowedUrl("http://192.168.1.5/list/")).toBe(false);
    setFetchGuardTesting({ allowHosts: ["192.168.1.5"] });
    expect(isTestAllowedUrl("http://192.168.1.5/list/")).toBe(true);
  });
});

describe("the API routes (46a)", () => {
  let ctx: CurationContext;
  beforeAll(() => {
    vi.doMock("recipe-editor/controller/apiContext", () => ({
      requireCurationContext: async () => ctx,
    }));
  });
  afterAll(() => {
    vi.doUnmock("recipe-editor/controller/apiContext");
  });
  beforeEach(async () => {
    ctx = { contentDirectory: await mkdtemp(join(tmpdir(), "url-guard-")) };
  });
  afterEach(async () => {
    await closeCachedEnvironments();
    await rm(ctx.contentDirectory, { recursive: true, force: true });
  });

  const ROUTES: Record<
    string,
    () => Promise<{ POST: (request: Request) => Promise<Response> }>
  > = {
    inspect: () =>
      import("../websites/recipe-website/editor/src/app/api/inspect/route"),
    import: () =>
      import("../websites/recipe-website/editor/src/app/api/import/route"),
    "inspect-list": () =>
      import("../websites/recipe-website/editor/src/app/api/inspect-list/route"),
    "import-list": () =>
      import("../websites/recipe-website/editor/src/app/api/import-list/route"),
  };
  const post = async (route: string, body: unknown) => {
    const { POST } = await ROUTES[route]();
    return POST(
      new Request(`http://editor.test/api/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  };

  it("answer a private URL with 422 url_refused and a plain message, before any fetch", async () => {
    expect(statusFor("url_refused")).toBe(422);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const cases: [string, Record<string, unknown>][] = [
      ["inspect", { url: "http://192.168.1.1/recipe" }],
      ["import", { url: "http://169.254.169.254/latest/", dryRun: true }],
      [
        "import",
        {
          url: "https://example.com/r",
          image: "http://[::1]/x.jpg",
          dryRun: true,
        },
      ],
      ["inspect-list", { url: "https://inner.example/list" }],
      ["import-list", { url: "http://10.0.0.2/list", all: true }],
    ];
    for (const [route, body] of cases) {
      const response = await post(route, body);
      expect(response.status, `${route} ${JSON.stringify(body)}`).toBe(422);
      const { error } = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(error.code).toBe("url_refused");
      expect(error.message).toMatch(
        /points inside your network.*; imports only read public sites\.$/,
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the test allowance stays in tests", () => {
  it("is read from the environment only under a test run", () => {
    const env = {
      [TEST_FETCH_ALLOW_ENV]: "localhost:3019, 127.0.0.1:3019",
      [TEST_DNS_ENV]: "*=203.0.113.10",
    };
    setFetchGuardTesting(undefined);
    expect(fetchGuardOptions(env)).toEqual({});
    expect(fetchGuardOptions({ ...env, NODE_ENV: "test" })).toEqual({});
    const options = fetchGuardOptions({ ...env, TEST_MODE: "true" });
    expect(options.allowHosts).toEqual(["localhost:3019", "127.0.0.1:3019"]);
    expect(options.lookup).toBeTypeOf("function");
    expect(fetchGuardOptions({ ...env, VITEST: "true" }).allowHosts).toEqual([
      "localhost:3019",
      "127.0.0.1:3019",
    ]);
  });

  async function sources(
    dirs: string[],
    pattern = /\.(ts|tsx|js|mjs|cjs|json|ya?ml|sh|env|service|example)$|Dockerfile/,
  ): Promise<string[]> {
    const files: string[] = [];
    const skip = new Set([
      "node_modules",
      ".next",
      "content",
      "test-content",
      "test-settings",
      "test-jobs",
      "test-clones",
      "test-remotes",
      "out",
      "dist",
      ".git",
      ".claude",
    ]);
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (skip.has(entry.name) || entry.isSymbolicLink()) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (pattern.test(entry.name)) files.push(path);
      }
    };
    for (const dir of dirs) await walk(dir);
    return files;
  }

  it("names RECIPE_TEST_FETCH_ALLOW, RECIPE_TEST_DNS and setFetchGuardTesting only in tests, the guard and agent-measure", async () => {
    const files = await sources([
      join(ROOT, "websites"),
      join(ROOT, "packages"),
      join(ROOT, "scripts"),
      join(ROOT, "deploy"),
      join(ROOT, ".github"),
    ]);
    /* The root's own files (Dockerfiles, compose files, CI scripts), not
     * its trees again — and never `.claude/worktrees`, other checkouts. */
    for (const entry of await readdir(ROOT, { withFileTypes: true })) {
      if (entry.isFile()) files.push(join(ROOT, entry.name));
    }
    const allowed = new Set([
      "websites/recipe-website/editor/controller/urlGuard.ts",
      "websites/recipe-website/editor/playwright.config.ts",
      "websites/recipe-website/editor/scripts/agent-measure.ts",
    ]);
    const named = new Set<string>();
    for (const file of files) {
      const path = relative(ROOT, file);
      if (path.startsWith("test/") || path.startsWith(".claude/")) continue;
      const source = await readFile(file, "utf8");
      if (
        /RECIPE_TEST_FETCH_ALLOW|RECIPE_TEST_DNS|setFetchGuardTesting/.test(
          source,
        )
      ) {
        named.add(path);
      }
    }
    expect([...named].sort()).toEqual([...allowed].sort());
    /* agent-measure only sets it after loading the editor's env. */
    const measure = await readFile(
      join(EDITOR, "scripts/agent-measure.ts"),
      "utf8",
    );
    expect(measure).toMatch(
      /setFetchGuardTesting\(\{ allowHosts: \["127\.0\.0\.1"\] \}\)/,
    );
  });

  it("makes a CheckedFetch only in guardedFetch.ts", async () => {
    const files = await sources(
      [join(SITE, "editor"), join(SITE, "common"), join(SITE, "export")],
      /\.(ts|tsx)$/,
    );
    const marking = new Set<string>();
    const casting = new Set<string>();
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/markCheckedFetch\(/.test(source)) {
        marking.add(relative(SITE, file));
      }
      /* A cast is a CheckedFetch made by hand (46a review). */
      if (/as\s+(unknown\s+as\s+)?CheckedFetch/.test(source)) {
        casting.add(relative(SITE, file));
      }
    }
    expect([...marking].sort()).toEqual([
      "common/util/politeFetch.ts",
      "editor/controller/guardedFetch.ts",
    ]);
    expect([...casting]).toEqual(["common/util/politeFetch.ts"]);
  });

  /*
   * Every `fetch(` the editor's server side makes — the controller, the
   * CLI, the MCP server, every `src/` module but a `"use client"` one
   * (routes, server actions, server components), and `common/util` — but a
   * same-origin one (a literal starting `/`, from a module the browser runs).
   * Each one here fetches a URL the editor's own configuration names (the
   * model, the Pi and workstation peers, SearXNG, a notify hook, its own
   * API); a fetch of a URL someone else chose goes through `guardedFetch`
   * (`importerFetch`, `CheckedFetch`). A new file in this list needs that
   * decision made, here.
   */
  it("fetches an outside URL only through guardedFetch", async () => {
    const files = await sources(
      [
        join(EDITOR, "controller"),
        join(EDITOR, "cli"),
        join(EDITOR, "mcp"),
        join(EDITOR, "src"),
        join(SITE, "common/util"),
      ],
      /\.(ts|tsx)$/,
    );
    const fetching = new Set<string>();
    for (const file of files) {
      const source = (await readFile(file, "utf8"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const path = relative(SITE, file);
      if (
        path.startsWith("editor/src/") &&
        /^\s*["']use client["']/.test(source)
      ) {
        continue;
      }
      const calls = [...source.matchAll(/(?:^|[^\w.$])fetch\(\s*(.)/gm)];
      if (calls.some(([, next]) => !/^[`'"]$/.test(next))) {
        fetching.add(path);
        continue;
      }
      const outside = [
        ...source.matchAll(/(?:^|[^\w.$])fetch\(\s*[`'"]([^`'"]?)/gm),
      ].some(([, first]) => first !== "/");
      if (outside) fetching.add(path);
    }
    expect([...fetching].sort()).toEqual(
      [
        "editor/cli/backend/http.ts",
        "editor/cli/backend/local.ts",
        "editor/controller/agent/tools/webSearch.ts",
        "editor/controller/guardedFetch.ts",
        "editor/controller/instance/notify.ts",
        "editor/controller/instance/pinger.ts",
        "editor/controller/instance/refresh.ts",
        "editor/controller/instance/siteSettings.ts",
        "editor/controller/instance/standing.ts",
        "editor/controller/llm/client.ts",
      ].sort(),
    );
  });
});
