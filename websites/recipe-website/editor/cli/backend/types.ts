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
  GroupDeleteResult,
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
  GitFetchOptions,
  GitPullOptions,
  GitPushOptions,
  GitRestoreRef,
  GitWriteResult,
  FetchResult,
  PullResult,
  PushResult,
  ShowResult,
  SyncStatus,
} from "../../controller/curation/git";
import type {
  GitSyncOptions,
  SyncResult,
} from "../../controller/curation/sync";
import type {
  ImportBatchResult,
  ImportResult,
} from "../../controller/curation/importRecipe";
import type { InspectResult } from "../../controller/curation/inspect";
import type {
  FillOptions,
  FillResult,
} from "../../controller/curation/fillRecipe";
import type {
  LinkedScanOptions,
  LinkedScanResult,
} from "../../controller/curation/linkedImport";
import type {
  GramsRecipeOptions,
  GramsRecipeResult,
} from "../../controller/curation/gramsRecipe";
import type { LinkedMode } from "../../controller/curation/linkedMode";
import type { JobContext } from "../../controller/jobs/context";
import type { EditResult } from "../../controller/llm/askEdit";
import type {
  ShoppingAskResult,
  ShoppingAskStart,
} from "recipe-website-common/util/shoppingAsk";
import type {
  AgentRunInput,
  AgentRunOutcome,
  AgentRunView,
} from "../../controller/agent/follow";
import type { ReviewNoteInput } from "../../controller/agent/reviewNotes";
import type { AddReviewNoteResult } from "../../controller/agent/reviewNoteStore";
import type { LlmMode } from "../../controller/llm/mode";
import type {
  ImportListOptions,
  ImportListResult,
  InspectListResult,
} from "../../controller/curation/importList";
import type {
  RecipeImageInput,
  RecipeImageResult,
  TermImageInput,
  TermImageResult,
} from "../../controller/curation/recipeImage";
import type {
  InventoryResult,
  InventoryWriteResult,
  MakeableResult,
} from "../../controller/curation/inventory";
import type {
  ShoppingAddResult,
  ShoppingClearResult,
  ShoppingLayerResult,
  ShoppingListResult,
  ShoppingMergeResult,
  ShoppingPatchResult,
  ShoppingRuleResult,
  ShoppingRulesResult,
  ShoppingSettingsResult,
  ShoppingViewResult,
} from "../../controller/curation/shopping";
import type { ShoppingListSummary } from "recipe-website-common/util/shoppingLists";
import type { ShoppingLayerListing } from "recipe-website-common/util/shoppingChanges";
import type {
  ShoppingTidyResult,
  TidyAskStart,
  TidyModels,
  TidyRunView,
  TidyStart,
} from "recipe-website-common/util/shoppingTidy";
import type { TidyDecisionResult } from "../../controller/curation/shopping";
import type {
  RecipeDetail,
  RecipeDryRunResult,
  RecipeListResult,
  RecipeWriteResult,
} from "../../controller/curation/recipes";
import type { ReindexResult } from "../../controller/curation/reindex";
import type {
  HolidayGetResult,
  HolidayListResult,
  HolidayOptions,
} from "../../controller/curation/holidays";
import type {
  JobCancelResult,
  JobListOptions,
  JobListResult,
  JobRetryResult,
  JobView,
} from "../../controller/jobs/views";
import type {
  DeepSearchResult,
  SearchResult,
} from "../../controller/curation/search";
import type {
  TermAssignResult,
  TermDeleteResult,
  TermDetail,
  TermListResult,
  TermMergeResult,
  TermRenameResult,
  TermWriteResult,
} from "../../controller/curation/terms";

