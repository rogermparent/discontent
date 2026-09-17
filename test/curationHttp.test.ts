// @vitest-environment node
//
// The transport-shaped half of the error contract.
//
// The routes themselves cannot be loaded here — `recipe/[slug]/route.ts` pulls
// in `unstable_cache`, which throws outside Next (T17) — so the pieces that can
// be wrong *quietly* were factored out to `controller/curation/http.ts` and are
// pinned here: the status a failure answers with, and the body it answers with,
// which is byte-for-byte the CLI's so the HTTP backend can rehydrate it.
//
// Playwright covers the routes; this covers the mapping they all share.

import { describe, expect, it } from "vitest";

import {
  BadRevisionError,
  CurationError,
  DirtyTreeError,
  GitConflictError,
  GroupCycleError,
  NotARepoError,
  NotFoundError,
  SlugConflictError,
  UnauthenticatedError,
  UnknownGroupError,
  UnknownRecipeError,
  ValidationError,
  toErrorObject,
  type CurationErrorCode,
} from "../websites/recipe-website/editor/controller/curation/errors";
import {
  boolParam,
  errorResponse,
  intParam,
  readJsonBody,
  statusFor,
} from "../websites/recipe-website/editor/controller/curation/http";

describe("statusFor", () => {
  it("maps every code in the union", () => {
    const table: Record<CurationErrorCode, number> = {
      validation: 400,
      usage: 400,
      unauthenticated: 401,
      not_found: 404,
      slug_conflict: 409,
      unknown_recipe: 422,
      unknown_group: 422,
      /* 24c, and the correction to D7's draft, which said 404. */
      unknown_term: 422,
      group_cycle: 422,
      import_failed: 502,
      no_git_identity: 500,
      /*
       * The git four (23d/D21). Three conflicts, because each describes the
       * *server's* state refusing a well-formed request, and one 422, because
       * `{hash: "zzz"}` is a well-formed body whose content names no commit.
       */
      not_a_repo: 409,
      dirty_tree: 409,
      git_conflict: 409,
      bad_revision: 422,
      internal: 500,
    };
    for (const [code, status] of Object.entries(table)) {
      expect(statusFor(code as CurationErrorCode)).toBe(status);
    }
  });
});

describe("errorResponse", () => {
  it("gives a slug conflict 409 with the CLI's body", async () => {
    const response = errorResponse(new SlugConflictError("naan"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "slug_conflict",
        message: expect.stringContaining("naan"),
        slug: "naan",
      },
    });
  });

  it("carries zod issues through a 400", async () => {
    const response = errorResponse(
      new ValidationError("Invalid input", [
        { path: "name", message: "A recipe needs a name" },
      ]),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.issues).toEqual([
      { path: "name", message: "A recipe needs a name" },
    ]);
  });

  it("gives an unknown recipe 422 with the offending slugs", async () => {
    const response = errorResponse(new UnknownRecipeError(["ghost"]));
    expect(response.status).toBe(422);
    expect((await response.json()).error.recipes).toEqual(["ghost"]);
  });

  it("gives an unknown group 422 with the offending slugs", async () => {
    /*
     * The T25 chain, end to end: a new code needs a `statusFor` case, an
     * `ErrorObject` field and a `rehydrate` copy, or a remote `feature --group`
     * of a missing group prints as `internal`.
     */
    expect(toErrorObject(new UnknownGroupError(["ghost"]))).toEqual({
      error: {
        code: "unknown_group",
        message: expect.stringContaining("ghost"),
        groups: ["ghost"],
      },
    });

    const response = errorResponse(new UnknownGroupError(["ghost"]));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("unknown_group");
    expect(body.error.groups).toEqual(["ghost"]);
    /* And no `--force` hint: featuring has no force (D5). */
    expect(body.error.message).not.toContain("--force");
  });

  it("gives a group cycle 422 with the path it would have made", async () => {
    /*
     * The other 422 (23c). Same status as `unknown_group` and a different
     * meaning: the body was well-formed and every slug in it exists, and the
     * *shape* is what this server declines to store — which is also why there
     * is no `--force` to offer.
     */
    const response = errorResponse(new GroupCycleError(["b", "a", "b"]));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("group_cycle");
    expect(body.error.groups).toEqual(["b", "a", "b"]);
    expect(body.error.message).not.toContain("--force");
  });

  it("gives each git failure its status and carries no new detail field", async () => {
    /*
     * One case per code (23d). The detail bag is deliberately empty: the hash,
     * the branch and the directory all live in the message, which is what keeps
     * the HTTP backend's `rehydrate` unchanged — a field it did not know to
     * copy would be dropped silently.
     */
    const notARepo = errorResponse(new NotARepoError("/tmp/content"));
    expect(notARepo.status).toBe(409);
    expect(await notARepo.json()).toEqual({
      error: {
        code: "not_a_repo",
        message: expect.stringContaining("/tmp/content"),
      },
    });

    const dirty = errorResponse(
      new DirtyTreeError("commit or discard working changes in /git first."),
    );
    expect(dirty.status).toBe(409);
    expect((await dirty.json()).error.code).toBe("dirty_tree");

    const conflict = errorResponse(
      new GitConflictError(
        "Push rejected — the remote has commits you don't have.",
      ),
    );
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toEqual({
      code: "git_conflict",
      message: expect.stringContaining("Push rejected"),
    });

    const badRevision = errorResponse(
      new BadRevisionError('No commit at "zzz".'),
    );
    expect(badRevision.status).toBe(422);
    expect((await badRevision.json()).error.code).toBe("bad_revision");
  });

  it("gives 401 and 404 their codes", async () => {
    expect(errorResponse(new UnauthenticatedError()).status).toBe(401);
    expect(errorResponse(new NotFoundError("gone", "gone")).status).toBe(404);
  });

  it("turns an unmapped throw into a 500 rather than leaking a stack", async () => {
    const response = errorResponse(new Error("kaboom"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal", message: "kaboom" },
    });
  });

  it("round-trips a CurationError's code", async () => {
    const response = errorResponse(new CurationError("usage", "nope"));
    expect(response.status).toBe(400);
  });
});

