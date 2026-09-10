/**
 * The `CurationContext` an API route hands to the curation layer — the one
 * place where "a write happened" becomes "these caches are wrong".
 *
 * This is the seam the whole phase turns on. The CLI writes to a content
 * directory and can do nothing about a running editor's caches, which is why it
 * prints a stale-editor hint. A write that arrives *through* the editor is in
 * the process that owns those caches, so it can fire exactly the same
 * invalidation a form submission fires: same `ContentSuccessConfig`, same
 * `revalidateContentWrite`, same tags (D9). No "Settings → Maintenance →
 * Reload" afterwards.
 *
 * Keeping the hook here rather than in each route is what stops the two from
 * drifting: a route that forgot to revalidate would look completely fine and
 * serve stale pages.
 */
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { revalidateContentWrite } from "@discontent/cms/content/genericActions";
import type { CurationContext } from "./curation/context";
import { UnauthenticatedError } from "./curation/errors";
import { successConfigFor } from "./successConfigs";
import { authenticateRequest } from "./apiAuth";

/**
 * A context for an authenticated write.
 *
 * `author` is the caller's own email on both sides, matching what
 * `createGenericActions` does with a session (`{name: email, email}`): the
 * content repo's git identity remains the *committer*, and this is only the
 * `--author` of the commit.
 */
export function curationContextFor(
  email: string,
  contentDirectory = getContentDirectory(),
): CurationContext {
  return {
    contentDirectory,
    author: { name: email, email },
    onWrite: (event) => {
      revalidateContentWrite(
        successConfigFor(
          event.contentType,
          event.kind === "delete" ? "delete" : "write",
        ),
        event.contentType,
        event.result,
        event.slug,
        event.previousSlug,
      );
    },
  };
}

/** A read-only context: no author, no revalidation, no authentication needed. */
export function readContext(
  contentDirectory = getContentDirectory(),
): CurationContext {
  return { contentDirectory };
}

/**
 * Authenticate, or throw the 401 every write route answers with.
 *
 * A throw rather than a returned `Response` so a route body is one `try` with
 * one `errorResponse` catch (T17): the guard, the parse and the curation call
 * all fail the same way.
 */
export async function requireCurationContext(
  request: Request,
): Promise<CurationContext> {
  const contentDirectory = getContentDirectory();
  const email = await authenticateRequest(request, contentDirectory);
  if (!email) {
    throw new UnauthenticatedError(
      "Authentication required: send an API token as `Authorization: Bearer rcp_…`, or sign in.",
    );
  }
  return curationContextFor(email, contentDirectory);
}
