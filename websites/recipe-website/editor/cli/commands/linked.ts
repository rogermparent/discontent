/**
 * `recipes linked --scan [--slug s …] [--limit n] [--dry-run] [--llm …]`
 * (50e): the recipes already here, each one's stored source page read again
 * — on its site's queue, politely — for the recipes it links to; those
 * imported (or linked to, when they are here already) and the lines that
 * make them rewritten, one commit per recipe. `--dry-run` reads the pages
 * and writes nothing: the output is the review — per recipe, what each
 * link is, which lines would change from what to what, and what was left
 * alone and why.
 *
 * Also home of the `linked` report's text, shared with `import`.
 */
import { UsageError } from "../../controller/curation/errors";
import {
  LINKED_MODES,
  type LinkedMode,
} from "../../controller/curation/linkedMode";
import type {
  LinkedReport,
  LinkedScanResult,
} from "../../controller/curation/linkedImport";
import {
  LLM_OPTION,
  LLM_USAGE,
  VERBOSE_OPTION,
  booleanOption,
  llmOption,
  stringListOption,
  stringOption,
  type CommandDef,
  type CommandRunContext,
} from "./types";

/** `--linked auto|off` (50e). */
export function linkedOption(
  options: CommandRunContext["options"],
): LinkedMode | undefined {
  const value = stringOption(options, "linked");
  if (value === undefined) return undefined;
  if (!(LINKED_MODES as readonly string[]).includes(value)) {
    throw new UsageError(
      `--linked takes ${LINKED_MODES.join(" or ")} — not "${value}".`,
    );
  }
  return value as LinkedMode;
}

const WHERE: Record<string, string> = {
  ingredient: "on an ingredient line",
  step: "in a step",
  note: "in the card's notes",
  body: "in the post",
};

/**
 * A `linked` report as lines: each linked recipe (what it is, where the
 * page links it), each rewritten line (from → to, 1-based), the notes
 * added, and the links left alone with why. `dryRun` words it as "would".
 */
export function formatLinked(
  report: LinkedReport | undefined,
  dryRun: boolean,
  indent = "",
): string[] {
  if (!report) return [];
  const out: string[] = [];
  const pad = `${indent}  `;
  for (const item of report.recipes) {
    const what =
      item.status === "existing"
        ? `here already as ${item.slug}`
        : item.status === "imported"
          ? `imported as ${item.slug}`
          : item.status === "would-import"
            ? `would import as ${item.slug}`
            : item.status === "not-a-recipe"
              ? `not a recipe — ${item.reason}`
              : `failed — ${item.reason ?? item.error?.message ?? "unknown"}`;
    out.push(
      `${indent}linked: ${item.name ? `${item.name}, ` : ""}${what}`,
      `${pad}${item.url} — "${item.text}" ${WHERE[item.where] ?? ""}`.trimEnd(),
    );
    if (item.tags?.length) out.push(`${pad}tags: ${item.tags.join(", ")}`);
    if (item.already && item.lines?.length) {
      out.push(
        `${pad}line${item.lines.length === 1 ? "" : "s"} ${item.lines.map((line) => line + 1).join(", ")} link it already`,
      );
    }
  }
  for (const change of report.lines) {
    out.push(
      `${indent}line ${change.line + 1}${dryRun ? " would read" : ":"} "${change.from}" → "${change.to}"`,
      `${pad}${change.how === "link" ? "the page links it there" : `names what ${change.name} makes`}${change.expands ? "; the shopping list opens it into its lines" : "; kept as written on the shopping list (a choice)"}`,
    );
  }
  for (const note of report.notes ?? []) {
    out.push(`${indent}note${dryRun ? " (would add)" : " added"}: ${note}`);
  }
  for (const skip of report.skipped ?? []) {
    out.push(
      `${indent}left alone: ${skip.url} "${skip.text}" — ${skip.reason}`,
    );
  }
  return out;
}

export const linkedCommand: CommandDef<LinkedScanResult> = {
  name: "linked",
  usage: `recipes linked --scan [--slug s …] [--limit n] [--dry-run] ${LLM_USAGE} [--verbose]`,
  options: {
    scan: { type: "boolean" },
    slug: { type: "string", multiple: true },
    limit: { type: "string" },
    "dry-run": { type: "boolean" },
    ...LLM_OPTION,
    ...VERBOSE_OPTION,
  },
  write: true,
  async run({ backend, options, positionals }) {
    if (!booleanOption(options, "scan")) {
      throw new UsageError(
        "linked takes --scan: recipes linked --scan [--slug s] [--dry-run].",
      );
    }
    if (positionals.length > 0) {
      throw new UsageError(
        `linked --scan takes no positional arguments (got ${positionals.join(" ")}); name recipes with --slug.`,
      );
    }
    const slugs = stringListOption(options, "slug").flatMap((value) =>
      value
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean),
    );
    const limitFlag = stringOption(options, "limit");
    const limit = limitFlag === undefined ? undefined : Number(limitFlag);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new UsageError(
        `--limit takes a whole number ≥ 1, not "${limitFlag}".`,
      );
    }
    const llm = llmOption(options);
    return backend.scanLinked({
      ...(slugs.length ? { slugs } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(booleanOption(options, "dry-run") ? { dryRun: true } : {}),
      ...(llm ? { llm } : {}),
    });
  },
  exitCode(result) {
    return result.recipes.some((recipe) => recipe.status === "failed") ? 1 : 0;
  },
  format(result) {
    const dryRun = result.dryRun === true;
    const counts = new Map<string, number>();
    for (const recipe of result.recipes) {
      counts.set(recipe.status, (counts.get(recipe.status) ?? 0) + 1);
    }
    return [
      `${dryRun ? "dry run: " : ""}read ${result.scanned} recipe page${result.scanned === 1 ? "" : "s"} — ${[...counts].map(([status, count]) => `${count} ${status}`).join(", ") || "nothing to read"}`,
      ...result.recipes.flatMap((recipe) => [
        "",
        `${recipe.slug} (${recipe.name}) — ${recipe.status}${recipe.reason ? `: ${recipe.reason}` : ""}`,
        ...(recipe.source ? [`  source: ${recipe.source}`] : []),
        ...formatLinked(recipe.linked, dryRun, "  "),
      ]),
      ...(result.job ? ["", `job: ${result.job}`] : []),
    ].join("\n");
  },
};

export default linkedCommand;
