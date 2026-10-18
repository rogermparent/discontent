import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  holdContentWrites,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";

export const dynamic = "force-dynamic";

/**
 * Stop this server writing into the content directory, once the writes in
 * flight have finished. For the Playwright harness only: `resetData` calls
 * it before replacing `test-content`, and `reset-cache` releases it (41b,
 * 40-Tf5). The previous test's late writes used to land under the reset —
 * `ENOTEMPTY`, `EEXIST`, or a stale file in the next test's corpus. A hold
 * whose release never comes ends by itself after 30 s.
 */
export async function POST() {
  try {
    await holdContentWrites(getContentDirectory());
  } catch (error) {
    if (!(error instanceof WritesStillRunningError)) throw error;
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json({ ok: true });
}
