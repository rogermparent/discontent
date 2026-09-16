// @vitest-environment node
//
// The curator skill's allow-lists, pinned against the registry (23f/D28).
//
// Three lists have to agree and nothing makes them: the skill's
// `allowed-tools` frontmatter, `.claude/settings.json`'s `permissions.allow`,
// and `TOOL_NAMES`. Drift is silent in the worst direction — a tool renamed
// here and not there is a run that stops mid-story with a permission denial
// nobody asked for, or (the other way) a destructive tool quietly
// pre-approved. So this is the guard (T64), and a new DESTRUCTIVE_WRITE tool
// has to be added to `HELD_BACK` below or this test fails.
//
// It also audits the prose, the way 22e audited the command lines: a tool name
// in the skill that does not exist is an instruction an agent cannot follow,
// and a held-back name outside the "Held back" section is an invitation.

import { mkdtemp, readFile, rm } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import {
  TOOL_NAMES,
  createRecipeServer,
} from "../websites/recipe-website/editor/mcp/registry";

const SKILL_DIR = resolve(__dirname, "../.claude/skills/recipe-curator");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
const EXAMPLES_PATH = join(SKILL_DIR, "examples.md");
const SETTINGS_PATH = resolve(__dirname, "../.claude/settings.json");

/**
 * The seven tools the skill does not get.
 *
 * Spelled out rather than derived, because annotations do not carry it: five
 * are `destructiveHint`, but `reindex` is an idempotent write and `git_push`
 * is an ordinary one — they are held back for what they do to the world
 * (rebuild everything, publish), not for what the protocol calls them. The
 * `destructiveHint` half is checked below, so this list can only be too big,
 * never too small.
 */
const HELD_BACK = [
  "recipe_delete",
  "group_delete",
  "unfeature",
  "reindex",
  "git_revert",
  "git_restore",
  "git_push",
] as const;

const EXPECTED_ALLOWED = TOOL_NAMES.filter(
  (name) => !(HELD_BACK as readonly string[]).includes(name),
);

/** Anything backticked that is shaped like one of this server's tool names. */
const TOOL_SHAPED =
  /^(recipe|group|git|tag|featured)_[a-z_]+$|^(feature|unfeature|reindex)$/;

/** `## Heading` … up to the next `## `, or the end. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  expect(start, `no "## ${heading}" section`).toBeGreaterThan(-1);
  const rest = markdown.slice(start + 3);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

function backtickedTokens(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

describe("the recipe-curator skill's allow-lists", () => {
  let skill: string;
  let examples: string;
  let settingsAllow: string[];
  let frontmatterTools: string[];
  let advertised: Awaited<ReturnType<Client["listTools"]>>["tools"];

  let contentDirectory: string;
  let backend: ReturnType<typeof createLocalBackend>;
  let server: ReturnType<typeof createRecipeServer>;
  let client: Client;

  beforeAll(async () => {
    skill = await readFile(SKILL_PATH, "utf8");
    examples = await readFile(EXAMPLES_PATH, "utf8");

    const settings = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as {
      permissions: { allow: string[] };
    };
    settingsAllow = settings.permissions.allow;

    /*
     * One line, comma-separated — which is why this stays a one-liner regex
     * and prettier has nothing to reflow (D27).
     */
    const line = /^allowed-tools:(.*)$/m.exec(skill);
    expect(line, "no `allowed-tools:` line in the frontmatter").not.toBeNull();
    frontmatterTools = (line as RegExpExecArray)[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    /* A live tool list, so the annotations checked below are the real ones. */
    contentDirectory = await mkdtemp(join(tmpdir(), "curator-skill-"));
    backend = createLocalBackend({ contentDirectory });
    server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "curator-skill-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    advertised = (await client.listTools()).tools;
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    await backend.close();
    await rm(contentDirectory, { recursive: true, force: true });
  });

  /* (a) --------------------------------------------------------------- */

  it("holds back every tool the server marks destructive", () => {
    const destructive = advertised
      .filter((tool) => tool.annotations?.destructiveHint === true)
      .map((tool) => tool.name);

    expect(destructive.length).toBeGreaterThan(0);
    expect([...HELD_BACK].sort()).toEqual(
      expect.arrayContaining(destructive.sort()),
    );
  });

  /* (b) --------------------------------------------------------------- */

  it("pre-approves the same tools in the frontmatter and in settings.json", () => {
    const mcpNames = (entries: string[]) =>
      entries
        .filter((entry) => entry.startsWith("mcp__"))
        .map((entry) => entry.replace(/^mcp__recipes__/, ""))
        .sort();

    const fromFrontmatter = mcpNames(frontmatterTools);
    const fromSettings = mcpNames(settingsAllow);
    const expected = [...EXPECTED_ALLOWED].sort();

    expect(fromFrontmatter).toEqual(expected);
    expect(fromSettings).toEqual(expected);
    /* Every entry really is `mcp__recipes__<tool>`, not a near miss. */
    for (const entry of [...frontmatterTools, ...settingsAllow].filter(
      (entry) => entry.startsWith("mcp__"),
    )) {
      expect(entry).toMatch(/^mcp__recipes__[a-z_]+$/);
      expect(TOOL_NAMES).toContain(entry.replace("mcp__recipes__", ""));
    }

    /* And the non-MCP half of the frontmatter is still what the skill uses. */
    expect(frontmatterTools).toContain("WebSearch");
    expect(frontmatterTools).toContain("Bash(pnpm --silent recipes:*)");
  });

  /* (c) --------------------------------------------------------------- */

  it("names only real tools, and never a held-back one outside its section", () => {
    for (const [file, markdown] of [
      ["SKILL.md", skill],
      ["examples.md", examples],
    ] as const) {
      for (const token of backtickedTokens(markdown)) {
        if (!TOOL_SHAPED.test(token)) continue;
        expect(TOOL_NAMES, `${file}: \`${token}\` is not a tool`).toContain(
          token,
        );
      }
    }

    const heldBackSection = section(skill, "Held back");
    const elsewhere = skill.replace(heldBackSection, "");
    for (const name of HELD_BACK) {
      expect(heldBackSection).toContain(name);
      expect(
        elsewhere,
        `SKILL.md names ${name} outside "Held back"`,
      ).not.toContain(name);
      expect(examples, `examples.md names ${name}`).not.toContain(name);
    }
  });

  /* (d) --------------------------------------------------------------- */

  it("keeps the CLI in the fallback section only", () => {
    /*
     * The frontmatter's `Bash(pnpm --silent recipes:*)` is the permission that
     * makes the fallback possible, so the audit starts after it — what it is
     * looking for is a *command line* in the body outside the fallback.
     */
    const body = skill.slice(skill.indexOf("\n---", 3) + 4);
    const fallback = section(body, "Fallback (CLI)");
    expect(fallback).toContain("pnpm --silent recipes");

    for (const line of body.replace(fallback, "").split("\n")) {
      expect(line, "a CLI command line outside Fallback (CLI)").not.toContain(
        "pnpm --silent recipes",
      );
    }
  });
});
