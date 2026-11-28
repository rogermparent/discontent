/**
 * `POST /api/agent` `{prompt, runId?, maxTurns?, newerWebTools?, hold?,
 * model?}` — start a run of the editor's agent, or follow up on one (epic
 * 44, 44c). **`hold`** (48b, Db9) holds the run's writes for the person's
 * review on the curator page (`/api/agent/<id>/review` applies them); it
 * defaults to **true** here, and `recipes agent --remote` sends false.
 * **`model`** (48b, Db5) picks `claude` or `local` where the editor has
 * both — or `import` (51d, Dd2), the import model, where the curator has a
 * local model of its own; a follow-up keeps its conversation's. **`intent`** (51b, D1) is
 * `online`, `mine`, `plan`, `organize`, `any` or `auto` (a guess): the
 * first three run as plans in code, the answer carries the intent as it
 * stands (`intent`, or `intentPending` when the model will classify it);
 * unset is the open loop, as before. A follow-up takes `any` or `auto`.
 * `newerWebTools: true` (46d) gives a Claude run the newer server web tools
 * (dynamic filtering) on a model that takes them (`takesNewerWebTools`); a
 * follow-up of such a run keeps them, and any other model — a Haiku, a
 * local one — ignores the flag (its job log says so).
 *
 * A run is an `agent` job (E2): the configured model with the curator's
 * tools, in this editor's process. Answers 202 at once with `{job, status:
 * "running", continues?}`; `GET /api/agent/<job>` follows it (its steps and
 * its conversation), and `POST /api/jobs/<job>/cancel` stops it.
 *
 * `runId` continues that run: its transcript is the history, and the new
 * run's transcript holds the whole conversation. A run still live — or one
 * a live follow-up already continues — is `job_live` (409), naming the live
 * one; a job that is not an agent run, one with no transcript, or one
 * recorded against another content directory is `usage` (400); an unknown
 * id 404. A conversation whose transcript is over
 * `AGENT_TRANSCRIPT_MAX_BYTES` (2 MB) is 413 `validation`: start a new one.
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
import {
  AGENT_PROMPT_MAX,
  CURATOR_MODEL_IDS,
} from "recipe-editor/controller/agent/job";
import { DEFAULT_AGENT_BUDGETS } from "recipe-editor/controller/agent/loop";
import {
  ConversationTooLongError,
  startAgentRun,
} from "recipe-editor/controller/agent/runs";
import { listCuratorRuns } from "recipe-editor/controller/agent/curator";
import { AGENT_INTENT_CHOICES } from "recipe-editor/controller/agent/intents/guess";

const AgentRequestSchema = z.strictObject({
  prompt: z.string(),
  runId: z.string().trim().min(1).optional(),
  maxTurns: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_AGENT_BUDGETS.maxTurns)
    .optional(),
  /* 46d: Claude's newer web tools for this run (a follow-up keeps them). */
  newerWebTools: z.boolean().optional(),
  /* 48b: hold the run's writes for review (the default here, Db9). */
  hold: z.boolean().optional(),
  /* 48b: who answers, where this editor has both (a follow-up keeps its own);
   * 51d (Dd2): `import`, the import model beside the curator's own. */
  model: z.enum(CURATOR_MODEL_IDS).optional(),
  /* 51b (D1): what the ask is for, or `auto` for a guess; unset is the loop. */
  intent: z.enum(AGENT_INTENT_CHOICES).optional(),
});

/**
 * `GET /api/agent?limit=` — the recent conversations, newest first (44d,
 * the curator page's list): each the newest run of a conversation (a run
 * another continues is left out, Ec3), `{id, ask, asks, status,
 * stopReason?, queuedAt, endedAt?, changes}`. `limit` 1–100, default 20.
 * Curation auth, read scope (E5: a read token may read runs).
 */
export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const raw = new URL(request.url).searchParams.get("limit");
    const limit = raw === null || raw === "" ? 20 : Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError(
        `limit is a whole number from 1 to 100 — not "${raw}".`,
      );
    }
    return Response.json(
      { runs: await listCuratorRuns({ limit }) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

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
    /* 48b (Db9): the editor's runs hold their writes for the person's
     * review unless the caller says otherwise (the CLI does). */
    const input = { ...body, hold: body.hold ?? true };
    const { done: _done, ...started } = await startAgentRun(ctx, input, {
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
    if (error instanceof ConversationTooLongError) {
      return Response.json(toErrorObject(error), { status: 413 });
    }
    return errorResponse(error);
  }
}
