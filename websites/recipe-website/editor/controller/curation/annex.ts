/**
 * The D3 `media` step: git-annex content between the workstation and one
 * mirror (epic 28, D9).
 *
 * Plain git still carries every commit — the annexed files are pointer files
 * in it, unlocked (v10), so the editor, sharp and the export read them as
 * ordinary files once their content is present. What git does not move is the
 * content itself; this does, after the merge and before the commit push:
 *
 * 1. `git annex merge` folds the `git-annex` branch the fetch brought in
 *    (where each file's copies are) into ours. A union merge: it never
 *    conflicts.
 * 2. `git annex copy --from <mirror>` brings in what the mirror has and we
 *    don't — its uploads, now in our tree after the merge.
 * 3. `git annex copy --to <mirror>` sends what we have and it lacks, before
 *    the push, so the mirror's checkout (`updateInstead`) finds the content
 *    already there and writes real files rather than pointers.
 * 4. Our `git-annex` branch goes to the mirror's `synced/git-annex`, which its
 *    git-annex merges on its next run. Never to its `git-annex`: that branch
 *    moves there too, and a push would be refused as non-fast-forward.
 *
 * _Not_ `git annex sync`: its automatic conflict resolution (renaming to
 * `.variant-*`) would break D3's "never auto-resolve" — the merge stays
 * `gitPull`'s.
 *
 * **Dormant until both sides are annexed.** The step runs only when this
 * repository has an annex uuid and the mirror's remote has one configured
 * (`remote.<name>.annex-uuid`, which `scripts/annex-activate.sh` sets), and
 * the remote is not `annex-ignore`d. Anything less is `skipped` with a
 * reason, never a failure, so a repository that was `git annex init`-ed and
 * left dormant (tourmaline's, since before epic 28) syncs exactly as before.
 *
 * `numcopies` is not set here: it lives in the `git-annex` branch, and the
 * activation script sets it once (2) for every clone. git-annex enforces it on
 * every `drop`.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

/* `execFile`, not `execa`: the CLI runs under `tsx` as CommonJS. */
const run = promisify(execFile);

export interface MediaStepResult {
  status: "ok" | "skipped" | "failed";
  detail?: string;
  /** Files whose content came in or went out. */
  received?: number;
  sent?: number;
}

async function gitConfig(
  contentDirectory: string,
  key: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["config", "--get", key], {
      cwd: contentDirectory,
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Why the media step would not run with `remote`, or `null` when it would. */
export async function annexSkipReason(
  contentDirectory: string,
  remote: string,
): Promise<string | null> {
  if (!(await gitConfig(contentDirectory, "annex.uuid"))) {
    return "git-annex is not initialised here";
  }
  if (
    (await gitConfig(contentDirectory, `remote.${remote}.annex-ignore`)) ===
    "true"
  ) {
    return `${remote} is annex-ignored`;
  }
  if (!(await gitConfig(contentDirectory, `remote.${remote}.annex-uuid`))) {
    return `${remote} has no git-annex repository yet`;
  }
  return null;
}

async function annex(
  contentDirectory: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const { stdout } = await run("git", ["annex", ...args], {
    cwd: contentDirectory,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

/** `--json` lines from a copy: how many files actually moved. */
function moved(stdout: string): number {
  let count = 0;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { success?: boolean };
      if (record.success) count += 1;
    } catch {
      /* not a JSON line */
    }
  }
  return count;
}

/**
 * Turn pointer files in the working tree into content that is now present.
 *
 * A push into a mirror's checked-out branch (`updateInstead`) checks files
 * out without git-annex's post-checkout hook, so an annexed file whose
 * content arrived just before the push is still a pointer in the tree. Every
 * instance runs this on a HEAD move (`instance/start.ts`), before D12's
 * reindex reads the files. A no-op without git-annex.
 */
export async function updateAnnexedWorktree(
  contentDirectory: string,
): Promise<void> {
  if (!(await gitConfig(contentDirectory, "annex.uuid"))) return;
  try {
    await annex(contentDirectory, ["smudge", "--update"], 10 * 60_000);
  } catch (error) {
    console.warn(
      "[annex] smudge --update failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function syncMedia(
  contentDirectory: string,
  remote: string,
  { timeoutMs = 30 * 60_000 }: { timeoutMs?: number } = {},
): Promise<MediaStepResult> {
  const reason = await annexSkipReason(contentDirectory, remote);
  if (reason) return { status: "skipped", detail: reason };
  try {
    await annex(contentDirectory, ["merge"], 120_000);
    /* `--fast`: only files whose content the location log says the other
     * side has, so an unchanged sync does not stat every annexed file there. */
    const received = moved(
      await annex(
        contentDirectory,
        ["copy", "--from", remote, "--fast", "--json"],
        timeoutMs,
      ),
    );
    const sent = moved(
      await annex(
        contentDirectory,
        ["copy", "--to", remote, "--fast", "--json"],
        timeoutMs,
      ),
    );
    await run("git", ["push", remote, "git-annex:synced/git-annex"], {
      cwd: contentDirectory,
      timeout: 120_000,
    });
    return {
      status: "ok",
      detail: `in ${received}, out ${sent}`,
      received,
      sent,
    };
  } catch (error) {
    const text =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      status: "failed",
      detail:
        text
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) ?? "git-annex failed",
    };
  }
}
