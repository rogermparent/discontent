/*
 * The 44e harness: the editor's curator agent, run for real on scripted
 * asks, one JSON line per run (epic 44, 44e). Local only — it needs a model
 * (`RECIPE_LLM_URL` from `editor/.env`, or the Claude API) and a scratch
 * clone of the content repository; never run in CI, never against
 * `editor/content`.
 *
 *   pnpm --filter recipe-editor exec tsx scripts/agent-measure.ts \
 *     --content-dir /scratch/content-clone --model qwen3:8b \
 *     [--think] [--num-ctx 12288|16384] [--asks a,b,c,d] [--repeat N] \
 *     [--max-turns N] [--newer-web-tools] [--jobs-dir DIR] [--out runs.jsonl] [--verbose]
 *
 * The asks (`agentMeasure.ts`): (a) gochujang, a read; (b) tahini →
 * `middle-eastern` if the term exists, a read and a conditional write; (c)
 * import the fixture page `test/fixtures/agent/lemon-garlic-chicken-thighs.html`,
 * served here on 127.0.0.1, and tag it; (d) two Sally's cookie recipes not
 * on the site, listed — for Claude with its own server-side search (46d),
 * for a local model only when `RECIPE_SEARCH_URL` is set (else its line says
 * `skipped`). `--newer-web-tools` gives Claude's runs the newer web tools
 * (46d); each line records the run's estimated cost (`costEstimateUsd`,
 * null for a model with no price), its budget and its web searches.
 *
 * Each run is an `agent` job exactly as the editor runs one —
 * `runAgentJob`: the same system prompt, tools, `num_ctx` and `think`
 * (`RECIPE_AGENT_NUM_CTX` / `RECIPE_AGENT_THINK`, which this sets from
 * `--num-ctx` / `--think`), the transcript beside the job — in a job store
 * of its own (`--jobs-dir`, default `<content dir>/../agent-measure-jobs`),
 * with one difference: the SSRF guard lets `127.0.0.1` through for the
 * fixture server (`AgentToolsetTesting`, Ee6, for the agent's own checks;
 * `setFetchGuardTesting`, 46a, for the importer's fetches), which nothing
 * in the editor, the route or the CLI can set.
 *
 * Before the first run the clone is reindexed — a fresh `git clone` has no
 * indexes, and readers never create them (F30, Ee9) — and its counts go to
 * stderr (recipes and terms indexed against on disk, the gochujang and
 * tahini sets); it refuses when the indexes list none of what is on disk.
 * Between runs the clone is put back: `git reset --hard` to the commit it
 * started at, `git clean -fd`, and a reindex — so every run starts from the
 * same corpus. The clone must be a git repository with a clean tree.
 *
 * A line: `{model, api, think, numCtx, ask, run, job, stopReason, error?,
 * turns, toolCalls: {total, valid, malformed, toolErrors, names}, calls,
 * wallMs, elapsedMs, tokens: {in, out}, trimmed, written, commits, changed,
 * matched, notes, text}` — `valid` counts the well-formed calls (an answer
 * or the tool's own refusal), `malformed` the model's broken ones, `written`
 * the write calls the transcript shows, `commits` / `changed` what git
 * shows. Lines go to stdout and, with `--out`, are appended to the file.
 */
