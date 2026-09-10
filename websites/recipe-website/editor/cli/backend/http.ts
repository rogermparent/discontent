/**
 * The remote backend: the same commands, against a running editor.
 *
 * `createLocalBackend` opens LMDB in this process; this one sends JSON to
 * `/api/*` and lets the server do it. Nothing above the seam changes — no
 * command knows which backend it has, and the result types are the curation
 * layer's own (`backend/types.ts` re-exports them), so a remote `group add`
 * returns the object a local one would.
 *
 * Two things are worth stating about what this deliberately does *not* do.
 *
 * **Reads go over the wire too.** `show`, `list`, `search` and `group show`
 * could read a local content directory while writes went remote, and that would
 * be a trap: the curator would search one corpus and write to another. With
 * `--remote`, the server is the only truth.
 *
 * **`afterWrite` returns nothing.** The local backend warns that a running
 * editor is stale; here the write *went through* that editor, which revalidated
 * in the same request (D9). Silence is the correct report.
 *
 * ## Errors
 *
 * A non-2xx body is the CLI's own `{error: {code, message, …}}` — the routes
 * answer through `errorResponse`, which serializes `toErrorObject` — so it is
 * rehydrated into a `CurationError` with the same code. That is what keeps
 * `exitCodeFor` answering 2 for a remote slug conflict, and it is why
 * `"unauthenticated"` had to join `CurationErrorCode`.
 */
import {
  CurationError,
  type CurationErrorCode,
  type CurationErrorDetails,
} from "../../controller/curation/errors";
import type {
  CuratorBackend,
  DeleteResult,
  GroupDetail,
  GroupListResult,
  GroupWriteResult,
  ImportOptions,
  ImportResult,
  RecipeDetail,
  RecipeListResult,
  RecipeWriteResult,
  ReindexResult,
  SearchResult,
} from "./types";

export interface HttpBackendOptions {
  baseUrl: string;
  token?: string;
}

type Query = Record<string, string | number | boolean | undefined>;

interface CallOptions {
  body?: unknown;
  query?: Query;
}

/**
 * `statusFor` read backwards, for a body that is not one of ours.
 *
 * The curation routes all answer through `errorResponse`, so their bodies carry
 * the code already. `/api/recipe/<slug>`'s GET predates them and answers
 * `{error: "Recipe not found"}`, and a proxy in front of the editor answers
 * whatever it likes — so the status is the fallback signal, and it is a much
 * better one than calling every such failure `internal`.
 */
function codeForStatus(status: number): CurationErrorCode {
  switch (status) {
    case 400:
      return "validation";
    case 401:
    case 403:
      return "unauthenticated";
    case 404:
      return "not_found";
    case 409:
      return "slug_conflict";
    case 422:
      return "unknown_recipe";
    case 502:
      return "import_failed";
    default:
      return "internal";
  }
}

/** The shape a curation route's failure arrives in; anything else by status. */
function rehydrate(status: number, statusText: string, body: unknown): Error {
  const error = (body as { error?: unknown } | null)?.error;
  if (
    error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const source = error as Record<string, unknown>;
    const details: CurationErrorDetails = {};
    if (typeof source.slug === "string") details.slug = source.slug;
    if (Array.isArray(source.issues)) {
      details.issues = source.issues as CurationErrorDetails["issues"];
    }
    if (Array.isArray(source.recipes)) {
      details.recipes = source.recipes as string[];
    }
    return new CurationError(
      source.code as CurationErrorCode,
      source.message as string,
      details,
    );
  }
  const message =
    typeof error === "string"
      ? error
      : `The editor answered ${status} ${statusText}`.trim();
  return new CurationError(codeForStatus(status), message);
}

