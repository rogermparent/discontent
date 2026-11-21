/**
 * `/api/shopping/merges/ask` — the shopping list's "same thing, different
 * names" asked of a model (epic 49, 49b, Db3): `recipes shopping ask` and
 * `shopping find-merges` with `--remote`.
 *
 * - `POST {task: "revise", id | keys, note, claude?, wait?}` asks about one
 *   proposal or merged row with a note; `POST {task: "find", claude?,
 *   wait?}` looks for more. A `shopping-merge` job either way: the answer is
 *   `{job, stored}` at once (202), or — `wait: true` — the job's result
 *   when it ends (`ShoppingAskResult`: a revised proposal, "apart", the
 *   found proposals, or why not).
 * - `GET ?job=<id>` follows one: `{job, status, live, result?, error?}`.
 *
 * Nothing is written: a result's `decision` is what `POST
 * /api/shopping/merges` takes, sent only when the person accepts it.
 * Authenticated with read scope although it writes nothing, as `/edit` is:
 * it runs a model.
 */
import { z } from "zod";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";
import { runSpec, startSpec } from "recipe-editor/controller/jobs/kinds";
import { keepUnstored } from "recipe-editor/controller/jobs/unstored";
import { getJobView } from "recipe-editor/controller/jobs/views";
import { storedShoppingAskSpec } from "recipe-editor/controller/llm/shoppingAsk";
import { SHOPPING_ASK_NOTE_MAX } from "recipe-website-common/util/shoppingAsk";
import { MERGE_LIMITS } from "recipe-website-common/util/shoppingMerges";

const AskBodySchema = z.discriminatedUnion("task", [
  z.strictObject({
    task: z.literal("revise"),
    id: z.string().trim().max(16).optional(),
    keys: z
      .array(z.string().trim().min(1).max(MERGE_LIMITS.key))
      .min(2)
      .max(MERGE_LIMITS.keys)
      .optional(),
    note: z.string().min(1).max(SHOPPING_ASK_NOTE_MAX),
    claude: z.boolean().optional(),
    wait: z.boolean().optional(),
  }),
  z.strictObject({
    task: z.literal("find"),
    claude: z.boolean().optional(),
    wait: z.boolean().optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { wait, ...input } = parseInput(
      AskBodySchema,
      await readJsonBody(request),
    );
    if (
      input.task === "revise" &&
      (input.id === undefined) === (input.keys === undefined)
    ) {
      throw new ValidationError("Name exactly one of `id` or `keys`.");
    }
    const spec = await storedShoppingAskSpec(ctx, input);
    if (wait) return Response.json(await runSpec(spec, { ctx }));
    const { job, stored, done } = await startSpec(spec, { ctx });
    keepUnstored(job, done);
    return Response.json({ job, stored }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const id = new URL(request.url).searchParams.get("job") ?? "";
    if (!id) throw new ValidationError("Say which job: ?job=<id>.");
    const view = await getJobView(id);
    if (view.meta.kind !== "shopping-merge") {
      throw new ValidationError(
        `Job ${view.job} is a ${view.meta.kind} job, not an ask about the shopping list.`,
      );
    }
    const { meta } = view;
    return Response.json(
      {
        job: view.job,
        status: meta.status,
        live: view.live,
        ...(meta.result !== undefined ? { result: meta.result } : {}),
        ...(meta.error ? { error: meta.error } : {}),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
