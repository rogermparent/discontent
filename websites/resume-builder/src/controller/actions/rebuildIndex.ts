"use server";

import { revalidatePath } from "next/cache";
import { resumeContentConfig } from "../resumeContentConfig";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";

export default async function rebuildResumeIndex() {
  await rebuildIndex({ config: resumeContentConfig });
  /*
   * The third of §11.4's three invalidation seats. Like portfolio's, it expires
   * nothing today — resume declares no pagination index and no aggregate, so
   * this is the `item:resume` catch-all and no entry carries it — and the value
   * is that the seat now exists and derives, so declaring an index is the only
   * edit an adoption needs.
   *
   * **`revalidatePath("/")` stays, and it is not the redundancy the recipe seat
   * dropped.** Recipe could drop its path call because every reader on `/` had
   * been given a tag; resume has the opposite shape. `getResumes` calls
   * `readContentIndex` directly, with no `unstable_cache` around it, so the
   * homepage's staleness lives in the Full Route Cache rather than the Data
   * Cache and no tag reaches it. Removing this line would leave the operator
   * pressing "Rebuild" and seeing the old list — the exact failure the button
   * exists to repair. It goes when the reads become tagged, not before.
   */
  revalidateDerivedState([resumeContentConfig]);
  revalidatePath("/");
}
