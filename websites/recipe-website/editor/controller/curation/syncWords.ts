/**
 * A mirror sync's outcome in words (47h): the `/git` page printed the
 * stored word itself ("Last sync …: nothing"). The words say what happened,
 * for a person; the stored `SyncOutcome` and every reader of it (the API,
 * the job, the notifications) are unchanged.
 *
 * Dependency-free: the Mirrors card and the workstation's ping line both
 * read it.
 */

const OUTCOME_WORDS: Record<string, string> = {
  nothing: "already in sync, nothing to move",
  synced: "synced",
  conflict: "stopped on a conflict",
  mirror_dirty: "the mirror has uncommitted changes, so nothing was sent",
  raced: "the mirror changed while it ran; the next sync catches up",
  busy: "another change was being saved; it tries again",
  unreachable: "could not reach the mirror",
  blocked: "blocked here (uncommitted changes, or a merge in progress)",
  error: "failed",
};

/** "already in sync, nothing to move" for `nothing`; an unknown word as is. */
export function syncOutcomeWords(outcome: string | undefined): string {
  if (!outcome) return "done";
  return OUTCOME_WORDS[outcome] ?? outcome.replace(/_/g, " ");
}
