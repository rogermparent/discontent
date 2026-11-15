// @vitest-environment node
//
// 47e: the editors' server-action bodies (`packages/auth/next.ts`) — the
// /login form, the footer's Sign In, sign-out and sign out everywhere — with
// `next/headers` faked as the request a browser on some host sends.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  headers: new Headers(),
  jar: new Map<string, { value: string; options?: unknown }>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) =>
      request.jar.has(name)
        ? { name, value: request.jar.get(name)!.value }
        : undefined,
    set: (name: string, value: string, options?: unknown) => {
      request.jar.set(name, { value, options });
    },
    delete: (name: string) => {
      request.jar.delete(name);
    },
  }),
}));

import { redirects, resetRedirects } from "./stub_navigation.js";
import { createEditorAuth, type EditorAuth } from "../packages/auth/config";
import {
  SIGN_IN_FAILED,
  WRONG_CREDENTIALS,
  createNextAuthHelpers,
  refererPath,
} from "../packages/auth/next";
import {
  closeAuthStorages,
  lmdbSecondaryStorage,
} from "../packages/auth/storage";

const FIXTURE_HASH =
  "$2b$10$82q8wy6VC18Xf8RlauuFluLOxHZJrnmTCwJuBUJX.j9AuxZpTYCma";

let root: string;
let usersDir: string;
let editor: EditorAuth;
let helpers: ReturnType<typeof createNextAuthHelpers>;

/** The browser's request, on `host`, carrying the jar's cookies. */
function browserOn(host: string, extra: Record<string, string> = {}) {
  const cookie = [...request.jar]
    .map(([name, { value }]) => `${name}=${value}`)
    .join("; ");
  request.headers = new Headers({
    host,
    origin: `http://${host}`,
    "sec-fetch-site": "same-origin",
    "x-forwarded-for": "192.168.1.50",
    ...(cookie ? { cookie } : {}),
    ...extra,
  });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "editor-auth-next-"));
  usersDir = join(root, "users");
  await mkdir(usersDir, { recursive: true });
  await writeFile(
    join(usersDir, "admin@nextmail.com"),
    JSON.stringify({ email: "admin@nextmail.com", password: FIXTURE_HASH }),
  );
  editor = createEditorAuth({
    usersDirectory: () => usersDir,
    storageDirectory: join(root, "auth"),
    cookiePrefix: "recipe-editor",
    secret: "a-test-secret-that-is-long-enough-for-better-auth-0123",
    nextCookies: false,
  });
  helpers = createNextAuthHelpers({
    getAuth: () => editor,
    usersDirectory: () => usersDir,
    cookiePrefix: "recipe-editor",
  });
  request.jar.clear();
  resetRedirects();
});

afterEach(async () => {
  await closeAuthStorages();
  await rm(root, { recursive: true, force: true });
});

async function signInOn(host: string, fields: Record<string, string> = {}) {
  browserOn(host);
  return helpers.signInWithPassword(
    {},
    form({
      email: "admin@nextmail.com",
      password: "password",
      redirectTo: "/settings",
      ...fields,
    }),
  );
}

