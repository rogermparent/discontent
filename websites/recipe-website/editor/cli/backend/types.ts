/**
 * The seam 22d slots an HTTP implementation into.
 *
 * Every command talks to this and nothing else — no command imports
 * `controller/curation/*` directly — so adding `--remote <url>` is one new file
 * plus one line of selection in `index.ts`, and no command changes at all.
 *
 * The result types are **re-exported from the curation layer** rather than
 * redeclared, so the HTTP backend's responses are typed against the same shapes
 * the local one returns and the two cannot answer in different vocabularies.
 */
import type { GroupItemRef } from "recipe-website-common/controller/types";
import type {
  FeaturedListResult,
  FeaturedWriteResult,
} from "../../controller/curation/featured";
import type {
  GroupDetail,
  GroupListResult,
  GroupWriteResult,
} from "../../controller/curation/groups";
import type {
  DiffResult,
  FileAtResult,
  GitDiffOptions,
  GitFileRef,
  GitLogOptions,
  GitLogResult,
  GitPushOptions,
  GitRestoreRef,
  GitWriteResult,
  PushResult,
  ShowResult,
  SyncStatus,
} from "../../controller/curation/git";
import type { ImportResult } from "../../controller/curation/importRecipe";
import type {
  RecipeDetail,
  RecipeListResult,
  RecipeWriteResult,
} from "../../controller/curation/recipes";
import type { ReindexResult } from "../../controller/curation/reindex";
import type { SearchResult } from "../../controller/curation/search";

export type {
  DiffResult,
  FeaturedListResult,
  FeaturedWriteResult,
  FileAtResult,
  GitDiffOptions,
  GitFileRef,
  GitLogOptions,
  GitLogResult,
  GitPushOptions,
  GitRestoreRef,
  GitWriteResult,
  GroupDetail,
  GroupItemRef,
  GroupListResult,
  GroupWriteResult,
  ImportResult,
  PushResult,
  RecipeDetail,
  RecipeListResult,
  RecipeWriteResult,
  ReindexResult,
  SearchResult,
  ShowResult,
  SyncStatus,
};

export interface DeleteResult {
  slug: string;
  deleted: true;
}

export interface ImportOptions {
  tags?: string[];
  slug?: string;
  name?: string;
  dryRun?: boolean;
  overwrite?: boolean;
}

export interface CuratorBackend {
  kind: "local" | "http";

  importRecipe(url: string, options?: ImportOptions): Promise<ImportResult>;
  createRecipe(
    raw: unknown,
    options?: { overwrite?: boolean },
  ): Promise<RecipeWriteResult>;
  updateRecipe(slug: string, raw: unknown): Promise<RecipeWriteResult>;
  getRecipe(slug: string): Promise<RecipeDetail>;
  listRecipes(options?: {
    limit?: number;
    offset?: number;
    tag?: string;
  }): Promise<RecipeListResult>;
  searchRecipes(
    query: string,
    options?: { limit?: number; offset?: number },
  ): Promise<SearchResult>;
  deleteRecipe(slug: string): Promise<DeleteResult>;

  createGroup(
    raw: unknown,
    options?: { force?: boolean },
  ): Promise<GroupWriteResult>;
  /** Everything about a group except its items (D4). */
  updateGroup(slug: string, raw: unknown): Promise<GroupWriteResult>;
  /**
   * Append one item — a recipe, or since 23c another group (D15).
   *
   * The ref is one object rather than two parameters so the two kinds cannot
   * both be passed, and so a third kind would be one type change here rather
   * than a new argument at every implementation.
   */
  addGroupItem(
    group: string,
    ref: GroupItemRef,
    options?: { label?: string; note?: string; force?: boolean },
  ): Promise<GroupWriteResult>;
  removeGroupItem(group: string, ref: GroupItemRef): Promise<GroupWriteResult>;
  setGroupItems(
    group: string,
    items: unknown,
    options?: { force?: boolean },
  ): Promise<GroupWriteResult>;
  getGroup(slug: string): Promise<GroupDetail>;
  listGroups(options?: {
    limit?: number;
    offset?: number;
  }): Promise<GroupListResult>;
  deleteGroup(slug: string): Promise<DeleteResult>;

  listFeatured(options?: {
    limit?: number;
    offset?: number;
  }): Promise<FeaturedListResult>;
  feature(raw: unknown): Promise<FeaturedWriteResult>;
  unfeature(slug: string): Promise<DeleteResult>;

  /**
   * Every tag in the corpus, sorted (D12).
   *
   * On the seam rather than reached for directly, so the MCP `tag_list` tool
   * and a `--remote` CLI run answer from the same place every other read does.
   */
  listTags(): Promise<string[]>;

  reindex(contentType?: string): Promise<ReindexResult>;

  /* --- git (23d/D23) ----------------------------------------------------- */

  /**
   * The content repository's history, and the two ways back into it.
   *
   * On the seam for the same reason every other read is: a `--remote` run must
   * see the history of the corpus it writes to, not of whatever directory
   * happens to be under the CLI. The `/git` page's fetch, pull, merge,
   * conflict, branch and remote flows stay page-only — they are interactive by
   * nature and there is nothing an agent would do with half a merge.
   */
  gitStatus(): Promise<SyncStatus>;
  gitLog(options?: GitLogOptions): Promise<GitLogResult>;
  gitShow(hash: string, options?: { maxChars?: number }): Promise<ShowResult>;
  gitFileAt(ref: GitFileRef): Promise<FileAtResult>;
  gitDiff(options: GitDiffOptions): Promise<DiffResult>;
  gitRevert(hash: string): Promise<GitWriteResult>;
  gitRestore(ref: GitRestoreRef): Promise<GitWriteResult>;
  /** Changes nothing locally, so no `afterWrite` follows it (T50). */
  gitPush(options?: GitPushOptions): Promise<PushResult>;

  /**
   * Run after a command whose `write` flag is set; the string it resolves to is
   * printed on **stderr**, never stdout. The local backend uses it for the
   * stale-editor hint; 22d's `--notify` will use it to report the revalidation.
   */
  afterWrite?(): Promise<string | undefined>;

  close(): Promise<void>;
}