export type {
  DiffResult,
  EditResult,
  ShoppingAskResult,
  ShoppingAskStart,
  FillOptions,
  FillResult,
  HolidayGetResult,
  HolidayListResult,
  HolidayOptions,
  FeaturedListResult,
  FeaturedWriteResult,
  FetchResult,
  FileAtResult,
  GitDiffOptions,
  GitFetchOptions,
  GitFileRef,
  GitLogOptions,
  GitLogResult,
  GitPullOptions,
  GitPushOptions,
  GitRestoreRef,
  GitSyncOptions,
  GitWriteResult,
  GroupDeleteResult,
  GroupDetail,
  GroupItemRef,
  GroupListResult,
  GroupWriteResult,
  ImportListOptions,
  ImportListResult,
  ImportBatchResult,
  ImportResult,
  InspectListResult,
  InspectResult,
  InventoryResult,
  InventoryWriteResult,
  JobCancelResult,
  JobListOptions,
  JobListResult,
  JobRetryResult,
  JobView,
  MakeableResult,
  PullResult,
  PushResult,
  RecipeDetail,
  RecipeDryRunResult,
  RecipeImageInput,
  RecipeImageResult,
  RecipeListResult,
  RecipeWriteResult,
  ReindexResult,
  DeepSearchResult,
  SearchResult,
  ShoppingAddResult,
  ShoppingClearResult,
  ShoppingLayerResult,
  ShoppingLayerListing,
  ShoppingListResult,
  ShoppingListSummary,
  ShoppingMergeResult,
  ShoppingPatchResult,
  ShoppingRuleResult,
  ShoppingRulesResult,
  ShoppingSettingsResult,
  ShoppingViewResult,
  ShowResult,
  SyncResult,
  SyncStatus,
  TermAssignResult,
  TermDeleteResult,
  TermDetail,
  TermImageInput,
  TermImageResult,
  TermListResult,
  TermMergeResult,
  TermRenameResult,
  TermWriteResult,
};

/**
 * 49b: what `shopping ask` and `shopping find-merges` answer — the job's
 * result once it ended, or (`--remote` without `--wait`) the job's id
 * while it runs on in the editor.
 */
export type ShoppingAskAnswer =
  | (ShoppingAskResult & { job: string })
  | { job: string; stored?: boolean; status: "running" };

/**
 * 50b: what `shopping tidy` and a tidy `shopping ask` answer — the job's
 * result once it ended, or (`--remote` without `--wait`) its id.
 */
export type ShoppingTidyAnswer =
  | (ShoppingTidyResult & { job: string })
  | { job: string; stored?: boolean; status: "running" };

export type { TidyDecisionResult, TidyModels, TidyRunView };

export interface DeleteResult {
  slug: string;
  deleted: true;
}

export interface ImportOptions {
  tags?: string[];
  slug?: string;
  name?: string;
  /** Use this image URL instead of the page's best one (26b). */
  image?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  /** Create from an SEO-only page — no Recipe node — anyway (26a/D3). */
  allowPartial?: boolean;
  /** The local model: `auto` (default), `force` or `off` (epic 36, D3). */
  llm?: LlmMode;
  /**
   * A video (or paste) holding several recipes (36e): import these, by
   * 1-based position, or `all`. With neither, such an import is `usage`.
   */
  pick?: (number | string)[];
  all?: boolean;
  /** Read a video or paste as one recipe, never split (36e). */
  asOne?: boolean;
  /**
   * The recipes the page links to (50e): `auto` (default) imports or links
   * them and links the lines they make; `off` imports this one alone.
   */
  linked?: LinkedMode;
  /**
   * Read it again (39a): skip the reading an earlier import of the same
   * source kept for half an hour (38c) — and a photo set's kept
   * transcription — and keep the new one.
   */
  fresh?: boolean;
}

/**
 * What a pasted-text import takes besides the text (36c, D8): a URL import's
 * options, without `llm` — text always goes through the local model.
 */
export interface ImportTextOptions extends Omit<ImportOptions, "llm"> {
  /** The text's URL: cited as `source` (a video URL is also `video`), never fetched. */
  source?: string;
}

/**
 * What a photo import takes besides the photos (38e): a pasted text's
 * options, and `photoAsImage`.
 */
export interface ImportPhotoOptions extends ImportTextOptions {
  /** Set the first photo as each created recipe's image (default off). */
  photoAsImage?: boolean;
}

/** What `inspect` takes besides the URL (36b). */
export interface InspectOptions {
  /** The local model: `auto` (default), `force` or `off` (epic 36, D3). */
  llm?: LlmMode;
}

/**
 * Who a job-running seat runs for (44c, Ec1): the editor's agent hands the
 * run's `signal` and `job` to the import and inspect seats, so a cancel stops
 * an import in flight and the import's steps nest under the tool call's step
 * in the run's own log. With `job`, the local backend runs the seat **inside
 * that job** (`runSpecInline`) instead of starting one of its own; with only
 * `signal`, its own job is cancelled when the signal aborts. The HTTP
 * backend ignores it (the agent runs in-process). Never part of a spec:
 * a signal and a job are not JSON.
 */
