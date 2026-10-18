import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  holdContentWrites,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";

export const dynamic = "force-dynamic";

/**
 * Stop this server writing into the content directory, once the writes in
 * flight have finished. For the Playwright harness only: `resetData` calls
 * it before replacing `test-content`, and `reset-cache?hold=<id>` releases
 * it, `id` being what this answers (41b, 40-Tf5). The previous test's late
 * writes used to land under the reset — `ENOTEMPTY`, `EEXIST`, or a stale
 * file in the next test's corpus. A write that arrives while the hold is in
 * force is refused rather than run against the next fixture. A hold whose
 * release never comes ends by itself after 30 s.
 *
 * Ungated, like `reset-cache`: the demo has no test mode of its own (its
 * `:test` scripts only point `CONTENT_DIRECTORY` at `test-content`), and is
 * never deployed (41b, Db8).
 */
export async function POST() {
  try {
    const hold = await holdContentWrites(getContentDirectory());
    return Response.json({ ok: true, hold });
  } catch (error) {
    if (!(error instanceof WritesStillRunningError)) throw error;
    return Response.json({ error: error.message }, { status: 503 });
  }
}
