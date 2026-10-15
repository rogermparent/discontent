/*
 * The 36a gate: how well a local model extracts recipes (epic 36, D4–D8).
 * Local only — it needs Ollama and network once; never run in CI.
 *
 *   # 1. Fetch once into a scratch cache (polite: one request at a time,
 *   #    15 s apart, one browser-UA retry after a 403, then the host is dropped)
 *   pnpm exec tsx ./scripts/measure-llm-import.ts fetch \
 *     --corpus corpus.json --cache /scratch/llm-cache
 *
 *   # 2. Measure, offline, one model per run (it unloads the model after)
 *   pnpm exec tsx ./scripts/measure-llm-import.ts run \
 *     --cache /scratch/llm-cache --model qwen3:8b --out qwen3-8b.json
 *
 * `corpus.json` is `{"pages": [url…], "youtube": [videoId…]}`. The cache holds
 * `pages/<sha1-12>.html` + `.json` (url, status) and `youtube/<id>.json`
 * (title, description, channel — `yt-dlp --skip-download --dump-json`,
 * trimmed). Never point it at `editor/content`: it reads no content at all.
 *
 * Three sets, each run with the extractor exactly as the importer will:
 *
 * - **schema pages** (a Recipe node with ingredients): the model in force mode
 *   on `pageText(html)`, compared with the page's own JSON-LD (through
 *   `mapRecipePage`) — ingredient-line recall and precision (headings left
 *   out; a line matches when its words agree ≥ 80%), step counts, time
 *   fields, grounding, wall time. **The gate:** recall ≥ 95%, grounded ≥ 95%,
 *   median warm page ≤ 30 s.
 * - **no-schema pages** (and a schema with no ingredients): found, partial,
 *   grounded, counts, time.
 * - **video descriptions** as pasted text (D8): the same, plus any line that
 *   looks like noise (a URL, a timestamp, a sponsor or social plug) that
 *   became an ingredient or a step.
 *
 * A warm-up call loads the model first, so every page is timed warm; the
 * warm-up's time is reported as the cold load.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { pageTextDetail } from "recipe-website-common/util/pageText";
import {
  mapRecipePage,
  parseRecipePage,
  RECIPE_FETCH_HEADERS,
} from "recipe-website-common/util/importRecipeData";
import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import { chatJson, type LlmConfig } from "../controller/llm/client";
import {
  extractRecipeWithLlm,
  normaliseForGrounding,
  type LlmExtraction,
} from "../controller/llm/extractRecipe";

const run = promisify(execFile);
const GAP_MS = 15_000;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pageKey = (url: string) =>
  createHash("sha1").update(url).digest("hex").slice(0, 12);

/* ------------------------------------------------------------------ */
/* fetch                                                               */
/* ------------------------------------------------------------------ */

async function fetchCorpus(corpusPath: string, cache: string) {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as {
    pages?: string[];
    youtube?: string[];
  };
  await mkdir(join(cache, "pages"), { recursive: true });
  await mkdir(join(cache, "youtube"), { recursive: true });
  let last = 0;
  const polite = async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
  const dropped = new Set<string>();

  for (const url of corpus.pages ?? []) {
    const host = new URL(url).hostname;
    const base = join(cache, "pages", pageKey(url));
    if (existsSync(`${base}.json`) || dropped.has(host)) continue;
    await polite();
    let response = await fetch(url);
    let retried = false;
    if (response.status === 403) {
      await response.body?.cancel().catch(() => {});
      await polite();
      response = await fetch(url, { headers: RECIPE_FETCH_HEADERS });
      retried = true;
      if (response.status === 403) dropped.add(host);
    }
    const html = await response.text();
    await writeFile(`${base}.html`, html);
    await writeFile(
      `${base}.json`,
      JSON.stringify({ url, status: response.status, retried }),
    );
    console.log(response.status, retried ? "(retried)" : "", url);
  }

  for (const id of corpus.youtube ?? []) {
    const out = join(cache, "youtube", `${id}.json`);
    if (existsSync(out)) continue;
    await polite();
    const { stdout } = await run(
      "yt-dlp",
      [
        "--skip-download",
        "--dump-json",
        `https://www.youtube.com/watch?v=${id}`,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
    );
    const dump = JSON.parse(stdout);
    await writeFile(
      out,
      JSON.stringify({
        id,
        title: dump.title,
        description: dump.description,
        channel: dump.channel,
        webpage_url: dump.webpage_url,
      }),
    );
    console.log("yt", id, dump.title);
  }
  if (dropped.size > 0) console.log("dropped hosts:", [...dropped]);
}

/* ------------------------------------------------------------------ */
/* run                                                                 */
/* ------------------------------------------------------------------ */

/** `<Multiplyable baseNumber="2" />` back to `2`. */
function plain(line: string): string {
  return line.replace(/<Multiplyable baseNumber="([^"]*)" \/>/g, "$1");
}