import { execFile } from "node:child_process";
import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { createLocalBackend } from "../cli/backend/local";
import { loadEditorEnv } from "../cli/editorEnv";
import {
  AGENT_CONTEXT_STEPS,
  runAgentJob,
  type AgentJobResult,
  type AgentJobSpec,
} from "../controller/agent/job";
import {
  historyOf,
  readTranscriptText,
  transcriptRecords,
} from "../controller/agent/transcript";
import type { CurationContext } from "../controller/curation/context";
import { freshIndexes, reindex } from "../controller/curation/reindex";
import { jobLabel, jobResources, jobTier } from "../controller/jobs/kinds";
import { runJob } from "../controller/jobs/run";
import { llmConfig } from "../controller/llm/client";
import { setFetchGuardTesting } from "../controller/urlGuard";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import {
  ASK_IDS,
  FIXTURE_FILE,
  FIXTURE_IMAGE_PATH,
  FIXTURE_PATH,
  SALLYS_HOST,
  TAHINI_TERM,
  askPrompt,
  callRecords,
  checkGochujang,
  checkImport,
  askSkipped,
  checkSallysList,
  checkTahini,
  contentDirectoryRefusal,
  positiveInt,
  prepareCorpus,
  slugsFromPaths,
  urlKey,
  writesOf,
  type AskId,
  type CheckResult,
  type CorpusCounts,
  type ImportedRecipe,
} from "./agentMeasure";

const run = promisify(execFile);
const EDITOR = path.resolve(__dirname, "..");
const ROOT = path.resolve(EDITOR, "../../..");
const FIXTURES = path.join(ROOT, "test/fixtures/agent");
const FIXTURE_IMAGE = path.join(
  EDITOR,
  "playwright/fixtures/images/recipe-6-test-image.png",
);

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`agent-measure: ${message}`);
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Never the real repository                                            */
/* ------------------------------------------------------------------ */

/** `git rev-parse <args>` in `cwd`, resolved through symlinks; nothing when it fails. */
async function gitPath(
  cwd: string,
  args: string[],
): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["rev-parse", ...args], { cwd });
    return await realpath(path.resolve(cwd, stdout.trim()));
  } catch {
    return undefined;
  }
}

const commonDirOf = (cwd: string) =>
  gitPath(cwd, ["--path-format=absolute", "--git-common-dir"]);

/**
 * The facts `contentDirectoryRefusal` judges (review of 44e): the clone's
 * own repository, and the repositories it must never be — this code
 * checkout's (any worktree of it, the main checkout) and the real content
 * repository behind `editor/content` (this checkout's link and the main
 * checkout's; a worktree has none of its own), each by its git common dir,
 * so a `git worktree add` of either is caught too.
 */
async function checkedContentDirectory(given: string): Promise<string> {
  const directory = await realpath(path.resolve(given)).catch(() =>
    fail(`no such content directory: ${given}`),
  );
  const monorepoCommon = await commonDirOf(EDITOR);
  const links = [path.join(EDITOR, "content")];
  if (monorepoCommon) {
    links.push(
      path.join(
        path.dirname(monorepoCommon),
        "websites/recipe-website/editor/content",
      ),
    );
  }
  const liveDirectories = (
    await Promise.all(
      links.map((link) => realpath(link).catch(() => undefined)),
    )
  ).filter((dir): dir is string => !!dir);
  const liveCommons = await Promise.all(liveDirectories.map(commonDirOf));
  const forbiddenCommonDirs = [monorepoCommon, ...liveCommons].filter(
    (dir): dir is string => !!dir,
  );
  const recipes = await stat(path.join(directory, "recipes")).catch(
    () => undefined,
  );
  const refusal = contentDirectoryRefusal({
    directory,
    toplevel: await gitPath(directory, ["--show-toplevel"]),
    commonDir: await commonDirOf(directory),
    hasRecipes: !!recipes?.isDirectory(),
    liveDirectories: [...new Set(liveDirectories)],
    forbiddenCommonDirs: [...new Set(forbiddenCommonDirs)],
  });
  if (refusal) fail(`refusing ${directory}: ${refusal}`);
  return directory;
}

/* ------------------------------------------------------------------ */
/* The fixture server                                                   */
/* ------------------------------------------------------------------ */

async function serveFixtures(): Promise<{ server: Server; origin: string }> {
  const page = await readFile(path.join(FIXTURES, FIXTURE_FILE), "utf8");
  const image = await readFile(FIXTURE_IMAGE);
  let origin = "";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin);
    if (
      url.pathname === FIXTURE_PATH ||
      url.pathname === FIXTURE_PATH.slice(0, -1)
    ) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(page.replaceAll("{{ORIGIN}}", origin));
      return;
    }
    if (url.pathname === FIXTURE_IMAGE_PATH) {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(image);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    fail("the fixture server has no port");
  origin = `http://127.0.0.1:${address.port}`;
  return { server, origin };
}

