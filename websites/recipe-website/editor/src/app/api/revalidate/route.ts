/**
 * `POST /api/revalidate` — "the content directory moved under you; drop
 * everything".
 *
 * The auth-gated twin of `settings/test-invalidate-cache` (fact 8), which is
 * TEST_MODE-only and fingerprinted by Playwright's `global-setup.ts` — that one
 * stays exactly as it is. This is what the CLI's `--notify` posts after a local
 * write, and it is the answer to the stale-editor hint 22c had to print
 * instead: a write that happened *outside* this process fires no tags here, so
 * nothing else can tell the server its caches are wrong.
 *
 * Nothing is rebuilt. The index on disk is already whatever the writer left; if
 * it is *not* — a hand-edited data file, a branch checkout — `POST /api/reindex`
 * is the seat that rebuilds and then invalidates.
 */
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { revalidatePath } from "next/cache";
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import { recipeContentTypes } from "recipe-editor/controller/contentTypes";
import { errorResponse } from "recipe-editor/controller/curation/http";

export async function POST(request: Request) {
  try {
    /* Authentication only — the context itself is unused; nothing is written. */
    await requireCurationContext(request);
    revalidatePath("/", "layout");
    revalidateDerivedState(recipeContentTypes);
    return Response.json({ revalidated: true });
  } catch (error) {
    return errorResponse(error);
  }
}
