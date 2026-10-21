// @vitest-environment node
//
// The editor agent's tool bridge (epic 44, 44b): the `recipes` MCP tools
// handed to a model directly, narrowed to Claude Code's grant (E1).
//
// What is pinned: the 45 names equal `.claude/settings.json`'s allow-list and
// the curator skill's frontmatter, none of the 14 held back is reachable; each
// tool's description and JSON Schema are the MCP server's own; and a round
// trip — one write, two reads — answers what the MCP tool answers, failures
// included, as returned objects rather than throws.

import { mkdtemp, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import {
  TOOL_NAMES,
  createRecipeServer,
} from "../websites/recipe-website/editor/mcp/registry";
import {
  AGENT_HELD_BACK,
  AGENT_TOOL_NAMES,
  LOCAL_FILE_REFUSAL,
  agentTools,
  recipeAgentTools,
  type AgentToolName,
} from "../websites/recipe-website/editor/controller/agent/tools";
import type { AgentTool } from "../websites/recipe-website/editor/controller/agent/types";

const SKILL_PATH = resolve(
  __dirname,
  "../.claude/skills/recipe-curator/SKILL.md",
);
const SETTINGS_PATH = resolve(__dirname, "../.claude/settings.json");

const mcpNames = (entries: string[]) =>
  entries
    .filter((entry) => entry.startsWith("mcp__recipes__"))
    .map((entry) => entry.replace(/^mcp__recipes__/, ""))
    .sort();

const ctx = () => ({ signal: new AbortController().signal });

describe("AGENT_TOOL_NAMES (E1)", () => {
  it("is Claude Code's grant: settings.json's allow-list and the skill's frontmatter", async () => {
    const settings = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as {
      permissions: { allow: string[] };
    };
    const skill = await readFile(SKILL_PATH, "utf8");
    const line = /^allowed-tools:(.*)$/m.exec(skill);
    expect(line).not.toBeNull();
    const frontmatter = (line as RegExpExecArray)[1]
      .split(",")
      .map((entry) => entry.trim());

    const expected = [...AGENT_TOOL_NAMES].sort();
    expect(AGENT_TOOL_NAMES).toHaveLength(45);
    expect(mcpNames(settings.permissions.allow)).toEqual(expected);
    expect(mcpNames(frontmatter)).toEqual(expected);
  });

  it("and the 14 held back are the rest of the registry, disjoint", () => {
    expect(AGENT_HELD_BACK).toHaveLength(14);
    expect(new Set(AGENT_TOOL_NAMES).size).toBe(45);
    for (const name of AGENT_HELD_BACK) {
      expect(AGENT_TOOL_NAMES as readonly string[]).not.toContain(name);
    }
    expect([...AGENT_TOOL_NAMES, ...AGENT_HELD_BACK].sort()).toEqual(
      [...TOOL_NAMES].sort(),
    );
  });
});

describe("the bridge over a temp content directory", () => {
  let contentDirectory: string;
  let previousContentDirectory: string | undefined;
  let backend: ReturnType<typeof createLocalBackend>;
  let tools: AgentTool[];

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "agent-tools-"));
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;
    /* As the editor will build it (44c): in-process, like MCP over HTTP. */
    backend = createLocalBackend({ contentDirectory, inProcess: true });
    tools = agentTools(backend, { webSearch: false });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await closeCachedEnvironments();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  const tool = (name: string) => {
    const found = tools.find((entry) => entry.name === name);
    expect(found, name).toBeDefined();
    return found as AgentTool;
  };

  it("offers the 45 and web_fetch, nothing held back, and web_search only when configured", () => {
    expect(tools.map((entry) => entry.name)).toEqual([
      ...AGENT_TOOL_NAMES,
      "web_fetch",
    ]);
    for (const name of AGENT_HELD_BACK) {
      expect(tools.map((entry) => entry.name)).not.toContain(name);
    }

    vi.stubEnv("RECIPE_SEARCH_URL", "");
    expect(agentTools(backend).map((entry) => entry.name)).not.toContain(
      "web_search",
    );
    vi.stubEnv("RECIPE_SEARCH_URL", "http://127.0.0.1:8888");
    expect(
      agentTools(backend)
        .map((entry) => entry.name)
        .at(-1),
    ).toBe("web_search");
    expect(
      agentTools(backend, { webFetch: false, webSearch: false }),
    ).toHaveLength(45);
    /* A subset for a small context (Eb5), still in the grant's order. */
    expect(
      agentTools(backend, {
        webSearch: false,
        only: ["recipe_get", "recipe_search"],
      }).map((entry) => entry.name),
    ).toEqual(["recipe_search", "recipe_get", "web_fetch"]);

    const untrusted = agentTools(backend)
      .filter((entry) => entry.untrusted)
      .map((entry) => entry.name);
    expect(untrusted).toEqual([
      "page_inspect",
      "page_inspect_list",
      "web_fetch",
      "web_search",
    ]);
  });

  it("describes each tool exactly as the MCP server lists it", async () => {
    const server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-tools-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const listed = new Map(
        (await client.listTools()).tools.map((entry) => [entry.name, entry]),
      );
      let schemaChars = 0;
      let descriptionChars = 0;
      for (const agentTool of recipeAgentTools(backend)) {
        const mcp = listed.get(agentTool.name);
        expect(mcp, agentTool.name).toBeDefined();
        expect(agentTool.description).toBe(mcp?.description);
        const { $schema: _dialect, ...schema } = mcp?.inputSchema as Record<
          string,
          unknown
        >;
        expect(agentTool.inputSchema, agentTool.name).toEqual(schema);
        /* What Anthropic's `input_schema` and Ollama's `parameters` need. */
        expect(agentTool.inputSchema.type).toBe("object");
        expect(agentTool.inputSchema).not.toHaveProperty("$schema");
        schemaChars += JSON.stringify(agentTool.inputSchema).length;
        descriptionChars += agentTool.description.length;
      }
      /* Recorded in the doc's 44b Results: what 45 tools cost a context. */
      console.info(
        `agent tools: ${schemaChars} schema chars + ${descriptionChars} description chars`,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("round-trips a write and two reads, answering as the MCP tool does", async () => {
    const created = (await tool("recipe_create").run(
      {
        recipe: {
          name: "Chocolate Cake",
          tags: ["Dessert"],
          ingredients: ["2 cups flour", "1 cup cocoa"],
          totalTime: 90,
        },
      },
      ctx(),
    )) as Record<string, unknown>;
    expect(created.slug).toBe("chocolate-cake");
    /* In-process: no stale-editor hint (T53). */
    expect(created.warnings).toBeUndefined();

    const got = (await tool("recipe_get").run(
      { slug: "chocolate-cake", fields: ["name", "tags"] },
      ctx(),
    )) as { recipe: Record<string, unknown> };
    expect(got.recipe).toEqual({ name: "Chocolate Cake", tags: ["dessert"] });

    const listed = (await tool("recipe_list").run({}, ctx())) as {
      recipes: Record<string, unknown>[];
    };
    /* Compact rows (D3), the same the MCP tool answers. */
    expect(listed.recipes).toHaveLength(1);
    expect(listed.recipes[0]).toMatchObject({
      slug: "chocolate-cake",
      name: "Chocolate Cake",
      tags: ["dessert"],
      totalTime: 90,
    });
    expect(listed.recipes[0]).not.toHaveProperty("ingredients");

    const server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-tools-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    try {
      const viaMcp = await client.callTool({
        name: "recipe_list",
        arguments: {},
      });
      expect(listed).toEqual(viaMcp.structuredContent);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("refuses a download from a private address before the handler runs (Eb9)", async () => {
    const guarded = agentTools(backend, {
      webSearch: false,
      guard: {
        lookup: async (host) =>
          host === "inner.example" ? ["10.9.8.7"] : ["93.184.216.34"],
      },
    });
    const run = (name: string, args: Record<string, unknown>) =>
      (guarded.find((entry) => entry.name === name) as AgentTool).run(
        args,
        ctx(),
      );
    const cases: [string, Record<string, unknown>][] = [
      ["page_inspect", { url: "http://169.254.169.254/latest/meta-data/" }],
      ["page_inspect", { url: "https://inner.example/recipe" }],
      ["recipe_import", { url: "http://2130706433/", dryRun: true }],
      [
        "recipe_import",
        { url: "https://example.com/r", image: "http://[::1]/x.jpg" },
      ],
      ["recipe_import", { url: "file:///etc/passwd" }],
      ["page_inspect_list", { url: "http://[::ffff:7f00:1]/" }],
      [
        "recipe_import_list",
        {
          url: "https://example.com/list",
          pick: [{ n: 1, url: "http://0.0.0.0/" }],
        },
      ],
      ["recipe_set_image", { slug: "x", url: "http://192.168.1.1/a.jpg" }],
      ["term_set_image", { slug: "x", url: "http://[::7f00:1]/a.jpg" }],
      [
        "recipe_create",
        { recipe: { name: "Sneaky", imageImportUrl: "http://10.0.0.1/a.jpg" } },
      ],
      [
        "recipe_update",
        { slug: "x", patch: { imageImportUrl: "http://127.0.0.1/a.jpg" } },
      ],
      [
        "group_create",
        { group: { name: "G", imageImportUrl: "http://10.0.0.1/a.jpg" } },
      ],
      [
        "term_create",
        { term: { label: "T", imageImportUrl: "http://10.0.0.1/a.jpg" } },
      ],
    ];
    for (const [name, args] of cases) {
      expect(
        await run(name, args),
        `${name} ${JSON.stringify(args)}`,
      ).toMatchObject({
        error: { code: "forbidden" },
      });
    }
    /* Refused before the handler: nothing was written. */
    expect(await run("recipe_list", {})).toMatchObject({ recipes: [] });
  });

  it("refuses a local file — an image `path`, import `photos` — nothing written (Ec10)", async () => {
    const image = join(contentDirectory, "secret.jpg");
    await writeFile(image, "not really a jpeg");
    expect(
      await tool("recipe_create").run(
        { recipe: { name: "Toast", ingredients: ["bread"] } },
        ctx(),
      ),
    ).toMatchObject({ slug: "toast" });
    await tool("term_create").run({ term: { label: "Breakfast" } }, ctx());
    const before = JSON.stringify(
      await tool("recipe_get").run({ slug: "toast" }, ctx()),
    );

    const cases: [string, Record<string, unknown>][] = [
      ["recipe_set_image", { slug: "toast", path: image }],
      ["term_set_image", { slug: "breakfast", path: image }],
      ["recipe_import", { photos: [image] }],
      ["recipe_import", { photos: ["/etc/passwd"], dryRun: true }],
    ];
    for (const [name, args] of cases) {
      expect(await tool(name).run(args, ctx()), name).toEqual({
        error: { code: "forbidden", message: LOCAL_FILE_REFUSAL },
      });
    }
    expect(
      JSON.stringify(await tool("recipe_get").run({ slug: "toast" }, ctx())),
    ).toBe(before);
    expect(
      await tool("term_get").run({ slug: "breakfast" }, ctx()),
    ).not.toMatchObject({ term: { image: expect.anything() } });

    /* A URL still reaches the handler (here a 404, not a refusal). */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );
    const viaUrl = await agentTools(backend, {
      webSearch: false,
      guard: { lookup: async () => ["93.184.216.34"] },
    })
      .find((entry) => entry.name === "recipe_set_image")
      ?.run({ slug: "toast", url: "https://example.invalid/a.jpg" }, ctx());
    expect(viaUrl).not.toMatchObject({ error: { code: "forbidden" } });
    vi.unstubAllGlobals();
  });

  it("offers nothing for a held-back name smuggled into `only`", () => {
    expect(
      recipeAgentTools(backend, {
        only: ["recipe_delete", "git_push"] as unknown as AgentToolName[],
      }),
    ).toEqual([]);
  });

  it("returns failures as the layer's error object, never a throw", async () => {
    expect(
      await tool("recipe_get").run({ slug: "no-such-recipe" }, ctx()),
    ).toMatchObject({ error: { code: "not_found" } });

    /* Input the schema refuses: the SDK's protocol error over MCP (T28), a
     * `validation` object here. */
    const missing = (await tool("recipe_get").run({}, ctx())) as {
      error: { code: string; message: string; issues: unknown[] };
    };
    expect(missing.error.code).toBe("validation");
    expect(missing.error.message).toMatch(/recipe_get/);
    expect(missing.error.issues).toEqual([
      expect.objectContaining({ path: "slug" }),
    ]);
    expect(
      await tool("recipe_get").run({ slug: "x", extra: 1 }, ctx()),
    ).toMatchObject({ error: { code: "validation" } });

    const stopped = new AbortController();
    stopped.abort();
    expect(
      await tool("recipe_list").run({}, { signal: stopped.signal }),
    ).toMatchObject({ error: { code: "cancelled" } });
  });
});
