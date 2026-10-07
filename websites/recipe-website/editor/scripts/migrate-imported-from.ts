/**
 * Move legacy "Imported from" description lines into `source` (27d/D13).
 *
 *     pnpm exec tsx ./scripts/migrate-imported-from.ts <content-dir> [--dry-run]
 *
 * Before 22a, the importer cited a page by writing its URL as the first line
 * of the description — `*Imported from [https://…](https://…)*` — and there
 * was no `source`. Those lines render as clutter above every old recipe, and
 * a citation in prose is invisible to `source:` search.
 *
 * For every recipe **with no `source`** whose description's first line is one
 * of the shapes below, this sets `source: {url, name: siteLabel(url)}`, strips
 * the line, the blank lines after it and a `---` rule if one follows (the old
 * importer wrote one), and drops `description` if nothing is left. Shapes:
 *
 * - `*Imported from [label](url)*` — the standard one, with or without `\r`;
 * - `*Imported from* [*url*](url)` — the YouTube importer's;
 * - `Imported from [label](url)` — no emphasis;
 * - `Imported from https://…` — a bare URL.
 *
 * A first line with two links, or a link that does not parse, is **reported
 * and left alone**: which URL is the citation is a person's call.
 *
 * One commit for the whole run — "Move legacy 'Imported from' lines into
 * source (N recipes)" — through the engine's `commitContentChanges`, then a
 * full reindex (which also stamps HEAD, so no stale-index banner follows).
 * `--dry-run` reads and reports and writes nothing.
 */
import { readdir, readJson, outputJSON, pathExists } from "fs-extra";
import { join, resolve } from "node:path";
import process from "node:process";
import { commitContentChanges } from "@discontent/cms/git/commit";
import { readHead } from "@discontent/cms/git/indexStamp";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type { Recipe } from "recipe-website-common/controller/types";
import { siteLabel } from "recipe-website-common/util/siteNames";
import { reindex } from "../controller/curation/reindex";

export interface MigrationReport {
  /** Recipes whose description opens with an "Imported from" line at all. */
  candidates: number;
  /** Recipes changed (or, on a dry run, that would be). */
  migrated: { slug: string; url: string; name?: string }[];
  /** Candidates left alone, and why. */
  skipped: { slug: string; reason: string; line: string }[];
  /** The commit made; absent on a dry run or when nothing changed. */
  commit?: string;
  dryRun: boolean;
}

const LEAD_RE = /^\s*\*?\s*Imported from\b/i;
const LINK_RE = /\[\*?([^\]]*?)\*?\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE =
  /^\s*\*?\s*Imported from\*?\s+\*?(https?:\/\/[^\s*]+)\*?\s*$/i;

/** The citation a first line names, or why it can't be read. */
export function parseImportedFrom(
  line: string,
): { url: string } | { reason: string } {
  const text = line.replace(/\r$/, "");
  const links = [...text.matchAll(LINK_RE)];
  if (links.length > 1) return { reason: "two links — pick one by hand" };
  if (links.length === 1) {
    /* Anything besides the link and its emphasis means more than one source. */
    const rest = text
      .replace(LINK_RE, "")
      .replace(/^\s*\*?\s*Imported from\*?/i, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (rest) return { reason: `more than one source: "${rest}"` };
    return { url: links[0][2] };
  }
  const bare = BARE_URL_RE.exec(text);
  if (bare) return { url: bare[1] };
  return { reason: "no link that parses" };
}

/** The description with its first line, following blanks and a `---` gone. */
export function stripImportedFrom(description: string): string | undefined {
  const lines = description.split("\n").slice(1);
  const blank = (line: string) => /^\s*$/.test(line);
  while (lines.length > 0 && blank(lines[0])) lines.shift();
  if (lines.length > 0 && /^\s*-{3,}\s*$/.test(lines[0])) {
    lines.shift();
    while (lines.length > 0 && blank(lines[0])) lines.shift();
  }
  const rest = lines.join("\n");
  return rest.trim() ? rest : undefined;
}

export async function migrateImportedFrom(
  contentDirectory: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<MigrationReport> {
  const dataDirectory = join(
    contentDirectory,
    recipeContentConfig.dataDirectory,
  );
  const report: MigrationReport = {
    candidates: 0,
    migrated: [],
    skipped: [],
    dryRun,
  };
  const touched: string[] = [];

  for (const slug of (await readdir(dataDirectory)).sort()) {
    const relative = join(
      recipeContentConfig.dataDirectory,
      slug,
      recipeContentConfig.dataFilename,
    );
    const file = join(contentDirectory, relative);
    if (!(await pathExists(file))) continue;
    const recipe = (await readJson(file)) as Recipe;
    const description = recipe.description ?? "";
    if (!LEAD_RE.test(description)) continue;
    report.candidates += 1;

    const line = description.split("\n")[0];
    if (recipe.source) {
      report.skipped.push({ slug, reason: "already has a source", line });
      continue;
    }
    const parsed = parseImportedFrom(line);
    if ("reason" in parsed) {
      report.skipped.push({ slug, reason: parsed.reason, line });
      continue;
    }

    const name = siteLabel(parsed.url);
    report.migrated.push({ slug, url: parsed.url, ...(name ? { name } : {}) });
    if (dryRun) continue;

    const rest = stripImportedFrom(description);
    const next: Recipe = { ...recipe };
    if (rest === undefined) delete next.description;
    else next.description = rest;
    next.source = { url: parsed.url, ...(name ? { name } : {}) };
    await outputJSON(file, next, { spaces: 2 });
    touched.push(relative);
  }

  if (!dryRun && touched.length > 0) {
    await commitContentChanges(
      `Move legacy 'Imported from' lines into source (${touched.length} recipes)`,
      undefined,
      touched,
      contentDirectory,
    );
    await reindex({ contentDirectory });
    report.commit = (await readHead(contentDirectory)) ?? undefined;
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((arg) => !arg.startsWith("--"));
  if (!target) {
    console.error(
      "Usage: tsx scripts/migrate-imported-from.ts <content-dir> [--dry-run]",
    );
    process.exit(2);
  }
  const report = await migrateImportedFrom(resolve(target), { dryRun });
  await closeCachedEnvironments();
  console.log(
    `${dryRun ? "[dry run] " : ""}${report.candidates} candidates, ${report.migrated.length} ${dryRun ? "would be " : ""}migrated, ${report.skipped.length} skipped`,
  );
  for (const { slug, reason, line } of report.skipped) {
    console.log(`  skipped ${slug}: ${reason}\n    ${line.trim()}`);
  }
  if (report.commit) console.log(`commit ${report.commit}`);
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
