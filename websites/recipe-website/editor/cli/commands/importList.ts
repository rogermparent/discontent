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
  LLM_OPTION,
  VERBOSE_OPTION,
  LLM_USAGE,
  booleanOption,
  llmOption,
  numberOption,
  stringOption,
  type CommandDef,
} from "./types";

/** As many picks as one call takes (`IMPORT_LIST_MAX_PICKS`). */
const MAX_PICKS = 1000;

/**
 * `1,3,5-7` → `[1, 3, 5, 6, 7]`; an `http(s)://` entry is a URL pick, kept
 * as a string (the seat checks it against the list).
 */
export function parsePicks(value: string): (number | string)[] {
  const picks: (number | string)[] = [];
  for (const part of value.split(",").map((entry) => entry.trim())) {
    if (!part) continue;
    if (/^https?:\/\//i.test(part)) {
      picks.push(part);
      continue;
    }
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (from < 1 || to < from) {
        throw new UsageError(`--pick: "${part}" is not a range of positions.`);
      }
      if (to - from + 1 + picks.length > MAX_PICKS) {
        throw new UsageError(`--pick names more than ${MAX_PICKS} positions.`);
      }
      for (let n = from; n <= to; n += 1) picks.push(n);
      continue;
    }
    if (!/^\d+$/.test(part) || Number(part) < 1) {
      throw new UsageError(
        `--pick takes 1-based positions like 1,3,5-7 (or the items' URLs) — not "${part}".`,
      );
    }
    picks.push(Number(part));
    if (picks.length > MAX_PICKS) {
      throw new UsageError(`--pick names more than ${MAX_PICKS} positions.`);
    }
  }
  if (picks.length === 0) throw new UsageError("--pick names no positions.");
  return picks;
}

export const inspectListCommand: CommandDef<InspectListResult> = {
  name: "inspect-list",
  usage: "recipes inspect-list <url> [--verbose]",
  options: { ...VERBOSE_OPTION },
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
      ...formatWarnings(result.warnings),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

export const importListCommand: CommandDef<ImportListResult> = {
  name: "import-list",
  usage: `recipes import-list <url> (--pick 1,3,5-7|<url>,… | --all) [--term <slug> [--term-label L]] [--limit 1-6] [--dry-run] ${LLM_USAGE} [--verbose]`,
  options: {
    pick: { type: "string" },
    all: { type: "boolean" },
    term: { type: "string" },
    "term-label": { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean" },
    ...LLM_OPTION,
    ...VERBOSE_OPTION,
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
    const llm = llmOption(options);
    return backend.importList(url, {
      ...(pickFlag ? { pick: parsePicks(pickFlag) } : { all: true }),
      ...(term ? { term } : {}),
      ...(termLabel ? { termLabel } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(booleanOption(options, "dry-run") ? { dryRun: true } : {}),
      ...(llm ? { llm } : {}),
    });
  },
  format(result) {
    const statusWidth = Math.max(
      0,
      ...result.results.map((entry) => entry.status.length),
    );
    const attempted = result.results.filter(
      (entry) => entry.status !== "existing" && entry.status !== "skipped",
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
        ? `remaining: ${result.remaining.map((pick) => pick.n).join(",")} — run again with --pick ${result.remaining.map((pick) => pick.url).join(",")}`
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
      ...formatWarnings(term?.warnings),
      ...formatWarnings(result.warnings),
      `requests: ${result.requests}`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};
