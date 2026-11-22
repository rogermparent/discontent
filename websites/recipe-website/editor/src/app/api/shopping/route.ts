/**
 * `/api/shopping` — the editor's shared shopping list (epic 35, D8).
 *
 * **Every verb authenticates, GET included**, as `/api/inventory` does: the
 * list lives only in the content repository, the static export never reads
 * it, and an anonymous GET here would be the one route that published it.
 *
 * - `GET` → `{items, settings, merges, layers, rules, view, text,
 *   proposals, path}`; `?format=text` answers the copy text alone as
 *   `text/plain`; `?store=<id>` narrows to one store. 49a's `merges` are
 *   the stored decisions, `proposals` the open "same thing, different
 *   names" ones (answered at `/api/shopping/merges`). 50a: the view is
 *   composed — merges, leave-off rules and this list's `layers` (changed at
 *   `/api/shopping/layers`) — with `view.leftOff`; `?as-written=1` answers
 *   the base rows instead.
 * - `POST` adds `{recipe, scale?} | {group, scale?} | {items}`.
 * - `PATCH` ticks, flags, moves or removes items (`patchShopping`'s body).
 * - `DELETE ?scope=checked|all` clears (checked by default).
 * - 50d: `?list=<id>` (or a body's `list`) names the list — `main`, a
 *   saved list's id or its name (`/api/shopping/lists`); the main list
 *   without one. `GET` answers `list` {id, name, main?, plan?}.
 *
 * Thin, per T17: authenticate, parse, call `controller/curation/shopping`,
 * answer through `errorResponse`. No `onWrite` follows a write — the list is
 * no content type, and the signed-in `/shopping` reads it per request.
 */
import { requireShoppingContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  addToShopping,
  clearShopping,
  patchShopping,
  readShoppingView,
} from "recipe-editor/controller/curation/shopping";

export async function GET(request: Request) {
  try {
    const ctx = await requireShoppingContext(request, { need: "read" });
    const url = new URL(request.url);
    const store = url.searchParams.get("store") || undefined;
    const asWritten = ["1", "true"].includes(
      url.searchParams.get("as-written") ?? "",
    );
    const result = await readShoppingView(ctx, { store, asWritten });
    if (url.searchParams.get("format") === "text") {
      return new Response(`${result.text}\n`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await addToShopping(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await patchShopping(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const scope = new URL(request.url).searchParams.get("scope") ?? undefined;
    return Response.json(
      await clearShopping(ctx, scope === undefined ? {} : { scope }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
