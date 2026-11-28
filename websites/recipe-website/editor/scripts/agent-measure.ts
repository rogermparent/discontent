/*
 * The 44e harness: the editor's curator agent, run for real on scripted
 * asks, one JSON line per run (epic 44, 44e). Local only — it needs a model
 * (`RECIPE_LLM_URL` from `editor/.env`, or the Claude API) and a scratch
 * clone of the content repository; never run in CI, never against
 * `editor/content`.
 *
 *   pnpm --filter recipe-editor exec tsx scripts/agent-measure.ts \
 *     --content-dir /scratch/content-clone --model qwen3:8b[,qwen3.5:9b] \
 *     [--think] [--num-ctx 12288|16384] [--asks a,b,c,d,e,f,g,h] [--cases file.json] [--repeat N] \
 *     [--max-turns N] [--newer-web-tools] [--intent online|mine|plan|organize|any|auto]
 *     [--jobs-dir DIR] [--out runs.jsonl] [--summary scores.json] [--verbose]
 *
 * `--model a,b` (or `--models a,b`; 51e) runs every ask on each model in
 * turn, on the configured server. When any case of the case file ran, the
 * end prints the scores on stderr — case × model, the passes over the
 * repeats and the median run time (`summarizeRuns`, `formatSummary`) —
 * and writes them as JSON to `--summary`, else beside `--out`
 * (`runs.jsonl` → `runs.summary.json`). Each run's line is unchanged.
 *
 * `--intent` (51b) runs every ask with that intent (`auto`: guessed, as the
 * curator page will); unset, the open loop as before. A line then carries
 * the intent the run took and its plan's `outcome`; an "answer" case of a
 * `mine` run is scored on the plan's fits and maybes (`answeredText`), not
 * the answer's prose, which also lists the near misses it left out.
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
  writeFile,
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
import { sourceUrlKey } from "recipe-website-common/util/roundupPage";
import { existingBySource } from "../controller/curation/importList";
import {
  AGENT_INTENT_CHOICES,
  isAgentIntentChoice,
  type AgentIntentChoice,
} from "../controller/agent/intents/guess";
import {
  ASK_IDS,
  FIXTURE_FILE,
  FIXTURE_IMAGE_PATH,
  FIXTURE_PATH,
  SALLYS_HOST,
  TAHINI_TERM,
  askPrompt,
  callRecords,
  caseFileFaults,
  answeredText,
  checkAnswerSlugs,
  checkGochujang,
  checkHeldGroup,
  checkImport,
  checkNewImports,
  askSkipped,
  checkSallysList,
  checkTahini,
  contentDirectoryRefusal,
  formatSummary,
  modelList,
  parseCases,
  positiveInt,
  prepareCorpus,
  slugsFromPaths,
  summarizeRuns,
  summaryPathFor,
  urlKey,
  writesOf,
  type AskId,
  type RunLine,
  type CheckResult,
  type CorpusCounts,
  type CuratorCase,
  type ImportedRecipe,
} from "./agentMeasure";

const run = promisify(execFile);
const EDITOR = path.resolve(__dirname, "..");
const ROOT = path.resolve(EDITOR, "../../..");
const FIXTURES = path.join(ROOT, "test/fixtures/agent");
/** 51a: the case file (`--cases` picks another). */
const DEFAULT_CASES = path.join(EDITOR, "scripts/curator-cases.json");
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

