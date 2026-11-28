// @vitest-environment node
//
// 51d (review finding 1): `POST /api/agent/<id>/review` through the route
// itself, auth for real (the `@/auth` stub, as agentRoute.test.ts). The
// Claude API is `fetch` stubbed — never a real model. Pinned: a decision
// with `remove` is taken (ReviewPanel sends `remove: []` when an untag is
// unticked; the route's strict schema once refused it with a 400), and a
// second decision on the same call is 400 with nothing applied again.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { auth } from "./stub_auth.js";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { startAgentRun } from "../websites/recipe-website/editor/controller/agent/runs";
import { curatorReview } from "../websites/recipe-website/editor/controller/agent/review";

const { POST: reviewRoute } =
  await import("../websites/recipe-website/editor/src/app/api/agent/[id]/review/route");

const EDITOR = "admin@nextmail.com";
const KEY = "sk-ant-test-0000-not-a-real-key-51d-review";

let dir: string;
let contentDirectory: string;

const toolUse = (id: string, name: string, input: unknown) => ({
  type: "tool_use",
  id,
  name,
  input,
});

/** The Claude API answering each turn in order. */
function stubTurns(turns: { content: unknown[]; stop?: string }[]): void {
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const turn = turns[n++];
      if (!turn) throw new Error(`no scripted turn ${n}`);
      return new Response(
        JSON.stringify({
          id: `msg_${n}`,
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: turn.content,
          stop_reason: turn.stop ?? "end_turn",
          usage: { input_tokens: 100, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
}

function review(id: string, body: unknown) {
  return reviewRoute(
    new Request(`http://editor/api/agent/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "review-route-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "review-route-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  vi.stubEnv("RECIPE_LLM_API", "anthropic");
  vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
  vi.stubEnv("RECIPE_LLM_URL", "https://claude.test");
  vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");
  vi.stubEnv("RECIPE_SEARCH_URL", "");
  auth.mockReset();
  auth.mockResolvedValue({ user: { email: EDITOR } });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("POST /api/agent/<id>/review", () => {
  it("takes a decision with remove, and refuses a second decision on the same call", async () => {
    const backend = createLocalBackend({ contentDirectory, inProcess: true });
    await backend.createRecipe({
      name: "Apple Pie",
      ingredients: ["6 apples"],
      instructions: ["Bake."],
      tags: ["Old Tag"],
    });
    await backend.createRecipe({
      name: "Pear Tart",
      ingredients: ["4 pears"],
      instructions: ["Bake."],
      tags: ["Old Tag"],
    });
    stubTurns([
      {
        content: [
          toolUse("toolu_01", "term_assign", {
            slug: "old-tag",
            remove: ["apple-pie", "pear-tart"],
          }),
        ],
        stop: "tool_use",
      },
      { content: [{ type: "text", text: "Untagged both." }] },
    ]);
    const started = await startAgentRun(
      { contentDirectory, author: { name: EDITOR, email: EDITOR } },
      { prompt: "untag the pie and the tart", hold: true },
    );
    await started.done;
    const { calls } = await curatorReview(started.job, {
      dir,
      contentDirectory,
    });
    expect(calls).toHaveLength(1);

    /* The person unticked the tart: `remove` narrows the untag. */
    const saved = await review(started.job, {
      decisions: [
        { call: calls[0].id, apply: true, add: [], remove: ["apple-pie"] },
      ],
    });
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.calls[0].state).toBe("applied");
    expect((await backend.getRecipe("apple-pie")).recipe.tags ?? []).toEqual(
      [],
    );
    /* The tart, unticked, keeps its tag. */
    expect((await backend.getRecipe("pear-tart")).recipe.tags).toHaveLength(1);

    /* A second decision on the same call: 400, nothing applied again. */
    const again = await review(started.job, {
      decisions: [{ call: calls[0].id, apply: true, remove: ["pear-tart"] }],
    });
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe("validation");
    /* The tart, unticked, keeps its tag. */
    expect((await backend.getRecipe("pear-tart")).recipe.tags).toHaveLength(1);
  });

  it("refuses a key the schema doesn't know", async () => {
    const refused = await review("nope", {
      decisions: [{ call: "c1", apply: true, widen: ["x"] }],
    });
    expect(refused.status).toBe(400);
  });
});
