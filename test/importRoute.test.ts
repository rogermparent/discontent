// @vitest-environment node
//
// 36c review: `/api/import` itself, with `{text, source}` (D8) and `{url}`
// through the one `ImportRequestSchema`, and the HTTP backend's `importText`
// against it — including an editor from before 36c, whose strict body names
// `text` as an unrecognised key. The model is a stubbed `fetch`; the curation
// context is mocked (no Next, no token).

import { mkdtemp, rm } from "fs-extra";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  sentPhotoKey,
  standInChat,
} from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

let ctx: CurationContext;
vi.mock("recipe-editor/controller/apiContext", () => ({
  requireCurationContext: async () => ctx,
}));

const { POST } =
  await import("../websites/recipe-website/editor/src/app/api/import/route");

const MODEL_URL = "http://model.test:11434";

const TEXT = [
  "Old Scones — subscribe! https://example.com/subscribe",
  "2 cups flour",
  "3/4 cup cream",
  "Stir together and bake.",
].join("\n");

/** The stubbed model; any other request fails the test. */
function stubModel() {
  const fetchStub = vi.fn(async (input: string | URL) => {
    if (!String(input).startsWith(MODEL_URL)) {
      throw new Error(`unexpected fetch: ${String(input)}`);
    }
    return new Response(
      JSON.stringify({
        model: "qwen3:8b",
        done: true,
        message: {
          role: "assistant",
          content: JSON.stringify({
            found: true,
            name: "Old Scones",
            ingredients: ["2 cups flour", "3/4 cup cream"],
            instructions: ["Stir together and bake."],
          }),
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://editor.test/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  ctx = { contentDirectory: await mkdtemp(join(tmpdir(), "import-route-")) };
  vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(ctx.contentDirectory, { recursive: true, force: true });
});

describe("/api/import with pasted text (36c)", () => {
  it("dry-runs {text, source} with 200, citing the source unfetched", async () => {
    const fetchStub = stubModel();
    const response = await post({
      text: TEXT,
      source: "https://www.youtube.com/watch?v=OLD1#t=5",
      dryRun: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      pastedText: true,
      url: "https://www.youtube.com/watch?v=OLD1",
      video: "https://www.youtube.com/watch?v=OLD1",
      llm: { mode: "force", grounded: 2, total: 2 },
      draft: {
        name: "Old Scones",
        ingredients: ["2 cups flour", "3/4 cup cream"],
        source: { url: "https://www.youtube.com/watch?v=OLD1" },
      },
    });
    /* One model call; the route runs it as a job (epic 37), which also asks
     * Ollama's /api/ps where the model sits (D6) — nothing else is fetched. */
    expect(
      fetchStub.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toEqual(["/api/chat", "/api/ps"]);
  });

  it("creates from {text} with 201", async () => {
    stubModel();
    const response = await post({ text: TEXT });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      slug: "old-scones",
      llm: { found: true },
    });
  });

  it("answers the body's rules as validation, and no model as import_failed", async () => {
    stubModel();
    const both = await post({ url: "https://example.com/x", text: TEXT });
    expect(both.status).toBe(400);
    expect((await both.json()).error).toMatchObject({
      code: "validation",
      issues: [
        {
          path: "url",
          message: "Give exactly one of `url`, `text` or `photos`",
        },
      ],
    });
    const badUrl = await post({ url: "not a url" });
    expect((await badUrl.json()).error.code).toBe("validation");

    vi.stubEnv("RECIPE_LLM_URL", "");
    const none = await post({ text: TEXT, dryRun: true });
    expect((await none.json()).error).toMatchObject({
      code: "import_failed",
      message: "no local model configured (RECIPE_LLM_URL)",
    });
  });
});

/* The form's "Paste text" tab: the server action's reducer. */
describe("reduceTextImport (36c)", () => {
  it("fills the form's state from pasted text, keyed per import", async () => {
    const { reduceTextImport } =
      await import("../websites/recipe-website/editor/src/app/(recipes)/new-recipe/common");
    stubModel();
    const state = await reduceTextImport(
      null,
      TEXT,
      "https://www.youtube.com/watch?v=OLD1",
    );
    expect(state.message).toBeUndefined();
    expect(state).toMatchObject({
      url: "https://www.youtube.com/watch?v=OLD1",
      key: expect.stringMatching(/^text-[0-9a-f-]{36}$/),
      llm: { mode: "force", found: true, grounded: 2, total: 2 },
      recipe: {
        name: "Old Scones",
        videoImportUrl: "https://www.youtube.com/watch?v=OLD1",
        source: { url: "https://www.youtube.com/watch?v=OLD1" },
      },
    });
    expect(state.recipe?.ingredients).toHaveLength(2);
    expect(state.warnings?.[0]).toMatch(/^extracted by local model qwen3:8b/);

    /* No source: no url, and still a fresh key. */
    const plain = await reduceTextImport(null, TEXT, "");
    expect(plain.url).toBeUndefined();
    expect(plain.recipe?.source).toBeUndefined();
    expect(plain.key).toMatch(/^text-[0-9a-f-]{36}$/);

    /* Failures are the form's message, not a throw. */
    expect(await reduceTextImport(null, "  ")).toEqual({
      message: "No text provided",
    });
    vi.stubEnv("RECIPE_LLM_URL", "");
    expect(await reduceTextImport(null, TEXT)).toEqual({
      message: "no local model configured (RECIPE_LLM_URL)",
    });
  });
});

describe("the HTTP backend's importText (36c)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    const running = server;
    server = undefined;
    if (running) await new Promise<void>((done) => running.close(() => done()));
  });

  /** An editor at 127.0.0.1 whose /api/import is `handle`. */
  async function editor(
    handle: (body: unknown) => Promise<Response> | Response,
  ): Promise<string> {
    server = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk) => (text += chunk));
      request.on("end", async () => {
        const answer = await handle(JSON.parse(text));
        response.writeHead(answer.status, {
          "content-type": "application/json",
        });
        response.end(await answer.text());
      });
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it("posts {text, source, …} to /api/import and gets the route's answer", async () => {
    const seen: unknown[] = [];
    /* The real route, behind a real socket; the model stub lets loopback
     * through for the backend's own request. */
    const realFetch = globalThis.fetch;
    const origin = await editor((body) => {
      seen.push(body);
      return post(body);
    });
    const modelStub = stubModel();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL, init?: RequestInit) =>
        String(input).startsWith(origin)
          ? realFetch(input, init)
          : modelStub(input),
      ),
    );
    const backend = createHttpBackend({ baseUrl: origin });
    const result = await backend.importText(TEXT, {
      source: "https://example.com/email",
      dryRun: true,
      tags: ["baking"],
    });
    expect(seen).toEqual([
      {
        text: TEXT,
        source: "https://example.com/email",
        dryRun: true,
        tags: ["baking"],
      },
    ]);
    expect(result).toMatchObject({
      dryRun: true,
      pastedText: true,
      url: "https://example.com/email",
      draft: { tags: ["baking"] },
    });
  });

  it("names an editor from before 36c instead of its zod issue", async () => {
    const origin = await editor(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "validation",
              message: "Invalid input",
              issues: [
                { path: "url", message: "Invalid input: expected string" },
                { path: "", message: 'Unrecognized key: "text"' },
              ],
            },
          }),
          { status: 400 },
        ),
    );
    const backend = createHttpBackend({ baseUrl: origin });
    await expect(backend.importText(TEXT, { dryRun: true })).rejects.toThrow(
      `The editor at ${origin} predates pasted-text import (36c) — update it, or run with --content-dir.`,
    );
  });

  it("names an editor from before 36e instead of its zod issue", async () => {
    const origin = await editor(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "validation",
              message: "Invalid input",
              issues: [{ path: "", message: 'Unrecognized key: "all"' }],
            },
          }),
          { status: 400 },
        ),
    );
    const backend = createHttpBackend({ baseUrl: origin });
    await expect(
      backend.importRecipe("https://www.youtube.com/watch?v=X", { all: true }),
    ).rejects.toThrow(
      `The editor at ${origin} predates several-recipe import (36e) — update it, or run with --content-dir.`,
    );
  });
});

