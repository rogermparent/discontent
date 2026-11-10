// @vitest-environment node
//
// 47e: the editors' sign-in on Better Auth (`packages/auth`).
//
// The real Better Auth instance, over a temp users directory and a temp LMDB
// session store, driven the way the editors drive it: sign-in through
// `auth.handler` with a request built from the `Host` header, the session
// through `auth.api.getSession({headers})`.

import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BROWSER_SESSION_SERVER_SECONDS,
  PINNING_ENV,
  REMEMBER_ME_SECONDS,
  createEditorAuth,
  type EditorAuth,
} from "../packages/auth/config";
import { usersDirectoryAdapter } from "../packages/auth/adapter";
import { isSameOriginRequest } from "../packages/auth/origin";
import { hashPassword, verifyPassword } from "../packages/auth/password";
import { loginPath, safeRedirectPath } from "../packages/auth/redirect";
import { authRequest, requestOrigin } from "../packages/auth/request";
import {
  closeAuthStorages,
  lmdbSecondaryStorage,
} from "../packages/auth/storage";

/* `password`, as the Playwright fixture user has it (bcrypt, cost 10). */
const FIXTURE_HASH =
  "$2b$10$82q8wy6VC18Xf8RlauuFluLOxHZJrnmTCwJuBUJX.j9AuxZpTYCma";
const SECRET = "a-test-secret-that-is-long-enough-for-better-auth-0123";

let root: string;
let usersDir: string;
let editor: EditorAuth;

function makeAuth(
  overrides: Partial<Parameters<typeof createEditorAuth>[0]> = {},
) {
  return createEditorAuth({
    usersDirectory: () => usersDir,
    storageDirectory: join(root, "settings", "auth"),
    cookiePrefix: "recipe-editor",
    secret: SECRET,
    nextCookies: false,
    ...overrides,
  });
}

async function writeUserFile(name: string, record: unknown) {
  await writeFile(join(usersDir, name), JSON.stringify(record));
}

/** A browser's sign-in POST, as `authRequest` builds it for `host`. */
function signInRequest(
  host: string,
  body: Record<string, unknown>,
  extra: Record<string, string> = {},
): Request {
  const headers = new Headers({
    host,
    origin: `http://${host}`,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "x-forwarded-for": "192.168.1.50",
    ...extra,
  });
  const request = authRequest(headers, "/sign-in/email", body);
  if (!request) throw new Error("no request");
  return request;
}

function sessionCookie(response: Response): string {
  const line = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("recipe-editor.session_token="));
  if (!line) throw new Error("no session cookie");
  return line;
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

async function sessionFor(instance: EditorAuth, cookie: string) {
  return instance.auth.api.getSession({
    headers: new Headers({ cookie, host: "localhost:3019" }),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "editor-auth-"));
  usersDir = join(root, "content", "users");
  await mkdir(usersDir, { recursive: true });
  editor = makeAuth();
});

afterEach(async () => {
  await closeAuthStorages();
  await rm(root, { recursive: true, force: true });
});

describe("passwords (bcrypt, as before)", () => {
  it("verifies the existing hashes and refuses a wrong password", async () => {
    expect(
      await verifyPassword({ hash: FIXTURE_HASH, password: "password" }),
    ).toBe(true);
    expect(
      await verifyPassword({ hash: FIXTURE_HASH, password: "Password" }),
    ).toBe(false);
  });

  it("answers false, not a throw, for a missing or malformed hash", async () => {
    expect(await verifyPassword({ hash: undefined, password: "x" })).toBe(
      false,
    );
    expect(await verifyPassword({ hash: "not-bcrypt", password: "x" })).toBe(
      false,
    );
  });

  it("hashes in the shape create-user writes", async () => {
    const hash = await hashPassword("hunter22");
    expect(hash).toMatch(/^\$2b\$10\$/);
    expect(await bcrypt.compare("hunter22", hash)).toBe(true);
  });
});

