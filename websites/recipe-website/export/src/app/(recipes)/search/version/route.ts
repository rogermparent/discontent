import { readPaginationMeta } from "@discontent/cms/pagination/readPaginationMeta";
import { recipesByDate } from "recipe-website-common/controller/paginationConfigs";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";

// Editor's version route is `force-dynamic` (re-reads the meta per request);
// that directive is illegal under `output: "export"`. `force-static` is the
// required opt-in for a parameterless route handler in a static export: the
// meta read runs at build time and the version string is baked into the static
// output — it only changes on a rebuild, which is exactly right for a static
// reader site (the client's IndexedDB-cached index re-populates whenever this
// string changes).
export const dynamic = "force-static";

/**
 * The same marker the editor's route serves, and the reasoning is in that file.
 *
 * What is specific to the export: because the string is baked in, it must be a
 * function of the content and the declared config alone. `data.mdb`'s mtime and
 * size were neither — re-copying the corpus moved them — which is why this file
 * was one of the 103 that F7 measured differing between two export builds of
 * the same commit. `versionOf(meta)` is stable across builds of one corpus,
 * given F16's build-stable spec hash.
 */
export async function GET() {
  try {
    // Already "" when there is no meta record, which is exactly the fallback
    // the `stat` version hand-rolled for ENOENT.
    const { version } = await readPaginationMeta({
      config: recipeContentConfig,
      paginationConfig: recipesByDate,
    });
    return Response.json({ version });
  } catch {
    // Index unreadable at build time for any reason — no corpus, empty version.
    // Returning here on *every* failure matters: falling through without a
    // Response left the baked-in route body undefined, which the client's
    // `res.json()` turns into a hard search error.
    return Response.json({ version: "" });
  }
}
