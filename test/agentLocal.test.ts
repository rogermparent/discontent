// @vitest-environment node
//
// 44e: what a local model gets. Pinned: the condensed prompt and the local
// tool specs stay under their budgets (estimateTokens, 40a — the method 44c
// measured with); `skill-local.md` names only tools a local run has; the
// tools' local view (short descriptions, lighter schemas, a smaller
// page_inspect answer) changes only what the model reads — the MCP
// descriptions, the zod parse and the bridge's refusals are as before;
// RECIPE_AGENT_NUM_CTX / RECIPE_AGENT_THINK reach the Ollama request; and
// the harness's SSRF allowance is off unless code passes it — no route,
// CLI or job spec can. Never a real model: `fetch` is stubbed.

import { mkdtemp, readFile, readdir, rm } from "fs-extra";
import { createServer, type Server } from "node:http";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { TOOL_NAMES } from "../websites/recipe-website/editor/mcp/registry";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import {
  AGENT_CONTEXT_STEPS,
  agentLocalOptions,
  agentSystemPrompt,
  agentToolset,
  runAgentJob,
} from "../websites/recipe-website/editor/controller/agent/job";
import {
  LOCAL_AGENT_TOOLS,
  LOCAL_PROMPT_BUDGET_TOKENS,
  LOCAL_SKILL_BUDGET_TOKENS,
  localSystemPrompt,
} from "../websites/recipe-website/editor/controller/agent/prompt";
import { CURATOR_LOCAL_SKILL_TEXT } from "../websites/recipe-website/editor/controller/agent/skillText.generated";
import {
  LOCAL_TOOL_TEXT,
  agentTools,
  localResult,
  localSchema,
} from "../websites/recipe-website/editor/controller/agent/tools";
import type { AgentTool } from "../websites/recipe-website/editor/controller/agent/types";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import { estimateTokens } from "../websites/recipe-website/editor/controller/llm/client";

const ROOT = resolve(__dirname, "..");
const EDITOR = join(ROOT, "websites/recipe-website/editor");

