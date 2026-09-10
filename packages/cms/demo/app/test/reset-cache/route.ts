import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { demoContentTypes } from "@/lib/contentTypes";

export const dynamic = "force-dynamic";

/**
 * Drop every cached read of every derived kind. For the Playwright harness only.
 *
 * `resetData` rolls the content directory back to a fixture, which is not a
 * write and therefore fires no cache tags — nothing in the running server can
 * know the corpus went backwards. Without this, a page cached during one test
 * would be served to the next one, and the suite's results would depend on the
 * order it ran in.
 *
 * `revalidateTag` rather than `updateTag`: the latter throws outside a Server
 * Action. The `{ expire: 0 }` profile is what makes it immediate instead of
 * stale-while-revalidate. Both now live in the engine helper.
 *
 * Derived from the registry rather than enumerated (F21b). The five tags this
 * listed by hand — both keyspaces, the note tag aggregate, and both item
 * catch-alls — are exactly what the derivation produces for `[noteConfig,
 * bookmarkConfig]`, so this is a pure simplification with no tag added or lost.
 * What it buys is that the third demo content type cannot be forgotten here.
 */
export async function POST() {
  revalidateDerivedState(demoContentTypes);
  return Response.json({ ok: true });
}