describe("the /login action", () => {
  it.each([
    "127.0.0.1:3019",
    "localhost:3019",
    "uraninite:3000",
    "10.0.0.5:3000",
  ])("signs in on %s and goes back to a path, not a URL", async (host) => {
    expect(await signInOn(host)).toBeUndefined();
    expect(redirects).toEqual(["/settings"]);
    expect(request.jar.has("recipe-editor.session_token")).toBe(true);
    browserOn(host);
    expect((await helpers.auth())?.user.email).toBe("admin@nextmail.com");
  });

  it("refuses an off-host redirectTo and goes home instead", async () => {
    await signInOn("uraninite:3000", { redirectTo: "http://evil.example/" });
    expect(redirects).toEqual(["/"]);
    resetRedirects();
    request.jar.clear();
    await signInOn("uraninite:3000", { redirectTo: "//evil.example" });
    expect(redirects).toEqual(["/"]);
  });

  it("says one plain thing for a wrong password or an unknown email", async () => {
    const wrong = await signInOn("uraninite:3000", { password: "nope" });
    const unknown = await signInOn("uraninite:3000", {
      email: "who@example.com",
    });
    expect(wrong).toEqual({
      error: WRONG_CREDENTIALS,
      email: "admin@nextmail.com",
    });
    expect(unknown?.error).toBe(WRONG_CREDENTIALS);
    expect(redirects).toEqual([]);
    expect(request.jar.size).toBe(0);
  });

  it("asks for both fields before trying", async () => {
    browserOn("uraninite:3000");
    expect(
      await helpers.signInWithPassword({}, form({ email: "", password: "" })),
    ).toEqual({ error: "Enter your email and password.", email: "" });
  });

  it("says when the limiter has tripped", async () => {
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await signInOn("uraninite:3000", { password: "guess" });
    }
    expect(last?.error).toMatch(/Too many sign-in attempts/);
  });

  it("remembers the device only when asked", async () => {
    await signInOn("uraninite:3000", { remember: "on" });
    const remembered = request.jar.get("recipe-editor.session_token")
      ?.options as {
      maxAge?: number;
    };
    expect(remembered.maxAge).toBe(90 * 86_400);
    request.jar.clear();
    await signInOn("uraninite:3000");
    const browserSession = request.jar.get("recipe-editor.session_token")
      ?.options as { maxAge?: number };
    expect(browserSession.maxAge).toBeUndefined();
  });
});

describe("the per-account and overall limits (De5)", () => {
  /** A sign-in from `ip`, as a client that sets its own X-Forwarded-For. */
  async function attemptFrom(ip: string, fields: Record<string, string> = {}) {
    browserOn("uraninite:3000", { "x-forwarded-for": ip });
    return helpers.signInWithPassword(
      {},
      form({
        email: "admin@nextmail.com",
        password: "guess",
        redirectTo: "/settings",
        ...fields,
      }),
    );
  }

  it("trips the account's limit however X-Forwarded-For rotates", async () => {
    const results = [];
    for (let i = 0; i < 11; i += 1) {
      results.push(await attemptFrom(`10.9.${i}.1`));
    }
    expect(results.slice(0, 10).map((r) => r?.error)).toEqual(
      Array(10).fill(WRONG_CREDENTIALS),
    );
    expect(results[10]?.error).toMatch(
      /^Too many sign-in attempts\. Try again in 15 minutes\.$/,
    );
    /* The right password from a fresh address is refused too, for now. */
    expect(
      (await attemptFrom("10.9.99.1", { password: "password" }))?.error,
    ).toMatch(/Too many sign-in attempts/);
    expect(request.jar.size).toBe(0);
    /* Another account is not this one's limit. */
    expect(
      (await attemptFrom("10.9.100.1", { email: "who@example.com" }))?.error,
    ).toBe(WRONG_CREDENTIALS);
  });

  it("counts the account case-blind", async () => {
    for (let i = 0; i < 10; i += 1) {
      await attemptFrom(`10.8.${i}.1`, {
        email: i % 2 ? "ADMIN@nextmail.com" : "admin@NEXTMAIL.com",
      });
    }
    expect((await attemptFrom("10.8.50.1"))?.error).toMatch(
      /Too many sign-in attempts/,
    );
  });

  it("starts the account's window again after a successful sign-in", async () => {
    for (let i = 0; i < 9; i += 1) await attemptFrom(`10.7.${i}.1`);
    expect(
      await attemptFrom("10.7.9.1", { password: "password" }),
    ).toBeUndefined();
    expect(redirects).toEqual(["/settings"]);
    request.jar.clear();
    for (let i = 0; i < 10; i += 1) {
      expect((await attemptFrom(`10.7.${20 + i}.1`))?.error).toBe(
        WRONG_CREDENTIALS,
      );
    }
    expect((await attemptFrom("10.7.40.1"))?.error).toMatch(
      /Too many sign-in attempts/,
    );
  });

  it("has an overall ceiling across accounts and addresses", async () => {
    editor = createEditorAuth({
      usersDirectory: () => usersDir,
      storageDirectory: join(root, "auth"),
      cookiePrefix: "recipe-editor",
      secret: "a-test-secret-that-is-long-enough-for-better-auth-0123",
      nextCookies: false,
      globalSignInRate: { window: 60, max: 3 },
    });
    const errors = [];
    for (let i = 0; i < 4; i += 1) {
      errors.push(
        (await attemptFrom(`10.6.${i}.1`, { email: `user${i}@example.com` }))
          ?.error,
      );
    }
    expect(errors.slice(0, 3)).toEqual(Array(3).fill(WRONG_CREDENTIALS));
    expect(errors[3]).toMatch(
      /^Too many sign-in attempts\. Try again in \d+ seconds\.$/,
    );
  });
});

