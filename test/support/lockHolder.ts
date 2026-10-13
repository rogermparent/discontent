/**
 * One lock-holding process for `test/writeLock.test.ts` (epic 34, 34c).
 *
 * `tsx lockHolder.ts <contentDirectory> <name> <holdMs> <logFile>` takes the
 * repository's write lock, appends `enter <name>`, holds it for `holdMs`,
 * appends `exit <name>`, and releases it. Several of these started together
 * against one stale lock must never log overlapping holds.
 */
import { appendFile } from "node:fs/promises";
import { withWriteLock } from "@discontent/cms/git/writeLock";

async function main() {
  const [contentDirectory, name, holdMs, logFile] = process.argv.slice(2);
  await withWriteLock(contentDirectory, `hold ${name}`, async () => {
    await appendFile(logFile, `enter ${name}\n`);
    await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
    await appendFile(logFile, `exit ${name}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