export function createHttpBackend({
  baseUrl,
  token,
}: HttpBackendOptions): CuratorBackend {
  const root = baseUrl.replace(/\/+$/, "");

  async function call<TResult>(
    method: string,
    path: string,
    { body, query }: CallOptions = {},
  ): Promise<TResult> {
    const url = new URL(`${root}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      /*
       * A refused connection is by far the most common remote failure — a typo
       * in `--remote`, or an editor that is not running — and the message has to
       * name the URL, because `fetch failed` on its own is unactionable.
       */
      throw new CurationError(
        "internal",
        `Could not reach ${url.origin}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.trim()) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = undefined;
      }
    }

    if (!response.ok) {
      throw rehydrate(response.status, response.statusText, parsed);
    }
    return parsed as TResult;
  }

  return {
    kind: "http",

    importRecipe(url: string, options: ImportOptions = {}) {
      return call<ImportResult>("POST", "/api/import", {
        body: { url, ...options },
      });
    },
    createRecipe(raw, options = {}) {
      return call<RecipeWriteResult>("POST", "/api/recipes", {
        body: raw,
        query: { overwrite: options.overwrite ? 1 : undefined },
      });
    },
    updateRecipe(slug, raw) {
      return call<RecipeWriteResult>(
        "PUT",
        `/api/recipe/${encodeURIComponent(slug)}`,
        { body: raw },
      );
    },
    /**
     * `GET /api/recipe/<slug>` returns the *record*, not the envelope.
     *
     * That route predates this phase — `RecipeSelect` fetches it to fill the
     * featured-recipe picker — and its shape is not this backend's to change,
     * so the envelope is rebuilt here. `path` is the only field that cannot
     * come across honestly: a remote caller has no filesystem, so it carries
     * the resource the record was read from instead of a server-side path.
     */
    async getRecipe(slug) {
      const recipe = await call<RecipeDetail["recipe"]>(
        "GET",
        `/api/recipe/${encodeURIComponent(slug)}`,
      );
      return {
        slug,
        path: `${root}/api/recipe/${encodeURIComponent(slug)}`,
        url: `/recipe/${slug}`,
        recipe,
      };
    },
    listRecipes(options = {}) {
      return call<RecipeListResult>("GET", "/api/recipes", { query: options });
    },
    searchRecipes(query, options = {}) {
      return call<SearchResult>("GET", "/api/recipes", {
        query: { q: query, ...options },
      });
    },
    deleteRecipe(slug) {
      return call<DeleteResult>(
        "DELETE",
        `/api/recipe/${encodeURIComponent(slug)}`,
      );
    },

    createGroup(raw, options = {}) {
      return call<GroupWriteResult>("POST", "/api/groups", {
        body: raw,
        query: { force: options.force ? 1 : undefined },
      });
    },
    addGroupItem(group, recipe, options = {}) {
      const { force, ...item } = options;
      return call<GroupWriteResult>(
        "POST",
        `/api/group/${encodeURIComponent(group)}/items`,
        { body: { recipe, ...item }, query: { force: force ? 1 : undefined } },
      );
    },
    removeGroupItem(group, recipe) {
      return call<GroupWriteResult>(
        "DELETE",
        `/api/group/${encodeURIComponent(group)}/items/${encodeURIComponent(recipe)}`,
      );
    },
    setGroupItems(group, items, options = {}) {
      return call<GroupWriteResult>(
        "PUT",
        `/api/group/${encodeURIComponent(group)}`,
        { body: { items }, query: { force: options.force ? 1 : undefined } },
      );
    },
    getGroup(slug) {
      return call<GroupDetail>("GET", `/api/group/${encodeURIComponent(slug)}`);
    },
    listGroups(options = {}) {
      return call<GroupListResult>("GET", "/api/groups", { query: options });
    },
    deleteGroup(slug) {
      return call<DeleteResult>(
        "DELETE",
        `/api/group/${encodeURIComponent(slug)}`,
      );
    },

    reindex(contentType) {
      return call<ReindexResult>("POST", "/api/reindex", {
        body: contentType ? { contentType } : {},
      });
    },

    /* The server revalidated in the same request; there is nothing to report. */
    async afterWrite() {
      return undefined;
    },

    /* No LMDB environment was opened in this process. */
    async close() {},
  };
}