export interface SeatRun {
  signal?: AbortSignal;
  job?: JobContext;
}

/** How `runAgent` follows its run. */
export interface AgentRunOptions {
  onProgress?: (view: AgentRunView) => void;
  /** Between reads; default `agentFollowMs()`. */
  pollMs?: number;
}

export interface CuratorBackend {
  kind: "local" | "http";

  importRecipe(
    url: string,
    options?: ImportOptions,
    run?: SeatRun,
  ): Promise<ImportResult>;
  /**
   * A pasted recipe, read by the local model (36c, D8): `import_failed` with
   * no model configured, or when it finds no recipe in the text.
   */
  importText(
    text: string,
    options?: ImportTextOptions,
    run?: SeatRun,
  ): Promise<ImportResult>;
  /**
   * Photos of a recipe — a card, a cookbook page — the pages in order (38e):
   * transcribed by the vision model, then read as pasted text is. `usage`
   * with no vision model configured (`RECIPE_LLM_VISION_MODEL`, or the
   * Claude API's own model under `RECIPE_LLM_API=anthropic`, 38g).
   */
  importPhotos(
    photos: File[],
    options?: ImportPhotoOptions,
    run?: SeatRun,
  ): Promise<ImportResult>;
  /**
   * A page, read and not written (26b): the mapped import, a create-ready
   * draft, the raw JSON-LD, its SEO metadata, ranked images and — for a video
   * host — yt-dlp's metadata.
   */
  inspect(
    url: string,
    options?: InspectOptions,
    run?: SeatRun,
  ): Promise<InspectResult>;
  /**
   * A roundup page's recipes, `existing` marked (34f, D11). One request,
   * nothing written.
   */
  inspectList(url: string, run?: SeatRun): Promise<InspectListResult>;
  /**
   * Import a roundup's picks one commit each, paced 15 s per site, at most
   * `limit` per call — the rest come back as `remaining` (34f, D11).
   */
  importList(
    url: string,
    options: ImportListOptions,
    run?: SeatRun,
  ): Promise<ImportListResult>;
  /** `dryRun` validates and resolves without writing (26b). */
  createRecipe(
    raw: unknown,
    options?: { overwrite?: boolean; dryRun?: boolean },
  ): Promise<RecipeWriteResult | RecipeDryRunResult>;
  updateRecipe(
    slug: string,
    raw: unknown,
    options?: { dryRun?: boolean },
  ): Promise<RecipeWriteResult | RecipeDryRunResult>;
  /**
   * A recipe's gaps filled from its source, written nowhere (45b): what the
   * source fills, what the model estimates, and the patch `updateRecipe`
   * takes. `usage` when the recipe has no source link or video.
   */
  fillRecipe(
    slug: string,
    options?: Pick<FillOptions, "estimate" | "uses" | "usesAll">,
    run?: SeatRun,
  ): Promise<FillResult>;
  /**
   * 51f: the recipe's lines given grams in the house form — a pasted list,
   * then the gram bank; one update (one commit), or none with `dryRun`.
   * With `model` the model is asked for the rest, one line at a time, and
   * its grams come back as `suggested`, never written.
   */
  gramsForRecipe(
    slug: string,
    options?: GramsRecipeOptions,
  ): Promise<GramsRecipeResult>;
  /**
   * `recipes linked --scan` (50e): recipes already here, their source pages
   * read again for the recipes they link — imported or linked, the lines
   * that make them rewritten, one commit per recipe (none with `dryRun`).
   * Local only: the HTTP backend answers `usage`.
   */
  scanLinked(
    options?: LinkedScanOptions,
    run?: SeatRun,
  ): Promise<LinkedScanResult>;
  /**
   * "Edit with AI" over the stored recipe (47i), written nowhere: the
   * request answered by the local model (or the Claude API, `claude`),
   * checked, and the change as a patch `updateRecipe` takes.
   */
  reviseRecipe(
    slug: string,
    options: { request: string; claude?: boolean },
    run?: SeatRun,
  ): Promise<EditResult>;
  /** Set (from a URL or a `File`) or clear one recipe's image, one commit (26b). */
  setRecipeImage(
    slug: string,
    input: RecipeImageInput,
  ): Promise<RecipeImageResult>;
  getRecipe(slug: string): Promise<RecipeDetail>;
  listRecipes(options?: {
    limit?: number;
    offset?: number;
    tag?: string;
  }): Promise<RecipeListResult>;
  /**
   * `deep` (51c): the steps and notes searched too (`searchRecipeText`),
   * the curator's search; a row a step or note found carries `found`.
   */
  searchRecipes(
    query: string,
    options?: { limit?: number; offset?: number; deep?: boolean },
  ): Promise<SearchResult | DeepSearchResult>;
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
    options?: {
      label?: string;
      note?: string;
      /** A recipe row's multiplier, `"2"` or `"1/2"` (epic 32, D4). */
      scale?: string;
      force?: boolean;
    },
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
  deleteGroup(slug: string): Promise<GroupDeleteResult>;

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

