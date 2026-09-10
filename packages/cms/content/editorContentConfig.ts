import type { ContentFormState } from "../forms/formState";
import type { ContentTypeConfig, UploadSpec } from "./types";
import type { Key } from "lmdb";

export type ContentSuccessConfig = {
  itemBasePath: string;
  listPaths: Array<{ path: string; type?: "page" | "layout" }>;
  redirectTo?: (slug: string) => string;
  /**
   * Trust the pagination tags alone: skip the blanket `revalidatePath` over
   * every list path and `/`.
   *
   * Off by default, so wiring pagination into the write path changes no
   * revalidation behaviour. A content type turns it on once every surface that
   * lists it reads through `createCachedPaginationReads` — otherwise a page
   * built from `readContentIndex` would never be told the corpus moved.
   */
  paginationOnly?: boolean;

  /**
   * Where a dependent content type's item pages live, keyed by its content
   * type — `{ "featured-recipes": "/featured-recipe" }`.
   *
   * A dependent's *detail* page renders borrowed fields too, and nothing
   * invalidates it today: the write path knows which of its items changed, but
   * only the app knows what URL they are served at. Unset everywhere in D1;
   * D2 fills it in for the first content type that borrows.
   */
  dependentItemBasePaths?: Record<string, string>;
};

export interface EditorContentConfig<
  TData,
  TIndexValue,
  TKey extends Key,
  TFormState extends ContentFormState,
  TParsed = Record<string, unknown>,
> {
  contentConfig: ContentTypeConfig<TData, TIndexValue, TKey>;
  successConfig: ContentSuccessConfig;

  parseFormData: (
    formData: FormData,
  ) =>
    | { success: true; parsed: TParsed }
    | { success: false; state: TFormState };

  buildCreateData: (
    parsed: TParsed,
    contentDirectory: string,
  ) => Promise<{ slug: string; data: TData }>;

  buildUpdateData: (
    parsed: TParsed,
    currentSlug: string,
    currentDate: number,
    contentDirectory: string,
  ) => Promise<{ slug: string; data: TData }>;

  buildCreateUploads?: (
    parsed: TParsed,
    contentDirectory: string,
  ) => Promise<Record<string, UploadSpec>>;

  buildUpdateUploads?: (
    parsed: TParsed,
    currentSlug: string,
    contentDirectory: string,
  ) => Promise<Record<string, UploadSpec>>;

  buildCurrentIndexKey: (currentDate: number, currentSlug: string) => TKey;

  extractFormData?: (parsed: TParsed) => TFormState["formData"];

  label: string;

  /**
   * Returns the signed-in author's identity, or null when unauthenticated.
   *
   * Injected rather than imported because auth is app-specific (`@/auth` is a
   * Next path alias resolved per app) — and *required*, not optional, so a new
   * content type cannot accidentally ship an unauthenticated write path. That is
   * exactly what projects-collection did: three "use server" actions with no
   * check at all, callable by anyone who could reach the action endpoint.
   */
  authenticate: () => Promise<string | null>;

  checkSlugConflict?: (
    slug: string,
    contentDirectory: string,
  ) => Promise<boolean>;

  deleteConflictingContent?: (
    slug: string,
    contentDirectory: string,
    email: string,
  ) => Promise<void>;

  deleteSuccessConfig?: ContentSuccessConfig;
}
