/*
 * Epic 29 — a canonical dump of every LMDB index under a content directory.
 *
 *   pnpm exec tsx ./scripts/dump-indexes.ts <content-dir> [--out dump.jsonl]
 *
 * Prints one line per environment (its entry count) and the dump's sha256, and
 * with `--out` writes the JSONL itself, so two dumps that disagree can be
 * diffed. The gate for 29a is the sha matching before and after the rebuild
 * changed (agent-epic-29.md, D3); what "logical" leaves out is written down in
 * `packages/cms/lmdb/dumpEnvironments.ts`.
 *
 * Read-only, but opening an environment creates its lock file — point it at a
 * copy, never at `~/Projects/recipe-content` while an editor is running on it.
 */
import { outputFile } from "fs-extra";
import { resolve } from "node:path";
import { dumpEnvironments } from "@discontent/cms/lmdb/dumpEnvironments";

async function main() {
  const target = process.argv[2];
  if (!target || target.startsWith("--")) {
    console.error("usage: dump-indexes.ts <content-dir> [--out dump.jsonl]");
    process.exit(1);
  }
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];

  const dump = await dumpEnvironments(resolve(target));
  for (const { environment, entries } of dump.environments) {
    console.log(`${String(entries).padStart(8)}  ${environment}`);
  }
  console.log(`sha256 ${dump.sha256}`);
  if (out) await outputFile(out, dump.lines.join("\n") + "\n");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
