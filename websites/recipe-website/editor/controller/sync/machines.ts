/**
 * The two machines Sync & upkeep (48d) puts side by side: this editor and
 * the one it syncs with, read from the repository alone — no fetch, no
 * network. As fresh as the last fetch or sync (`fetchedAt`).
 *
 * **The other side** (`peerOf`): on a mirror, its workstation, through its
 * upstream. On a workstation, its first mirror (epic 28's `settings.mirrors`),
 * else its upstream's remote, else none. Its remote-tracking ref
 * (`<remote>/<branch>`) is what "waiting to send" and "waiting to come" count
 * against, and what a commit is "not sent yet" from.
 */
import simpleGit, { type SimpleGit } from "simple-git";
import type { EditorRole } from "recipe-website-common/config/role";

export interface Peer {
  /** What the page calls it: the remote's name, or the workstation's. */
  name: string;
  /** The remote it is reached through, if any. */
  remote?: string;
  /** Its remote-tracking ref for this branch, e.g. `uraninite/main`. */
  ref?: string;
  /** How it is related: a mirror this workstation syncs, the workstation syncing this mirror, or a plain upstream. */
  relation: "mirror" | "workstation" | "upstream";
}

export interface PeerInput {
  role: EditorRole;
  branch?: string;
  upstream?: string;
  mirrors: string[];
  remotes: string[];
  workstationName: string;
}

export function peerOf(input: PeerInput): Peer | undefined {
  const upstreamRemote = input.upstream?.split("/")[0];
  if (input.role === "mirror") {
    return {
      name: input.workstationName,
      remote: upstreamRemote,
      ref: input.upstream,
      relation: "workstation",
    };
  }
  const mirror = input.mirrors.find((name) => input.remotes.includes(name));
  if (mirror) {
    return {
      name: mirror,
      remote: mirror,
      ref:
        input.upstream?.startsWith(`${mirror}/`) || !input.branch
          ? (input.upstream ?? undefined)
          : `${mirror}/${input.branch}`,
      relation: "mirror",
    };
  }
  if (upstreamRemote && input.upstream) {
    return {
      name: upstreamRemote,
      remote: upstreamRemote,
      ref: input.upstream,
      relation: "upstream",
    };
  }
  return undefined;
}

export interface MachineFacts {
  /** This repository's committer email (`git var GIT_COMMITTER_IDENT`). */
  localEmail?: string;
  /** Whether the peer's ref exists here. */
  peerRefKnown: boolean;
  ahead: number;
  behind: number;
  /** Commits on HEAD the peer's ref lacks (at most a few hundred). */
  unsent: Set<string>;
  /** Committer email by commit hash, for the history's page. */
  committers: Map<string, string>;
  /** The newest commit on the peer's ref, if any. */
  peerHead?: { hash: string; date: string; message: string };
}

async function quiet<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
  const out = await quiet(() =>
    git.raw(["rev-parse", "--verify", "--quiet", `refs/remotes/${ref}`]),
  );
  return Boolean(out && String(out).trim());
}

export async function readMachineFacts(
  contentDirectory: string,
  peer: Peer | undefined,
  hashes: string[],
): Promise<MachineFacts> {
  const git = simpleGit({ baseDir: contentDirectory });
  const ident = await quiet(() => git.raw(["var", "GIT_COMMITTER_IDENT"]));
  const localEmail = /<([^>]*)>/.exec(String(ident ?? ""))?.[1] || undefined;

  const committers = new Map<string, string>();
  if (hashes.length > 0) {
    const out = await quiet(() =>
      git.raw(["show", "-s", "--format=%H %ce", ...hashes]),
    );
    for (const line of String(out ?? "").split("\n")) {
      const [hash, email] = line.trim().split(" ");
      if (hash && email) committers.set(hash, email);
    }
  }

  const facts: MachineFacts = {
    localEmail,
    peerRefKnown: false,
    ahead: 0,
    behind: 0,
    unsent: new Set(),
    committers,
  };
  if (!peer?.ref || !(await refExists(git, peer.ref))) return facts;
  facts.peerRefKnown = true;
  const counts = await quiet(() =>
    git.raw(["rev-list", "--left-right", "--count", `HEAD...${peer.ref}`]),
  );
  const [ahead, behind] = String(counts ?? "0 0")
    .trim()
    .split(/\s+/)
    .map(Number);
  facts.ahead = Number.isFinite(ahead) ? ahead : 0;
  facts.behind = Number.isFinite(behind) ? behind : 0;
  if (facts.ahead > 0) {
    const out = await quiet(() =>
      git.raw(["rev-list", "--max-count=500", "HEAD", `^${peer.ref}`]),
    );
    for (const hash of String(out ?? "").split("\n")) {
      if (hash.trim()) facts.unsent.add(hash.trim());
    }
  }
  const head = await quiet(() =>
    git.raw(["log", "-1", "--format=%H%x1f%cI%x1f%s", peer.ref!]),
  );
  const [hash, date, message] = String(head ?? "")
    .trim()
    .split("\u001f");
  if (hash && date) facts.peerHead = { hash, date, message: message ?? "" };
  return facts;
}
