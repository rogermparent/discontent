/*
 * The 47j measurement: how an import finds a recipe page's notes, on pages
 * saved to a scratch directory beforehand (the script fetches nothing and
 * writes nothing but its own settings and output). Local only — the
 * learned-selector path asks a real model (`RECIPE_LLM_URL` from
 * `editor/.env`, or the Claude API from the environment); never run in CI.
 *
 *   pnpm --filter recipe-editor exec tsx scripts/measure-notes.ts \
 *     --pages /scratch/pages --cases /scratch/cases.json \
 *     --settings /scratch/settings-local [--only local|claude] [--out runs.jsonl]
 *
 * `--cases` is `[{host, pages: [{file, url}, {file, url}]}]`: each host's
 * first page, then a second recipe from the same site. Each page is one
 * `readPageNotes` — the import's own notes step, learning allowed — over a
 * settings directory of the run's own (`--settings`, emptied first), so the
 * second page reuses what the first learned. A line per page: `{host, url,
 * path, plugin, selector, model, notes, why, ms, attempts}` — `notes` the
 * text, for judging by hand.
 */
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { loadEditorEnv } from "../cli/editorEnv";
import { editModels } from "../controller/llm/askEdit";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

interface Case {
  host: string;
  pages: { file: string; url: string }[];
}

async function main() {
  const pages = flag("pages") ?? fail("--pages <dir> is required");
  const casesFile = flag("cases") ?? fail("--cases <file> is required");
  const settings = flag("settings") ?? fail("--settings <dir> is required");
  const only = flag("only") as "local" | "claude" | undefined;
  const out = flag("out");
  loadEditorEnv();
  await rm(settings, { recursive: true, force: true });
  await mkdir(settings, { recursive: true });
  process.env.SETTINGS_DIRECTORY = path.resolve(settings);
  const { readPageNotes } = await import("../controller/notes/importNotes");
  const all = editModels();
  const models =
    only === "local"
      ? { local: all.local }
      : only === "claude"
        ? { claude: all.claude }
        : all;
  if (!models.local && !models.claude) fail("no model is set up");
  const cases = JSON.parse(await readFile(casesFile, "utf8")) as Case[];
  for (const item of cases) {
    for (const page of item.pages) {
      let html: string;
      try {
        html = await readFile(path.join(pages, page.file), "utf8");
      } catch {
        const line = { host: item.host, url: page.url, missing: true };
        process.stdout.write(`${JSON.stringify(line)}\n`);
        if (out) await appendFile(out, `${JSON.stringify(line)}\n`);
        continue;
      }
      const started = Date.now();
      const found = await readPageNotes(page.url, html, {
        mode: "learn",
        models,
      });
      const line = {
        host: item.host,
        url: page.url,
        path: found.path,
        plugin: found.plugin,
        selector: found.selector,
        model: found.model,
        why: found.why,
        ms: Date.now() - started,
        count: found.notes.length,
        notes: found.notes.map((note) => note.slice(0, 160)),
        attempts: found.attempts,
      };
      process.stdout.write(`${JSON.stringify(line)}\n`);
      if (out) await appendFile(out, `${JSON.stringify(line)}\n`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
