/**
 * `GET /api/agent/summary` — what ⌘K says of the curator (48b): how many
 * conversations have held writes waiting for review (and the newest one's
 * ask), and who answers an ask by default with what its recent runs cost —
 * the hand-off row's words. `{review: {runs, calls, first?}, model, api,
 * search, costRange?}`; 404 with no model set up. Curation auth, read scope.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { errorResponse } from "recipe-editor/controller/curation/http";
import { NotFoundError } from "recipe-editor/controller/curation/errors";
import { curatorPaletteSummary } from "recipe-editor/controller/agent/curator";

export async function GET(request: Request) {
  try {
    await requireCurationContext(request, { need: "read" });
    const summary = await curatorPaletteSummary();
    if (!summary)
      throw new NotFoundError("No model is set up for the curator.");
    return Response.json(summary, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
