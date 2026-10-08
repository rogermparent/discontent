/**
 * `POST /api/internal/refresh` — the editor's own background work asking it
 * to expire rendered pages and derived tags (epic 28; see
 * `controller/instance/refresh.ts`). Only callable with this process's
 * in-memory secret, which never leaves it; anyone else gets a 404.
 */
import { timingSafeEqual } from "crypto";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { revalidatePath } from "next/cache";
import { recipeContentTypes } from "recipe-editor/controller/contentTypes";
import { existingInternalSecret } from "recipe-editor/controller/instance/refresh";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = existingInternalSecret();
  const given = request.headers.get("x-discontent-internal") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  revalidatePath("/", "layout");
  revalidateDerivedState(recipeContentTypes);
  return Response.json({ refreshed: true });
}
