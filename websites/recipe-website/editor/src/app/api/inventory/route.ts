/**
 * `/api/inventory` — the editor's shared list of what's on hand (25d).
 *
 * **Every verb authenticates, GET included.** Unlike `/api/recipes` or
 * `/api/tags`, this is not public content: the list lives only in the content
 * repository, the static export never reads it (D10), and an anonymous GET
 * here would be the one route that published it. `PATCH` takes an
 * `{add, remove}` diff; `PUT` replaces the list with `{items}`.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/inventory`,
 * answer through `errorResponse`. No `onWrite` follows a write — the file is
 * no content type, and the signed-in `/make` reads it per request.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  patchInventory,
  readInventory,
  setInventory,
} from "recipe-editor/controller/curation/inventory";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    return Response.json(await readInventory(ctx));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await patchInventory(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    return Response.json(await setInventory(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}