  /* --- terms (31c) ------------------------------------------------------- */

  /**
   * The `tag` vocabulary's records and carriers (`curation/terms.ts`).
   *
   * Every slug names a term of the one vocabulary the site has, so there is no
   * taxonomy argument here; the HTTP backend spells it into the URL
   * (`/api/taxonomies/tag/…`), which is where a second vocabulary would go.
   */
  listTerms(options?: {
    limit?: number;
    offset?: number;
    records?: boolean;
  }): Promise<TermListResult>;
  getTerm(slug: string): Promise<TermDetail>;
  createTerm(raw: unknown): Promise<TermWriteResult>;
  updateTerm(slug: string, raw: unknown): Promise<TermWriteResult>;
  /**
   * Set (from a URL or a `File`) or clear one term record's picture, one
   * commit (32c) — `setRecipeImage`'s twin.
   */
  setTermImage(slug: string, input: TermImageInput): Promise<TermImageResult>;
  /** Refused with `term_in_use` while carried, unless `unassign`. */
  deleteTerm(
    slug: string,
    options?: { unassign?: boolean },
  ): Promise<TermDeleteResult>;
  /** `{to, label?}`: moves the record and rewrites every carrier's tag. */
  renameTerm(slug: string, raw: unknown): Promise<TermRenameResult>;
  /** `{into}`: re-tags every carrier and folds the record in. */
  mergeTerm(slug: string, raw: unknown): Promise<TermMergeResult>;
  /** `{add?, remove?, type?}`: one update per carrier. */
  assignTerm(slug: string, raw: unknown): Promise<TermAssignResult>;

  reindex(contentType?: string): Promise<ReindexResult>;

  /* --- holidays (42h) --------------------------------------------------- */

  /**
   * The holiday pages' data, read-only (`curation/holidays.ts`): every child
   * of the `holidays` term soonest first, and one holiday's menu. `date`
   * (`YYYY-MM-DD`) counts as of that day; absent, the server's today.
   * Locally `link` is absolute on `RECIPE_EDITOR_URL` when set, remotely on
   * the editor that answered (41i's Di5).
   */
  holidayList(options?: HolidayOptions): Promise<HolidayListResult>;
  holidayGet(slug: string, options?: HolidayOptions): Promise<HolidayGetResult>;

  /* --- inventory (25d) --------------------------------------------------- */

  /**
   * The editor's shared list of what's on hand, and what it can make.
   *
   * On the seam so the CLI, the MCP tools and `--remote` all reach the same
   * file. `setInventory` replaces the list whole and is the one write the
   * agent's seats hold back (D11); `patchInventory` takes an `{add, remove}`
   * diff.
   */
  getInventory(): Promise<InventoryResult>;
  patchInventory(raw: unknown): Promise<InventoryWriteResult>;
  setInventory(raw: unknown): Promise<InventoryWriteResult>;
  inventoryMakeable(options?: {
    query?: string;
    /** Featured ingredients (41i): `/make`'s featuring, judged by the matcher. */
    feature?: string[];
    limit?: number;
    /** Pantry staples count as on hand (U5); `false` turns them off. */
    staples?: boolean;
  }): Promise<MakeableResult>;

  /* --- shopping list (35c) ---------------------------------------------- */

