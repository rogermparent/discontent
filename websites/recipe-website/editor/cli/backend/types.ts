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
import type {
  GroupDetail,
  GroupListResult,
  GroupWriteResult,
} from "../../controller/curation/groups";
import type { ImportResult } from "../../controller/curation/importRecipe";
import type {
  RecipeDetail,
  RecipeListResult,
  RecipeWriteResult,
} from "../../controller/curation/recipes";
import type { ReindexResult } from "../../controller/curation/reindex";
import type { SearchResult } from "../../controller/curation/search";

export type {
  GroupDetail,
  GroupListResult,
  GroupWriteResult,
  ImportResult,
  RecipeDetail,
  RecipeListResult,
  RecipeWriteResult,
  ReindexResult,
  SearchResult,
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
  addGroupItem(
    group: string,
    recipe: string,
    options?: { label?: string; note?: string; force?: boolean },
  ): Promise<GroupWriteResult>;
  removeGroupItem(group: string, recipe: string): Promise<GroupWriteResult>;
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

  reindex(contentType?: string): Promise<ReindexResult>;

  /**
   * Run after a command whose `write` flag is set; the string it resolves to is
   * printed on **stderr**, never stdout. The local backend uses it for the
   * stale-editor hint; 22d's `--notify` will use it to report the revalidation.
   */
  afterWrite?(): Promise<string | undefined>;

  close(): Promise<void>;
}
