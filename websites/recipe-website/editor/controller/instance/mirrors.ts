/**
 * Which mirrors this workstation syncs, and how to reach each (epic 28, D6).
 *
 * The list is remote names in the workstation's settings (`mirrors`). The
 * ssh host and directory for the mirror-dirty preflight are not configured
 * separately: they are read off the remote's own URL, which already says
 * how this repository reaches the mirror — `uraninite:recipes`,
 * `roger@uraninite:recipes` or `ssh://uraninite/~/recipes`. A local-path
 * remote (tests, a USB disk) gets no preflight; its push answers for it.
 */
import simpleGit from "simple-git";
import type { SyncMirrorTarget } from "../curation/sync";

export interface MirrorTarget extends SyncMirrorTarget {
  remote: string;
  url?: string;
}

/** `host` and `dir` from an ssh-style remote URL, or `{}` for anything else. */
export function sshTargetOf(url: string): SyncMirrorTarget {
  const ssh = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(url);
  if (ssh) {
    const dir = ssh[2].startsWith("~") ? ssh[2] : `/${ssh[2]}`;
    return { sshHost: ssh[1], dir };
  }
  /* scp-like `[user@]host:path`, but not a Windows drive or a URL scheme. */
  const scp = /^(?:[^@/:]+@)?([^/:]{2,}):(?!\/\/)(.+)$/.exec(url);
  if (scp) return { sshHost: scp[1], dir: scp[2] };
  return {};
}

export async function mirrorTargets(
  contentDirectory: string,
  names: readonly string[] | undefined,
): Promise<MirrorTarget[]> {
  if (!names || names.length === 0) return [];
  const remotes = await simpleGit({ baseDir: contentDirectory }).getRemotes(
    true,
  );
  const targets: MirrorTarget[] = [];
  for (const name of names) {
    const remote = remotes.find((entry) => entry.name === name);
    if (!remote) continue;
    const url = remote.refs.push || remote.refs.fetch;
    targets.push({ remote: name, url, ...sshTargetOf(url) });
  }
  return targets;
}
