import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  getIndexFreshness,
  rebuildIndexesAction,
} from "../../../../controller/actions/sync";

/**
 * "Content changed outside the editor — Rebuild indexes" (27b/D3).
 *
 * Shown on `/git` and Settings → Maintenance while HEAD differs from the commit
 * the indexes were last fully rebuilt from: a push landed on this repository
 * (the Pi's `updateInstead`), someone pulled or checked out from a shell, or no
 * rebuild has been recorded yet. The editor's own writes never trigger it —
 * each one carries the stamp forward. Renders nothing when the indexes are
 * current or the content directory is not a repository.
 */
export async function IndexStaleBanner() {
  const { stale, indexedHead, head } = await getIndexFreshness();
  if (!stale) return null;
  return (
    <div
      role="status"
      data-testid="index-stale-banner"
      className="my-4 rounded-md border border-warning bg-warning/10 p-4"
    >
      <p className="font-bold text-warning">
        {indexedHead
          ? "Content changed outside the editor"
          : "No index rebuild has been recorded for this content yet"}
      </p>
      <p className="text-sm my-2">
        {indexedHead
          ? `The indexes were built from ${indexedHead.slice(0, 7)}, but the content is now at ${head?.slice(0, 7)}. Listings, tags, groups and search may be out of date until the indexes are rebuilt.`
          : "Rebuild once so the editor can tell when content changes behind its back."}
      </p>
      <form action={rebuildIndexesAction}>
        <SubmitButton size="sm">Rebuild indexes</SubmitButton>
      </form>
    </div>
  );
}
