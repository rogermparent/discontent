import { readPaginationMeta } from "@discontent/cms/pagination/readPaginationMeta";
import { recipesByDate } from "recipe-website-common/controller/paginationConfigs";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";

export const dynamic = "force-dynamic";

/**
 * The marker the client's cached search index is keyed on.
 *
 * It used to be `data.mdb`'s mtime and size, a proxy that lied in both
 * directions: it moved when nothing semantic did — re-copying the corpus
 * rewrites both — and it stayed put when the index's *shape* changed, which is
 * how `3cec4e17` shipped a stale index claiming to be current. It was also one
 * of the two causes F7 measured for an export build not reproducing against
 * itself.
 *
 * `readPaginationMeta().version` is `versionOf(meta)` —
 * `specHash.slice(0, 16):updatedAt` — so it moves exactly when the index's
 * declared shape changes or the corpus is written, and not otherwise. That it
 * is a function of the declared `version` rather than of `fn.toString()` is
 * what F16 had to land first: a spec hash that differed between builds would
 * have made the export's baked-in string change on every build, which is worse
 * than the mtime proxy it replaces.
 */
export async function GET() {
  try {
    // Already "" when there is no meta record, which is exactly the fallback
    // the `stat` version hand-rolled for ENOENT.
    const { version } = await readPaginationMeta({
      config: recipeContentConfig,
      paginationConfig: recipesByDate,
    });
    return Response.json(
      { version },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Index unreadable for any reason: there is no version to report. Returning
    // a Response regardless is the point — falling through without one, as this
    // handler used to on the non-ENOENT path, makes the client's `res.json()`
    // throw and takes the whole search UI into its error state.
    return Response.json(
      { version: "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