describe("the users-directory adapter", () => {
  it("reads the old file shape and signs in with it", async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
    const response = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "admin@nextmail.com",
        password: "password",
      }),
    );
    expect(response.status).toBe(200);
    const session = await sessionFor(editor, cookieHeader(response));
    expect(session?.user.id).toBe("admin@nextmail.com");
    expect(session?.user.email).toBe("admin@nextmail.com");
  });

  it("never rewrites the user file: its API tokens survive a sign-in", async () => {
    const record = {
      email: "owner@example.com",
      password: FIXTURE_HASH,
      createdAt: "2026-09-01T00:00:00.000Z",
      tokens: [
        {
          id: "c624dc6c",
          hash: "ab".repeat(32),
          name: "pi-deploy",
          createdAt: "2026-10-07",
        },
        {
          id: "0badf00d",
          hash: "cd".repeat(32),
          name: "reader",
          createdAt: "2026-10-08",
          scope: "read",
        },
      ],
    };
    await writeUserFile("owner@example.com", record);
    const before = await readFile(join(usersDir, "owner@example.com"), "utf8");
    const response = await editor.auth.handler(
      signInRequest("uraninite:3000", {
        email: "owner@example.com",
        password: "password",
      }),
    );
    expect(response.status).toBe(200);
    await editor.auth.handler(
      signInRequest("uraninite:3000", {
        email: "owner@example.com",
        password: "wrong-password",
      }),
    );
    expect(await readFile(join(usersDir, "owner@example.com"), "utf8")).toBe(
      before,
    );
  });

  it("finds a user whatever the case of the typed email", async () => {
    await writeUserFile("Roger@Example.com", {
      email: "Roger@Example.com",
      password: FIXTURE_HASH,
    });
    const response = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "roger@example.COM",
        password: "password",
      }),
    );
    expect(response.status).toBe(200);
    const session = await sessionFor(editor, cookieHeader(response));
    expect(session?.user.id).toBe("Roger@Example.com");
  });

  it("answers an unknown email and a wrong password with the same 401", async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
    const unknown = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "nobody@example.com",
        password: "password",
      }),
    );
    const wrong = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "admin@nextmail.com",
        password: "not-it",
      }),
    );
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect((await unknown.json()).code).toBe((await wrong.json()).code);
  });

  it("skips unreadable files and signs nobody in from one without a password", async () => {
    await writeFile(join(usersDir, "broken@example.com"), "{not json");
    await writeUserFile("nopass@example.com", { email: "nopass@example.com" });
    for (const email of ["broken@example.com", "nopass@example.com"]) {
      const response = await editor.auth.handler(
        signInRequest("localhost:3019", { email, password: "password" }),
      );
      expect(response.status).toBe(401);
    }
  });

  it("is read-only: a write is refused, not invented", async () => {
    const adapter = usersDirectoryAdapter({ usersDirectory: () => usersDir })(
      {},
    );
    await expect(
      adapter.create({ model: "user", data: { email: "x@example.com" } }),
    ).rejects.toThrow(/read-only/);
  });
});

describe("a variable that would pin one host", () => {
  it("covers every base-URL variable Better Auth reads", () => {
    expect([...PINNING_ENV].sort()).toEqual(
      [
        "BASE_URL",
        "BETTER_AUTH_URL",
        "NEXT_PUBLIC_BETTER_AUTH_URL",
        "NUXT_PUBLIC_AUTH_URL",
        "NUXT_PUBLIC_BETTER_AUTH_URL",
        "PUBLIC_BETTER_AUTH_URL",
      ].sort(),
    );
  });

  it("is named in a warning at start", () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NUXT_PUBLIC_AUTH_URL", "http://localhost:3000");
    try {
      makeAuth();
      expect(warned).toHaveBeenCalledWith(
        expect.stringMatching(/NUXT_PUBLIC_AUTH_URL is set/),
      );
    } finally {
      vi.unstubAllEnvs();
      warned.mockRestore();
    }
  });
});

