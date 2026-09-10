import type { Key, RootDatabase } from "lmdb";
import type {
  AggregateConfig,
  AggregateUpdateResult,
} from "../aggregates/types";
import type {
  PaginationIndexConfig,
  PaginationUpdateResult,
} from "../pagination/types";
import type { ReferenceDeclaration, ResolvedReferences } from "./references";

/**
 * What one *other* content type's items did as a consequence of this write.
 *
 * Its own list rather than an entry in a uniform per-type map, because the
 * asymmetry is permanent: the written type owns the redirect and the item
 * path, while a dependent type's paths are not even in the caller's success
 * config.
 */
export interface DependentWriteResult {
  contentType: string;
  /** The dependent type's dirty-page diff, keyed by *its* content type. */
  pagination: PaginationUpdateResult[];
  /**
   * And its aggregates. A write to type A can move an aggregate of type B
   * through borrowed fields (§6.1) — rewriting a recipe's name rewrites every
   * featured-recipe index value that borrows it, which is a change to the
   * corpus a featured-recipe aggregate folds.
   */
  aggregates: AggregateUpdateResult[];
  /** Which of its items the write touched. */
  updatedSlugs: string[];
}

/**
 * What a content write reports back: the regeneration set (§2).
 *
 * `pagination` is empty for a content type that declares no indexes, which is
 * every content type until one opts in. It carries the dirty-page diff the
 * caller needs to invalidate precisely instead of blanket-revalidating —
 * `createGenericActions` is the caller this exists for.
 *
 * `dependents` carries the same thing for content of *other* types that
 * borrows fields from the item just written. It is empty unless some type
 * declares `references` against this one, so adding it changed no behaviour
 * for any existing content type. Additive, so every
 * `({ pagination } = await ...)` destructure kept working.
 *
 * `aggregates` is the second derived kind (§2), added on the same terms. It
 * reports one entry per declared aggregate, each carrying whether the value
 * actually moved — which for an aggregate is the whole answer, since there are
 * no pages to name.
 */
export interface ContentWriteResult {
  pagination: PaginationUpdateResult[];
  dependents: DependentWriteResult[];
  aggregates: AggregateUpdateResult[];
}

/**
 * Specification for a content type that references another content type.
 * Used to automatically update references when the referenced content's slug changes.
 */
export interface ReferenceSpec<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TReferencingData = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TReferencingIndexValue = any,
  TReferencingKey extends Key = Key,
> {
  /**
   * The content type configuration for the referencing type.
   *
   * A thunk, not the config itself. Declaring the edge in both directions —
   * `referencedBy` here and `references` (§6.1) on the borrowing side — makes
   * the two modules import each other, and whichever one the bundler reaches
   * first would evaluate the other's object literal while its `const` is still
   * in the temporal dead zone. That is a `ReferenceError` at import time, not a
   * type error. Deferring the read to first use breaks the cycle from both
   * ends, so neither side has to be the one that loads second.
   */
  config: () => ContentTypeConfig<
    TReferencingData,
    TReferencingIndexValue,
    TReferencingKey
  >;

  /**
   * Field name in the data file that stores the slug reference.
   * Optional if indexField is provided and the field name is the same in both.
   */
  dataField?: string;

  /**
   * Field name in the index value that stores the slug reference.
   * If provided, enables efficient lookup via index iteration instead of reading all data files.
   * If only indexField is provided, assumes the same field name exists in both the index and data.
   */
  indexField?: string;
}

/**
 * Configuration for content types that defines how content is stored and indexed
 * TKey is flexible to support different index key structures (string, number, array, etc.)
 */
