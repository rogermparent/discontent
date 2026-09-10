import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { revalidatePath } from "next/cache";
import { portfolioContentTypes } from "../../../../../../controller/contentTypes";

/**
 * Test-only cache invalidation, and the fingerprint global-setup uses to prove
 * the server on the test port really is this app.
 *
 * Unauthenticated *by design* — the Playwright fixtures mutate content on disk
 * behind Next's back and must be able to flush the cache before a request is
 * signed in. `TEST_MODE` is the gate: outside it this 404s.
 */
export async function GET() {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }

  revalidatePath("/", "layout");

  /*
   * Expired nothing when it was added, and that was the point (F21b).
   *
   * This route was *correct* before the call was added, but only because
   * portfolio declared no pagination index and no aggregate, so there was no
   * tagged read for a fixture rollback to leave stale. Correct-by-accident is
   * exactly what §11.2's adoption would have broken, and F29 is that adoption:
   * `projects` now declares an index, so without this a rollback would start
   * serving the previous fixture's pages and the failure would read as a
   * flake. It needed no edit to keep up, which is the reason it was written
   * from the registry rather than from what existed at the time.
   */
  revalidateDerivedState(portfolioContentTypes);

  return Response.json({ revalidated: true }, { status: 200 });
}
