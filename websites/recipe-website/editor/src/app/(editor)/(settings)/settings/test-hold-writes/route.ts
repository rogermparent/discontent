import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import {
  holdContentWrites,
  WritesStillRunningError,
} from "@discontent/cms/fs/writeGate";

/**
 * Stop this server writing into the content directory, once the writes in
 * flight have finished — the Playwright `resetData` fixture's first step
 * (41b, 40-Tf5). The fixture then replaces `test-content` from the test
 * process, and `test-invalidate-cache` releases the hold.
 *
 * Work the previous test started (a server action whose page has closed, a
 * render still writing transformed images) used to land under the reset: the
 * removal failed `ENOTEMPTY`, the copy `EEXIST`, and a late file could carry
 * into the next test's corpus. A hold whose release never comes ends by
 * itself after 30 s (`holdContentWrites`).
 */
export async function GET() {
  if (!process.env.TEST_MODE) {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await holdContentWrites(getContentDirectory());
  } catch (error) {
    if (!(error instanceof WritesStillRunningError)) throw error;
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json({ held: true }, { status: 200 });
}
