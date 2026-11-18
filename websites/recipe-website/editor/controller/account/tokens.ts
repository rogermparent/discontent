/**
 * API tokens from the editor (48d, 47h row 11): Account & devices makes,
 * lists and revokes them, as `pnpm create-token` / `revoke-token` do (27b).
 *
 * - **A token is shown once.** `createToken` answers the token string to
 *   its caller and nothing else keeps it: the user file holds its hash
 *   (`src/users`), the list answers rows without hashes, and nothing here
 *   logs or throws with it.
 * - **Scopes are 27b's** (D6): `read` (the GET routes, `inspect`, `git
 *   fetch`, the read-only MCP tools) or `write` (everything).
 * - **No "last used".** The store has none, deliberately (27b D6): stamping
 *   the user file on every request would rewrite — and commit — a file per
 *   API call.
 * - **Committed** (Dd6): the user file is tracked in the content repository
 *   (27b T4), so an uncommitted token would leave the tree dirty and stop
 *   every sync (`dirty_tree`). The change is written and committed under
 *   the repository's write lock, and the sync carries it to the other
 *   editor, which then accepts the token too. An ignored `users/` (or no
 *   repository) is written and not committed.
 *
 * Plain Node, no Next: the account page's actions call it, and vitest does.
 */
import simpleGit from "simple-git";
import { relative } from "node:path";
import {
  assertNoMergeInProgress,
  commitContentChanges,
  directoryIsGitRepo,
} from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import {
  addTokenToUser,
  readUser,
  removeTokensFromUser,
  scopeOf,
  userFilePath,
  type TokenScope,
} from "../../src/users";

export interface TokenView {
  id: string;
  name: string;
  scope: TokenScope;
  createdAt: string;
}

export const TOKEN_NAME_MAX = 60;

export class TokenInputError extends Error {}

/** A token's name: trimmed, 1–60 printable characters, no control characters. */
export function tokenName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new TokenInputError("Give the token a name.");
  if (name.length > TOKEN_NAME_MAX) {
    throw new TokenInputError(
      `Keep the name to ${TOKEN_NAME_MAX} characters or fewer.`,
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new TokenInputError("The name can't hold control characters.");
  }
  return name;
}

export function tokenScope(raw: unknown): TokenScope {
  if (raw === "read" || raw === "write") return raw;
  throw new TokenInputError("Choose what the token can do.");
}

/** The owner's tokens, newest first, without their hashes. */
export async function listTokens(
  contentDirectory: string,
  email: string,
): Promise<TokenView[]> {
  const user = await readUser(contentDirectory, email);
  return (user?.tokens ?? [])
    .map((token) => ({
      id: token.id,
      name: token.name,
      scope: scopeOf(token),
      createdAt: token.createdAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Whether git would ignore the user file (then it is not committed). */
async function ignored(contentDirectory: string, path: string) {
  /*
   * `check-ignore` prints the path when it is ignored and nothing when it is
   * not; its exit status is no use here, since simple-git resolves a quiet
   * exit 1 (27 T3).
   */
  const out = await simpleGit({ baseDir: contentDirectory }).raw([
    "check-ignore",
    "--",
    path,
  ]);
  return String(out).trim().length > 0;
}

async function commitUserFile(
  contentDirectory: string,
  email: string,
  message: string,
) {
  if (!(await directoryIsGitRepo(contentDirectory))) return;
  const path = relative(
    contentDirectory,
    userFilePath(contentDirectory, email),
  );
  if (await ignored(contentDirectory, path)) return;
  await commitContentChanges(
    message,
    { name: email, email },
    [path],
    contentDirectory,
  );
}

/**
 * Make a token for the owner. Answers the token itself — the only time it
 * exists outside the person's hands — and its row.
 */
export async function createToken(
  contentDirectory: string,
  email: string,
  input: { name: unknown; scope: unknown },
): Promise<{ token: string; row: TokenView }> {
  const name = tokenName(input.name);
  const scope = tokenScope(input.scope);
  return withWriteLock(contentDirectory, "add an API token", async () => {
    /* Refused before the file is touched, so a merge never gains a stray change. */
    await assertNoMergeInProgress(contentDirectory);
    const token = await addTokenToUser(contentDirectory, email, name, {
      scope,
    });
    const id = token.split("_")[1];
    const row = (await listTokens(contentDirectory, email)).find(
      (entry) => entry.id === id,
    );
    if (!row) throw new Error("The new token's row wasn't written.");
    await commitUserFile(
      contentDirectory,
      email,
      `Add API token: ${name} (${scope})`,
    );
    return { token, row };
  });
}

/** Revoke one of the owner's tokens by id. Answers its row, or `null` if none had that id. */
export async function revokeToken(
  contentDirectory: string,
  email: string,
  id: unknown,
): Promise<TokenView | null> {
  if (typeof id !== "string" || !/^[0-9a-f]{8}$/.test(id)) return null;
  return withWriteLock(contentDirectory, "revoke an API token", async () => {
    await assertNoMergeInProgress(contentDirectory);
    const removed = await removeTokensFromUser(contentDirectory, email, {
      id,
    });
    const gone = removed[0];
    if (!gone) return null;
    await commitUserFile(
      contentDirectory,
      email,
      `Revoke API token: ${gone.name}`,
    );
    return {
      id: gone.id,
      name: gone.name,
      scope: scopeOf(gone),
      createdAt: gone.createdAt,
    };
  });
}