  /**
   * The editor's shared shopping list (epic 35, D7/D8): one file per item in
   * the content repo, every feature a switch. `getShopping` answers the
   * stored items and settings with the view and its copy text; `store`
   * narrows to one store's list. Every write is one commit, or none.
   *
   * 50d: every call is about one list — the one `forShoppingList` names,
   * else the main list. The rules, merges and settings are every list's.
   */
  getShopping(options?: {
    store?: string;
    /** 50a: the base rows — no merges, rules or layers. */
    asWritten?: boolean;
  }): Promise<ShoppingViewResult>;
  /**
   * 50d (Dd2): this backend with every shopping call on one list — `main`,
   * a saved list's id or its name (`--list`, a tool's `list` argument).
   */
  forShoppingList(list: string): CuratorBackend;
  /** 50d: the lists, the main list first; `all` with the deleted ones. */
  listShoppingLists(options?: {
    all?: boolean;
  }): Promise<{ lists: ShoppingListSummary[] }>;
  /** 50d: `{name}` or `{plan, name?, scale?}` — a new list, one commit. */
  createShoppingList(raw: unknown): Promise<ShoppingListResult>;
  /** 50d: `{id, name?, archived?}` — rename, delete or restore. */
  editShoppingList(raw: unknown): Promise<ShoppingListResult>;
  /** `{recipe, scale?} | {group, scale?} | {items}`. */
  addToShopping(raw: unknown): Promise<ShoppingAddResult>;
  /** `{check, uncheck, remove, need, unneed, names, uncheckNames, removeSource, set}`. */
  patchShopping(raw: unknown): Promise<ShoppingPatchResult>;
  /** `{scope: "checked" | "all"}`, checked by default. */
  clearShopping(raw?: unknown): Promise<ShoppingClearResult>;
  getShoppingSettings(): Promise<ShoppingSettingsResult>;
  updateShoppingSettings(raw: unknown): Promise<ShoppingSettingsResult>;
  /**
   * 49a: answer a "same thing, different names" proposal, or change a merge
   * — `{id | keys, status: "merged" | "apart", name?, amount?, note?}`.
   */
  decideShoppingMerge(raw: unknown): Promise<ShoppingMergeResult>;
  /** 49a: Split — `{id}`: delete that decision. */
  splitShoppingMerge(raw: unknown): Promise<ShoppingMergeResult>;
  /** 50a: this list's changes (layers), in the order they apply. */
  listShoppingLayers(): Promise<{ layers: ShoppingLayerListing[] }>;
  /** 50a: add a change — `{ops, reason?, note?, by?, on?, from?}`. */
  addShoppingLayer(raw: unknown): Promise<ShoppingLayerResult>;
  /** 50a: `{id, on}` — turn a change off (undo) or on. */
  setShoppingLayer(raw: unknown): Promise<ShoppingLayerResult>;
  /** 50a: `{id}` — remove a change. */
  removeShoppingLayer(raw: unknown): Promise<ShoppingLayerResult>;
  /** 50a: `{name, leaveOff, reason?}` — a leave-off rule for every list. */
  setShoppingLeaveOff(raw: unknown): Promise<ShoppingRuleResult>;
  /** 50c: `{kind: "rule" | "merge", id, on}` — switch a rule for every list. */
  setShoppingRule(raw: unknown): Promise<ShoppingRulesResult>;
  /** 50c: `{kind: "rule", id} | {kind: "aisle", key}` — remove a rule. */
  removeShoppingRule(raw: unknown): Promise<ShoppingRulesResult>;
  /** 50c: `{id}` — "Always do this": a change made rules for every list. */
  promoteShoppingLayer(raw: unknown): Promise<ShoppingRulesResult>;
  /**
   * 49b: ask the model about one proposal or merged row with a note, or
   * look for more merges — a `shopping-merge` job, written nowhere. Locally
   * it runs in this process to its end; remotely `wait` follows it there,
   * and without it the answer is the job's id.
   */
  askShopping(
    input: ShoppingAskStart,
    options?: { wait?: boolean },
    run?: SeatRun,
  ): Promise<ShoppingAskAnswer>;
  /** 50b: the models a tidy run may pick, and those it can't, with why. */
  tidyModels(): Promise<TidyModels>;
  /**
   * 50b: "Tidy with the model" — a `shopping-tidy` job that keeps its run
   * (one commit). Locally it runs here to its end; remotely `wait` follows
   * it, and without it the answer is the job's id.
   */
  tidyShopping(
    input: TidyStart,
    options?: { wait?: boolean },
    run?: SeatRun,
  ): Promise<ShoppingTidyAnswer>;
  /** 50b: the tidy runs, newest first (`run`: that one only). */
  tidyRuns(options?: { run?: string }): Promise<{ runs: TidyRunView[] }>;
  /** 50b: Accept (one layer) or Skip one suggestion — one commit. */
  decideTidySuggestion(
    id: string,
    action: "accept" | "skip",
  ): Promise<TidyDecisionResult>;
  /** 50b: a note on one card, asked again (Db6). */
  askTidySuggestion(
    input: TidyAskStart,
    options?: { wait?: boolean },
    run?: SeatRun,
  ): Promise<ShoppingTidyAnswer>;

