/**
 * Everything Sync & upkeep (48d) shows beyond `getSyncStatus`: the other
 * side, what moved and which way, the sentence, and the sync records —
 * read once per render, from the repository and its `.git` records only.
 */
import {
  readSyncState,
  type SyncStateFile,
} from "@discontent/cms/git/syncState";
import {
  getEditorRole,
  getWorkstationName,
  type EditorRole,
} from "recipe-website-common/config/role";
import { readSettings } from "../../src/settings";
import type { CommitSummary, SyncStatus } from "../curation/git";
import { readPingState, type PingState } from "../instance/pinger";
import { readStanding } from "../instance/standing";
import { directionOf, type Direction } from "./moved";
import {
  peerOf,
  readMachineFacts,
  type MachineFacts,
  type Peer,
} from "./machines";
import { syncSentence, type SyncSentence } from "./sentence";

export interface SyncView {
  role: EditorRole;
  peer?: Peer;
  mirrors: string[];
  facts: MachineFacts;
  sentence: SyncSentence;
  /** Where each listed commit was made and went, by hash. */
  directions: Record<string, Direction>;
  syncState: SyncStateFile;
  ping: PingState | null;
  workstationConflictSince?: string;
  /** When this was read (epoch ms): "Today" in the history is this day. */
  now: number;
}

async function peerFor(status: SyncStatus, role: EditorRole) {
  const mirrors =
    role === "mirror" ? [] : ((await readSettings()).mirrors ?? []);
  const peer = peerOf({
    role,
    branch: status.branch,
    upstream: status.upstream,
    mirrors,
    remotes: status.remotes.map((remote) => remote.name),
    workstationName: getWorkstationName(),
  });
  return { peer, mirrors };
}

function directionsOf(
  commits: CommitSummary[],
  peer: Peer | undefined,
  facts: MachineFacts,
): Record<string, Direction> {
  const directions: Record<string, Direction> = {};
  for (const commit of commits) {
    const direction = directionOf({
      hasPeer: Boolean(peer && facts.peerRefKnown),
      unsent: facts.unsent.has(commit.hash),
      localEmail: facts.localEmail,
      committerEmail: facts.committers.get(commit.hash),
    });
    if (direction) directions[commit.hash] = direction;
  }
  return directions;
}

export async function readSyncView(
  contentDirectory: string,
  status: SyncStatus,
): Promise<SyncView> {
  const role = getEditorRole();
  const { peer, mirrors } = await peerFor(status, role);
  const [facts, syncState, ping, standing] = await Promise.all([
    readMachineFacts(
      contentDirectory,
      peer,
      status.log.map((commit) => commit.hash),
    ),
    role === "mirror"
      ? Promise.resolve({} as SyncStateFile)
      : readSyncState(contentDirectory),
    role === "mirror" ? readPingState(contentDirectory) : Promise.resolve(null),
    role === "mirror" ? readStanding(contentDirectory) : Promise.resolve(null),
  ]);
  /* The peer's own counts when its ref is here; else the upstream's. */
  const counted = facts.peerRefKnown
    ? { ahead: facts.ahead, behind: facts.behind }
    : { ahead: status.ahead, behind: status.behind };
  const sentence = syncSentence({
    role,
    peer: peer?.name,
    detached: status.detached,
    dirty: status.dirty,
    dirtyCount: status.dirtyCount,
    merge: {
      inProgress: status.merge.inProgress,
      unresolved: status.merge.conflicted.length,
    },
    upstream: status.upstream,
    hasRemote: status.remotes.length > 0,
    ...counted,
    indexStale: status.indexStale && !status.indexVersionStale,
    indexVersionStale: status.indexVersionStale,
    mirrors: mirrors
      .map((name) => syncState[name])
      .filter((entry) => entry !== undefined)
      .map((entry) => ({
        name: entry.remote,
        outcome: entry.outcome,
        consecutiveFailures: entry.consecutiveFailures,
        conflictSince: entry.conflictSince,
        message: entry.message,
      })),
    workstationConflictSince: standing?.conflict?.since,
  });
  return {
    role,
    peer,
    mirrors,
    facts,
    sentence,
    directions: directionsOf(status.log, peer, facts),
    syncState,
    ping,
    workstationConflictSince: standing?.conflict?.since,
    now: Date.now(),
  };
}

/** The directions of a later page of the history ("Load more"). */
export async function readDirections(
  contentDirectory: string,
  status: SyncStatus,
  commits: CommitSummary[],
): Promise<Record<string, Direction>> {
  const { peer } = await peerFor(status, getEditorRole());
  const facts = await readMachineFacts(
    contentDirectory,
    peer,
    commits.map((commit) => commit.hash),
  );
  return directionsOf(commits, peer, facts);
}
