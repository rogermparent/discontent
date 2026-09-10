import type { Key } from "lmdb";
import { createContent, SlugConflictError } from "./createContent";
import { deleteContent } from "./deleteContent";
import { updateContent } from "./updateContent";
import { getContentDirectory } from "../fs/getContentDirectory";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContentFormState } from "../forms/formState";
import { revalidateAggregateResults } from "../aggregates/next/revalidate";
import { revalidatePaginationResults } from "../pagination/next/revalidate";
import { revalidateItemWrite } from "./next/revalidate";
import type { ContentWriteResult } from "./types";
import type {
  ContentSuccessConfig,
  EditorContentConfig,
} from "./editorContentConfig";

/**
 * What a failed write leaves behind: nothing to invalidate.
 *
 * Frozen and shared — every action below assigns over it rather than mutating
 * it, and a failed write returns before `handleContentSuccess` anyway.
 */
const EMPTY_RESULT: ContentWriteResult = Object.freeze({
  pagination: [],
  dependents: [],
  aggregates: [],
});

/**
 * Everything a successful write has to invalidate — and nothing about where the
 * caller goes next.
 *
 * Split out of `handleContentSuccess` (D9) because a *form* is no longer the
 * only thing that writes. The editor's API routes call the same
 * `controller/curation/*` functions the CLI does and then have to expire the
 * same caches; what they must not do is `redirect`, which throws a
 * `NEXT_REDIRECT` control-flow error that would escape a route handler as a
 * 500. So the revalidation is the reusable half and the redirect stays in the
 * wrapper.
 *
 * Nothing about the form path changes: `handleContentSuccess` is this call
 * followed by the redirect it always did.
 */
export function revalidateContentWrite(
  config: ContentSuccessConfig,
  contentType: string,
  result: ContentWriteResult,
  slug: string,
  currentSlug?: string,
): void {
  if (currentSlug && currentSlug !== slug) {
    revalidatePath(config.itemBasePath + "/" + currentSlug);
  }
  revalidatePath(config.itemBasePath + "/" + slug);

  /*
   * The same two item URLs, as a tag rather than a path — the fifth derived
   * kind (§2). The path calls above reach the item's *own* page; this reaches
   * every surface that renders the item's record from somewhere else, which is
   * a set the write path cannot enumerate as URLs. The homepage hero (at `/`)
   * and `/featured-recipe/<slug>` are both in it.
   *
   * No config seat: an item tag's only coupling is the content type, which is
   * already an argument here.
   */
  revalidateItemWrite(contentType, { slug, previousSlug: currentSlug });

  /*
   * Precise: exactly the pages the write actually changed. A no-op for a
   * content type that declares no indexes, since `pagination` is then empty.
   */
  revalidatePaginationResults(contentType, result.pagination);

  /*
   * The second derived kind, on the same terms. Usually fires nothing: an
   * aggregate reports `changed` only when its value actually moved, which most
   * writes do not do.
   */
  revalidateAggregateResults(contentType, result.aggregates);

  /*
   * The same, for content of *other* types that borrows fields from this item.
   * Its tags are keyed by its own content type, which is exactly why these
   * could not ride along in the list above and why the write path had to start
   * returning them per type.
   *
   * Nothing else fires for a dependent — no redirect (it is not what the user
   * submitted) and no list paths (they are not in this config). Its item pages
   * need `dependentItemBasePaths`, unset in D1.
   */
  for (const dependent of result.dependents) {
    revalidatePaginationResults(dependent.contentType, dependent.pagination);
    revalidateAggregateResults(dependent.contentType, dependent.aggregates);

    /*
     * And the dependent's *records*, which `updateDependents` rewrites on
     * disk when a referenced slug moves. This is the half `dependentItemBasePaths`
     * could never cover on its own: that seat needs the app to declare a URL,
     * while an item tag is keyed by the dependent's own content type, which
     * `DependentWriteResult` already carries. So it fires whether or not the
     * app declared a base path below.
     */
    for (const dependentSlug of dependent.updatedSlugs) {
      revalidateItemWrite(dependent.contentType, { slug: dependentSlug });
    }

    const basePath = config.dependentItemBasePaths?.[dependent.contentType];
    if (!basePath) continue;
    for (const dependentSlug of dependent.updatedSlugs) {
      revalidatePath(basePath + "/" + dependentSlug);
    }
  }

  /*
   * Imprecise, and the default: every list path plus the homepage, because a
   * surface reading through `readContentIndex` has no tag to be told about.
   * `paginationOnly` drops it once every such surface reads through the
   * pagination indexes instead — proven per content type, not assumed here.
   */
  if (!config.paginationOnly) {
    for (const listPath of config.listPaths) {
      revalidatePath(listPath.path, listPath.type);
    }
    revalidatePath("/");
  }
}

