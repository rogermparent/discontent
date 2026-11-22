/**
 * `POST /api/shopping/layers/always {id}` (epic 50, 50c): "Always do this" —
 * one of this list's changes said again as rules for every list, by its
 * lines' names (a merge, a rename, a leave-off, an aisle); the change goes
 * in the same commit. Refused (`validation`) for an amount or a note.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/shopping`,
 * answer through `errorResponse`.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { promoteShoppingLayer } from "recipe-editor/controller/curation/shopping";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await promoteShoppingLayer(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}
