import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  holdContentWrites,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";

export const dynamic = "force-dynamic";

/**
 * Stop this server writing into the content directory, once the writes in
 * flight have finished — the Playwright `resetData` fixture's first step
 * (41b, 40-Tf5). The fixture then replaces `test-content` from the test
 * process, and `test-invalidate-cache?hold=<id>` releases the hold, `id`
 * being what this answers.
 *
 * Work the previous test started (a server action whose page has closed, a
 * render still writing transformed images) used to land under the reset: the
 * removal failed `ENOTEMPTY`, the copy `EEXIST`, and a late file could carry
 * into the next test's corpus. Now the writes in flight finish first, and a
 * write that arrives while the hold is in force is refused rather than run
 * against the next fixture. A hold whose release never comes ends by itself
 * after 30 s (`holdContentWrites`).
 */
export async function GET() {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const hold = await holdContentWrites(getContentDirectory());
    return Response.json({ held: true, hold }, { status: 200 });
  } catch (error) {
    if (!(error instanceof WritesStillRunningError)) throw error;
    return Response.json({ error: error.message }, { status: 503 });
  }
}