function itemLines(ingredients: Ingredient[] | undefined): string[] {
  return (ingredients ?? [])
    .filter((entry) => entry.type !== "heading")
    .map((entry) => plain(entry.ingredient));
}

function stepTexts(entries: InstructionEntry[] | undefined): string[] {
  return (entries ?? []).flatMap((entry) =>
    "instructions" in entry
      ? entry.instructions.map((step) => step.text)
      : [entry.text],
  );
}

/** Dice similarity of two lines' word multisets, after normalisation. */
function similarity(a: string, b: string): number {
  const left = normaliseForGrounding(a).split(" ").filter(Boolean);
  const right = normaliseForGrounding(b).split(" ").filter(Boolean);
  if (left.length === 0 || right.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of left) {
    const count = pool.get(word) ?? 0;
    if (count > 0) {
      shared += 1;
      pool.set(word, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

const LINE_MATCH = 0.8;

/** How many of `wanted` some line of `got` matches, exactly and loosely. */
function matched(wanted: string[], got: string[]) {
  let exact = 0;
  let loose = 0;
  const missed: string[] = [];
  for (const line of wanted) {
    const norm = normaliseForGrounding(line);
    if (got.some((other) => normaliseForGrounding(other) === norm)) {
      exact += 1;
      loose += 1;
    } else if (got.some((other) => similarity(line, other) >= LINE_MATCH)) {
      loose += 1;
    } else {
      missed.push(line);
    }
  }
  return { exact, loose, missed };
}

/** A line that came from the noise around a recipe, not the recipe. */
const NOISE =
  /https?:|www\.|amzn|\b\d{1,2}:\d{2}\b|sponsor|patreon|subscribe|instagram|tiktok|affiliate|discount|promo code|epidemic sound|@\w/i;

interface Row {
  set: "schema" | "noschema" | "youtube";
  id: string;
  url?: string;
  container?: string;
  textChars: number;
  found: boolean;
  partial?: boolean;
  grounded?: number;
  total?: number;
  ingredients?: number;
  steps?: number;
  durationMs: number;
  error?: string;
  /* schema pages */
  refIngredients?: number;
  recallExact?: number;
  recallLoose?: number;
  precisionLoose?: number;
  refSteps?: number;
  timesAgree?: number;
  timesRef?: number;
  timesInvented?: number;
  missed?: string[];
  extra?: string[];
  /* noise */
  noise?: string[];
  ungrounded?: string[];
  /** Lines the model skipped that `fillSkippedLines` put back. */
  added?: number;
  /** What came out, for eyeballing: prep, cook, total minutes, and the lines. */
  times?: (number | undefined)[];
  lines?: { ingredients: string[]; steps: string[] };
}

function rowFromExtraction(
  base: Pick<Row, "set" | "id" | "url" | "container" | "textChars">,
  extraction: LlmExtraction,
): Row {
  if (!extraction.found) {
    return { ...base, found: false, durationMs: extraction.llm.durationMs };
  }
  const { recipe, llm } = extraction;
  const items = itemLines(recipe.ingredients);
  const steps = stepTexts(recipe.instructions);
  const noise = [...items, ...steps].filter((line) => NOISE.test(line));
  return {
    ...base,
    found: true,
    partial: !!recipe.partial,
    grounded: llm.grounded,
    total: llm.total,
    ingredients: items.length,
    steps: steps.length,
    durationMs: llm.durationMs,
    ...(noise.length > 0 ? { noise } : {}),
    ...(llm.ungrounded ? { ungrounded: llm.ungrounded } : {}),
    ...(llm.added ? { added: llm.added.length } : {}),
    times: [recipe.prepTime, recipe.cookTime, recipe.totalTime],
    lines: { ingredients: items, steps },
  };
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const pct = (part: number, whole: number) =>
  whole ? `${((100 * part) / whole).toFixed(1)}%` : "–";
const secs = (ms: number) =>
  Number.isFinite(ms) ? (ms / 1000).toFixed(1) : "–";

async function measure(cache: string, config: LlmConfig, only?: string) {
  const onlySet = flag("set");
  const rows: Row[] = [];
  const out = flag("out");
  const save = async () => {
    if (out) await writeFile(out, JSON.stringify(rows, null, 1));
  };

  /* Load the model once, so each page below is timed warm. */
  const warm = await chatJson({
    system: "Answer in JSON.",
    user: 'Return {"ok": true}.',
    schema: {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    },
    config,
  });
  console.log(
    `warm-up ${secs(warm.durationMs)} s (load ${secs(warm.loadMs ?? NaN)} s)`,
  );

  const pageFiles = (await readdir(join(cache, "pages"))).filter((file) =>
    file.endsWith(".json"),
  );
  for (const file of pageFiles) {
    const info = JSON.parse(
      await readFile(join(cache, "pages", file), "utf8"),
    ) as { url: string; status: number };
    if (only && !info.url.includes(only)) continue;
    if (info.status < 200 || info.status >= 300) continue;
    const html = await readFile(
      join(cache, "pages", file.replace(/\.json$/, ".html")),
      "utf8",
    );
    const parsed = parseRecipePage(html, info.url);
    const mapped = mapRecipePage(info.url, parsed);
    const reference = itemLines(mapped?.ingredients);
    const set = reference.length > 0 ? "schema" : "noschema";
    if (onlySet && onlySet !== set) continue;
    const detail = pageTextDetail(html);
    const base = {
      set,
      id: info.url.replace(/^https?:\/\/(www\.)?/, ""),
      url: info.url,
      container: detail.container,
      textChars: detail.text.length,
    } as const;
    let row: Row;
    try {
      const extraction = await extractRecipeWithLlm({
        text: detail.text,
        url: info.url,
        meta: {
          title: parsed.meta.ogTitle ?? parsed.meta.title,
          siteName: parsed.meta.siteName,
        },
        config,
      });
      row = rowFromExtraction(base, extraction);
      if (set === "schema" && extraction.found) {
        const got = itemLines(extraction.recipe.ingredients);
        const recall = matched(reference, got);
        const precision = matched(got, reference);
        const timeKeys = ["prepTime", "cookTime", "totalTime"] as const;
        const defined = timeKeys.filter((key) => mapped?.[key] !== undefined);
        row = {
          ...row,
          refIngredients: reference.length,
          recallExact: recall.exact,
          recallLoose: recall.loose,
          precisionLoose: precision.loose,
          refSteps: stepTexts(mapped?.instructions).length,
          timesRef: defined.length,
          timesAgree: defined.filter(
            (key) => extraction.recipe[key] === mapped?.[key],
          ).length,
          timesInvented: timeKeys.filter(
            (key) =>
              mapped?.[key] === undefined &&
              extraction.recipe[key] !== undefined,
          ).length,
          ...(recall.missed.length > 0 ? { missed: recall.missed } : {}),
          ...(precision.missed.length > 0 ? { extra: precision.missed } : {}),
        };
      }
    } catch (error) {
      row = {
        ...base,
        found: false,
        durationMs: NaN,
        error: String((error as Error)?.message ?? error),
      };
    }
    rows.push(row);
    console.log(
      `${row.set.padEnd(8)} ${secs(row.durationMs).padStart(5)} s  ${
        row.found ? `${row.grounded}/${row.total} grounded` : "not found"
      }${row.partial ? " PARTIAL" : ""}${
        row.refIngredients
          ? `  recall ${row.recallLoose}/${row.refIngredients}`
          : ""
      }${row.error ? `  ERROR ${row.error}` : ""}  ${row.id}`,
    );
    await save();
  }

  const videoFiles = (await readdir(join(cache, "youtube"))).filter((file) =>
    file.endsWith(".json"),
  );
  for (const file of videoFiles) {
    const video = JSON.parse(
      await readFile(join(cache, "youtube", file), "utf8"),
    ) as { id: string; title: string; description: string; channel: string };
    if (only && !video.id.includes(only)) continue;
    if (onlySet && onlySet !== "youtube") continue;
    const text = `${video.title}\n\n${video.description}`;
    const base = {
      set: "youtube",
      id: `${video.channel}: ${video.title}`,
      textChars: text.length,
    } as const;
    let row: Row;
    try {
      row = rowFromExtraction(
        base,
        await extractRecipeWithLlm({ text, sourceKind: "text", config }),
      );
    } catch (error) {
      row = {
        ...base,
        found: false,
        durationMs: NaN,
        error: String((error as Error)?.message ?? error),
      };
    }
    rows.push(row);
    console.log(
      `youtube  ${secs(row.durationMs).padStart(5)} s  ${
        row.found ? `${row.grounded}/${row.total} grounded` : "not found"
      }${row.partial ? " PARTIAL" : ""}${
        row.noise ? `  NOISE ${JSON.stringify(row.noise)}` : ""
      }  ${row.id}`,
    );
    await save();
  }

  const { stdout: ps } = await run("ollama", ["ps"]).catch(() => ({
    stdout: "(ollama ps unavailable)",
  }));
  summarise(rows, config.model, warm.durationMs, ps);
}

function summarise(rows: Row[], model: string, warmMs: number, ps: string) {
  const schema = rows.filter((row) => row.set === "schema");
  const sum = (list: Row[], key: keyof Row) =>
    list.reduce((total, row) => total + ((row[key] as number) ?? 0), 0);
  const durations = (list: Row[]) =>
    list.map((row) => row.durationMs).filter(Number.isFinite);

  console.log(`\n## ${model}\n`);
  console.log(`cold load (warm-up call): ${secs(warmMs)} s`);
  console.log(ps.trim());
  console.log(
    "\n| set | pages | found | trusted (not partial) | grounded | recall (loose / exact) | precision | steps (got/ref) | times agree | lines put back | median s | max s |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const set of ["schema", "noschema", "youtube"] as const) {
    const list = rows.filter((row) => row.set === set);
    if (list.length === 0) continue;
    const found = list.filter((row) => row.found);
    const isSchema = set === "schema";
    console.log(
      `| ${set} | ${list.length} | ${found.length} | ${
        found.filter((row) => !row.partial).length
      } | ${pct(sum(found, "grounded"), sum(found, "total"))} | ${
        isSchema
          ? `${pct(sum(list, "recallLoose"), sum(list, "refIngredients"))} / ${pct(sum(list, "recallExact"), sum(list, "refIngredients"))}`
          : "–"
      } | ${
        isSchema
          ? pct(sum(list, "precisionLoose"), sum(found, "ingredients"))
          : "–"
      } | ${
        isSchema
          ? `${sum(found, "steps")}/${sum(list, "refSteps")}`
          : sum(found, "steps")
      } | ${
        isSchema
          ? `${sum(list, "timesAgree")}/${sum(list, "timesRef")} (+${sum(list, "timesInvented")} invented)`
          : "–"
      } | ${sum(found, "added")} | ${secs(median(durations(list)))} | ${secs(Math.max(...durations(list)))} |`,
    );
  }
  const recall = sum(schema, "recallLoose") / sum(schema, "refIngredients");
  const grounded =
    sum(
      schema.filter((row) => row.found),
      "grounded",
    ) /
    sum(
      schema.filter((row) => row.found),
      "total",
    );
  const medianS = median(durations(schema)) / 1000;
  const pass = recall >= 0.95 && grounded >= 0.95 && medianS <= 30;
  console.log(
    `\ngate (schema pages): recall ${pct(recall, 1)} grounded ${pct(grounded, 1)} median ${medianS.toFixed(1)} s → ${pass ? "PASS" : "MISS"}`,
  );
}

async function unload(config: LlmConfig) {
  if (config.api !== "ollama") return;
  await fetch(`${config.url}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ model: config.model, keep_alive: 0 }),
  }).catch(() => {});
}

async function main() {
  const mode = process.argv[2];
  const cache = flag("cache");
  if (!cache || (mode !== "fetch" && mode !== "run")) {
    console.error(
      "usage: measure-llm-import.ts fetch --corpus <file> --cache <dir>\n" +
        "       measure-llm-import.ts run --cache <dir> [--model qwen3:8b] [--url http://localhost:11434] [--only <substr>] [--out <file>] [--keep]",
    );
    process.exit(2);
  }
  if (mode === "fetch") {
    const corpus = flag("corpus");
    if (!corpus) throw new Error("--corpus is required");
    await fetchCorpus(corpus, cache);
    return;
  }
  const config: LlmConfig = {
    url: flag("url") ?? "http://localhost:11434",
    model: flag("model") ?? "qwen3:8b",
    api: flag("api") === "openai" ? "openai" : "ollama",
  };
  try {
    await measure(cache, config, flag("only"));
  } finally {
    if (!process.argv.includes("--keep")) await unload(config);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
