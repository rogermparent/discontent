/**
 * User records and API tokens, on disk.
 *
 * There is no user database: a user is one JSON file at
 * `<contentDirectory>/users/<email>` — **no extension**, which is the path
 * `src/auth.ts` has always read and the shape the Playwright fixture
 * (`playwright/fixtures/users/admin@nextmail.com`) ships. `scripts/create-user.ts`
 * wrote `<email>.json` instead and so created users that could never sign in;
 * D10 makes this module the single owner of the path so the two cannot disagree
 * again.
 *
 * **Relative imports only, and nothing from Next.** Three callers live outside
 * the Next runtime: `scripts/create-user.ts`, `scripts/create-token.ts` and
 * Playwright's `support/tasks.ts`. A `@/` alias resolves for none of them, and
 * `getContentDirectory()` is the wrong seat anyway — every function here takes
 * the content directory as an argument, the same rule the curation layer
 * follows (T16).
 *
 * ## Tokens
 *
 * `rcp_<id>_<secret>`: `id` is 8 hex characters (4 random bytes) and `secret` is
 * 32 random bytes as base64url (43 characters). Only the **hash** of the secret
 * is stored, so a leaked user file cannot be replayed as a token, and the id is
 * what makes verification a lookup rather than a hash of every stored token.
 * Comparison is `timingSafeEqual` over the two digests.
 *
 * Revocation in v1 is deleting the `{id, …}` object from the record's `tokens`
 * array by hand; there is no script and the phase doc says so.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface ApiToken {
  /** 8 hex characters. Public — it travels in the token and identifies the row. */
  id: string;
  /** `sha256(secret)` as hex. The secret itself is never stored. */
  hash: string;
  name: string;
  createdAt: string;
}

export interface UserRecord {
  email: string;
  /** bcrypt, written by `scripts/create-user.ts`. */
  password: string;
  createdAt?: string;
  tokens?: ApiToken[];
}

/** `rcp_` + 8 hex + `_` + 43 base64url characters. */
export const TOKEN_PATTERN = /^rcp_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

/** The directory `auth.ts`, the scripts and the Playwright harness all read. */
export function usersDirectory(contentDirectory: string): string {
  return resolve(contentDirectory, "users");
}

/**
 * `<contentDirectory>/users/<email>` — bare, with no `.json`.
 *
 * The one line this module exists for. `auth.ts` does
 * `resolve(getContentDirectory(), "users", email)`, and every writer now goes
 * through here so that stays true.
 */
export function userFilePath(contentDirectory: string, email: string): string {
  return resolve(usersDirectory(contentDirectory), email);
}

export async function readUser(
  contentDirectory: string,
  email: string,
): Promise<UserRecord | null> {
  try {
    const raw = await readFile(userFilePath(contentDirectory, email), "utf8");
    return JSON.parse(raw) as UserRecord;
  } catch {
    /*
     * Absent *and* unparseable both read as "no such user". A record that has
     * been hand-edited into invalid JSON must not authenticate anyone, and a
     * scan over every user (below) must not stop at the first bad file.
     */
    return null;
  }
}

export async function writeUser(
  contentDirectory: string,
  user: UserRecord,
): Promise<string> {
  const filePath = userFilePath(contentDirectory, user.email);
  await mkdir(usersDirectory(contentDirectory), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(user, null, 2)}\n`);
  return filePath;
}

/** Every user file's name, which is its email. Dotfiles and directories skipped. */
export async function listUserEmails(
  contentDirectory: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(usersDirectory(contentDirectory), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name);
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * A fresh token and the row that verifies it.
 *
 * Returned together and stored apart: the caller writes `{id, hash}` onto the
 * user and prints `token` exactly once, because nothing can recover it
 * afterwards.
 */
export function generateToken(): { token: string; id: string; hash: string } {
  const id = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { token: `rcp_${id}_${secret}`, id, hash: hashSecret(secret) };
}

export function parseToken(
  token: string,
): { id: string; secret: string } | null {
  const match = TOKEN_PATTERN.exec(token.trim());
  if (!match) return null;
  return { id: match[1], secret: match[2] };
}

/** Constant-time over two hex digests of equal length. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  /*
   * `timingSafeEqual` throws on a length mismatch rather than returning false,
   * and a stored hash of the wrong length is a corrupt record, not a match.
   */
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The email a bearer token belongs to, or `null`.
 *
 * A scan over `users/*` rather than an index: this repo's user set is a handful
 * of files, and an index would be a second thing to keep in sync with the
 * records — the exact failure D10 is fixing. The id narrows the work to at most
 * one `timingSafeEqual` per user.
 */
export async function findUserByToken(
  contentDirectory: string,
  token: string,
): Promise<string | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const secretHash = hashSecret(parsed.secret);

  for (const email of await listUserEmails(contentDirectory)) {
    const user = await readUser(contentDirectory, email);
    if (!user?.tokens) continue;
    for (const stored of user.tokens) {
      if (stored.id !== parsed.id) continue;
      if (digestsMatch(stored.hash, secretHash)) return user.email ?? email;
    }
  }
  return null;
}

/** Append a token to a user, returning the token string to print once. */
export async function addTokenToUser(
  contentDirectory: string,
  email: string,
  name: string,
): Promise<string> {
  const user = await readUser(contentDirectory, email);
  if (!user) {
    throw new Error(
      `No user at ${userFilePath(contentDirectory, email)} — create one with \`pnpm create-user\` first.`,
    );
  }
  const { token, id, hash } = generateToken();
  user.tokens = [
    ...(user.tokens ?? []),
    { id, hash, name, createdAt: new Date().toISOString() },
  ];
  await writeUser(contentDirectory, user);
  return token;
}
