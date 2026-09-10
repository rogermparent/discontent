// @vitest-environment node
//
// API tokens, on disk (D10).
//
// The whole point of this module is that two things agree about one path:
// `src/auth.ts` reads `<contentDirectory>/users/<email>` with **no extension**,
// and `scripts/create-user.ts` used to write `<email>.json`, so every user it
// created was invisible to sign-in. That is not a bug a type can catch and it
// is not one Playwright would notice either — the fixture user is hand-written
// — so the path assertion is here, spelled out as the literal `resolve` that
// `auth.ts` performs.
//
// The rest is the token contract: a format a caller can recognize, a lookup
// that finds the right user among several, and three rejections that must all
// answer `null` rather than throwing.

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addTokenToUser,
  findUserByToken,
  generateToken,
  hashSecret,
  listUserEmails,
  parseToken,
  readUser,
  userFilePath,
  writeUser,
} from "../websites/recipe-website/editor/src/users";

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "api-tokens-"));
});

afterEach(async () => {
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("userFilePath", () => {
  it("is the bare email under users/, exactly as auth.ts reads it", () => {
    const email = "admin@nextmail.com";
    expect(userFilePath(contentDirectory, email)).toBe(
      resolve(contentDirectory, "users", email),
    );
    expect(userFilePath(contentDirectory, email).endsWith(email)).toBe(true);
    expect(userFilePath(contentDirectory, email)).not.toMatch(/\.json$/);
  });
});

describe("readUser / writeUser / listUserEmails", () => {
  it("round-trips a record and lists it by email", async () => {
    await writeUser(contentDirectory, {
      email: "a@example.com",
      password: "hashed",
    });
    await writeUser(contentDirectory, {
      email: "b@example.com",
      password: "hashed",
    });

    expect((await listUserEmails(contentDirectory)).sort()).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(await readUser(contentDirectory, "a@example.com")).toMatchObject({
      email: "a@example.com",
    });
  });

  it("reads a missing user as null rather than throwing", async () => {
    expect(await readUser(contentDirectory, "nobody@example.com")).toBeNull();
    expect(await listUserEmails(contentDirectory)).toEqual([]);
  });
});

describe("generateToken / parseToken", () => {
  it("round-trips and matches the documented format", () => {
    const { token, id, hash } = generateToken();
    expect(token).toMatch(/^rcp_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);

    const parsed = parseToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(id);
    expect(hashSecret(parsed!.secret)).toBe(hash);
  });

  it("rejects a malformed token", () => {
    expect(parseToken("nope")).toBeNull();
    expect(parseToken("rcp_xyz_short")).toBeNull();
    /* Right shape, wrong id alphabet: the id is hex. */
    expect(parseToken(`rcp_zzzzzzzz_${"a".repeat(43)}`)).toBeNull();
  });
});

describe("findUserByToken", () => {
  it("finds the right user among two", async () => {
    await writeUser(contentDirectory, {
      email: "a@example.com",
      password: "hashed",
    });
    await writeUser(contentDirectory, {
      email: "b@example.com",
      password: "hashed",
    });

    const tokenA = await addTokenToUser(
      contentDirectory,
      "a@example.com",
      "laptop",
    );
    const tokenB = await addTokenToUser(
      contentDirectory,
      "b@example.com",
      "phone",
    );

    expect(await findUserByToken(contentDirectory, tokenA)).toBe(
      "a@example.com",
    );
    expect(await findUserByToken(contentDirectory, tokenB)).toBe(
      "b@example.com",
    );
  });

  it("stores only the hash, and rejects a tampered secret", async () => {
    await writeUser(contentDirectory, {
      email: "a@example.com",
      password: "hashed",
    });
    const token = await addTokenToUser(
      contentDirectory,
      "a@example.com",
      "cli",
    );

    const stored = await readUser(contentDirectory, "a@example.com");
    expect(stored?.tokens).toHaveLength(1);
    expect(stored!.tokens![0]).toMatchObject({ name: "cli" });
    /* The secret half must appear nowhere in the record. */
    expect(JSON.stringify(stored)).not.toContain(parseToken(token)!.secret);

    const { id, secret } = parseToken(token)!;
    const tampered = `rcp_${id}_${secret.slice(0, -1)}${
      secret.endsWith("A") ? "B" : "A"
    }`;
    expect(await findUserByToken(contentDirectory, tampered)).toBeNull();
  });

  it("rejects an unknown id and a malformed token", async () => {
    await writeUser(contentDirectory, {
      email: "a@example.com",
      password: "hashed",
    });
    await addTokenToUser(contentDirectory, "a@example.com", "cli");

    expect(
      await findUserByToken(contentDirectory, `rcp_deadbeef_${"a".repeat(43)}`),
    ).toBeNull();
    expect(await findUserByToken(contentDirectory, "not-a-token")).toBeNull();
    expect(await findUserByToken(contentDirectory, "")).toBeNull();
  });

  it("appends rather than replacing, so an old token keeps working", async () => {
    await writeUser(contentDirectory, {
      email: "a@example.com",
      password: "hashed",
    });
    const first = await addTokenToUser(
      contentDirectory,
      "a@example.com",
      "one",
    );
    const second = await addTokenToUser(
      contentDirectory,
      "a@example.com",
      "two",
    );

    expect(await findUserByToken(contentDirectory, first)).toBe(
      "a@example.com",
    );
    expect(await findUserByToken(contentDirectory, second)).toBe(
      "a@example.com",
    );
    expect(
      (await readUser(contentDirectory, "a@example.com"))?.tokens,
    ).toHaveLength(2);
  });
});
