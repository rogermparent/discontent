/**
 * How stale the static export is (epic 39, D6; 28-D8's endorsed piece).
 *
 * The export stays a deliberate workstation action. A Build that finishes
 * records the content commit it was built from in
 * `.git/discontent-export.json` (`{head, at}`) — in the repository's git
 * directory, beside the index and sync stamps, so it is never part of the
 * content history and describes this clone. The Export page reads it back
 * as "N commits since the last export", "Up to date" or "No export recorded
 * yet". Deploy publishes the last build and records nothing.
 */
import { readFile, rename, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";

const EXPORT_STAMP = "discontent-export.json";

export interface ExportStamp {
  /** The content commit the build read. */
  head: string;
  /** ISO time the build finished. */
  at: string;
}

export type ExportStaleness =
  | { state: "never" }
  | { state: "current"; at: string }
  | { state: "behind"; commits: number; at: string }
  /** The recorded commit is not in this history any more (a rewrite, a re-clone). */
  | { state: "unknown"; at: string };

async function stampPath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      EXPORT_STAMP,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

const SHA = /^[0-9a-f]{7,64}$/;

export async function readExportStamp(
  contentDirectory: string,
): Promise<ExportStamp | null> {
  try {
    const parsed = JSON.parse(
      await readFile(await stampPath(contentDirectory), "utf8"),
    );
    if (
      typeof parsed?.head === "string" &&
      SHA.test(parsed.head) &&
      typeof parsed.at === "string"
    ) {
      return { head: parsed.head, at: parsed.at };
    }
    return null;
  } catch {
    return null;
  }
}

/** Never throws: losing the hint is better than failing a finished build. */
export async function writeExportStamp(
  contentDirectory: string,
  stamp: ExportStamp,
): Promise<void> {
  try {
    const path = await stampPath(contentDirectory);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(stamp, null, 2)}\n`);
    await rename(temporary, path);
  } catch (error) {
    console.warn("[export] could not record the exported commit:", error);
  }
}

/** `null` outside a repository (nothing to count against). */
export async function exportStaleness(
  contentDirectory: string,
): Promise<ExportStaleness | null> {
  if (!(await directoryIsGitRepo(contentDirectory))) return null;
  const stamp = await readExportStamp(contentDirectory);
  if (!stamp) return { state: "never" };
  const git = simpleGit({ baseDir: contentDirectory });
  try {
    await git.raw(["cat-file", "-e", `${stamp.head}^{commit}`]);
  } catch {
    return { state: "unknown", at: stamp.at };
  }
  try {
    const commits = Number(
      String(
        await git.raw(["rev-list", "--count", `${stamp.head}..HEAD`]),
      ).trim(),
    );
    if (!Number.isFinite(commits)) return { state: "unknown", at: stamp.at };
    return commits === 0
      ? { state: "current", at: stamp.at }
      : { state: "behind", commits, at: stamp.at };
  } catch {
    return { state: "unknown", at: stamp.at };
  }
}
