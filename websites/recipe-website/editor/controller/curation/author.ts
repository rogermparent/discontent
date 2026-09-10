/**
 * Who a write is attributed to, and whether git will accept it at all.
 *
 * Two different identities, and conflating them is the bug this file exists to
 * prevent (fact 8). The engine's `author` becomes `git commit --author`, which
 * says who *wrote* the change; git still requires a **committer**, which comes
 * from `user.name`/`user.email` or the `GIT_COMMITTER_*` environment. A content
 * repository with no configured identity therefore fails *inside* `git commit`
 * — after `createContent` has already written the data file, the index entry
 * and the pagination pages. The content is fine and the commit is missing,
 * which is a confusing state to hand someone.
 *
 * So the local backend preflights the committer before touching disk. Curation
 * functions do not call this themselves: 22d's routes get their identity from
 * the session, and a server has no business failing a request over the CLI's
 * environment.
 */
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import simpleGit from "simple-git";
import type { Author } from "./context";
import { NoGitIdentityError } from "./errors";

/**
 * `"Name <email>"`, or a bare email.
 *
 * The engine's `author` is a `{name, email}` pair and formats it back as
 * `Name <email>`, so a bare email becomes both halves rather than being
 * rejected — `git` accepts `you@example.com <you@example.com>` and the
 * alternative is refusing the shortest thing anyone would type.
 */
export function parseAuthor(value?: string): Author | undefined {
  if (!value) return undefined;
  const angled = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (angled) {
    const email = angled[2].trim();
    const name = angled[1].trim() || email;
    return email ? { name, email } : undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return { name: trimmed, email: trimmed };
}

/** `--author` beats `RECIPE_AUTHOR` beats nothing (the repo's own identity). */
export function resolveAuthor(
  flag?: string,
  env: NodeJS.ProcessEnv = process.env,
): Author | undefined {
  return parseAuthor(flag ?? env.RECIPE_AUTHOR);
}

export async function assertCommitIdentity(
  contentDirectory: string,
): Promise<void> {
  /* Not a repository: `commitContentChanges` no-ops, so there is nothing to check. */
  if (!(await directoryIsGitRepo(contentDirectory))) return;
  if (process.env.GIT_COMMITTER_EMAIL) return;
  let email: string | null = null;
  try {
    email = (
      await simpleGit({ baseDir: contentDirectory }).getConfig("user.email")
    ).value;
  } catch {
    email = null;
  }
  if (!email) throw new NoGitIdentityError(contentDirectory);
}
