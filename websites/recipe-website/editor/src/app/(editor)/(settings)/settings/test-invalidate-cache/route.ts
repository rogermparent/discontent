import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { revalidatePath } from "next/cache";
import { recipeContentTypes } from "../../../../../../controller/contentTypes";

export async function GET() {
  // Only allow in test environment
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }

  revalidatePath("/", "layout");

  /*
   * `revalidatePath` does not touch `unstable_cache` tags, and the derived
   * reads are cached entirely by tag. Rolling the content directory back to a
   * fixture fires no write path and therefore no tags, so without this a page
   * cached by one test is served to the next one — the suite would be
   * order-dependent in a way that only shows up when tests are resharded.
   *
   * Derived from the registry rather than enumerated (F21b). This listed five
   * cached *reads* by hand — both keyspaces, both tag aggregates, and the
   * recipe item catch-all — which is the wrong thing to enumerate: a read is a
   * consequence of what a content config declares, and the config is where
   * that already lives. The fired set is a superset of those five; it also
   * covers featured-recipe and page items, where it is a no-op today.
   */
  revalidateDerivedState(recipeContentTypes);

  return Response.json({ revalidated: true }, { status: 200 });
}
