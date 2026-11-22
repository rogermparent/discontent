/**
 * `/api/shopping/tidy` — "Tidy with the model" (epic 50, 50b): `recipes
 * shopping tidy --remote`, and the page.
 *
 * - `POST {model?, on?, wait?}` starts a `shopping-tidy` job over the list
 *   (`on`: `current`, the default, or `original`): `{job, stored}` at once
 *   (202), or — `wait: true` — the job's result (`ShoppingTidyResult`: the
 *   run as kept, or why not). The run is written (one commit); nothing on
 *   the list changes until a suggestion is accepted.
 * - `GET ?job=<id>` follows one: `{job, status, live, result?, error?}`.
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
import { storedTidySpec } from "recipe-editor/controller/llm/shoppingTidy";

const TidyBodySchema = z.strictObject({
  model: z.string().trim().min(1).max(80).optional(),
  on: z.enum(["current", "original"]).optional(),
  dryRun: z.boolean().optional(),
  wait: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const { wait, ...input } = parseInput(
      TidyBodySchema,
      await readJsonBody(request),
    );
    const spec = await storedTidySpec(ctx, input);
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
    if (view.meta.kind !== "shopping-tidy") {
      throw new ValidationError(
        `Job ${view.job} is a ${view.meta.kind} job, not a tidy of the shopping list.`,
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
