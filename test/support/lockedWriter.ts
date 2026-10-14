/**
 * Another process's write, for `test/siteWrites.test.ts` (epic 34, 34d).
 *
 * `tsx lockedWriter.ts <contentDirectory> <relativePath> <delayMs> <holdMs>
 * <readyFile>` takes the repository's write lock, touches `readyFile` (outside
 * the repository) to say it holds it, waits `delayMs`, writes `relativePath`,
 * waits `holdMs` with the file on disk and uncommitted, then commits it and
 * releases the lock — the window in which a pull or a restore that did not
 * wait would see a dirty tree, or `reset --hard` the file away.
 */
import { outputFile, writeFile } from "fs-extra";
import { join } from "node:path";
import { commitContentChanges } from "@discontent/cms/git/commit";
import { withWriteLock } from "@discontent/cms/git/writeLock";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const [contentDirectory, relativePath, delayMs, holdMs, readyFile] =
    process.argv.slice(2);
  await withWriteLock(
    contentDirectory,
    `test write ${relativePath}`,
    async () => {
      await writeFile(readyFile, "");
      await sleep(Number(delayMs));
      await outputFile(
        join(contentDirectory, relativePath),
        "another process\n",
      );
      await sleep(Number(holdMs));
      await commitContentChanges(
        `Add ${relativePath}`,
        { name: "Other Process", email: "other@test.local" },
        [relativePath],
        contentDirectory,
      );
    },
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