/** Every recipe's slug and name: what "already have" is compared with (51a). */
async function recipeBank(
  backend: Backend,
): Promise<Array<{ slug: string; name: string }>> {
  const bank: Array<{ slug: string; name: string }> = [];
  for (let offset = 0; ; offset += 100) {
    const page = await backend.listRecipes({ limit: 100, offset });
    bank.push(
      ...page.recipes.map((row) => ({ slug: row.slug, name: row.name })),
    );
    if (page.recipes.length === 0 || bank.length >= page.total) break;
  }
  return bank;
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
  /** 51a: the case file's cases by id; they run with writes held. */
  cases: ReadonlyMap<string, CuratorCase>;
  /** 46d: Claude's newer web tools for every run (`--newer-web-tools`). */
  newerWebTools: boolean;
  /** 51b: every run's intent (`--intent`); unset, the loop. */
  intent?: AgentIntentChoice;
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
  ask: string,
  index: number,
  settings: Settings,
): Promise<Record<string, unknown>> {
  const { backend, ctx } = settings;
  const fixtureUrl = `${settings.origin}${FIXTURE_PATH}`;
  const curatorCase = settings.cases.get(ask);
  const prompt = curatorCase?.ask ?? askPrompt(ask as AskId, fixtureUrl);
  /* 51a: the case's corpus facts, from before the run. */
  const bank = curatorCase ? await recipeBank(backend) : [];

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
    ...(curatorCase ? { hold: true } : {}),
    ...(settings.maxTurns ? { maxTurns: settings.maxTurns } : {}),
    ...(settings.newerWebTools ? { newerWebTools: true } : {}),
    ...(settings.intent ? { intent: settings.intent } : {}),
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
  if (curatorCase) {
    const faults = caseFileFaults(
      curatorCase,
      new Set(bank.map((recipe) => recipe.slug)),
    );
    let scored: CheckResult;
    if (curatorCase.kind === "new-imports") {
      const urls = calls
        .map((call) => (call.input as { url?: unknown } | undefined)?.url)
        .filter((url): url is string => typeof url === "string");
      const { found, warnings } = await existingBySource(ctx, urls);
      scored = checkNewImports({
        calls,
        count: curatorCase.count,
        sourceKey: (url) => (URL.canParse(url) ? sourceUrlKey(url) : undefined),
        existing: found,
        bank,
        commits: facts.commits,
      });
      /* No index to ask (a clone not reindexed) means "already have" was
       * not checked: fail, never pass. */
      scored.notes.push(...warnings);
      if (warnings.length > 0) scored.matched = false;
    } else if (curatorCase.kind === "answer") {
      scored = checkAnswerSlugs({
        text: answeredText(text, outcome?.result.outcome),
        include: curatorCase.include,
        exclude: curatorCase.exclude,
        commits: facts.commits,
      });
    } else {
      scored = checkHeldGroup({
        calls,
        tag: curatorCase.tag,
        require: curatorCase.require,
        minItems: curatorCase.minItems,
        commits: facts.commits,
      });
    }
    check = {
      matched: scored.matched && faults.length === 0,
      notes: [...faults, ...scored.notes],
    };
  } else if (ask === "a") {
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
    ...(result?.intent ? { intent: result.intent } : {}),
    ...(result?.outcome ? { outcome: result.outcome } : {}),
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
  /* 51e: several models in one go, `--model a,b` or `--models a,b`. */
  const models = modelList(flag("model"), flag("models"));
  if (!given || models.length === 0) {
    fail(
      "usage: tsx scripts/agent-measure.ts --content-dir <clone> --model <name>[,<name>…] [--think] [--num-ctx N] [--asks a,b,c,d] [--cases file.json] [--repeat N] [--max-turns N] [--newer-web-tools] [--intent <id|auto>] [--jobs-dir DIR] [--out file.jsonl] [--summary file.json] [--verbose]",
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
  const selectModel = (model: string) => {
    process.env.RECIPE_LLM_MODEL = model;
    /* 51a: RECIPE_AGENT_MODEL (editor/.env) would win for the curator. */
    process.env.RECIPE_AGENT_MODEL = model;
  };
  selectModel(models[0]);
  process.env.RECIPE_AGENT_NUM_CTX = String(numCtx);
  process.env.RECIPE_AGENT_THINK = has("think") ? "1" : "0";
  process.env.RECIPE_JOBS_DIR = jobsDir;
  loadEditorEnv();
  /* 46a: the importer's guard lets the fixture server through, as the
   * agent's does (`testing` below). */
  setFetchGuardTesting({ allowHosts: ["127.0.0.1"] });
  if (!llmConfig())
    fail(
      "no model configured: set RECIPE_LLM_URL (editor/.env) or the Claude API",
    );

  /* 51a: the case file's cases (e–h) beside the built-in asks (a–d). */
  const casesFile = path.resolve(flag("cases") ?? DEFAULT_CASES);
  const caseList = await readFile(casesFile, "utf8")
    .then((text) => parseCases(JSON.parse(text)))
    .catch((error) => {
      if (!flag("cases") && (error as NodeJS.ErrnoException).code === "ENOENT")
        return [];
      return fail(
        `${casesFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  const cases = new Map(caseList.map((entry) => [entry.id, entry] as const));
  const asks = (
    flag("asks") ??
    (flag("cases") ? caseList.map((entry) => entry.id).join(",") : "a,b,c,d")
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of asks) {
    if (!(ASK_IDS as readonly string[]).includes(id) && !cases.has(id)) {
      fail(`unknown ask ${id} (${[...ASK_IDS, ...cases.keys()].join(", ")})`);
    }
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
  const intent = flag("intent");
  if (intent !== undefined && !isAgentIntentChoice(intent)) {
    fail(`--intent takes ${AGENT_INTENT_CHOICES.join(", ")}`);
  }
  const out = flag("out") ? path.resolve(flag("out")!) : undefined;
  if (out) await mkdir(path.dirname(out), { recursive: true });
  /* 51e: the score summary's JSON, beside `--out` unless named. */
  const summaryFile = flag("summary")
    ? path.resolve(flag("summary")!)
    : out
      ? summaryPathFor(out)
      : undefined;
  if (summaryFile) await mkdir(path.dirname(summaryFile), { recursive: true });

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
    cases,
    ...(maxTurns ? { maxTurns } : {}),
    newerWebTools: has("newer-web-tools"),
    ...(intent ? { intent } : {}),
    verbose: has("verbose"),
  };
  /* 51e: every line, for the score summary at the end. */
  const lines: RunLine[] = [];
  try {
    for (const model of models) {
      selectModel(model);
      const config = llmConfig();
      if (!config) fail(`no model configured for ${model}`);
      console.error(
        `agent-measure: ${config.api} ${config.model}, num_ctx ${numCtx}, think ${has("think") ? "on" : "off"}; ${contentDirectory} at ${start.slice(0, 8)}; jobs in ${jobsDir}; fixture ${origin}${FIXTURE_PATH}`,
      );
      for (const ask of asks) {
        for (let index = 0; index < repeat; index += 1) {
          let line: Record<string, unknown>;
          const skipped = cases.has(ask)
            ? undefined
            : askSkipped(ask as AskId, config.api, process.env);
          if (skipped) {
            line = {
              at: new Date().toISOString(),
              model: config.model,
              ask,
              run: index + 1,
              skipped,
            };
          } else {
            console.error(
              `agent-measure: ${config.model}, ask ${ask}, run ${index + 1}…`,
            );
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
          /* Keyed by the model asked for, whatever the line's says. */
          lines.push({ ...(line as unknown as RunLine), model });
        }
      }
    }
  } finally {
    server.close();
    await closeCachedEnvironments();
  }
  /*
   * 51e (D7): the scores, case × model — on stderr, so stdout stays one
   * JSON line per run — and as JSON beside `--out` (or `--summary`).
   */
  const caseIds = new Set(asks.filter((id) => cases.has(id)));
  if (caseIds.size > 0) {
    const summary = summarizeRuns(lines, { only: caseIds });
    console.error(
      `agent-measure: scores (passes / runs · median time)\n${formatSummary(summary)}`,
    );
    if (summaryFile) {
      await writeFile(
        summaryFile,
        `${JSON.stringify(
          {
            at: new Date().toISOString(),
            contentStart: start,
            repeat,
            ...(intent ? { intent } : {}),
            ...summary,
          },
          null,
          2,
        )}\n`,
      );
      console.error(`agent-measure: summary in ${summaryFile}`);
    }
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
