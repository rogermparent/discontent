import { readContentFromFilesystem } from "./filesystem";
import { isArrayRefPath } from "./referencePath";
import type { ContentTypeConfig } from "./types";

/**
 * One content type's declaration that its index value **borrows fields** from
 * a referenced type.
 *
 * This is the inbound half of an edge whose outbound half is `referencedBy`
 * (`ReferenceSpec`). Both halves have to exist: the referenced type needs
 * `referencedBy` to find its dependents on write, and the borrowing type needs
 * this to say what it actually renders.
 *
 * Non-generic on purpose. Naming this config's generics here would put `TKey`
 * in a parameter position and make `ContentTypeConfig` invariant, which breaks
 * every `config as ContentTypeConfig` cast in the package — the same trap
 * `paginationIndexes` documents.
 */
export interface ReferenceDeclaration {
  /**
   * The referenced type's configuration. A thunk for the reason `ReferenceSpec`
   * gives: this edge is declared from both sides, so the two modules import
   * each other.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: () => ContentTypeConfig<any, any, any>;

  /** Field in *this* type's data file holding the referenced item's slug. */
  dataField: string;

  /**
   * Field in this type's index value holding that slug, when it differs from
   * `dataField`. Dependent lookup scans the index for it.
   */
  indexField?: string;

  /**
   * Which fields of the referenced item's data this type's index value is
   * allowed to read.
   *
   * The list is both the payload and the trigger, and it must be exactly the
   * same set for both. If `buildIndexValue` could reach a field that is not
   * declared here, a write changing that field would fire no invalidation —
   * reintroducing the staleness this whole mechanism removes, one layer down.
   */
  fields: readonly string[];
}

/** One resolved edge: what it pointed at, and the declared fields it carries. */
export interface ResolvedReference {
  /** The slug the reference field held. */
  id: string;
  /** Only the declared fields. A field the item does not have is `undefined`. */
  values: Record<string, unknown>;
}

/**
 * Every declared reference of one item, keyed by `dataField`.
 *
 * An entry is `undefined` when the reference is empty or dangling — never an
 * error. A content directory is edited by hand and by git; a reference to an
 * item that has been deleted is an ordinary state, not a broken invariant.
 */
export type ResolvedReferences = Record<string, ResolvedReference | undefined>;

/** What a type with no declarations gets, without allocating per call. */
export const NO_REFERENCES: ResolvedReferences = Object.freeze({});

export interface ReferenceResolver {
  /**
   * Read a referenced item's data file. `undefined` when it is not there.
   */
  read(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: ContentTypeConfig<any, any, any>,
    slug: string,
  ): Promise<Record<string, unknown> | undefined>;

  /** Hand the resolver data the caller already holds, so it reads no file. */
  seed(contentType: string, slug: string, data: unknown): void;