function handleContentSuccess(
  config: ContentSuccessConfig,
  contentType: string,
  result: ContentWriteResult,
  slug: string,
  currentSlug?: string,
) {
  revalidateContentWrite(config, contentType, result, slug, currentSlug);

  const redirectTarget = config.redirectTo
    ? config.redirectTo(slug)
    : config.itemBasePath + "/" + slug;
  redirect(redirectTarget);
}

export function createGenericActions<
  TData,
  TIndexValue,
  TKey extends Key,
  TFormState extends ContentFormState,
  TParsed,
>(
  editorConfig: EditorContentConfig<
    TData,
    TIndexValue,
    TKey,
    TFormState,
    TParsed
  >,
) {
  const { contentConfig, successConfig, label } = editorConfig;
  const authenticateUser = editorConfig.authenticate;

  async function create(
    _prevState: TFormState | null,
    formData: FormData,
  ): Promise<TFormState> {
    const email = await authenticateUser();
    if (!email) {
      return { message: "Authentication required" } as TFormState;
    }

    const contentDirectory = getContentDirectory();

    const parseResult = editorConfig.parseFormData(formData);
    if (!parseResult.success) {
      return parseResult.state;
    }

    const { parsed } = parseResult;
    const { slug, data } = await editorConfig.buildCreateData(
      parsed,
      contentDirectory,
    );
    const uploads = editorConfig.buildCreateUploads
      ? await editorConfig.buildCreateUploads(parsed, contentDirectory)
      : undefined;

    let result = EMPTY_RESULT;
    try {
      result = await createContent({
        config: contentConfig,
        slug,
        data,
        contentDirectory,
        author: { name: email, email },
        commitMessage: `Add new ${label}: ${slug}`,
        uploads,
      });
    } catch (e) {
      if (e instanceof SlugConflictError) {
        return {
          message: `A ${label} with slug "${e.slug}" already exists.`,
          slugConflict: e.slug,
          formData: editorConfig.extractFormData?.(parsed),
        } as TFormState;
      }
      return {
        message: `Failed to create ${label}`,
        formData: editorConfig.extractFormData?.(parsed),
      } as TFormState;
    }

    handleContentSuccess(
      successConfig,
      contentConfig.contentType,
      result,
      slug,
    );

    return { message: `${label} creation successful!` } as TFormState;
  }

  async function overwriteCreate(
    _prevState: TFormState | null,
    formData: FormData,
  ): Promise<TFormState> {
    const email = await authenticateUser();
    if (!email) {
      return { message: "Authentication required" } as TFormState;
    }

    const contentDirectory = getContentDirectory();

    const parseResult = editorConfig.parseFormData(formData);
    if (!parseResult.success) {
      return parseResult.state;
    }

    const { parsed } = parseResult;
    const { slug, data } = await editorConfig.buildCreateData(
      parsed,
      contentDirectory,
    );
    const uploads = editorConfig.buildCreateUploads
      ? await editorConfig.buildCreateUploads(parsed, contentDirectory)
      : undefined;

    if (editorConfig.deleteConflictingContent) {
      await editorConfig.deleteConflictingContent(
        slug,
        contentDirectory,
        email,
      );
    }

    let result = EMPTY_RESULT;
    try {
      result = await createContent({
        config: contentConfig,
        slug,
        data,
        contentDirectory,
        author: { name: email, email },
        commitMessage: `Add new ${label}: ${slug}`,
        uploads,
      });
    } catch {
      return {
        message: `Failed to create ${label}`,
        formData: editorConfig.extractFormData?.(parsed),
      } as TFormState;
    }

    handleContentSuccess(
      successConfig,
      contentConfig.contentType,
      result,
      slug,
    );

    return { message: `${label} creation successful!` } as TFormState;
  }

  async function update(
    currentDate: number,
    currentSlug: string,
    _prevState: TFormState | null,
    formData: FormData,
  ): Promise<TFormState> {
    const email = await authenticateUser();
    if (!email) {
      return { message: "Authentication required" } as TFormState;
    }

    const contentDirectory = getContentDirectory();

    const parseResult = editorConfig.parseFormData(formData);
    if (!parseResult.success) {
      return parseResult.state;
    }

    const { parsed } = parseResult;
    const { slug, data } = await editorConfig.buildUpdateData(
      parsed,
      currentSlug,
      currentDate,
      contentDirectory,
    );
    const uploads = editorConfig.buildUpdateUploads
      ? await editorConfig.buildUpdateUploads(
          parsed,
          currentSlug,
          contentDirectory,
        )
      : undefined;

    // Check for slug conflict when renaming
    if (slug !== currentSlug && editorConfig.checkSlugConflict) {
      const hasConflict = await editorConfig.checkSlugConflict(
        slug,
        contentDirectory,
      );
      if (hasConflict) {
        return {
          message: `A ${label} with slug "${slug}" already exists.`,
          slugConflict: slug,
          formData: editorConfig.extractFormData?.(parsed),
        } as TFormState;
      }
    }

    const currentIndexKey = editorConfig.buildCurrentIndexKey(
      currentDate,
      currentSlug,
    );

    let result = EMPTY_RESULT;
    try {
      result = await updateContent({
        config: contentConfig,
        slug,
        currentSlug,
        currentIndexKey,
        data,
        contentDirectory,
        author: { name: email, email },
        commitMessage: `Update ${label}: ${slug}`,
        uploads,
      });
    } catch {
      return {
        message: `Failed to update ${label}`,
        formData: editorConfig.extractFormData?.(parsed),
      } as TFormState;
    }

    handleContentSuccess(
      successConfig,
      contentConfig.contentType,
      result,
      slug,
      currentSlug,
    );

    return { message: `${label} update successful!` } as TFormState;
  }

  async function overwriteUpdate(
    currentDate: number,
    currentSlug: string,
    _prevState: TFormState | null,
    formData: FormData,
  ): Promise<TFormState> {
    const email = await authenticateUser();
    if (!email) {
      return { message: "Authentication required" } as TFormState;
    }

    const contentDirectory = getContentDirectory();

    const parseResult = editorConfig.parseFormData(formData);
    if (!parseResult.success) {
      return parseResult.state;
    }

    const { parsed } = parseResult;
    const { slug, data } = await editorConfig.buildUpdateData(
      parsed,
      currentSlug,
      currentDate,
      contentDirectory,
    );
    const uploads = editorConfig.buildUpdateUploads
      ? await editorConfig.buildUpdateUploads(
          parsed,
          currentSlug,
          contentDirectory,
        )
      : undefined;

    // Delete conflicting content at target slug
    if (slug !== currentSlug && editorConfig.deleteConflictingContent) {
      await editorConfig.deleteConflictingContent(
        slug,
        contentDirectory,
        email,
      );
    }

    const currentIndexKey = editorConfig.buildCurrentIndexKey(
      currentDate,
      currentSlug,
    );

    let result = EMPTY_RESULT;
    try {
      result = await updateContent({
        config: contentConfig,
        slug,
        currentSlug,
        currentIndexKey,
        data,
        contentDirectory,
        author: { name: email, email },
        commitMessage: `Update ${label}: ${slug}`,
        uploads,
      });
    } catch {
      return {
        message: `Failed to update ${label}`,
        formData: editorConfig.extractFormData?.(parsed),
      } as TFormState;
    }

    handleContentSuccess(
      successConfig,
      contentConfig.contentType,
      result,
      slug,
      currentSlug,
    );

    return { message: `${label} update successful!` } as TFormState;
  }

  async function deleteContent_(date: number, slug: string): Promise<void> {
    const email = await authenticateUser();
    if (!email) {
      throw new Error("Authentication required");
    }

    const contentDirectory = getContentDirectory();
    const indexKey = editorConfig.buildCurrentIndexKey(date, slug);

    const result = await deleteContent({
      config: contentConfig,
      slug,
      indexKey,
      contentDirectory,
      author: { name: email, email },
      commitMessage: `Delete ${label}: ${slug}`,
    });

    const deleteConfig = editorConfig.deleteSuccessConfig || successConfig;
    handleContentSuccess(
      deleteConfig,
      contentConfig.contentType,
      result,
      slug,
    );
  }

  return {
    create,
    overwriteCreate,
    update,
    overwriteUpdate,
    delete: deleteContent_,
  };
}
