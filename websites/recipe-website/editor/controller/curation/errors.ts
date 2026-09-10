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
  | "import_failed"
  | "no_git_identity"
  | "usage"
  | "internal";

export interface CurationErrorDetails {
  slug?: string;
  issues?: { path: string; message: string }[];
  recipes?: string[];
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