describe("a sign-in that fails for another reason", () => {
  it("does not call a session-store failure a wrong password", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = editor;
    editor = {
      ...real,
      auth: {
        ...real.auth,
        handler: async () =>
          Response.json(
            {
              code: "FAILED_TO_CREATE_SESSION",
              message: "Failed to create session",
            },
            { status: 401 },
          ),
      },
    };
    expect(await signInOn("uraninite:3000")).toEqual({
      error: SIGN_IN_FAILED,
      email: "admin@nextmail.com",
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringMatching(/401 FAILED_TO_CREATE_SESSION/),
      expect.anything(),
    );
    expect(redirects).toEqual([]);
    logged.mockRestore();
  });

  it("says so when the store cannot write a session", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = lmdbSecondaryStorage(join(root, "auth"));
    editor = createEditorAuth({
      usersDirectory: () => usersDir,
      storageDirectory: join(root, "auth"),
      cookiePrefix: "recipe-editor",
      secret: "a-test-secret-that-is-long-enough-for-better-auth-0123",
      nextCookies: false,
      storage: {
        ...store,
        async set() {
          throw new Error("MDB_MAP_FULL");
        },
      },
    });
    const result = await signInOn("uraninite:3000");
    expect(result?.error).toBe(SIGN_IN_FAILED);
    expect(result?.error).not.toBe(WRONG_CREDENTIALS);
    expect(redirects).toEqual([]);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("sign-out", () => {
  it("signs this browser out and goes back to the page it was on", async () => {
    await signInOn("uraninite:3000");
    resetRedirects();
    browserOn("uraninite:3000", {
      referer: "http://uraninite:3000/recipe/pie",
    });
    await helpers.signOut();
    expect(redirects).toEqual(["/recipe/pie"]);
    expect(request.jar.has("recipe-editor.session_token")).toBe(false);
    browserOn("uraninite:3000");
    expect(await helpers.auth()).toBeNull();
  });

  it("ignores a Referer from another host", () => {
    expect(
      refererPath(
        new Headers({
          host: "uraninite:3000",
          referer: "http://evil.example/x",
        }),
      ),
    ).toBeUndefined();
    expect(
      refererPath(
        new Headers({
          host: "uraninite:3000",
          referer: "http://uraninite:3000/a?b=1",
        }),
      ),
    ).toBe("/a?b=1");
  });

  it("everywhere: ends the other device's session too, then /login", async () => {
    await signInOn("192.168.1.20:3000");
    const phone = new Map(request.jar);
    request.jar.clear();
    await signInOn("localhost:3019");
    resetRedirects();

    browserOn("localhost:3019");
    await helpers.signOutEverywhere();
    expect(redirects).toEqual(["/login?signedOut=everywhere"]);
    browserOn("localhost:3019");
    expect(await helpers.auth()).toBeNull();

    request.jar.clear();
    for (const [name, cookie] of phone) request.jar.set(name, cookie);
    browserOn("192.168.1.20:3000");
    expect(await helpers.auth()).toBeNull();
  });
});

describe("the footer's Sign In", () => {
  it("goes to /login with this page as redirectTo", async () => {
    browserOn("uraninite:3000", {
      referer: "http://uraninite:3000/tags/pie?view=board",
    });
    await helpers.startSignIn();
    expect(redirects).toEqual([
      "/login?redirectTo=%2Ftags%2Fpie%3Fview%3Dboard",
    ]);
  });
});

describe("auth()", () => {
  it("is null for a guest without touching the store", async () => {
    browserOn("uraninite:3000");
    expect(await helpers.auth()).toBeNull();
  });

  it("is null once the user file is gone", async () => {
    await signInOn("uraninite:3000");
    await rm(join(usersDir, "admin@nextmail.com"));
    browserOn("uraninite:3000");
    expect(await helpers.auth()).toBeNull();
  });
});
