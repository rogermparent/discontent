/**
 * `/api/shopping/lists` — the saved shopping lists (epic 50, 50d). The
 * main list is always there (`main: true`); every other list is a record
 * beside its own items, changes and tidy runs. Every other shopping route
 * takes `?list=<id>` (the main list without one).
 *
 * - `GET` → `{lists}`: the main list first, then the saved ones newest
 *   first, each `{id, name, main?, created?, plan?, planName?, archived?,
 *   items, left}`; `?all=1` includes deleted ones.
 * - `POST {name}` makes a blank list; `{plan, name?, scale?}` one from a
 *   meal plan, holding its recipes — one commit.
 * - `PATCH {id, name?, archived?}` renames, deletes (`archived: true`) or
 *   restores one — one commit.
 * - `DELETE ?id=<id>` deletes one: archived, its files kept.
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
  createShoppingList,
  deleteShoppingList,
  editShoppingList,
  readShoppingLists,
} from "recipe-editor/controller/curation/shopping";

export async function GET(request: Request) {
  try {
    const ctx = await requireCurationContext(request, { need: "read" });
    const all = ["1", "true"].includes(
      new URL(request.url).searchParams.get("all") ?? "",
    );
    return Response.json({ lists: await readShoppingLists(ctx, { all }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    return Response.json(
      await createShoppingList(ctx, await readJsonBody(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    return Response.json(
      await editShoppingList(ctx, await readJsonBody(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    return Response.json(await deleteShoppingList(ctx, { id }));
  } catch (error) {
    return errorResponse(error);
  }
}
