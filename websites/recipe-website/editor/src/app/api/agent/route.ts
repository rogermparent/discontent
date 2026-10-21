/**
 * `POST /api/agent` `{prompt, runId?, maxTurns?}` — start a run of the
 * editor's agent, or follow up on one (epic 44, 44c).
 *
 * A run is an `agent` job (E2): the configured model with the curator's
 * tools, in this editor's process. Answers 202 at once with `{job, status:
 * "running", continues?}`; `GET /api/agent/<job>` follows it (its steps and
 * its conversation), and `POST /api/jobs/<job>/cancel` stops it.
 *
 * `runId` continues that run: its transcript is the history, and the new
 * run's transcript holds the whole conversation. A run still live — or one
 * a live follow-up already continues — is `job_live` (409), naming the live
 * one; a job that is not an agent run, or one with no transcript, is
 * `usage` (400); an unknown id 404.
 *
 * - **Auth (E5):** a signed-in session or a **write**-scope token; a read
 *   token is 403 (a run writes), a guest 401.
 * - **No model configured** (neither `RECIPE_LLM_URL` nor the Claude API):
 *   `usage`, 400.
 * - **An ask over `AGENT_PROMPT_MAX` (4,000) characters** is 413 with code
 *   `validation`; an empty one, or a body with other keys, 400.
 *
 * **The run outlives the answer** (37c review, T26): its outcome goes to
 * `after()`, so the revalidation its writes queue runs when it ends.
 */
import { after } from "next/server";
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  ValidationError,
  toErrorObject,
} from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { AGENT_PROMPT_MAX } from "recipe-editor/controller/agent/job";
import { DEFAULT_AGENT_BUDGETS } from "recipe-editor/controller/agent/loop";
import { startAgentRun } from "recipe-editor/controller/agent/runs";

const AgentRequestSchema = z.strictObject({
  prompt: z.string(),
  runId: z.string().trim().min(1).optional(),
  maxTurns: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_AGENT_BUDGETS.maxTurns)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = parseInput(AgentRequestSchema, await readJsonBody(request));
    if (body.prompt.length > AGENT_PROMPT_MAX) {
      return Response.json(
        toErrorObject(
          new ValidationError(
            `The ask is ${body.prompt.length} characters, over the ${AGENT_PROMPT_MAX}-character cap.`,
          ),
        ),
        { status: 413 },
      );
    }
    const { done: _done, ...started } = await startAgentRun(ctx, body, {
      /* The run records its own failure: nothing to rethrow here. */
      background: (done) =>
        after(() =>
          done.then(
            () => undefined,
            () => undefined,
          ),
        ),
    });
    void _done;
    return Response.json(started, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
