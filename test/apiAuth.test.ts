// @vitest-environment node
//
// `authenticateRequest` — the one guard every write route calls.
//
// There is no middleware in this editor (fact 1), so a route that forgot this
// call would be an unauthenticated write path with nothing above it to catch
// the omission. What this file pins is the *precedence*: a valid bearer token
// wins outright, and anything else — absent, malformed, revoked — falls through
// to the session rather than refusing, so a stale token in an agent's
// environment cannot lock out a signed-in browser.
//
// `@/auth` is the recording stub `vitest.config.js` aliases in, reached through
// `controller/actions/shared`, which is the same path the route takes.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authenticateRequest } from "../websites/recipe-website/editor/controller/apiAuth";
import {
  addTokenToUser,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import { auth } from "./stub_auth.js";

let contentDirectory: string;
let token: string;

function requestWith(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/recipes", {
    method: "POST",
    headers,
  });
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "api-auth-"));
  await writeUser(contentDirectory, {
    email: "admin@nextmail.com",
    password: "hashed",
  });
  token = await addTokenToUser(
    contentDirectory,
    "admin@nextmail.com",
    "vitest",
  );
  auth.mockReset();
  auth.mockResolvedValue(null);
});

afterEach(async () => {
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("authenticateRequest", () => {
  it("accepts a valid bearer token without consulting the session", async () => {
    expect(
      await authenticateRequest(
        requestWith({ authorization: `Bearer ${token}` }),
        contentDirectory,
      ),
    ).toBe("admin@nextmail.com");
    expect(auth).not.toHaveBeenCalled();
  });

  it("is case-insensitive about the scheme", async () => {
    expect(
      await authenticateRequest(
        requestWith({ authorization: `bearer ${token}` }),
        contentDirectory,
      ),
    ).toBe("admin@nextmail.com");
  });

  it("falls back to the session when the token is bad", async () => {
    auth.mockResolvedValue({ user: { email: "someone@example.com" } });
    expect(
      await authenticateRequest(
        requestWith({ authorization: "Bearer rcp_deadbeef_nope" }),
        contentDirectory,
      ),
    ).toBe("someone@example.com");
    expect(auth).toHaveBeenCalled();
  });

  it("falls back to the session when there is no header at all", async () => {
    auth.mockResolvedValue({ user: { email: "someone@example.com" } });
    expect(await authenticateRequest(requestWith(), contentDirectory)).toBe(
      "someone@example.com",
    );
  });

  it("answers null when neither credential is present", async () => {
    auth.mockResolvedValue(null);
    expect(
      await authenticateRequest(requestWith(), contentDirectory),
    ).toBeNull();
  });
});