let contentDirectory: string;
let ctx: CurationContext;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "agent-local-"));
  ctx = { contentDirectory };
  vi.stubEnv("RECIPE_SEARCH_URL", "http://127.0.0.1:8888");
  vi.stubEnv("RECIPE_AGENT_NUM_CTX", "");
  vi.stubEnv("RECIPE_AGENT_THINK", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const specsOf = (tools: AgentTool[]) =>
  JSON.stringify(
    tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  );

const byName = (tools: AgentTool[], name: string) => {
  const tool = tools.find((each) => each.name === name);
  if (!tool) throw new Error(`no ${name}`);
  return tool;
};

const signal = () => new AbortController().signal;

describe("the local prompt and tools fit", () => {
  it("stay under the budget, measured as 44c measured", () => {
    const { tools } = agentToolset(ctx, "ollama");
    expect(tools.map((tool) => tool.name)).toEqual([
      ...LOCAL_AGENT_TOOLS,
      "web_fetch",
      "web_search",
    ]);
    const prompt = estimateTokens(
      localSystemPrompt({ now: new Date(2026, 9, 21), search: true }),
    );
    const specs = estimateTokens(specsOf(tools));
    expect(
      prompt + specs,
      `local prompt ${prompt} + tools ${specs} tokens: over the 44e budget`,
    ).toBeLessThanOrEqual(LOCAL_PROMPT_BUDGET_TOKENS);
    expect(estimateTokens(CURATOR_LOCAL_SKILL_TEXT)).toBeLessThanOrEqual(
      LOCAL_SKILL_BUDGET_TOKENS,
    );
    /* What it replaced (44c): ~2.2k + ~4.8k. */
    expect(prompt + specs).toBeLessThan(4_000);
  });

  it("names in skill-local.md only the tools a local run has", () => {
    const { tools } = agentToolset(ctx, "ollama");
    const offered = new Set(tools.map((tool) => tool.name));
    const known = new Set<string>([...TOOL_NAMES, "web_fetch", "web_search"]);
    const named = [
      ...CURATOR_LOCAL_SKILL_TEXT.matchAll(/`([a-z]+_[a-z_]+)/g),
    ].map((match) => match[1]);
    const tools_ = named.filter((name) => known.has(name));
    expect(tools_.length).toBeGreaterThan(5);
    for (const name of tools_) expect(offered).toContain(name);
  });

  it("leaves Claude's tools as the MCP server describes them", () => {
    const backend = createLocalBackend({ ...ctx, inProcess: true });
    const plain = agentTools(backend, { only: LOCAL_AGENT_TOOLS });
    const { tools } = agentToolset(ctx, "anthropic");
    for (const name of LOCAL_AGENT_TOOLS) {
      expect(byName(tools, name).description).toBe(
        byName(plain, name).description,
      );
      expect(byName(tools, name).inputSchema).toEqual(
        byName(plain, name).inputSchema,
      );
    }
    expect(byName(tools, "recipe_import").description.length).toBeGreaterThan(
      2_000,
    );
  });
});

describe("the tools' local view", () => {
  it("covers every local tool, and every left-out argument exists", () => {
    const backend = createLocalBackend({ ...ctx, inProcess: true });
    const plain = agentTools(backend, {
      only: LOCAL_AGENT_TOOLS,
      webSearch: { searchUrl: "http://127.0.0.1:8888" },
    });
    for (const tool of plain) {
      const text = LOCAL_TOOL_TEXT[tool.name as keyof typeof LOCAL_TOOL_TEXT];
      expect(text, tool.name).toBeDefined();
      expect(text!.description.length).toBeLessThan(tool.description.length);
      for (const path of text!.omit ?? []) {
        let schema = tool.inputSchema as Record<string, unknown>;
        const parts = path.split(".");
        for (const part of parts.slice(0, -1)) {
          schema = (
            schema.properties as Record<string, Record<string, unknown>>
          )[part];
        }
        expect(
          (schema.properties as Record<string, unknown>)[parts.at(-1)!],
          `${tool.name}: ${path}`,
        ).toBeDefined();
      }
    }
  });

  it("lightens a schema and leaves the original alone", () => {
    const original = {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
        when: { type: "integer", minimum: -Number.MAX_SAFE_INTEGER },
        recipe: {
          type: "object",
          properties: {
            name: { type: "string" },
            timelines: { type: "array" },
          },
          required: ["name", "timelines"],
          additionalProperties: false,
        },
        photos: { type: "array", minItems: 1 },
        size: { type: "integer", minimum: 500, maximum: 24_000 },
      },
      required: ["query", "photos"],
      additionalProperties: false,
    };
    const copy = structuredClone(original);
    expect(localSchema(original, ["photos", "recipe.timelines"])).toEqual({
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1 },
        when: { type: "integer" },
        recipe: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        size: { type: "integer", minimum: 500, maximum: 24_000 },
      },
      required: ["query"],
    });
    expect(original).toEqual(copy);
  });

  it("answers page_inspect without its copies, and passes errors through", () => {
    const inspected = {
      url: "u",
      finalUrl: "u",
      status: 200,
      partial: false,
      recipe: { name: "x" },
      draft: { name: "x", ingredients: ["1 egg"] },
      suggestedTags: ["main course"],
      jsonLd: { "@type": "Recipe" },
      meta: { title: "t" },
      images: [1, 2, 3, 4, 5].map((n) => ({ url: `i${n}`, from: "jsonld" })),
      video: {
        title: "v",
        channel: "c",
        description: "d".repeat(5_000),
        chapters: [],
        thumbnails: [],
      },
      recipes: [{ n: 1, name: "a", slug: "a", recipe: {}, draft: {} }],
      job: "j",
    };
    expect(localResult("page_inspect", inspected)).toEqual({
      url: "u",
      finalUrl: "u",
      status: 200,
      partial: false,
      draft: { name: "x", ingredients: ["1 egg"] },
      suggestedTags: ["main course"],
      images: inspected.images.slice(0, 3),
      video: { title: "v", channel: "c", description: "d".repeat(1_500) },
      recipes: [{ n: 1, name: "a", slug: "a" }],
      job: "j",
    });
    expect(
      localResult("recipe_import", {
        dryRun: true,
        slug: "x",
        recipe: {},
        draft: {},
      }),
    ).toEqual({ dryRun: true, slug: "x", draft: {} });
    const error = { error: { code: "not_found", message: "no" } };
    expect(localResult("page_inspect", error)).toBe(error);
    expect(localResult("recipe_search", { total: 0 })).toEqual({ total: 0 });
  });

  it("still parses and refuses as the bridge did: a left-out argument is not a way round", async () => {
    const { tools } = agentToolset(ctx, "ollama");
    const imports = byName(tools, "recipe_import");
    expect(imports.inputSchema.properties).not.toHaveProperty("photos");
    /* Ec10's refusal stands, though the local schema no longer shows `photos`. */
    expect(
      await imports.run({ photos: ["/etc/passwd"] }, { signal: signal() }),
    ).toMatchObject({ error: { code: "forbidden" } });
    /* The zod parse is the rule (Eb1). */
    expect(
      await imports.run(
        { url: "https://x.test/", bogus: 1 },
        { signal: signal() },
      ),
    ).toMatchObject({ error: { code: "validation" } });
  });
});

describe("RECIPE_AGENT_NUM_CTX and RECIPE_AGENT_THINK", () => {
  it("parse to the default, a known step, or the default with a note", () => {
    expect(agentLocalOptions({})).toEqual({
      numCtx: 12_288,
      think: false,
      ignored: [],
    });
    expect(
      agentLocalOptions({
        RECIPE_AGENT_NUM_CTX: "16384",
        RECIPE_AGENT_THINK: "1",
      }),
    ).toEqual({ numCtx: 16_384, think: true, ignored: [] });
    expect(agentLocalOptions({ RECIPE_AGENT_THINK: "off" }).think).toBe(false);
    const odd = agentLocalOptions({
      RECIPE_AGENT_NUM_CTX: "9000",
      RECIPE_AGENT_THINK: "maybe",
    });
    expect(odd.numCtx).toBe(12_288);
    expect(odd.think).toBe(false);
    expect(odd.ignored).toHaveLength(2);
    expect(AGENT_CONTEXT_STEPS).toEqual([12_288, 16_384]);
  });

  it("reach every Ollama turn of a run, with the local prompt", async () => {
    vi.stubEnv("RECIPE_LLM_API", "ollama");
    vi.stubEnv("RECIPE_LLM_URL", "http://localhost:11434");
    vi.stubEnv("RECIPE_LLM_MODEL", "qwen3:8b");
    vi.stubEnv("RECIPE_AGENT_NUM_CTX", "16384");
    vi.stubEnv("RECIPE_AGENT_THINK", "1");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        expect(String(input)).toBe("http://localhost:11434/api/chat");
        bodies.push(JSON.parse(String(init?.body)));
        const message =
          bodies.length === 1
            ? {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    function: {
                      name: "recipe_search",
                      arguments: { query: "tahini" },
                    },
                  },
                ],
              }
            : { role: "assistant", content: "None here." };
        return new Response(
          JSON.stringify({
            model: "qwen3:8b",
            message,
            done: true,
            done_reason: "stop",
            prompt_eval_count: 3000,
            eval_count: 20,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const dir = await mkdtemp(join(tmpdir(), "agent-local-jobs-"));
    try {
      const { log } = memoryJobLog();
      const result = await runAgentJob(
        { kind: "agent", contentDirectory, prompt: "anything with tahini?" },
        { ctx, job: { log, tier: "interactive" }, dir },
      );
      expect(result.stopReason).toBe("done");
      expect(bodies).toHaveLength(2);
      for (const body of bodies) {
        expect(body).toMatchObject({
          think: true,
          options: { num_ctx: 16_384 },
        });
      }
      const messages = bodies[0].messages as {
        role: string;
        content: string;
      }[];
      expect(messages[0].content).toBe(
        agentSystemPrompt("ollama", { now: new Date(), search: true }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the harness's SSRF allowance (Ee6)", () => {
  let server: Server;
  let origin: string;

  beforeEach(async () => {
    const page = await readFile(
      join(ROOT, "test/fixtures/agent/lemon-garlic-chicken-thighs.html"),
      "utf8",
    );
    server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(page.replaceAll("{{ORIGIN}}", origin));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterEach(() => {
    server.close();
  });

  it("is off by default: the editor's toolset refuses the fixture host", async () => {
    for (const api of ["ollama", "anthropic"] as const) {
      const { tools } = agentToolset(ctx, api);
      const url = `${origin}/recipes/lemon-garlic-chicken-thighs/`;
      expect(
        await byName(tools, "page_inspect").run({ url }, { signal: signal() }),
      ).toMatchObject({ error: { code: "forbidden" } });
      expect(
        await byName(tools, "web_fetch").run({ url }, { signal: signal() }),
      ).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("lets the harness's host through only when code passes it", async () => {
    const { tools } = agentToolset(ctx, "ollama", {
      allowHosts: ["127.0.0.1"],
    });
    const inspected = (await byName(tools, "page_inspect").run(
      { url: `${origin}/recipes/lemon-garlic-chicken-thighs/` },
      { signal: signal() },
    )) as { status: number; draft: { name: string; ingredients: string[] } };
    expect(inspected.status).toBe(200);
    expect(inspected.draft.name).toBe("Sheet-Pan Lemon Garlic Chicken Thighs");
    expect(inspected.draft.ingredients).toHaveLength(9);
    /* The local view: no mapped copy, no raw JSON-LD. */
    expect(inspected).not.toHaveProperty("jsonLd");
    expect(inspected).not.toHaveProperty("recipe");
  });

  it("cannot be set from a route, the CLI, the MCP server or a job spec", async () => {
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    for (const dir of ["src", "cli", "mcp", "controller/jobs"]) {
      await walk(join(EDITOR, dir));
    }
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/allowHosts|AgentToolsetTesting/);
    }
    /* The kind's handler hands runAgentJob exactly {ctx, job, dir}. */
    const kinds = await readFile(
      join(EDITOR, "controller/jobs/kinds.ts"),
      "utf8",
    );
    const handler = /async agent\(spec[^]*?runAgentJob\(spec, \{([^}]*)\}/.exec(
      kinds,
    );
    expect(handler?.[1].replace(/\s+/g, " ").trim()).toBe(
      "ctx: contextFor(spec, ctx), job, dir: dir ?? jobsDirectory(),",
    );
  });
});
