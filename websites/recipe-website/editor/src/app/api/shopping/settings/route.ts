/**
 * `/api/shopping/settings` — the shopping list's switches, stores and routes
 * (epic 35, D2/D8). Signed-in or token-scoped like `/api/shopping`: `GET`
 * reads (`{settings, path}`), `PATCH` merges a change in (one commit).
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  getShoppingSettings,
  updateShoppingSettings,
} from "recipe-editor/controller/curation/shopping";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    return Response.json(await getShoppingSettings(ctx));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await updateShoppingSettings(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}
