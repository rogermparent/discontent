/**
 * The HTTP half of the error contract, as pure functions.
 *
 * Everything here takes a `Request` or a `URL` and returns a `Response` or a
 * plain value — no Next imports, no engine calls, nothing that reads the
 * filesystem. That is deliberate and it is what makes the status mapping
 * testable: a route file that imports a cached read cannot even be *loaded*
 * under vitest (`unstable_cache` throws outside Next, T17), so the pieces worth
 * pinning have to live somewhere a unit test can reach them.
 *
 * It is inside `controller/curation/` because the mapping belongs with the
 * vocabulary it maps: `statusFor` is exhaustive over `CurationErrorCode`, so
 * adding a code without deciding its status is a type error rather than a
 * silent 500. Only web globals and `./errors` — the D8 allow-list holds.
 */
import {
  ValidationError,
  toErrorObject,
  type CurationErrorCode,
} from "./errors";

/**
 * The status each failure answers with.
 *
 * `unknown_recipe` is 422 rather than 400 because the body was well-formed and
 * the *content* was wrong — a group naming a recipe that does not exist is a
 * legitimate request that this server declines to fulfil without `?force=1`.
 * `import_failed` is 502 for the same reason inverted: the request was fine and
 * an upstream site was not.
 */
export function statusFor(code: CurationErrorCode): number {
  switch (code) {
    case "validation":
    case "usage":
      return 400;
    case "unauthenticated":
      return 401;
    case "not_found":
      return 404;
    case "slug_conflict":
      return 409;
    case "unknown_recipe":
      return 422;
    case "import_failed":
      return 502;
    case "no_git_identity":
    case "internal":
      return 500;
  }
}

/**
 * The body is the CLI's, byte for byte.
 *
 * One vocabulary over both transports is what lets the HTTP backend rehydrate a
 * failure into the same `CurationError` a local run would have thrown, so
 * `exitCodeFor` still answers 2 for a conflict whether the write went through
 * `fetch` or through LMDB.
 */
export function errorResponse(error: unknown): Response {
  const object = toErrorObject(error);
  return Response.json(object, { status: statusFor(object.error.code) });
}

/**
 * A JSON body, or a `ValidationError` naming what was wrong with it.
 *
 * An empty body is its own case rather than `undefined`: `request.json()` on a
 * POST with no body throws a `SyntaxError` whose message varies by runtime, and
 * "no body" is the mistake a caller is most likely to make by hand. The one
 * route where an empty body is legitimate (`/api/reindex`, "all types") passes
 * `optional: true` and gets `undefined` back — a *malformed* body is still a
 * 400 there, which is why it does not read the text itself.
 */
export async function readJsonBody(
  request: Request,
  { optional = false }: { optional?: boolean } = {},
): Promise<unknown> {
  let text: string;
  try {
    text = await request.text();
  } catch (error) {
    throw new ValidationError(
      `Could not read the request body: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!text.trim()) {
    if (optional) return undefined;
    throw new ValidationError(
      "Expected a JSON body, but the request was empty",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ValidationError(
      `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * `?overwrite=1`, `?force=true`, `?force` — all true; absent is false.
 *
 * Generous on purpose. These are flags a human types into a URL bar and an
 * agent writes into a shell one-liner, and the failure mode of being strict is
 * an overwrite that silently did not happen.
 */
export function boolParam(url: URL, name: string): boolean {
  const raw = url.searchParams.get(name);
  if (raw === null) return false;
  if (raw === "") return true;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

/** A positive integer query param, or `undefined` when absent or unparseable. */
export function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.trunc(value);
}
