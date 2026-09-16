/**
 * One error vocabulary for every transport.
 *
 * The CLI turns these into `{"error": {...}}` on stdout and an exit code; 22d's
 * routes will turn the same codes into status codes. Keeping the mapping in one
 * place is what stops the two from drifting — and is why `toErrorObject` also
 * understands the two error shapes that arrive from *below* this layer, the
 * engine's `SlugConflictError` and zod's `ZodError`, rather than making every
 * call site wrap them.
 */
import { SlugConflictError } from "@discontent/cms/content/createContent";
import { z } from "zod";

export { SlugConflictError };

export type CurationErrorCode =
  | "not_found"
  | "slug_conflict"
  | "validation"
  | "unknown_recipe"
  /** A slug that named no group: featuring one, and from 23c a group item. */
  | "unknown_group"
  /**
   * A sub-group item that would put a group inside itself (23c/D17).
   *
   * Never forceable, unlike `unknown_recipe` / `unknown_group`: a dangling slug
   * is a state the pages render, while a cycle is a shape the render walk
   * cannot terminate on.
   */
  | "group_cycle"
  | "import_failed"
  | "no_git_identity"
  /**
   * Only ever produced over HTTP, and listed here anyway: the HTTP backend
   * rehydrates a server error body into a `CurationError`, so a code this union
   * did not know would be widened away to `internal` and a 401 would print as a
   * mystery. No local path throws it.
   */
  | "unauthenticated"
  | "usage"
  | "internal";

export interface CurationErrorDetails {
  slug?: string;
  issues?: { path: string; message: string }[];
  recipes?: string[];
  groups?: string[];
}

export class CurationError extends Error {
  constructor(
    public readonly code: CurationErrorCode,
    message: string,
    public readonly details: CurationErrorDetails = {},
  ) {
    super(message);
    this.name = "CurationError";
  }
}

export class NotFoundError extends CurationError {
  constructor(message: string, slug?: string) {
    super("not_found", message, slug ? { slug } : {});
    this.name = "NotFoundError";
  }
}

export class ValidationError extends CurationError {
  constructor(message: string, issues?: { path: string; message: string }[]) {
    super("validation", message, issues ? { issues } : {});
    this.name = "ValidationError";
  }
}

export class UnknownRecipeError extends CurationError {
  constructor(recipes: string[]) {
    super(
      "unknown_recipe",
      `No recipe at ${recipes.length === 1 ? "slug" : "slugs"}: ${recipes.join(", ")}. Pass --force to add it anyway.`,
      { recipes },
    );
    this.name = "UnknownRecipeError";
  }
}

/**
 * `UnknownRecipeError`'s twin, whose `--force` hint is asked for rather than
 * assumed.
 *
 * Featuring has no force: a feature whose target does not exist renders as an
 * empty card with a borrowed name that was never borrowed, which is not a
 * legitimate state the way a dangling *group item* is (D3). So the default
 * message stops at the fact rather than offering a way past it.
 *
 * A group item naming a missing group *is* the dangling case (23c/T31), and
 * there the hint is the whole answer — so `checkItems` constructs this with
 * `{forceHint: true}` and nothing else does.
 */
export class UnknownGroupError extends CurationError {
  constructor(
    groups: string[],
    { forceHint = false }: { forceHint?: boolean } = {},
  ) {
    super(
      "unknown_group",
      `No group at ${groups.length === 1 ? "slug" : "slugs"}: ${groups.join(", ")}.` +
        (forceHint ? " Pass --force to add it anyway." : ""),
      { groups },
    );
    this.name = "UnknownGroupError";
  }
}

/**
 * A sub-group item that would make a group contain itself (23c/D17).
 *
 * `groups` is the **path**, first and last element the group being written:
 * `["b", "a", "b"]` reads as "b, inside a, inside b". A self-reference is the
 * shortest of them, `["x", "x"]`.
 *
 * There is no `--force`. The other two content failures are forceable because
 * what they describe — a slug that names nothing — is a state every page
 * already renders; a cycle is not a state at all, and the render walk that
 * follows sub-groups for a thumbnail would only be saved from it by the bounds
 * it carries for hand-edited files (T35).
 */
export class GroupCycleError extends CurationError {
  constructor(groups: string[], message?: string) {
    super(
      "group_cycle",
      message ?? `That would put a group inside itself: ${groups.join(" → ")}.`,
      { groups },
    );
    this.name = "GroupCycleError";
  }
}

export class ImportError extends CurationError {
  constructor(message: string) {
    super("import_failed", message);
    this.name = "ImportError";
  }
}

export class NoGitIdentityError extends CurationError {
  constructor(contentDirectory: string) {
    super(
      "no_git_identity",
      `The content repository at ${contentDirectory} has no committer identity. ` +
        `Set one with \`git -C ${contentDirectory} config user.email you@example.com\` ` +
        `(and user.name), or export GIT_COMMITTER_EMAIL.`,
    );
    this.name = "NoGitIdentityError";
  }
}

export class UnauthenticatedError extends CurationError {
  constructor(message = "Authentication required") {
    super("unauthenticated", message);
    this.name = "UnauthenticatedError";
  }
}

export class UsageError extends CurationError {
  constructor(message: string) {
    super("usage", message);
    this.name = "UsageError";
  }
}

export interface ErrorObject {
  error: {
    code: CurationErrorCode;
    message: string;
    slug?: string;
    issues?: { path: string; message: string }[];
    recipes?: string[];
    groups?: string[];
  };
}

/** zod's issue list, flattened to something a terminal and a JSON body agree on. */
export function issuesOf(
  error: z.ZodError,
): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * The single object a failed command prints.
 *
 * Everything unrecognized becomes `internal` rather than leaking a stack: the
 * CLI's contract is "exactly one JSON object on stdout", and an unmapped throw
 * is still an answer.
 */
export function toErrorObject(error: unknown): ErrorObject {
  if (error instanceof SlugConflictError) {
    return {
      error: {
        code: "slug_conflict",
        message: error.message,
        slug: error.slug,
      },
    };
  }
  if (error instanceof CurationError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details.slug ? { slug: error.details.slug } : {}),
        ...(error.details.issues ? { issues: error.details.issues } : {}),
        ...(error.details.recipes ? { recipes: error.details.recipes } : {}),
        ...(error.details.groups ? { groups: error.details.groups } : {}),
      },
    };
  }
  if (error instanceof z.ZodError) {
    return {
      error: {
        code: "validation",
        message: "Invalid input",
        issues: issuesOf(error),
      },
    };
  }
  if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
    return {
      error: {
        code: "not_found",
        message: (error as Error).message,
      },
    };
  }
  return {
    error: {
      code: "internal",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

/**
 * 2 for a slug conflict, 1 for everything else.
 *
 * A conflict is the one failure a caller routinely *plans* for — the curator
 * skill retries with a different slug rather than stopping — so it is worth a
 * code of its own that a shell can branch on without parsing stdout.
 */
export function exitCodeFor(error: unknown): 1 | 2 {
  return toErrorObject(error).error.code === "slug_conflict" ? 2 : 1;
}