  /** Drop a cached slug — after a delete, or after the item moved. */
  forget(contentType: string, slug: string): void;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Resolution reads the referenced type's **data file**, not its index.
 *
 * Both halves of that choice matter. A by-slug lookup against an index keyed
 * `[date, slug]` is an O(N) scan, while the data file's path derives straight
 * from the slug; and the data file is the source (§2), so resolution is
 * order-independent across a rebuild and cannot serve a value from an index
 * that has not caught up yet. It also avoids opening a second LMDB environment
 * per item inside a loop that already holds one open — `getContentDatabase`
 * opens a fresh one on every call until F1.
 *
 * **One resolver per write operation, never module-global.** A process-wide
 * cache would answer with values from before the last write, which is the
 * exact failure shape of `3cec4e17`: a marker vouching for content that had
 * moved on.
 *
 * @example
 * ```ts
 * const resolver = createReferenceResolver(contentDirectory);
 * resolver.seed(config.contentType, slug, data);
 * const refs = await resolveReferences({ config, data, resolver });
 * ```
 */
export function createReferenceResolver(
  contentDirectory: string,
): ReferenceResolver {
  /*
   * The *promise* is cached, not the value: N dependents of the same target
   * resolve concurrently and must share one read rather than racing N of them.
   */
  const cache = new Map<
    string,
    Promise<Record<string, unknown> | undefined>
  >();
  /*
   * NUL as the separator, because it cannot occur in a content type or a slug,
   * so no pair of them can collide on one key. **Written as the `\0` escape and
   * never as the literal byte** — a source file carrying a raw control character
   * is reported by `file` as `data` rather than as source, and plain `grep`
   * silently matches nothing anywhere in it, which is a trap for every later
   * reader rather than a style preference (§11.4).
   */
  const cacheKey = (contentType: string, slug: string) =>
    `${contentType}\0${slug}`;

  return {
    read(config, slug) {
      const key = cacheKey(config.contentType, slug);
      const cached = cache.get(key);
      if (cached) return cached;

      const pending = readContentFromFilesystem(config, slug, contentDirectory)
        .then((data) => data as Record<string, unknown>)
        .catch((error: unknown) => {
          /*
           * A dangling reference is `undefined` and silent. Anything else is
           * also `undefined` — a content write must not fail because a
           * *different* item is unreadable — but it gets said out loud, unlike
           * the bare `catch` on today's featured-recipe read path.
           */
          if (!isMissing(error)) {
            console.warn(
              `Failed to resolve ${config.contentType}/${slug}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          return undefined;
        });

      cache.set(key, pending);
      return pending;
    },

    seed(contentType, slug, data) {
      cache.set(
        cacheKey(contentType, slug),
        Promise.resolve(data as Record<string, unknown>),
      );
    },

    forget(contentType, slug) {
      cache.delete(cacheKey(contentType, slug));
    },
  };
}

/**
 * Resolve every reference one item declares, for `buildIndexValue` to read.
 *
 * **Exactly one hop.** A borrowed field is never itself resolved: the values
 * handed back come from the referenced item's data file and stop there.
 * Deeper chains would need transitive dependent tracking on write, which the
 * reverse scan does not give cheaply and nothing in this repo wants.
 *
 * @example
 * ```ts
 * const refs = await resolveReferences({ config, data, resolver });
 * const indexValue = config.buildIndexValue(data, refs);
 * ```
 */
export async function resolveReferences(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, any, any>;
  data: unknown;
  resolver: ReferenceResolver;
}): Promise<ResolvedReferences> {
  const { config, data, resolver } = options;
  const declarations = config.references;
  if (!declarations || declarations.length === 0) return NO_REFERENCES;

  const record = data as Record<string, unknown> | undefined;
  const resolved: ResolvedReferences = {};

  await Promise.all(
    declarations.map(async (declaration) => {
      /*
       * An array path (`items[].recipe`, F32) names many slugs and borrows
       * nothing: it exists so renames follow, and its `fields` must be empty.
       * One that declares fields is a config error, said out loud rather than
       * borrowed from the first element.
       */
      if (isArrayRefPath(declaration.dataField)) {
        if (declaration.fields.length > 0) {
          console.warn(
            `${config.contentType}: array reference ${declaration.dataField} cannot borrow fields; declare \`fields: []\``,
          );
        }
        resolved[declaration.dataField] = undefined;
        return;
      }
      const id = record?.[declaration.dataField];
      if (typeof id !== "string" || id === "") {
        resolved[declaration.dataField] = undefined;
        return;
      }

      const referenced = await resolver.read(declaration.config(), id);
      if (!referenced) {
        resolved[declaration.dataField] = undefined;
        return;
      }

      const values: Record<string, unknown> = {};
      for (const field of declaration.fields) {
        values[field] = referenced[field];
      }
      resolved[declaration.dataField] = { id, values };
    }),
  );

  return resolved;
}

/**
 * Which of *this* type's fields some other type borrows.
 *
 * The list necessarily lives on the borrowing side — a type cannot know what
 * its dependents render — so this walks out through `referencedBy` and back in
 * through each dependent's `references`.
 *
 * It is what makes the dependent pass precise in both directions at once: a
 * write whose borrowed fields did not move does no work, and a write that
 * moves one does work even without a rename. An empty list means no dependent
 * borrows anything, which is the state of every production content type until
 * one opts in.
 */
export function borrowedFieldsOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, any, any>,
): string[] {
  const specs = config.referencedBy;
  if (!specs || specs.length === 0) return [];

  const fields = new Set<string>();
  for (const spec of specs) {
    const dependent = spec.config();
    for (const declaration of dependent.references ?? []) {
      if (declaration.config().contentType !== config.contentType) continue;
      for (const field of declaration.fields) fields.add(field);
    }
  }
  return [...fields];
}

/**
 * Whether `dependent` copies any field of `config`'s items into its index.
 *
 * A dependent that declares references to `config` and borrows nothing through
 * any of them (F32's `fields: []` array edges) has nothing a rebuild of
 * `config` could make stale. A dependent with no declaration at all is
 * assumed to borrow, which is how the cascade treated every edge before.
 */
export function borrowsFrom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dependent: ContentTypeConfig<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: ContentTypeConfig<any, any, any>,
): boolean {
  const declarations = (dependent.references ?? []).filter(
    (declaration) => declaration.config().contentType === config.contentType,
  );
  if (declarations.length === 0) return true;
  return declarations.some((declaration) => declaration.fields.length > 0);
}

/**
 * Read one resolved reference's values at a `buildIndexValue` declaration site.
 *
 * `Partial<T>`, not `T`: the referenced item may be gone, and a field the
 * declaration names may be absent from it. Keeping the cast here means each
 * config writes `borrowed<Note>(refs, "note")?.title` rather than its own.
 *
 * @example
 * ```ts
 * buildIndexValue: (data: Bookmark, refs): BookmarkIndexValue => ({
 *   note: data.note,
 *   noteTitle: borrowed<Note>(refs, "note")?.title,
 * }),
 * ```
 */
export function borrowed<T>(
  refs: ResolvedReferences,
  field: string,
): Partial<T> | undefined {
  return refs[field]?.values as Partial<T> | undefined;
}
