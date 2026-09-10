export interface CommitSummary {
  hash: string;
  message: string;
  author_name: string;
  date: string;
}

export interface RemoteSummary {
  name: string;
  fetchUrl: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

export interface ConflictFile {
  path: string;
  label: string;
}

export interface MergeState {
  /** A merge is underway (MERGE_HEAD exists), so the resolver should be shown. */
  inProgress: boolean;
  /** Files that still need an ours/theirs decision. */
  conflicted: ConflictFile[];
  /** Count of files already resolved (staged) but not yet committed. */
  resolvedCount: number;
}

export interface SyncStatus {
  isRepo: boolean;
  branch?: string;
  detached: boolean;
  /** Upstream tracking ref, e.g. "origin/main". Undefined when none is configured. */
  upstream?: string;
  ahead: number;
  behind: number;
  remotes: RemoteSummary[];
  branches: BranchInfo[];
  merge: MergeState;
  /** Uncommitted working-tree changes are present (outside of a merge). */
  dirty: boolean;
  /** Number of uncommitted changed files (for the warning copy). */
  dirtyCount: number;
  log: CommitSummary[];
  /** More commits exist beyond the first page. */
  hasMore: boolean;
}

export interface CommitLogPage {
  commits: CommitSummary[];
  hasMore: boolean;
}