/* ------------------------------------------------------------------ */
/* Facts about the corpus                                               */
/* ------------------------------------------------------------------ */

type Backend = ReturnType<typeof createLocalBackend>;

async function searchAll(backend: Backend, query: string): Promise<string[]> {
  const slugs: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await backend.searchRecipes(query, { limit: 100, offset });
    slugs.push(...page.recipes.map((row) => row.slug));
    if (page.recipes.length === 0 || slugs.length >= page.total) break;
  }
  return slugs;
}

async function vocabulary(backend: Backend) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await backend.listTerms({ limit: 500, offset });
    rows.push(...page.terms);
    if (!page.more || page.terms.length === 0) break;
  }
  const terms = new Set<string>();
  const parents = new Set<string>();
  for (const row of rows) {
    terms.add(row.slug);
    /* Compared with a tag's `tagSlug` (Ee9), so aliases are slugged too. */
    for (const alias of row.aliases ?? []) terms.add(tagSlug(alias));
    if (row.parent) parents.add(row.parent);
  }
  const roots = new Set(
    rows
      .filter((row) => !row.parent && parents.has(row.slug))
      .map((row) => row.slug),
  );
  /* `term_list` also lists tags no record names; `records` counts the records. */
  const records = rows.filter((row) => row.record).length;
  return { terms, roots, records };
}

/** Directories under `dir`; none when it is missing. */
async function directoriesIn(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).length;
}

/** What is on disk against what the indexes list (Ee9). */
async function countCorpus(
  backend: Backend,
  directory: string,
): Promise<CorpusCounts> {
  return {
    recipesOnDisk: await directoriesIn(path.join(directory, "recipes/data")),
    recipesIndexed: (await backend.listRecipes({ limit: 1 })).total,
    termsOnDisk: await directoriesIn(
      path.join(directory, "taxonomies/tag/data"),
    ),
    termsIndexed: (await vocabulary(backend)).records,
  };
}

