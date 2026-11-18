/**
 * The sentence `/git` (Sync & upkeep, 48d) opens on: "Everything is in
 * sync.", or what isn't, and why. Pure: the page reads the repository, the
 * sync record and the index stamp, and hands the facts in.
 *
 * The order is the order a person must act in: a merge in the middle of
 * being resolved, then a conflict a sync stopped on, then anything that keeps
 * a sync from running at all (no branch, uncommitted files, no upstream), a
 * failing sync, the indexes, and only then what is merely waiting to move.
 *
 * Several ledes keep the exact words `SyncPanel`'s status line had before
 * 48d ("No upstream configured. …", "No upstream — this mirror pulls from
 * …"): the specs that read them still do, and so does a person who learnt
 * them.
 */
import type { EditorRole } from "recipe-website-common/config/role";
import type { SyncOutcome } from "@discontent/cms/git/syncState";
import { syncOutcomeWords } from "../curation/syncWords";

/** `ok`: green, nothing to do. `waiting`: it will move by itself or on a click. `attention`: a person is needed. */
export type SentenceTone = "ok" | "waiting" | "attention";

export interface MirrorFacts {
  name: string;
  outcome: SyncOutcome;
  consecutiveFailures: number;
  conflictSince?: string;
  message?: string;
}

export interface SentenceInput {
  role: EditorRole;
  /** The other editor's name in words: a mirror's remote, the workstation's name, or the upstream remote. */
  peer?: string;
  detached: boolean;
  dirty: boolean;
  dirtyCount: number;
  merge: { inProgress: boolean; unresolved: number };
  upstream?: string;
  hasRemote: boolean;
  /** Against the peer's remote-tracking ref when there is one, else the upstream. */
  ahead: number;
  behind: number;
  indexStale: boolean;
  indexVersionStale: boolean;
  /** The workstation's mirrors, as the last sync with each left them. */
  mirrors?: MirrorFacts[];
  /** A mirror: the workstation told it of a conflict (39-D4). */
  workstationConflictSince?: string;
}

export interface SyncSentence {
  tone: SentenceTone;
  title: string;
  lede: string;
  /** What the page offers first, if anything. */
  action?:
    | "resolve"
    | "pull-to-resolve"
    | "commit"
    | "set-upstream"
    | "add-remote"
    | "rebuild"
    | "sync";
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "1 change", "3 changes". */
export function changes(count: number): string {
  return plural(count, "change");
}

export function syncSentence(input: SentenceInput): SyncSentence {
  const mirror = input.role === "mirror";
  const peer = input.peer;

  if (input.merge.inProgress) {
    const left = input.merge.unresolved;
    if (left === 0) {
      return {
        tone: "attention",
        title: "Ready to finish the merge.",
        lede: "Every file has a choice. Complete the merge to make it one commit; the next sync takes it across.",
        action: "resolve",
      };
    }
    return {
      tone: "attention",
      title:
        left === 1
          ? "One change needs you."
          : `${plural(left, "change")} need you.`,
      lede: `Both sides changed ${left === 1 ? "the same record" : "the same records"} since they last synced. Everything else went across. Choose what to keep below; until then nothing new is merged here.`,
      action: "resolve",
    };
  }

  if (mirror && input.workstationConflictSince) {
    return {
      tone: "attention",
      title: `${capitalized(peer ?? "the workstation")} needs you.`,
      lede: `A sync on ${peer ?? "the workstation"} stopped on a conflict with this editor. Keep working here; resolve it there, and the next sync brings both sides together.`,
    };
  }

  const conflicted = (input.mirrors ?? []).find(
    (entry) => entry.conflictSince || entry.outcome === "conflict",
  );
  if (!mirror && conflicted) {
    return {
      tone: "attention",
      title: "A change needs you.",
      lede: `This editor and ${conflicted.name} both changed the same thing, so the sync stopped and nothing moved. Pull to see it here and choose what to keep.`,
      action: "pull-to-resolve",
    };
  }

  if (input.detached) {
    return {
      tone: "attention",
      title: "Not on a branch.",
      lede: "Detached HEAD — checkout a branch to sync.",
    };
  }

  if (input.dirty) {
    return {
      tone: "attention",
      title: `${capitalized(changes(input.dirtyCount))} here ${input.dirtyCount === 1 ? "isn't" : "aren't"} committed.`,
      lede: "Commit before syncing: nothing syncs while files outside a commit are waiting.",
      action: "commit",
    };
  }

  if (mirror && !input.upstream) {
    return {
      tone: "attention",
      title: "Not syncing yet.",
      lede: `No upstream — this mirror pulls from ${peer ?? "the workstation"}; \`pnpm deploy:pi --setup\` sets it up.`,
    };
  }

  if (!mirror && !input.upstream && (input.mirrors ?? []).length === 0) {
    return input.hasRemote
      ? {
          tone: "attention",
          title: "Not syncing yet.",
          lede: "No upstream configured. Choose a remote and set the upstream to start syncing.",
          action: "set-upstream",
        }
      : {
          tone: "attention",
          title: "This editor syncs with nothing yet.",
          lede: "No remote configured. Add one under Advanced to start syncing.",
          action: "add-remote",
        };
  }

  const failing = (input.mirrors ?? []).find(
    (entry) => entry.consecutiveFailures > 0,
  );
  if (!mirror && failing) {
    return {
      tone: "attention",
      title: `The last sync with ${failing.name} didn't finish.`,
      lede: `It ${syncOutcomeWords(failing.outcome)}${failing.consecutiveFailures > 1 ? `, ${plural(failing.consecutiveFailures, "time")} in a row` : ""}.${failing.message ? ` ${failing.message}` : ""}`,
      action: "sync",
    };
  }

  if (input.indexStale || input.indexVersionStale) {
    return {
      tone: "waiting",
      title: "The search indexes are behind.",
      lede: input.indexVersionStale
        ? "They were built by another version of the editor, which rebuilds them by itself when it starts. Lists, tags and search may miss a change until it has."
        : "The content changed outside the editor since they were built, so lists, tags and search may miss it until they are rebuilt.",
      action: "rebuild",
    };
  }

  const { ahead, behind } = input;
  const there = peer ?? "the remote";
  if (mirror && ahead > 0 && behind > 0) {
    return {
      tone: "waiting",
      title: "Both sides have changes.",
      lede: `Diverged — ${there} merges both sides when it next syncs.`,
    };
  }
  if (ahead > 0 || behind > 0) {
    const parts: string[] = [];
    if (ahead > 0) parts.push(`${changes(ahead)} here waiting to go`);
    if (behind > 0) parts.push(`${changes(behind)} from ${there} to bring in`);
    const by = mirror
      ? `${capitalized(there)} syncs this editor after every change on either side.`
      : (input.mirrors ?? []).length > 0
        ? "It syncs by itself after every change; Sync now moves them sooner."
        : ahead > 0 && behind > 0
          ? "Diverged — Sync will merge remote changes."
          : "Sync moves them.";
    return {
      tone: "waiting",
      title: `${capitalized(parts.join(", and "))}.`,
      lede: by,
      action: mirror ? undefined : "sync",
    };
  }

  return {
    tone: "ok",
    title: "Everything is in sync.",
    lede: peer
      ? `This editor and ${peer} hold the same content, and the search indexes match it.`
      : "The search indexes match the content.",
  };
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
