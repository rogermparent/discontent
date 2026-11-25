/**
 * `/api/shopping/rules` — the rules for every shopping list (epic 50, 50a):
 * leave a name off (`{name, leaveOff: true, reason?}`), or bring one back
 * (`leaveOff: false` — Restore, built-in water included). One commit, none
 * when nothing changes. `GET /api/shopping` answers the stored `rules`.
 *
 * 50c: `PATCH {kind: "rule" | "merge", id, on}` switches a rule (or a 49a
 * merge decision) off or on, keeping its file; `DELETE {kind: "rule", id}
 * | {kind: "aisle", key}` removes a rule, or an aisle by name. The rules
 * are every list's; `?list=` (50d) only picks whose `layers` the answer
 * carries back.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/shopping`,
 * answer through `errorResponse`.
 */
import { requireShoppingContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  removeShoppingRule,
  setShoppingLeaveOff,
  setShoppingRuleOn,
} from "recipe-editor/controller/curation/shopping";

export async function POST(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await setShoppingLeaveOff(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await setShoppingRuleOn(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await removeShoppingRule(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}
