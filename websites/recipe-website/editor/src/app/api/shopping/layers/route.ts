/**
 * `/api/shopping/layers` — this list's changes (epic 50, 50a): each a layer
 * of ops over the list's rows, tied to item ids. Signed-in or token-scoped
 * like `/api/shopping`, whose `GET` also answers `layers` beside the
 * composed view.
 *
 * - `GET` → `{layers: [{layer, ops, text, stale}]}`, in the order they
 *   apply; a stale one names no item still on the list.
 * - `POST` adds one: `{ops, reason?, note?, by?, on?, from?}` — one commit.
 * - `PATCH` `{id, on}` turns one off (undo) or on — one commit.
 * - `DELETE ?id=<id>` removes one — one commit, none when it is not stored.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/shopping`,
 * answer through `errorResponse`.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  addShoppingLayer,
  readShopping,
  removeShoppingLayer,
  setShoppingLayer,
} from "recipe-editor/controller/curation/shopping";
import { listLayers } from "recipe-website-common/util/shoppingChanges";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const { layers, items } = await readShopping(ctx);
    return Response.json({ layers: listLayers(layers, items) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await addShoppingLayer(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await setShoppingLayer(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    return Response.json(await removeShoppingLayer(ctx, { id }));
  } catch (error) {
    return errorResponse(error);
  }
}