describe("/api/import with several recipes (36e)", () => {
  const TWO = [
    "CAKE",
    "200g flour",
    "100g sugar",
    "",
    "Mix and bake.",
    "",
    "GLAZE",
    "100g icing sugar",
    "20g lemon juice",
    "",
    "Whisk and pour over the cake.",
  ].join("\n");

  function stubStandIn() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) =>
        Response.json(standInChat(JSON.parse(String(init?.body)))),
      ),
    );
  }

  it("refuses a create with neither pick nor all (400 usage), takes all (201)", async () => {
    stubStandIn();
    const refused = await post({ text: TWO });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatchObject({
      code: "usage",
      message: expect.stringContaining("1. Cake, 2. Glaze"),
    });
    const both = await post({ text: TWO, pick: [1], all: true });
    expect(both.status).toBe(400);
    expect((await both.json()).error.code).toBe("validation");
    const created = await post({ text: TWO, all: true });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      batch: true,
      recipes: [
        { n: 1, status: "imported", slug: "cake" },
        { n: 2, status: "imported", slug: "glaze" },
      ],
    });
  });
});

/* 38e: photos as multipart; the stand-in model transcribes them by hash. */
describe("/api/import with photos (38e)", () => {
  const CARD = [
    "Oat Cookies",
    "1 cup butter",
    "3 cups oats",
    "",
    "Mix and bake.",
  ].join("\n");

  let server: Server | undefined;

  afterEach(async () => {
    const running = server;
    server = undefined;
    if (running) await new Promise<void>((done) => running.close(() => done()));
  });

  async function card(): Promise<Buffer> {
    const { default: sharp } = await import("sharp");
    return sharp({
      create: { width: 60, height: 40, channels: 3, background: "#fbf6e9" },
    })
      .jpeg()
      .toBuffer();
  }

  async function stubVision(bytes: Buffer) {
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "qwen2.5vl:7b");
    const transcripts = { [await sentPhotoKey(bytes)]: CARD };
    const modelStub = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/chat") {
        return Response.json(
          standInChat(JSON.parse(String(init?.body)), { transcripts }),
        );
      }
      return Response.json({ models: [] });
    });
    vi.stubGlobal("fetch", modelStub);
    return modelStub;
  }

  async function multipart(
    photos: { bytes: Buffer; name: string }[],
    request?: unknown,
  ): Promise<Response> {
    const form = new FormData();
    for (const photo of photos) {
      form.append(
        "photo",
        new File([new Uint8Array(photo.bytes)], photo.name, {
          type: "image/jpeg",
        }),
        photo.name,
      );
    }
    if (request !== undefined) form.set("request", JSON.stringify(request));
    /* As a browser or `fetch` sends it: encoded, with its Content-Length
     * (a constructed Request carries none). */
    const encoded = new Response(form);
    const body = Buffer.from(await encoded.arrayBuffer());
    return POST(
      new Request("http://editor.test/api/import", {
        method: "POST",
        headers: {
          "content-type": encoded.headers.get("content-type")!,
          "content-length": String(body.length),
        },
        body,
      }),
    );
  }

  it("refuses an upload too large, or of no stated size, before reading it (38e review)", async () => {
    const bytes = await card();
    await stubVision(bytes);
    let read = false;
    const unread = () =>
      new ReadableStream<Uint8Array>(
        {
          pull() {
            read = true;
            throw new Error("the body was read");
          },
        },
        /* No pull until someone reads. */
        { highWaterMark: 0 },
      );
    const upload = (headers: Record<string, string>) =>
      POST(
        new Request("http://editor.test/api/import", {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=x",
            ...headers,
          },
          body: unread(),
          duplex: "half",
        } as RequestInit),
      );
    const huge = await upload({
      "content-length": String(4 * 15 * 1024 * 1024 + 1024 * 1024 + 1),
    });
    expect(huge.status).toBe(413);
    expect((await huge.json()).error).toMatchObject({
      code: "validation",
      message: expect.stringMatching(/^The upload is \d+ bytes, over the /),
    });
    const unsized = await upload({});
    expect(unsized.status).toBe(400);
    expect((await unsized.json()).error.message).toMatch(
      /needs a Content-Length header/,
    );
    /* No vision model: `usage`, before the size is even looked at. */
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "");
    const off = await upload({ "content-length": "999999999" });
    expect(off.status).toBe(400);
    expect((await off.json()).error.code).toBe("usage");
    expect(read).toBe(false);
  });

  it("dry-runs an upload: transcribed, then read and grounded", async () => {
    const bytes = await card();
    const modelStub = await stubVision(bytes);
    const response = await multipart([{ bytes, name: "card.jpg" }], {
      dryRun: true,
      tags: ["cookies"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      photos: 1,
      transcription: CARD,
      llm: { grounded: 2, total: 2 },
      draft: { name: "Oat Cookies", tags: ["cookies"] },
    });
    expect(
      modelStub.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toEqual([
      /* The vision model's digest, once per import (39a). */
      "/api/tags",
      "/api/chat",
      "/api/ps",
      "/api/generate",
      "/api/chat",
      "/api/ps",
    ]);
  });

  it("refuses photo paths in a JSON body, too many photos, and no vision model", async () => {
    const bytes = await card();
    await stubVision(bytes);
    const paths = await post({ photos: ["/etc/passwd.jpg"], dryRun: true });
    expect(paths.status).toBe(400);
    expect((await paths.json()).error.message).toMatch(
      /^`photos` are local paths, for the MCP tool/,
    );
    const five = await multipart(
      [1, 2, 3, 4, 5].map((n) => ({ bytes, name: `${n}.jpg` })),
      { dryRun: true },
    );
    expect((await five.json()).error).toMatchObject({
      code: "validation",
      issues: [
        { path: "photos", message: "A photo import takes at most 4 photos" },
      ],
    });
    const named = await multipart([{ bytes, name: "a.jpg" }], {
      photos: ["/x.jpg"],
    });
    expect((await named.json()).error.code).toBe("validation");
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "");
    const off = await multipart([{ bytes, name: "a.jpg" }], { dryRun: true });
    expect(off.status).toBe(400);
    expect((await off.json()).error).toMatchObject({
      code: "usage",
      message: expect.stringContaining("RECIPE_LLM_VISION_MODEL"),
    });
  });

  it("the HTTP backend's importPhotos uploads them to the route", async () => {
    const bytes = await card();
    const realFetch = globalThis.fetch;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", async () => {
        const answer = await POST(
          new Request("http://editor.test/api/import", {
            method: "POST",
            headers: {
              "content-type": request.headers["content-type"]!,
              "content-length": request.headers["content-length"]!,
            },
            body: Buffer.concat(chunks),
          }),
        );
        response.writeHead(answer.status, {
          "content-type": "application/json",
        });
        response.end(await answer.text());
      });
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
    const modelStub = await stubVision(bytes);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL, init?: RequestInit) =>
        String(input).startsWith(origin)
          ? realFetch(input, init)
          : modelStub(input, init),
      ),
    );
    const backend = createHttpBackend({ baseUrl: origin });
    const result = await backend.importPhotos(
      [new File([new Uint8Array(bytes)], "card.jpg", { type: "image/jpeg" })],
      { dryRun: true, source: "https://example.com/cookbook" },
    );
    expect(result).toMatchObject({
      dryRun: true,
      photos: 1,
      url: "https://example.com/cookbook",
      draft: { name: "Oat Cookies" },
    });
  });
});
