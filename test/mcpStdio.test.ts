// @vitest-environment node
//
// The stdout-purity proof (T21).
//
// `mcp.test.ts` drives the registry over an in-memory transport, which is the
// right shape for testing tools and the wrong shape for testing the *server*:
// it never opens a pipe, so it cannot notice that something in the import
// graph wrote a byte to stdout. A real MCP stdio client spawning the real
// `pnpm --silent --filter recipe-editor mcp` can — a stray `console.log`, a
// pnpm banner or an engine warning on the wrong stream lands in the middle of
// a JSON-RPC frame and the handshake below simply fails.
//
// So: two cases, both cheap once the process is up, and the whole child's
// stderr is captured and attached to any failure, because a server that dies
// during startup otherwise fails as an unexplained timeout.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createContent } from "@discontent/cms/content/createContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";
import type {
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "../websites/recipe-website/common/controller/types";
import { TOOL_NAMES } from "../websites/recipe-website/editor/mcp/registry";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** tsx has to compile the editor's whole import graph before the first frame. */
const TIMEOUT = 60_000;

let contentDirectory: string;
let transport: StdioClientTransport;
let client: Client;
let stderr = "";

beforeAll(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "mcp-stdio-"));
  await createContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug: "stdio-scone",
    data: {
      name: "Stdio Scone",
      date: Date.UTC(2026, 0, 4),
      tags: ["baked"],
      totalTime: 30,
    },
    contentDirectory,
  });
  /*
   * Before the child runs: the environments this process opened are mapped
   * files and the child is about to open the same ones (T16).
   */
  await closeCachedEnvironments();

  transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--silent", "--filter", "recipe-editor", "mcp"],
    cwd: REPO_ROOT,
    /*
     * The client passes a minimal environment by default, and pnpm is not in
     * it (T29). Only what the child genuinely needs — in particular
     * `CONTENT_DIRECTORY`, without which the server opens the *real* content
     * repository through `editor/content`.
     */
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      CONTENT_DIRECTORY: contentDirectory,
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  client = new Client({ name: "mcp-stdio-test", version: "0" });
  await client.connect(transport);
}, TIMEOUT);

afterAll(async () => {
  /* Closing the client ends the child's stdin, which is its shutdown signal. */
  await client?.close();
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("the MCP server as a process", () => {
  it(
    "completes a handshake and lists the whole tool surface",
    async () => {
      const { tools } = await client.listTools();
      expect(
        tools.map((tool) => tool.name),
        stderr,
      ).toEqual([...TOOL_NAMES]);
    },
    TIMEOUT,
  );

  it(
    "answers a read from the content directory it was given",
    async () => {
      const result = await client.callTool({
        name: "recipe_list",
        arguments: {},
      });
      const data = result.structuredContent as {
        total: number;
        recipes: Record<string, unknown>[];
      };
      expect(data.total, stderr).toBe(1);
      expect(data.recipes[0], stderr).toEqual({
        slug: "stdio-scone",
        name: "Stdio Scone",
        date: Date.UTC(2026, 0, 4),
        tags: ["baked"],
        totalTime: 30,
      });
      /* One banner on stderr, and it names the directory it was handed. */
      expect(stderr).toContain(`recipes MCP: local ${contentDirectory}`);
    },
    TIMEOUT,
  );
});