export interface ContentTypeConfig<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type identifier (e.g., "recipes", "featured-recipes") */
  contentType: string;

  /** Directory name for storing data files, relative to content directory */
  dataDirectory: string;

  /** Directory name for the LMDB index, relative to content directory */
  indexDirectory: string;

  /** Filename for the content data file (e.g., "recipe.json") */
  dataFilename: string;

  /**
   * Function to build the index value from the full data, plus whatever the
   * engine resolved for the references this type declares.
   *
   * Stays pure and synchronous. The engine does the reading and hands the
   * values over — which is what lets `project` stay synchronous too (§3.4) and
   * keeps phase 2 a walk over materialized values.
   *
   * The second parameter is **required in the type, optional in practice**: a
   * required parameter cannot be silently forgotten at a new engine call site,
   * while TypeScript still accepts an implementation that declares only the
   * first — which is every config that borrows nothing.
   */
  buildIndexValue: (data: TData, refs: ResolvedReferences) => TIndexValue;

  /** Function to build the index key from slug and data */
  buildIndexKey: (slug: string, data: TData) => TKey;

  /** Optional function to generate a default slug from data */
  createDefaultSlug?: (data: TData) => string;

  /** Optional directory name for uploads, relative to content directory */
  uploadsDirectory?: string;

  /**
   * Optional array of content types that reference this content type.
   * When this content's slug changes, all referencing content will be automatically updated.
   */
  referencedBy?: ReferenceSpec[];

  /**
   * Content types this one borrows index-value fields from — the inbound half
   * of the edge `referencedBy` declares outbound.
   *
   * The engine resolves each one before calling `buildIndexValue` and hands
   * the declared fields over, so the content index becomes covering and a
   * reader stops doing an N+1 enrichment pass. A write to a referenced item
   * then finds its dependents through `referencedBy` and rebuilds exactly
   * these values.
   */
  references?: ReferenceDeclaration[];

  /**
   * Pre-baked paginated queries over this content type. Each one materializes
   * its own keyspace in its own LMDB environment, so a content type can carry
   * any number of orderings and filters.
   *
   * Declared in a separate module and listed here; pagination configs never
   * import the content config back, so there is no cycle.
   *
   * Loosely typed for the same reason as `referencedBy`: naming this config's
   * own generics here would put `TKey` in a parameter position and make the
   * whole interface invariant, which breaks every `config as ContentTypeConfig`
   * cast in the package. The precise types live at the declaration site, and
   * `updatePaginationIndex` still checks the config/index pair when called.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginationIndexes?: PaginationIndexConfig<any, any, any>[];

  /**
   * Values folded from this content type's whole index — the aggregate kind
   * (§2). Each one materializes a single record in its own LMDB environment.
   *
   * A sibling of `paginationIndexes`, not a field inside one. An aggregate
   * folds the index *value*, so a content type with no pagination index can
   * still declare one and a fold can see fields no projection carries. The
   * price is a second O(N) walk per write, which the two modules staying
   * independent is worth (§11.1, F10b).
   *
   * Loosely typed for the same variance reason `paginationIndexes` and
   * `referencedBy` are.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aggregates?: AggregateConfig<any, any, any, any>[];
}

/**
 * One content type, with its generics erased — the element type of a list of
 * configs a site owns.
 *
 * `ContentTypeConfig[]` would not do: the default generics make `TKey` appear
 * in a parameter position (`buildIndexKey`), so the interface is invariant and
 * `recipeContentConfig` is not assignable to it. That is the same variance
 * problem `paginationIndexes` and `referencedBy` solve the same way, and the
 * reason every engine call site casts through `config as ContentTypeConfig`.
 *
 * A site's registry is a list of *heterogeneous* configs by definition, so it
 * is the one place that has no concrete generics to name. Anything reading a
 * registry entry reads the fields that are the same for every type — the
 * directories, the declared indexes and aggregates — never its data shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyContentTypeConfig = ContentTypeConfig<any, any, any>;

/**
 * Upload specification for a single field
 */
export interface UploadSpec {
  /** The File to upload (optional) */
  file?: File;
  /** URL to import file from (optional) */
  fileImportUrl?: string;
  /** Whether to clear/remove the existing file */
  clearFile?: boolean;
  /** The existing filename (if any) */
  existingFile?: string;
}

/**
 * Options for creating content
 */
export interface CreateContentOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** The URL-friendly slug for this content */
  slug: string;

  /** The full content data to store in the filesystem */
  data: TData;

  /** Optional content directory override */
  contentDirectory?: string;

  /** Optional author for git commit */
  author?: { name: string; email: string };

  /** Custom git commit message */
  commitMessage?: string;

  /** Optional uploads to process (keyed by field name) */
  uploads?: Record<string, UploadSpec>;

  /**
   * Optional custom upload processor. If provided, this will be called
   * instead of the default upload processing. Receives the resolved
   * upload data for each field. Returns paths touched (relative to contentDirectory).
   */
  processUploads?: (
    config: ContentTypeConfig,
    slug: string,
    uploads: Record<string, FileUploadData | undefined>,
    contentDirectory: string,
  ) => Promise<string[] | void>;

  action?: "overwrite";
}

/**
 * Options for updating content
 */