describe("any host, one instance (the 47e bug)", () => {
  beforeEach(async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
  });

  it("builds the request's origin from Host, never the bind address", () => {
    expect(requestOrigin(new Headers({ host: "uraninite:3000" }))).toBe(
      "http://uraninite:3000",
    );
    expect(
      requestOrigin(
        new Headers({
          host: "pi.tail1234.ts.net",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://pi.tail1234.ts.net");
    expect(
      requestOrigin(new Headers({ host: "evil.example/path" })),
    ).toBeNull();
    expect(requestOrigin(new Headers())).toBeNull();
  });

  it.each([
    "localhost:3019",
    "127.0.0.1:3019",
    "192.168.1.20:3000",
    "uraninite:3000",
    "uraninite.local:3000",
    "[::1]:3000",
  ])("signs in on %s", async (host) => {
    const response = await editor.auth.handler(
      signInRequest(host, {
        email: "admin@nextmail.com",
        password: "password",
      }),
    );
    expect(response.status).toBe(200);
  });

  it("refuses a sign-in posted from another site", async () => {
    const response = await editor.auth.handler(
      signInRequest(
        "uraninite:3000",
        { email: "admin@nextmail.com", password: "password" },
        { origin: "http://evil.example", "sec-fetch-site": "cross-site" },
      ),
    );
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("refuses a callbackURL to another host", async () => {
    const response = await editor.auth.handler(
      signInRequest("uraninite:3000", {
        email: "admin@nextmail.com",
        password: "password",
        callbackURL: "http://evil.example/steal",
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("redirects stay on this host", () => {
  it.each([
    ["/settings", "/settings"],
    ["/jobs/01ABC?tab=log#steps", "/jobs/01ABC?tab=log#steps"],
    ["/recipes/pie...v2/.hidden", "/recipes/pie...v2/.hidden"],
    ["/search?q=../..", "/search?q=../.."],
    [
      "/new-recipe?import=https%3A%2F%2Fexample.com%2Fpie",
      "/new-recipe?import=https%3A%2F%2Fexample.com%2Fpie",
    ],
  ])("keeps %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/",
    "http://localhost:3000/settings",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "settings",
    "/\u0000x",
    "/login",
    "/login?redirectTo=%2F",
    /* Dot segments: the parser resolves each of these to //evil.com. */
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
    "/%2E//evil.com",
    "/.%2e//evil.com",
    "/.%2F/evil.com",
    "/a/%2e%2e/%2e%2e//evil.com",
    "/./",
    "/settings/..",
  ])("refuses %s", (input) => {
    expect(safeRedirectPath(input, "/")).toBe("/");
  });

  it("refuses a non-string", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(["/a"])).toBe("/");
  });

  it("builds /login links with a safe redirectTo only", () => {
    expect(loginPath("/settings/maintenance")).toBe(
      "/login?redirectTo=%2Fsettings%2Fmaintenance",
    );
    expect(loginPath("https://evil.example")).toBe("/login");
    expect(loginPath()).toBe("/login");
  });
});

describe("Remember this device", () => {
  beforeEach(async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
  });

  it("on: a 90-day cookie and a 90-day session", async () => {
    const response = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "admin@nextmail.com",
        password: "password",
        rememberMe: true,
      }),
    );
    const cookie = sessionCookie(response);
    expect(cookie).toMatch(new RegExp(`Max-Age=${REMEMBER_ME_SECONDS}`, "i"));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    /* Plain http on a LAN host: a Secure cookie would be dropped. */
    expect(cookie).not.toMatch(/Secure/i);
    const session = await sessionFor(editor, cookieHeader(response));
    const days =
      (new Date(session!.session.expiresAt).getTime() - Date.now()) /
      86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);
  });

  it("off: a browser-session cookie and a one-day session", async () => {
    const response = await editor.auth.handler(
      signInRequest("localhost:3019", {
        email: "admin@nextmail.com",
        password: "password",
        rememberMe: false,
      }),
    );
    const cookie = sessionCookie(response);
    expect(cookie).not.toMatch(/Max-Age/i);
    expect(cookie).not.toMatch(/Expires/i);
    const session = await sessionFor(editor, cookieHeader(response));
    const seconds =
      (new Date(session!.session.expiresAt).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(BROWSER_SESSION_SERVER_SECONDS - 60);
    expect(seconds).toBeLessThanOrEqual(BROWSER_SESSION_SERVER_SECONDS);
  });
});

describe("the sign-in rate limiter", () => {
  beforeEach(async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
  });

  it("trips after the limit from one address, and not for another", async () => {
    const limited = makeAuth({ signInRate: { window: 60, max: 3 } });
    const attempt = (ip: string) =>
      limited.auth.handler(
        signInRequest(
          "uraninite:3000",
          { email: "admin@nextmail.com", password: "guess" },
          { "x-forwarded-for": ip },
        ),
      );
    const statuses = [];
    for (let i = 0; i < 4; i += 1)
      statuses.push((await attempt("10.0.0.7")).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
    const blocked = await attempt("10.0.0.7");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect((await attempt("10.0.0.8")).status).toBe(401);
  });

  it("defaults to five a minute", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (
          await editor.auth.handler(
            signInRequest("uraninite:3000", {
              email: "admin@nextmail.com",
              password: "guess",
            }),
          )
        ).status,
      );
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});

describe("sign out everywhere", () => {
  beforeEach(async () => {
    await writeUserFile("admin@nextmail.com", {
      email: "admin@nextmail.com",
      password: FIXTURE_HASH,
    });
    await writeUserFile("other@example.com", {
      email: "other@example.com",
      password: FIXTURE_HASH,
    });
  });

  async function signedIn(email: string, host = "localhost:3019") {
    const response = await editor.auth.handler(
      signInRequest(host, { email, password: "password", rememberMe: true }),
    );
    expect(response.status).toBe(200);
    return cookieHeader(response);
  }

  it("ends every session of the user, this one included, and no one else's", async () => {
    const laptop = await signedIn("admin@nextmail.com", "localhost:3019");
    const phone = await signedIn("admin@nextmail.com", "192.168.1.20:3000");
    const someoneElse = await signedIn("other@example.com");

    await editor.auth.api.revokeSessions({
      headers: new Headers({ cookie: laptop, host: "localhost:3019" }),
    });
    await editor.storage.sweepUserSessions("admin@nextmail.com");

    expect(await sessionFor(editor, laptop)).toBeNull();
    expect(await sessionFor(editor, phone)).toBeNull();
    expect((await sessionFor(editor, someoneElse))?.user.id).toBe(
      "other@example.com",
    );
  });

  it("the sweep ends a session the session list lost track of", async () => {
    const laptop = await signedIn("admin@nextmail.com");
    const phone = await signedIn("admin@nextmail.com");
    /* What Better Auth fixed in 1.7.16: a session missing from the list. */
    await editor.storage.delete("active-sessions-admin@nextmail.com");

    await editor.auth.api.revokeSessions({
      headers: new Headers({ cookie: laptop, host: "localhost:3019" }),
    });
    const swept = await editor.storage.sweepUserSessions("admin@nextmail.com");
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(await sessionFor(editor, laptop)).toBeNull();
    expect(await sessionFor(editor, phone)).toBeNull();
  });

  it("a plain sign-out ends only this browser's session", async () => {
    const laptop = await signedIn("admin@nextmail.com");
    const phone = await signedIn("admin@nextmail.com");
    await editor.auth.api.signOut({
      headers: new Headers({ cookie: laptop, host: "localhost:3019" }),
    });
    expect(await sessionFor(editor, laptop)).toBeNull();
    expect((await sessionFor(editor, phone))?.user.id).toBe(
      "admin@nextmail.com",
    );
  });

  it("sessions survive a fresh instance on the same store (a restart)", async () => {
    const laptop = await signedIn("admin@nextmail.com");
    const restarted = makeAuth();
    expect((await sessionFor(restarted, laptop))?.user.id).toBe(
      "admin@nextmail.com",
    );
  });
});

describe("the LMDB session store", () => {
  it("expires values on their TTL", async () => {
    let now = 1_000_000;
    const store = lmdbSecondaryStorage(join(root, "ttl"), { now: () => now });
    await store.set("a", "1", 10);
    await store.set("b", "2");
    expect(await store.get("a")).toBe("1");
    now += 10_001;
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBe("2");
  });

  it("increments in a fixed window and starts again after it", async () => {
    let now = 5_000_000;
    const store = lmdbSecondaryStorage(join(root, "inc"), { now: () => now });
    expect(await store.increment("k", 60)).toBe(1);
    now += 30_000;
    expect(await store.increment("k", 60)).toBe(2);
    now += 30_001;
    expect(await store.increment("k", 60)).toBe(1);
  });

  it("says when a counter's window ends", async () => {
    let now = 5_000_000;
    const store = lmdbSecondaryStorage(join(root, "hit"), { now: () => now });
    expect(await store.hit("k", 900)).toEqual({
      count: 1,
      resetAt: 5_900_000,
    });
    now += 60_000;
    expect(await store.hit("k", 900)).toEqual({
      count: 2,
      resetAt: 5_900_000,
    });
  });

  it("gets and deletes in one step", async () => {
    const store = lmdbSecondaryStorage(join(root, "gad"));
    await store.set("token", "value", 60);
    expect(await store.getAndDelete("token")).toBe("value");
    expect(await store.get("token")).toBeNull();
    expect(await store.getAndDelete("token")).toBeNull();
  });

  it("reopens when its directory is removed (a test reset, a cleared settings dir)", async () => {
    const path = join(root, "gone");
    const store = lmdbSecondaryStorage(path);
    await store.set("a", "1");
    await rm(path, { recursive: true, force: true });
    expect(await store.get("a")).toBeNull();
    await store.set("b", "2");
    expect(await store.get("b")).toBe("2");
    expect(existsSync(join(path, "data.mdb"))).toBe(true);
  });

  it("prunes expired rows", async () => {
    let now = 9_000_000;
    const store = lmdbSecondaryStorage(join(root, "prune"), { now: () => now });
    await store.set("old", "x", 1);
    await store.set("keep", "y", 3600);
    now += 2_000;
    expect(await store.prune()).toBe(1);
    expect(await store.get("keep")).toBe("y");
  });
});

describe("isSameOriginRequest (API routes on the session cookie)", () => {
  const check = (method: string, headers: Record<string, string>) =>
    isSameOriginRequest({ method, headers: new Headers(headers) });

  it("passes safe methods whatever their origin", () => {
    expect(check("GET", { "sec-fetch-site": "cross-site" })).toBe(true);
    expect(check("HEAD", { origin: "http://evil.example" })).toBe(true);
  });

  it("follows Fetch Metadata when the browser sent it", () => {
    expect(check("POST", { "sec-fetch-site": "same-origin" })).toBe(true);
    expect(check("POST", { "sec-fetch-site": "none" })).toBe(true);
    expect(check("POST", { "sec-fetch-site": "same-site" })).toBe(false);
    expect(check("DELETE", { "sec-fetch-site": "cross-site" })).toBe(false);
  });

  it("otherwise compares Origin's host with Host", () => {
    expect(
      check("PUT", { host: "uraninite:3000", origin: "http://uraninite:3000" }),
    ).toBe(true);
    expect(
      check("PUT", { host: "uraninite:3000", origin: "http://uraninite:3001" }),
    ).toBe(false);
    expect(check("POST", { host: "uraninite:3000", origin: "null" })).toBe(
      false,
    );
  });

  it("passes a non-browser client that sends neither", () => {
    expect(check("POST", { host: "uraninite:3000" })).toBe(true);
  });
});
