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
  CurationError,
  NotFoundError,
  SlugConflictError,
  UnauthenticatedError,
  UnknownRecipeError,
  ValidationError,
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
      import_failed: 502,
      no_git_identity: 500,
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
