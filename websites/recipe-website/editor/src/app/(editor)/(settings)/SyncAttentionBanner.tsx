import Link from "next/link";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import { readSyncState } from "@discontent/cms/git/syncState";
import {
  getWorkstationName,
  isMirror,
} from "recipe-website-common/config/role";
import { readSettings } from "@/settings";
import {
  attentionKey,
  attentionText,
} from "../../../../controller/instance/notify";
import { workstationConfig } from "../../../../controller/instance/pinger";
import { readStanding } from "../../../../controller/instance/standing";

/** A time as the page shows it: in a `<time>`, which the visual specs mask. */
function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{new Date(iso).toLocaleString()}</time>;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Epic 39, D4: a mirror's view of a conflict the workstation hit — told in a
 * sync answer to this mirror's ping or pushed by the workstation after its
 * own sync (`standing.ts`). Gone once the workstation says it is clear.
 */
async function MirrorConflictBanner({
  contentDirectory,
}: {
  contentDirectory: string;
}) {
  const standing = await readStanding(contentDirectory);
  const conflict = standing?.conflict;
  if (!conflict) return null;
  const name = getWorkstationName();
  const workstationUrl = workstationConfig()?.url;
  return (
    <div
      role="status"
      data-testid="workstation-conflict-banner"
      className="my-4 rounded-md border border-warning bg-warning/10 p-4"
    >
      <p className="font-bold text-warning">
        {capitalized(name)} hit a conflict at <When iso={conflict.since} />.
      </p>
      <p className="text-sm">
        Your edits here are safe; resolve it on {name}. This editor keeps saving
        and committing, and {name} merges its commits on the next sync after the
        conflict is resolved.
      </p>
      {conflict.job && workstationUrl && (
        <a
          href={`${workstationUrl}/jobs/${conflict.job}`}
          className="text-sm underline"
        >
          The sync&apos;s steps on {name}
        </a>
      )}
    </div>
  );
}

/**
 * "Sync with <mirror> needs you" (epic 28, D5) on the workstation's `/git`
 * and Maintenance: a conflict, a mirror with uncommitted changes, or three
 * failures in a row — the same states that raise a desktop notification.
 * A conflict says since when and links the sync job that hit it (39d). On a
 * mirror, the workstation's conflict instead (39d, D4). Renders nothing
 * outside a repository, or when all is well.
 */
export async function SyncAttentionBanner() {
  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  if (isMirror()) {
    return <MirrorConflictBanner contentDirectory={contentDirectory} />;
  }
  const [settings, state] = await Promise.all([
    readSettings(),
    readSyncState(contentDirectory),
  ]);
  const needing = (settings.mirrors ?? [])
    .map((name) => state[name])
    .filter((entry) => entry && attentionKey(entry));
  if (needing.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="sync-attention-banner"
      className="my-4 rounded-md border border-warning bg-warning/10 p-4"
    >
      {needing.map((entry) => {
        const { title, body } = attentionText(entry);
        return (
          <div key={entry.remote} className="my-1">
            <p className="font-bold text-warning">{title}</p>
            <p className="text-sm">
              {entry.conflictSince && (
                <>
                  Since <When iso={entry.conflictSince} />.{" "}
                </>
              )}
              {body}
            </p>
            {entry.conflictSince && entry.conflictJob && (
              <Link
                href={`/jobs/${entry.conflictJob}`}
                className="text-sm underline"
              >
                The sync that hit it
              </Link>
            )}
          </div>
        );
      })}
      <Link href="/git" className="text-sm underline">
        Content Sync
      </Link>
    </div>
  );
}
