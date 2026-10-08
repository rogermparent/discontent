import Link from "next/link";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import { readSyncState } from "@discontent/cms/git/syncState";
import { isMirror } from "recipe-website-common/config/role";
import { readSettings } from "@/settings";
import {
  attentionKey,
  attentionText,
} from "../../../../controller/instance/notify";

/**
 * "Sync with <mirror> needs you" (epic 28, D5) on the workstation's `/git`
 * and Maintenance: a conflict, a mirror with uncommitted changes, or three
 * failures in a row — the same states that raise a desktop notification.
 * Renders nothing on a mirror, outside a repository, or when all is well.
 */
export async function SyncAttentionBanner() {
  if (isMirror()) return null;
  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
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
            <p className="text-sm">{body}</p>
          </div>
        );
      })}
      <Link href="/git" className="text-sm underline">
        Content Sync
      </Link>
    </div>
  );
}