async function tagsOf(backend: Backend, slug: string): Promise<string[]> {
  try {
    return (await backend.getRecipe(slug)).recipe.tags ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* One run                                                              */
/* ------------------------------------------------------------------ */

interface Settings {
  ctx: CurationContext;
  backend: Backend;
  jobsDir: string;
  origin: string;
  start: string;
  maxTurns?: number;
  /** 46d: Claude's newer web tools for every run (`--newer-web-tools`). */
  newerWebTools: boolean;
  verbose: boolean;
}

async function gitFacts(directory: string, start: string) {
  const git = simpleGit({ baseDir: directory });
  const commits = Number(
    (await git.raw(["rev-list", "--count", `${start}..HEAD`])).trim(),
  );
  const names = (await git.raw(["diff", "--name-only", start, "HEAD"]))
    .split("\n")
    .filter(Boolean);
  const status = await git.status();
  return { commits, changed: slugsFromPaths(names), dirty: !status.isClean() };
}

async function putBack(settings: Settings): Promise<boolean> {
  const git = simpleGit({ baseDir: settings.ctx.contentDirectory });
  const head = (await git.revparse(["HEAD"])).trim();
  const status = await git.status();
  if (head === settings.start && status.isClean()) {
    /* Nothing to put back; the indexes still describe the start (Ee9). */
    if (!(await freshIndexes(settings.ctx.contentDirectory))) {
      await reindex(settings.ctx);
    }
    return false;
  }
  await git.reset(["--hard", settings.start]);
  await git.clean("f", ["-d"]);
  await reindex(settings.ctx);
  return true;
}

async function measure(
  ask: AskId,
  index: number,
  settings: Settings,
): Promise<Record<string, unknown>> {
  const { backend, ctx } = settings;
  const fixtureUrl = `${settings.origin}${FIXTURE_PATH}`;
  const prompt = askPrompt(ask, fixtureUrl);

  /* Before: what the corpus says the answer is. */
  const expected =
    ask === "a"
      ? await searchAll(backend, "ingredient:gochujang")
      : ask === "b"
        ? await searchAll(backend, "ingredient:tahini")
        : [];
  const vocab =
    ask === "b" || ask === "c" ? await vocabulary(backend) : undefined;
  const existingSources = new Set<string>();
  if (ask === "d") {
    for (const slug of await searchAll(backend, `source:${SALLYS_HOST}`)) {
      const source = (await backend.getRecipe(slug)).recipe.source?.url;
      const key = source ? urlKey(source) : undefined;
      if (key) existingSources.add(key);
    }
  }

  const spec: AgentJobSpec = {
    kind: "agent",
    contentDirectory: ctx.contentDirectory,
    prompt,
    ...(settings.maxTurns ? { maxTurns: settings.maxTurns } : {}),
    ...(settings.newerWebTools ? { newerWebTools: true } : {}),
  };
  const began = Date.now();
  let outcome: { job: string; result: AgentJobResult } | undefined;
  let crashed: string | undefined;
  try {
    outcome = await runJob(
      {
        kind: "agent",
        label: jobLabel(spec),
        spec,
        tier: jobTier(spec),
        resources: jobResources(spec),
      },
      (job) =>
        runAgentJob(spec, {
          ctx,
          job,
          dir: settings.jobsDir,
          testing: { allowHosts: ["127.0.0.1"] },
        }),
      { dir: settings.jobsDir, ...(settings.verbose ? {} : { mirror: null }) },
    );
  } catch (error) {
    crashed = error instanceof Error ? error.message : String(error);
  }
  const elapsedMs = Date.now() - began;

  const transcript = outcome
    ? await readTranscriptText(settings.jobsDir, outcome.job)
    : undefined;
  const messages = transcript ? historyOf(transcriptRecords(transcript)) : [];
  const calls = callRecords(messages);
  const written = writesOf(calls);
  const facts = await gitFacts(ctx.contentDirectory, settings.start);
  const text = outcome?.result.text ?? "";

  let check: CheckResult & { checkedTerm?: boolean };
  if (ask === "a") {
    check = checkGochujang({ expected, text, commits: facts.commits });
  } else if (ask === "b") {
    const tagsAfter: Record<string, string[]> = {};
    for (const slug of expected) tagsAfter[slug] = await tagsOf(backend, slug);
    check = checkTahini({
      termExists: vocab!.terms.has(TAHINI_TERM),
      expected,
      tagsAfter,
      changed: facts.changed,
      text,
      commits: facts.commits,
      calls,
    });
  } else if (ask === "c") {
    const imported: ImportedRecipe[] = [];
    const others: string[] = [];
    for (const slug of facts.changed) {
      const detail = await backend.getRecipe(slug).catch(() => undefined);
      const source = detail?.recipe.source?.url;
      if (detail && source && urlKey(source) === urlKey(fixtureUrl)) {
        imported.push({
          slug,
          tags: detail.recipe.tags ?? [],
          ingredients: detail.recipe.ingredients?.length ?? 0,
          instructions: detail.recipe.instructions?.length ?? 0,
          ...(detail.recipe.totalTime !== undefined
            ? { totalTime: detail.recipe.totalTime }
            : {}),
        });
      } else {
        others.push(slug);
      }
    }
    check = checkImport({
      imported,
      terms: vocab!.terms,
      roots: vocab!.roots,
      changedOthers: others,
    });
  } else {
    check = checkSallysList({ text, existingSources, commits: facts.commits });
  }
  if (crashed)
    check = { matched: false, notes: [`crashed: ${crashed}`, ...check.notes] };

  const result = outcome?.result;
  const malformed = calls.filter((call) => call.outcome === "malformed").length;
  const toolErrors = calls.filter(
    (call) => call.outcome === "tool_error",
  ).length;
  const api = result?.api ?? llmConfig()?.api;
  /* `num_ctx` and `think` are a local model's (Ee4/Ee5): null for Claude. */
  const local = api !== "anthropic";
  const line = {
    at: new Date().toISOString(),
    model: result?.model ?? llmConfig()?.model,
    api,
    think: local ? process.env.RECIPE_AGENT_THINK === "1" : null,
    numCtx: local ? Number(process.env.RECIPE_AGENT_NUM_CTX) : null,
    ask,
    run: index + 1,
    job: outcome?.job,
    stopReason: result?.stopReason ?? "crashed",
    ...(result?.error ? { error: result.error } : {}),
    turns: result?.turns ?? 0,
    toolCalls: {
      total: calls.length,
      valid: calls.length - malformed,
      malformed,
      toolErrors,
      names: calls.map((call) => call.name),
    },
    calls: calls.map((call) => ({
      name: call.name,
      outcome: call.outcome,
      ...(call.code ? { code: call.code } : {}),
      ...(call.outcome !== "ok" && call.message
        ? { message: call.message }
        : {}),
    })),
    wallMs: result?.durationMs,
    elapsedMs,
    tokens: {
      in: result?.usage.inputTokens ?? 0,
      out: result?.usage.outputTokens ?? 0,
    },
    /* 46d: every run's cost, null for a model with no price (a local one). */
    costEstimateUsd: result?.usage.costEstimateUsd ?? null,
    maxCostUsd: result?.maxCostUsd ?? null,
    newerWebTools: result?.newerWebTools === true,
    webSearches: result?.usage.webSearchRequests ?? 0,
    trimmed: result?.trimmed ?? 0,
    written,
    commits: facts.commits,
    changed: facts.changed,
    ...(facts.dirty ? { dirty: true } : {}),
    ...(check.checkedTerm !== undefined
      ? { checkedTerm: check.checkedTerm }
      : {}),
    matched: check.matched,
    notes: check.notes,
    text: text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text,
  };
  return line;
}

/* ------------------------------------------------------------------ */
/* main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const given = flag("content-dir");
  const model = flag("model");
  if (!given || !model) {
    fail(
      "usage: tsx scripts/agent-measure.ts --content-dir <clone> --model <name> [--think] [--num-ctx N] [--asks a,b,c,d] [--repeat N] [--max-turns N] [--newer-web-tools] [--jobs-dir DIR] [--out file.jsonl] [--verbose]",
    );
  }
  const contentDirectory = await checkedContentDirectory(given);
  const git = simpleGit({ baseDir: contentDirectory });
  if (!(await git.status()).isClean()) {
    fail(
      `${contentDirectory} has uncommitted changes: the harness resets it between runs`,
    );
  }
  const start = (await git.revparse(["HEAD"])).trim();

  const numCtx = Number(flag("num-ctx") ?? AGENT_CONTEXT_STEPS[0]);
  if (!AGENT_CONTEXT_STEPS.includes(numCtx)) {
    fail(
      `--num-ctx takes ${AGENT_CONTEXT_STEPS.join(" or ")} (the editor's own steps)`,
    );
  }
  const jobsDir = path.resolve(
    flag("jobs-dir") ??
      path.join(path.dirname(contentDirectory), "agent-measure-jobs"),
  );
  await mkdir(jobsDir, { recursive: true });

  /* The run's settings win over editor/.env; the model's URL comes from it. */
  process.env.RECIPE_LLM_MODEL = model;
  process.env.RECIPE_AGENT_NUM_CTX = String(numCtx);
  process.env.RECIPE_AGENT_THINK = has("think") ? "1" : "0";
  process.env.RECIPE_JOBS_DIR = jobsDir;
  loadEditorEnv();
  /* 46a: the importer's guard lets the fixture server through, as the
   * agent's does (`testing` below). */
  setFetchGuardTesting({ allowHosts: ["127.0.0.1"] });
  const config = llmConfig();
  if (!config)
    fail(
      "no model configured: set RECIPE_LLM_URL (editor/.env) or the Claude API",
    );

  const asks = (flag("asks") ?? "a,b,c,d")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean) as AskId[];
  for (const id of asks) {
    if (!ASK_IDS.includes(id)) fail(`unknown ask ${id} (a, b, c or d)`);
  }
  const repeat = positiveInt(flag("repeat") ?? "1", 100);
  if (repeat === undefined) fail("--repeat takes a whole number from 1 to 100");
  const maxTurnsText = flag("max-turns");
  /* Ec7: a caller may lower E3's 40 turns, never raise them. */
  const maxTurns =
    maxTurnsText === undefined ? undefined : positiveInt(maxTurnsText, 40);
  if (maxTurnsText !== undefined && maxTurns === undefined) {
    fail("--max-turns takes a whole number from 1 to 40");
  }
  const out = flag("out") ? path.resolve(flag("out")!) : undefined;
  if (out) await mkdir(path.dirname(out), { recursive: true });

  const ctx: CurationContext = { contentDirectory };
  const backend = createLocalBackend({ ...ctx, inProcess: true });
  /*
   * Ee9: a fresh `git clone` has no indexes and readers never create them
   * (F30), so every search — the model's and the checkers' own `expected`
   * sets — answered "none" on the first real run. Always rebuild before the
   * first run, then make sure the indexes list what is on disk.
   */
  const reindexStart = Date.now();
  const prepared = await prepareCorpus({
    reindex: () => reindex(ctx),
    count: () => countCorpus(backend, contentDirectory),
  });
  const { counts } = prepared;
  const gochujang = (await searchAll(backend, "ingredient:gochujang")).length;
  const tahini = (await searchAll(backend, "ingredient:tahini")).length;
  console.error(
    `agent-measure: reindexed in ${Date.now() - reindexStart} ms — recipes ${counts.recipesIndexed} indexed / ${counts.recipesOnDisk} on disk, terms ${counts.termsIndexed} / ${counts.termsOnDisk}; ingredient:gochujang ${gochujang}, ingredient:tahini ${tahini}`,
  );
  if (prepared.refusal) {
    await closeCachedEnvironments();
    fail(`the indexes do not describe the clone: ${prepared.refusal}`);
  }
  const { server, origin } = await serveFixtures();
  const settings: Settings = {
    ctx,
    backend,
    jobsDir,
    origin,
    start,
    ...(maxTurns ? { maxTurns } : {}),
    newerWebTools: has("newer-web-tools"),
    verbose: has("verbose"),
  };
  console.error(
    `agent-measure: ${config.api} ${config.model}, num_ctx ${numCtx}, think ${has("think") ? "on" : "off"}; ${contentDirectory} at ${start.slice(0, 8)}; jobs in ${jobsDir}; fixture ${origin}${FIXTURE_PATH}`,
  );

  try {
    for (const ask of asks) {
      for (let index = 0; index < repeat; index += 1) {
        let line: Record<string, unknown>;
        const skipped = askSkipped(ask, config.api, process.env);
        if (skipped) {
          line = {
            at: new Date().toISOString(),
            model: config.model,
            ask,
            run: index + 1,
            skipped,
          };
        } else {
          console.error(`agent-measure: ask ${ask}, run ${index + 1}…`);
          line = await measure(ask, index, settings);
          if (await putBack(settings)) {
            console.error(
              `agent-measure: put the clone back at ${start.slice(0, 8)}`,
            );
          }
        }
        const text = JSON.stringify(line);
        console.log(text);
        if (out) await appendFile(out, `${text}\n`);
      }
    }
  } finally {
    server.close();
    await closeCachedEnvironments();
  }
  console.error(
    `agent-measure: steps and transcripts in ${jobsDir} (RECIPE_JOBS_DIR=${jobsDir} pnpm recipes jobs show <job>)`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