function post(body?: string): Request {
  return new Request("http://localhost/api/recipes", {
    method: "POST",
    ...(body === undefined ? {} : { body }),
  });
}

describe("readJsonBody", () => {
  it("parses a JSON object", async () => {
    expect(await readJsonBody(post('{"name":"Naan"}'))).toEqual({
      name: "Naan",
    });
  });

  it("rejects an empty body as a validation error", async () => {
    await expect(readJsonBody(post())).rejects.toBeInstanceOf(ValidationError);
    await expect(readJsonBody(post("   "))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects invalid JSON as a validation error", async () => {
    const error = await readJsonBody(post("{not json")).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(errorResponse(error).status).toBe(400);
  });

  it("treats an empty body as undefined only when told it is optional", async () => {
    /* `/api/reindex`: no body means "all types" … */
    expect(await readJsonBody(post(), { optional: true })).toBeUndefined();
    expect(await readJsonBody(post("  "), { optional: true })).toBeUndefined();
    /* … but a body that is there still has to parse. */
    await expect(
      readJsonBody(post("{not json"), { optional: true }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(
      await readJsonBody(post('{"contentType":"groups"}'), { optional: true }),
    ).toEqual({ contentType: "groups" });
  });
});

describe("boolParam / intParam", () => {
  const url = (search: string) => new URL(`http://localhost/api/x${search}`);

  it("reads a flag the several ways a caller writes one", () => {
    expect(boolParam(url("?overwrite=1"), "overwrite")).toBe(true);
    expect(boolParam(url("?overwrite"), "overwrite")).toBe(true);
    expect(boolParam(url("?overwrite=true"), "overwrite")).toBe(true);
    expect(boolParam(url("?overwrite=0"), "overwrite")).toBe(false);
    expect(boolParam(url("?overwrite=false"), "overwrite")).toBe(false);
    expect(boolParam(url(""), "overwrite")).toBe(false);
  });

  it("reads an integer, and undefined when there is none to read", () => {
    expect(intParam(url("?limit=5"), "limit")).toBe(5);
    expect(intParam(url("?limit=5.7"), "limit")).toBe(5);
    expect(intParam(url(""), "limit")).toBeUndefined();
    expect(intParam(url("?limit="), "limit")).toBeUndefined();
    expect(intParam(url("?limit=many"), "limit")).toBeUndefined();
  });
});