export interface UpdateContentOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** The new slug for this content */
  slug: string;

  /** The current slug (before update) */
  currentSlug: string;

  /** The current index key (before update) - used to remove old entry if key changes */
  currentIndexKey: TKey;

  /** The full content data to store in the filesystem */
  data: TData;

  /** Optional content directory override */
  contentDirectory?: string;

  /** Optional author for git commit */
  author?: { name: string; email: string };

  /** Custom git commit message */
  commitMessage?: string;

  /** Optional uploads to process (keyed by field name) */
  uploads?: Record<string, UploadSpec>;

  /**
   * Optional custom upload processor. If provided, this will be called
   * instead of the default upload processing. Receives the resolved
   * upload data for each field, plus additional context for updates.
   * Returns paths touched (relative to contentDirectory).
   */
  processUploads?: (
    config: ContentTypeConfig,
    slug: string,
    uploads: Record<string, FileUploadData | undefined>,
    contentDirectory: string,
    currentSlug: string,
    uploadSpecs: Record<string, UploadSpec>,
  ) => Promise<string[] | void>;
}

/**
 * Options for deleting content
 */
export interface DeleteContentOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** The slug of content to delete */
  slug: string;

  /** The index key of content to delete */
  indexKey: TKey;

  /** Optional content directory override */
  contentDirectory?: string;

  /** Optional author for git commit */
  author?: { name: string; email: string };

  /** Custom git commit message */
  commitMessage?: string;
}

/**
 * Options for reading content from the index
 */
export interface ReadContentIndexOptions<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TResult = { key: TKey; value: TIndexValue },
> {
  /** The content type configuration */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, TIndexValue, TKey>;

  /** Maximum number of entries to return */
  limit?: number;

  /** Number of entries to skip */
  offset?: number;

  /** Whether to return results in reverse order (newest first) */
  reverse?: boolean;

  /** Optional content directory override */
  contentDirectory?: string;

  map?: (arg: { key: TKey; value: TIndexValue }) => TResult;
}

/**
 * Result from reading the content index
 */
export interface ReadContentIndexResult<
  TIndexValue = unknown,
  TKey extends Key = Key,
  TResult = {
    key: TKey;
    value: TIndexValue;
  },
> {
  entries: Array<TResult>;
  total: number;
  more: boolean;
}

/**
 * Options for reading a single content file
 */
export interface ReadContentFileOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** The slug of the content to read */
  slug: string;

  /** Optional content directory override */
  contentDirectory?: string;
}

/**
 * File upload information
 */
export interface FileUploadData {
  /** The filename to use */
  fileName: string;
  /** The File object if uploading from form */
  file?: File;
  /** URL to import file from */
  fileImportUrl?: string;
}

/**
 * Options for processing uploads
 */
export interface ProcessUploadsOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** The slug for the content */
  slug: string;

  /** Uploads to process */
  uploads: Record<
    string,
    {
      file?: File;
      clearFile?: boolean;
      existingFile?: string;
      fileImportUrl?: string;
    }
  >;

  /** Optional content directory override */
  contentDirectory?: string;
}

/**
 * Generic database instance type
 */
export type ContentDatabase<
  TIndexValue = unknown,
  TKey extends Key = Key,
> = RootDatabase<TIndexValue, TKey>;

/**
 * Options for rebuilding the index
 */
export interface RebuildIndexOptions<
  TData = Record<string, unknown>,
  TIndexValue = unknown,
  TKey extends Key = Key,
> {
  /** The content type configuration */
  config: ContentTypeConfig<TData, TIndexValue, TKey>;

  /** Optional content directory override */
  contentDirectory?: string;

  /**
   * Also rebuild every content type that references this one. Defaults to
   * **true**.
   *
   * A dependent's index value holds fields copied out of *this* type's data
   * files, and the content index carries no spec hash — so nothing detects
   * that those copies went stale and nothing self-heals. Rebuilding this type
   * alone would leave them wrong indefinitely.
   *
   * True by default because every caller of `rebuildIndex` is a "make
   * everything right" operation: the export action, the sync command, the seed
   * scripts, the maintenance button. A caller that genuinely wants one index
   * and no cascade can say so.
   */
  cascadeDependents?: boolean;

  /**
   * Content types already rebuilt in this cascade. Internal: it is what stops
   * a reference cycle from recursing forever, and callers should not pass it.
   */
  visited?: Set<string>;
}
