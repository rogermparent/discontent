/**
 * `/api/shopping/rules` — the rules for every shopping list (epic 50, 50a):
 * leave a name off (`{name, leaveOff: true, reason?}`), or bring one back
 * (`leaveOff: false` — Restore, built-in water included). One commit, none
 * when nothing changes. `GET /api/shopping` answers the stored `rules`.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/shopping`,
 * answer through `errorResponse`.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { setShoppingLeaveOff } from "recipe-editor/controller/curation/shopping";

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await setShoppingLeaveOff(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}
