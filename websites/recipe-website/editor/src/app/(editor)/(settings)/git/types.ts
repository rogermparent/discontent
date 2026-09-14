/**
 * The `/git` page's DTOs, which now live in the curation layer (23d/D19).
 *
 * They were declared here because the page was the only thing that had them,
 * and `controller/actions/sync.ts` imported *up* into the page directory to
 * reach them. `controller/curation/git.ts` is where the reads that produce them
 * live now, so the declarations moved with the code and this file is the
 * re-export that keeps every component's `from "./types"` import working.
 */
export type {
  BranchInfo,
  CommitSummary,
  ConflictFile,
  MergeState,
  RemoteSummary,
  SyncStatus,
} from "../../../../../controller/curation/git";

import type { CommitSummary } from "../../../../../controller/curation/git";

/**
 * One "Load more" page of the commit log.
 *
 * Page-only, and deliberately *not* `GitLogResult`: the curation seat's entry
 * carries the files each commit touched, which the log list does not render and
 * would only pay for over the RSC wire.
 */
export interface CommitLogPage {
  commits: CommitSummary[];
  hasMore: boolean;
}
