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
    ).toEqual({ email: "admin@nextmail.com", scope: "write" });
    expect(auth).not.toHaveBeenCalled();
  });

  it("is case-insensitive about the scheme", async () => {
    expect(
      await authenticateRequest(
        requestWith({ authorization: `bearer ${token}` }),
        contentDirectory,
      ),
    ).toEqual({ email: "admin@nextmail.com", scope: "write" });
  });

  it("falls back to the session when the token is bad", async () => {
    auth.mockResolvedValue({ user: { email: "someone@example.com" } });
    expect(
      await authenticateRequest(
        requestWith({ authorization: "Bearer rcp_deadbeef_nope" }),
        contentDirectory,
      ),
    ).toEqual({ email: "someone@example.com", scope: "write" });
    expect(auth).toHaveBeenCalled();
  });

  it("falls back to the session when there is no header at all", async () => {
    auth.mockResolvedValue({ user: { email: "someone@example.com" } });
    expect(await authenticateRequest(requestWith(), contentDirectory)).toEqual({
      email: "someone@example.com",
      scope: "write",
    });
  });

  it("answers null when neither credential is present", async () => {
    auth.mockResolvedValue(null);
    expect(
      await authenticateRequest(requestWith(), contentDirectory),
    ).toBeNull();
  });

  it("answers a read token's scope, and a session as write (27b)", async () => {
    const readToken = await addTokenToUser(
      contentDirectory,
      "admin@nextmail.com",
      "reader",
      { scope: "read" },
    );
    expect(
      await authenticateRequest(
        requestWith({ authorization: `Bearer ${readToken}` }),
        contentDirectory,
      ),
    ).toEqual({ email: "admin@nextmail.com", scope: "read" });

    auth.mockResolvedValue({ user: { email: "someone@example.com" } });
    expect(await authenticateRequest(requestWith(), contentDirectory)).toEqual({
      email: "someone@example.com",
      scope: "write",
    });
  });
});

/*
 * 47e: the session cookie writes only from this host's own pages. A bearer
 * token is exempt — a browser never attaches one on another site's behalf.
 */
describe("authenticateRequest and the request's origin (47e)", () => {
  const signedIn = { user: { email: "someone@example.com" } };

  it("refuses a cross-site write on the session cookie", async () => {
    auth.mockResolvedValue(signedIn);
    expect(
      await authenticateRequest(
        requestWith({
          host: "uraninite:3000",
          origin: "http://evil.example",
          "sec-fetch-site": "cross-site",
        }),
        contentDirectory,
      ),
    ).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  it("refuses an Origin from another host when Fetch Metadata is absent", async () => {
    auth.mockResolvedValue(signedIn);
    expect(
      await authenticateRequest(
        requestWith({
          host: "uraninite:3000",
          origin: "http://uraninite:3001",
        }),
        contentDirectory,
      ),
    ).toBeNull();
  });

  it("accepts a same-origin write on the session cookie, on any host", async () => {
    auth.mockResolvedValue(signedIn);
    for (const host of [
      "uraninite:3000",
      "192.168.1.20:3000",
      "127.0.0.1:3019",
    ]) {
      expect(
        await authenticateRequest(
          requestWith({ host, origin: `http://${host}` }),
          contentDirectory,
        ),
      ).toEqual({ email: "someone@example.com", scope: "write" });
      expect(
        await authenticateRequest(
          requestWith({ host, "sec-fetch-site": "same-origin" }),
          contentDirectory,
        ),
      ).toEqual({ email: "someone@example.com", scope: "write" });
    }
  });

  it("lets a bearer token write from anywhere", async () => {
    expect(
      await authenticateRequest(
        requestWith({
          authorization: `Bearer ${token}`,
          origin: "http://evil.example",
          "sec-fetch-site": "cross-site",
        }),
        contentDirectory,
      ),
    ).toEqual({ email: "admin@nextmail.com", scope: "write" });
  });

  it("lets a cross-site GET read the session (reads are not CSRF)", async () => {
    auth.mockResolvedValue(signedIn);
    const request = new Request("http://localhost/api/recipes", {
      headers: {
        origin: "http://evil.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(await authenticateRequest(request, contentDirectory)).toEqual({
      email: "someone@example.com",
      scope: "write",
    });
  });
});
