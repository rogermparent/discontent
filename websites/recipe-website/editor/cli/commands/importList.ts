/**
 * `recipes inspect-list <url>` and `recipes import-list <url> …` — roundup
 * ("meta-list") import (34f, D11).
 *
 * `inspect-list` reads the list and writes nothing. `import-list` imports the
 * picks one commit each, 15 s apart per site, at most `--limit` per run; the
 * rest come back as `remaining`, and the same command with
 * `--pick <remaining>` continues.
 */
import { UsageError } from "../../controller/curation/errors";
import type { ImportListResult, InspectListResult } from "../backend/types";
import { formatWarnings } from "../output";
import {
  booleanOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

/** `1,3,5-7` → `[1, 3, 5, 6, 7]`. */
export function parsePicks(value: string): number[] {
  const picks: number[] = [];
  for (const part of value.split(",").map((entry) => entry.trim())) {
    if (!part) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from < 1 || to < from) {
        throw new UsageError(`--pick: "${part}" is not a range of positions.`);
      }
      for (let n = from; n <= to; n += 1) picks.push(n);
      continue;
    }
    if (!/^\d+$/.test(part) || Number(part) < 1) {
      throw new UsageError(
        `--pick takes 1-based positions like 1,3,5-7 — not "${part}".`,
      );
    }
    picks.push(Number(part));
  }
  if (picks.length === 0) throw new UsageError("--pick names no positions.");
  return picks;
}

export const inspectListCommand: CommandDef<InspectListResult> = {
  name: "inspect-list",
  usage: "recipes inspect-list <url>",
  options: {},
  async run({ backend, positionals }) {
    const url = positionals[0];
    if (!url) throw new UsageError("inspect-list needs a URL.");
    return backend.inspectList(url);
  },
  format(result) {
    const width = String(result.items.length).length;
    return [
      `${result.title ?? result.url}${result.source ? ` (${result.source}, ${result.items.length} items)` : ""}`,
      result.finalUrl,
      result.reason ? `no list: ${result.reason}` : undefined,
      ...result.items.map(
        (item) =>
          `  ${String(item.n).padStart(width)}. ${item.name}  ${item.url}${item.existing ? `  [existing: ${item.existing}]` : ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const importListCommand: CommandDef<ImportListResult> = {
  name: "import-list",
  usage:
    "recipes import-list <url> (--pick 1,3,5-7 | --all) [--term <slug> [--term-label L]] [--limit n] [--dry-run]",
  options: {
    pick: { type: "string" },
    all: { type: "boolean" },
    term: { type: "string" },
    "term-label": { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const url = positionals[0];
    if (!url) throw new UsageError("import-list needs a URL.");
    const pickFlag = stringOption(options, "pick");
    const all = booleanOption(options, "all");
    if (Boolean(pickFlag) === all) {
      throw new UsageError(
        "import-list needs --pick <positions> (from inspect-list) or --all — one of them.",
      );
    }
    const limitFlag = stringOption(options, "limit");
    const limit = numberOption(options, "limit");
    if (limitFlag !== undefined && (!Number.isInteger(limit) || limit! < 1)) {
      throw new UsageError(`--limit takes a positive whole number.`);
    }
    const termLabel = stringOption(options, "term-label");
    const term = stringOption(options, "term");
    if (termLabel && !term) {
      throw new UsageError("--term-label labels the --term: pass --term too.");
    }
    return backend.importList(url, {
      ...(pickFlag ? { pick: parsePicks(pickFlag) } : { all: true }),
      ...(term ? { term } : {}),
      ...(termLabel ? { termLabel } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(booleanOption(options, "dry-run") ? { dryRun: true } : {}),
    });
  },
  format(result) {
    const statusWidth = Math.max(
      0,
      ...result.results.map((entry) => entry.status.length),
    );
    const attempted = result.results.filter(
      (entry) => entry.status !== "existing",
    ).length;
    const term = result.term;
    return [
      `${result.dryRun ? "dry run: " : ""}${result.title ?? result.url} — ${attempted} attempted, ${result.remaining.length} remaining (${result.total} on the list)`,
      result.reason ? `no list: ${result.reason}` : undefined,
      ...result.results.map((entry) =>
        [
          `  ${entry.n}.`,
          entry.status.padEnd(statusWidth),
          entry.slug ?? "",
          entry.error
            ? `${entry.error.code}: ${entry.error.message}`
            : `(${entry.name})`,
        ]
          .filter(Boolean)
          .join("  "),
      ),
      ...result.results.flatMap((entry) => formatWarnings(entry.warnings)),
      result.remaining.length > 0
        ? `remaining: ${result.remaining.join(",")} — run again with --pick ${result.remaining.join(",")}`
        : undefined,
      ...(result.dropped ?? []).map(
        (entry) =>
          `dropped: ${entry.site} (${entry.reason}) — leave it for a while`,
      ),
      term
        ? term.error
          ? `term ${term.slug}: ${term.error.code}: ${term.error.message}`
          : term.assign
            ? `term ${term.slug}: would ${term.created ? "create and " : ""}assign to ${term.assign.length} recipe(s)`
            : `term ${term.slug}: ${term.created ? "created, " : ""}+${term.updated?.length ?? 0} recipe(s)`
        : undefined,
      `requests: ${result.requests}`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};
