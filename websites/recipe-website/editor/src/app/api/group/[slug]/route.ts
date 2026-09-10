/**
 * `/api/group/<slug>` — one group, read, re-ordered or removed.
 *
 * The GET returns `getGroup`'s envelope with **resolved** items: each carries
 * the recipe's name, or `missing: true` when the slug resolves to nothing. That
 * is the read the curator needs to fix a plan it broke, and it is the same
 * thing `/group/<slug>` renders as "Recipe not found".
 *
 * PUT replaces the whole item list (`setItems`), which is why it takes
 * `{items}` and not a partial group: renaming or re-describing a group stays a
 * browser-form job in v1.
 */
import {
  readContext,
  requireCurationContext,
} from "recipe-editor/controller/apiContext";
import {
  boolParam,
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import {
  deleteGroup,
  getGroup,
  setItems,
} from "recipe-editor/controller/curation/groups";
import { ValidationError } from "recipe-editor/controller/curation/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    return Response.json(await getGroup(readContext(), slug));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const ctx = await requireCurationContext(request);
    const body = await readJsonBody(request);
    /*
     * A bare array is accepted as well as `{items: […]}`. The CLI's
     * `set-items --file` takes a file that *is* the array, and making the two
     * disagree would be a trap for anyone moving a file from one to the other.
     */
    const items = Array.isArray(body)
      ? body
      : (body as { items?: unknown })?.items;
    if (items === undefined) {
      throw new ValidationError("Expected an `items` array");
    }
    return Response.json(
      await setItems(ctx, slug, items, { force: boolParam(url, "force") }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const ctx = await requireCurationContext(request);
    return Response.json(await deleteGroup(ctx, slug));
  } catch (error) {
    return errorResponse(error);
  }
}
