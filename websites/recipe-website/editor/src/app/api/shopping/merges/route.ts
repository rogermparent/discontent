/**
 * `/api/shopping/merges` — "same thing, different names" on the shared
 * shopping list (epic 49, 49a, Da7). Signed-in or token-scoped like
 * `/api/shopping`, whose `GET` answers the open `proposals` and the stored
 * `merges` beside the list.
 *
 * - `POST` answers a proposal, or changes a merge already made:
 *   `{id | keys, status: "merged" | "apart", name?, amount?, note?}` — one
 *   commit.
 * - `DELETE ?id=<id>` splits: deletes that decision — one commit, none when
 *   it is not stored.
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
  decideShoppingMerge,
  splitShoppingMerge,
} from "recipe-editor/controller/curation/shopping";

export async function POST(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const body = await readJsonBody(request);
    return Response.json(await decideShoppingMerge(ctx, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireShoppingContext(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    return Response.json(await splitShoppingMerge(ctx, { id }));
  } catch (error) {
    return errorResponse(error);
  }
}