  /* --- git (23d/D23) ----------------------------------------------------- */

  /**
   * The content repository's history, and the two ways back into it.
   *
   * On the seam for the same reason every other read is: a `--remote` run must
   * see the history of the corpus it writes to, not of whatever directory
   * happens to be under the CLI. The `/git` page's merge, conflict, branch and
   * remote flows stay page-only — they are interactive by nature and there is
   * nothing an agent would do with half a merge. Fetch and pull joined in 27b,
   * with a pull that aborts rather than leave a conflict behind.
   */
  gitStatus(options?: { fetch?: boolean }): Promise<SyncStatus>;
  gitLog(options?: GitLogOptions): Promise<GitLogResult>;
  gitShow(hash: string, options?: { maxChars?: number }): Promise<ShowResult>;
  gitFileAt(ref: GitFileRef): Promise<FileAtResult>;
  gitDiff(options: GitDiffOptions): Promise<DiffResult>;
  gitRevert(hash: string): Promise<GitWriteResult>;
  gitRestore(ref: GitRestoreRef): Promise<GitWriteResult>;
  /** Changes nothing locally, so no `afterWrite` follows it (T50). */
  gitPush(options?: GitPushOptions): Promise<PushResult>;
  /** Moves remote-tracking refs only: no `afterWrite` either. */
  gitFetch(options?: GitFetchOptions): Promise<FetchResult>;
  /** Merges and rebuilds every index; a write like revert and restore. */
  gitPull(options?: GitPullOptions): Promise<PullResult>;
  /**
   * Fetch the mirror, merge it in, push back (epic 28, D3). A write: a merge
   * rebuilds every index. Expected failures are an `outcome`, not a throw.
   */
  gitSync(options?: GitSyncOptions): Promise<SyncResult>;

  /*
   * The job store (epic 37, 37c): local, this machine's store
   * (`RECIPE_JOBS_DIR`); remote, the editor's, over `/api/jobs`.
   */
  /** Newest first; `status`, `kind`, `limit` filter. */
  listJobs(options?: JobListOptions): Promise<JobListResult>;
  /** One job: its record and its step log from byte `from` on. */
  getJob(id: string, options?: { from?: number }): Promise<JobView>;
  /** Stop a job wherever it runs (`requestJobCancel`). */
  cancelJob(id: string): Promise<JobCancelResult>;
  /**
   * Run a job again with this backend's own context: locally it runs here
   * and the answer is its end; remotely the editor starts it and answers
   * at once (`status: "running"`). A spec recorded against another content
   * directory is `usage`. `fresh` (39a): an import skips its kept reading.
   */
  retryJob(id: string, options?: { fresh?: boolean }): Promise<JobRetryResult>;

  /**
   * Run the editor's agent (epic 44, 44c) — or follow up on a run
   * (`runId`) — and follow it to its end, `onProgress` hearing each new
   * read (step lines, transcript records). Locally it runs **in this
   * process** against this content directory, a committer preflighted; with
   * `--remote` the editor runs it (`POST /api/agent`) and this follows
   * `GET /api/agent/<id>` — a Ctrl-C stops following, not the run.
   * `usage` when no model is configured where it runs.
   */
  runAgent(
    input: AgentRunInput,
    options?: AgentRunOptions,
  ): Promise<AgentRunOutcome>;

  /**
   * Add a review note to an ended agent run (51e): locally to this
   * machine's job store, remotely `POST /api/agent/<id>/note` (write scope).
   * A note writes nothing to the content repository.
   */
  noteAgentRun(
    id: string,
    input: ReviewNoteInput,
  ): Promise<AddReviewNoteResult>;

  /**
   * Run after a command whose `write` flag is set; the string it resolves to is
   * printed on **stderr**, never stdout. The local backend uses it for the
   * stale-editor hint; 22d's `--notify` will use it to report the revalidation.
   */
  afterWrite?(): Promise<string | undefined>;

  close(): Promise<void>;
}
