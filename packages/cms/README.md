# @discontent/cms

The core CMS engine providing generic, reusable primitives for managing file-backed content. All functionality is driven by a `ContentTypeConfig` that consumers define to describe their specific content type.

## ContentTypeConfig

`ContentTypeConfig<TData, TIndexValue, TKey>` is the central abstraction. It describes how a content type is stored, indexed, and referenced:

```ts
interface ContentTypeConfig<TData, TIndexValue, TKey extends Key> {
  contentType: string; // identifier, e.g. "recipes"
  dataDirectory: string; // subdirectory for data files
  indexDirectory: string; // subdirectory for the LMDB index
  dataFilename: string; // filename for each content item, e.g. "recipe.json"
  buildIndexValue(data: TData): TIndexValue;
  buildIndexKey(slug: string, data: TData): TKey;
  createDefaultSlug?(data: TData): string;
  uploadsDirectory?: string;
  referencedBy?: ReferenceSpec[]; // other types that reference this one by slug
  references?: ReferenceDeclaration[]; // types this one borrows index-value fields from
  paginationIndexes?: PaginationIndexConfig[]; // pre-baked paginated queries over this type
  aggregates?: AggregateConfig[]; // values folded from this type's whole index
  taxonomies?: TaxonomyConfig[]; // index-value fields that are vocabularies (see below)
}
```

`references` and `referencedBy` are the two halves of one edge and must both be declared: the borrowing side names the fields it reads, and the referenced side names the types to rewrite when it is written. Both take the other's config as a **thunk**, because declaring the edge from both sides makes the two modules import each other.

## Taxonomies

A `string[]` field on the index value can be declared a **vocabulary** instead of left as bare strings:

```ts
interface TaxonomyConfig<TIndexValue, TKey extends Key, TItem> {
  name: string; // singular stem: names both derived aggregates
  field: string; // the index-value field holding the raw terms
  version: string; // the site's half of the stored spec version
  slugOf?(term: string): string; // default: @sindresorhus/slugify
  project?(entry: AggregateEntry<TIndexValue, TKey>): TItem; // a by-term row; default { id }
  terms?(): AnyContentTypeConfig; // the vocabulary's term-record type
}

// packages/cms/demo/lib/noteTaxonomy.ts, in full:
export const noteTagTaxonomy: TaxonomyConfig<NoteIndexValue, NoteIndexKey> = {
  name: "tag",
  field: "tags",
  version: "1",
};
```

From that the engine derives **two ordinary aggregates**, appended after whatever the type declares in `aggregates`:

| Derived | Name                    | Value                                                             |
| ------- | ----------------------- | ----------------------------------------------------------------- |
| terms   | `${name}s` → `tags`     | `Array<{ slug, label, count }>`, sorted by slug, first label wins |
| by-term | `by-${name}` → `by-tag` | `Record<slug, { label, items }>`, items newest-first              |

So a taxonomy is a declaration, not a fourth derived kind: `aggregatesOf(config)` is the single derivation, and the fold pass, the cache tags and the ignore list all read it. Term identity is `slugOf(normalizeTerm(label))` — carriers go on storing free-text strings, so nothing on disk changes and two labels that slugify alike merge.

Reads are `readTaxonomyTerms` / `readTaxonomyByTerm` (`taxonomies/read`, Node-safe) and `createCachedTaxonomyReads` (`taxonomies/next/cachedReads`, returning `{ terms, byTerm }`).

### Term records

`createTermContentType({ taxonomy, directory })` returns an ordinary `ContentTypeConfig` giving a vocabulary optional **records** — `term.json` per slug, holding `{ label, date, description?, image?, parent? }` plus anything the site adds. Its one novelty is a self-referencing reference edge: `parent` is a scalar slug, so renaming a parent rewrites its children and each child's index value borrows `parentLabel`. A `tree` aggregate folds `Record<slug, { label, parent?, children, image? }>` from the term index alone.

Records are additive: a term with carriers but no record is still a term, and a record with no carriers still has a page.

## Sub-modules

### `content/`

Core CRUD operations and indexing.

| Export                      | Description                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `createContent(options)`    | Creates a new content item on the filesystem and writes its index entry. Throws `SlugConflictError` if the slug is already taken. |
| `updateContent(options)`    | Updates an existing content item. Handles slug renames, index key changes, and optional upload processing.                        |
| `deleteContent(options)`    | Deletes a content item from the filesystem and removes its index entry.                                                           |
| `readContentFile(options)`  | Reads and returns the data file for a single content item by slug.                                                                |
| `readContentIndex(options)` | Reads paginated entries from the LMDB index. Returns `{ entries, total, more }`. Supports `limit`, `offset`, and `reverse`.       |
| `rebuildIndex(options)`     | Scans all data files and rebuilds the LMDB index from scratch.                                                                    |

All mutation functions accept an optional `author` and `commitMessage` to record a git commit after the change.

### `fs/`

Filesystem helpers.

| Export                        | Description                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `getContentDirectory()`       | Returns the content directory path. Respects `CONTENT_DIRECTORY` env var; falls back to `test-content` in `TEST_MODE`, then `content`. |
| `contentDirectory`            | Pre-resolved content directory path (evaluated at import time).                                                                        |
| `collectFiles(dir, filename)` | Recursively collects all files with a given name under a directory.                                                                    |

### `git/`

Git integration.

| Export                                                      | Description                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `commitChanges(contentDirectory, message, author?, paths?)` | Stages the given paths and creates a git commit. No-ops if the content directory is not a git repo. |
| `directoryIsGitRepo(dir)`                                   | Returns `true` if the directory contains a `.git` folder.                                           |

### `forms/`

Form data parsing.

| Export                            | Description                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parseFormData(schema, formData)` | Validates a `FormData` object against a Zod schema, using lodash `set` for nested field assignment. Returns the parsed data or throws on validation failure. |

### `hooks/`

React hooks.

| Export                 | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `useCurrentTimezone()` | Returns the browser's current IANA timezone string using `Intl.DateTimeFormat`. |

## Key Types

- **`ReferenceSpec`** — Describes a content type that references another by slug. Used by `updateContent` to automatically update references when a slug changes.
- **`UploadSpec`** — Per-field upload specification: a `File`, a `fileImportUrl`, a `clearFile` flag, or an existing filename.
- **`FileUploadData`** — Resolved upload data passed to custom `processUploads` callbacks.

## Part of [Discontent](https://github.com/rogermparent/discontent)
