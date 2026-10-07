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
 * Revocation is `scripts/revoke-token.ts` (27b), which removes the `{id, …}`
 * object from the record's `tokens` array by id or by name.
 *
 * ## Scopes (27b/D6)
 *
 * A token is `read` or `write`. A row with no `scope` is `write`: every token
 * minted before scopes existed was full-write, and silently demoting them would
 * break the agents holding them. A `read` token passes the GET routes, `inspect`
 * and `git fetch`, and gets 403 `forbidden` from everything that writes; its MCP
 * session lists only the read-only tools.
 *
 * There is deliberately no `lastUsedAt`: the user record lives in the content
 * directory, so stamping it on every request would rewrite (and, for a tracked
 * `users/`, commit) a file per API call.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export type TokenScope = "read" | "write";

export interface ApiToken {
  /** 8 hex characters. Public — it travels in the token and identifies the row. */
  id: string;
  /** `sha256(secret)` as hex. The secret itself is never stored. */
  hash: string;
  name: string;
  createdAt: string;
  /** Absent means `write` — every token before 27b was full-write. */
  scope?: TokenScope;
}

/** Who a token authenticates as, and what it may do. */
export interface TokenIdentity {
  email: string;
  scope: TokenScope;
}

export function scopeOf(token: Pick<ApiToken, "scope">): TokenScope {
  return token.scope === "read" ? "read" : "write";
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
 * The user a bearer token belongs to, and the token's scope — or `null`.
 *
 * A scan over `users/*` rather than an index: this repo's user set is a handful
 * of files, and an index would be a second thing to keep in sync with the
 * records — the exact failure D10 is fixing. The id narrows the work to at most
 * one `timingSafeEqual` per user.
 */
export async function findUserByToken(
  contentDirectory: string,
  token: string,
): Promise<TokenIdentity | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const secretHash = hashSecret(parsed.secret);

  for (const email of await listUserEmails(contentDirectory)) {
    const user = await readUser(contentDirectory, email);
    if (!user?.tokens) continue;
    for (const stored of user.tokens) {
      if (stored.id !== parsed.id) continue;
      if (digestsMatch(stored.hash, secretHash)) {
        return { email: user.email ?? email, scope: scopeOf(stored) };
      }
    }
  }
  return null;
}

/**
 * Remove a user's tokens by id or by name, returning the rows removed.
 *
 * By name removes *every* token with that name — two laptops both called
 * "laptop" are one revocation, which is what someone typing a name means. An
 * empty answer is not an error here; the script decides what to say about it.
 */
export async function removeTokensFromUser(
  contentDirectory: string,
  email: string,
  match: { id?: string; name?: string },
): Promise<ApiToken[]> {
  if (!match.id && !match.name) {
    throw new Error("Name a token to revoke, by id or by name.");
  }
  const user = await readUser(contentDirectory, email);
  if (!user) {
    throw new Error(`No user at ${userFilePath(contentDirectory, email)}.`);
  }
  const matches = (token: ApiToken) =>
    match.id ? token.id === match.id : token.name === match.name;
  const removed = (user.tokens ?? []).filter(matches);
  if (removed.length > 0) {
    user.tokens = (user.tokens ?? []).filter((token) => !matches(token));
    await writeUser(contentDirectory, user);
  }
  return removed;
}

/** Append a token to a user, returning the token string to print once. */
export async function addTokenToUser(
  contentDirectory: string,
  email: string,
  name: string,
  { scope = "write" }: { scope?: TokenScope } = {},
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
    {
      id,
      hash,
      name,
      createdAt: new Date().toISOString(),
      /* Omitted for write, so a write row reads exactly as it always has. */
      ...(scope === "read" ? { scope } : {}),
    },
  ];
  await writeUser(contentDirectory, user);
  return token;
}
