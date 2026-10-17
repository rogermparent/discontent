import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { exportStaleness } from "recipe-editor/controller/exportStamp";

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{new Date(iso).toLocaleString()}</time>;
}

/**
 * How far the static export is behind the content (epic 39, D6): counted
 * from the commit the last finished Build read. Nothing exports by itself
 * (28-D8); this only says when it might be time to.
 */
export async function ExportStaleness() {
  const staleness = await exportStaleness(getContentDirectory());
  if (!staleness) return null;
  return (
    <p className="p-2 text-sm" data-testid="export-staleness">
      {staleness.state === "never" ? (
        "No export recorded yet: the next Build that finishes is."
      ) : staleness.state === "current" ? (
        <>
          Up to date: the last export (<When iso={staleness.at} />) was built
          from the current commit.
        </>
      ) : staleness.state === "behind" ? (
        <>
          {staleness.commits} commit{staleness.commits === 1 ? "" : "s"} since
          the last export (<When iso={staleness.at} />
          ).
        </>
      ) : (
        <>
          The last export (<When iso={staleness.at} />) was built from a commit
          this history no longer has.
        </>
      )}
    </p>
  );
}
