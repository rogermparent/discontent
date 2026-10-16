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
 *
 * Also while the indexes were built by other code (epic 39, D1: the index
 * version moved). The editor rebuilds those by itself at start, so the
 * banner is seen only if that rebuild failed or has not finished.
 */
export async function IndexStaleBanner() {
  const { stale, indexedHead, head, versionStale, indexedVersion, version } =
    await getIndexFreshness();
  if (!stale && !versionStale) return null;
  if (!stale) {
    return (
      <div
        role="status"
        data-testid="index-stale-banner"
        className="my-4 rounded-md border border-warning bg-warning/10 p-4"
      >
        <p className="font-bold text-warning">
          The indexes were built by an older version of the editor
        </p>
        <p className="text-sm my-2">
          {indexedVersion
            ? `They were built under index version ${indexedVersion}; this editor reads ${version}. `
            : "They predate the index version stamp. "}
          The editor rebuilds them by itself when it starts; if this stays,
          rebuild them here.
        </p>
        <form action={rebuildIndexesAction}>
          <SubmitButton size="sm">Rebuild indexes</SubmitButton>
        </form>
      </div>
    );
  }
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
