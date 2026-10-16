/**
 * `pnpm recipes <command>` — the curator's hands.
 *
 * ## Why the argv is split before it is parsed
 *
 * `node:util`'s `parseArgs` is strict and flat: it has no notion of a
 * subcommand, so one call would have to know every command's options at once
 * and would accept `recipes list --dry-run` happily. Two strict passes give
 * real per-command validation — an unknown flag is an error rather than a
 * silently ignored token — at the cost of splitting the argv by hand first.
 *
 * The split's one subtlety is that a *global* may appear before the command
 * (`recipes --json list`) or after it (`recipes list --json`). Tokens before
 * the command go to `head` and are parsed against the globals alone; everything
 * after goes to `tail` and is parsed against the globals **merged with** the
 * command's own options. The operand of `--content-dir`/`--author` has to be
 * dragged along with its flag, or `recipes --content-dir ./x list` would take
 * `./x` for the command name.
 *
 * `create-user.ts`'s `parseArgs` call is not a template for this: it disallows
 * positionals outright (fact 2).
 */
import process from "node:process";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  CurationError,
  UsageError,
  exitCodeFor,
} from "../controller/curation/errors";
import { resolveBackend } from "./backend/resolve";
import { EDITOR_DIRECTORY, loadEditorEnv } from "./editorEnv";
import { gpuUsedHere, setJobsRoot } from "../controller/jobs/location";
import { setJobMirror } from "../controller/jobs/log";
import type { CuratorBackend } from "./backend/types";
import { createCommand } from "./commands/create";
import { deleteCommand } from "./commands/delete";
import {
  featuredCommands,
  featureCommand,
  unfeatureCommand,
} from "./commands/featured";
import { gitCommands } from "./commands/git";
import { groupCommands } from "./commands/group";
import { imageCommand } from "./commands/image";
import { importCommand } from "./commands/import";
import { importListCommand, inspectListCommand } from "./commands/importList";
import { inspectCommand } from "./commands/inspect";
import { inventoryCommands } from "./commands/inventory";
import { jobsCommands } from "./commands/jobs";
import { listCommand } from "./commands/list";
import { reindexCommand } from "./commands/reindex";
import { searchCommand } from "./commands/search";
import { shoppingCommands } from "./commands/shopping";
import { showCommand } from "./commands/show";
import { tagsCommand } from "./commands/tags";
import { termCommands } from "./commands/term";
import type { CommandDef } from "./commands/types";
import { updateCommand } from "./commands/update";
import { emit, emitError, warn } from "./output";

const GLOBAL_OPTIONS: ParseArgsOptionsConfig = {
  json: { type: "boolean" },
  "content-dir": { type: "string" },
  author: { type: "string" },
  /** Drive a running editor over HTTP instead of this content directory. */
  remote: { type: "string" },
  /** Which editor a *local* write should tell about itself. */
  "editor-url": { type: "string" },
  notify: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

/** Flags whose operand is a separate token, so it must not be read as a command. */
const GLOBAL_VALUE_FLAGS = new Set([
  "--content-dir",
  "--author",
  "--remote",
  "--editor-url",
]);

const COMMANDS: Record<string, CommandDef<unknown>> = {
  inspect: inspectCommand,
  import: importCommand,
  /* Roundup ("meta-list") import (34f). */
  "inspect-list": inspectListCommand,
  "import-list": importListCommand,
  create: createCommand,
  update: updateCommand,
  image: imageCommand,
  show: showCommand,
  list: listCommand,
  search: searchCommand,
  tags: tagsCommand,
  delete: deleteCommand,
  feature: featureCommand,
  unfeature: unfeatureCommand,
  reindex: reindexCommand,
};

/**
 * The commands that take a subcommand after them, and what each dispatches to.
 *
 * One table rather than a chain of `===` tests, because the *split* and the
 * *dispatch* have to agree about exactly this list: a command in one and not
 * the other would either eat its subcommand as a positional or report a
 * perfectly good subcommand as unknown.
 */
const SUBCOMMAND_TABLES: Record<string, Record<string, CommandDef<unknown>>> = {
  group: groupCommands,
  featured: featuredCommands,
  git: gitCommands,
  inventory: inventoryCommands,
  /* The shared shopping list (35c). */
  shopping: shoppingCommands,
  /* The vocabulary's records and carriers (31c). */
  term: termCommands,
  /* The job store (epic 37): list, show, log, cancel, retry. */
  jobs: jobsCommands,
};

/**
 * What a table command means with no subcommand. Only the two lists have
 * one: `recipes inventory` and `recipes shopping` read as "show me the
 * list", where a bare `group` or `git` names no obvious action and stays a
 * usage error.
 */
const DEFAULT_SUBCOMMANDS: Record<string, string> = {
  inventory: "list",
  shopping: "list",
};

/** Own properties only, so `recipes toString x` is not a `Function`. */
function subcommandTableFor(
  command: string | undefined,
): Record<string, CommandDef<unknown>> | undefined {
  return command !== undefined && Object.hasOwn(SUBCOMMAND_TABLES, command)
    ? SUBCOMMAND_TABLES[command]
    : undefined;
}

const USAGE = `Usage: pnpm recipes <command> [options]

  inspect <url> [--out draft.json] [--llm auto|force|off] [--verbose]
  import <url> [--tags a,b] [--slug s] [--name N] [--image <url>]
               [--dry-run [--out draft.json]] [--overwrite] [--allow-partial]
               [--llm auto|force|off] [--all | --pick "Name",… | --as-one]
               [--verbose]
  import --text <file|-> [--source <url>] [the same options, no --llm]
  inspect-list <url> [--verbose]
  import-list <url> (--pick 1,3,5-7|<url>,… | --all) [--term <slug> [--term-label L]]
              [--limit 1-6] [--dry-run] [--llm auto|force|off] [--verbose]
  jobs list [--status queued|running|done|failed|cancelled|interrupted|live]
            [--kind <kind>] [--limit 50]
  jobs show <id>
  jobs log <id> [--follow] [--from <byte>]
  jobs cancel <id>
  jobs retry <id>
  create (--file recipe.json | --stdin) [--overwrite] [--dry-run]
  update <slug> (--file patch.json | --stdin) [--dry-run]
  image <slug> (--url <image-url> | --file <path> | --clear)
  show <slug>
  list [--tag t] [--limit 20] [--offset 0]
  search <query…>
  tags
  delete <slug> [--yes]
  group create --name N [--kind meal-plan] [--description D] [--slug s]
               [--date d] (--file items.json | --item slug[:label][@scale] …
               [--group-item slug[:label] …]) [--force]
  group update <group> [--name N] [--description D] [--kind K] [--date d]
               [--slug s] [--image-url U | --clear-image] | (--file patch.json | --stdin)
  group add <group> (<recipe> | --group <group>) [--label L] [--note N]
            [--scale 2] [--force]
  group remove <group> (<recipe> | --group <group>)
  group set-items <group> (--file items.json | --stdin) [--force]
  group show <group>
  group list [--limit 20] [--offset 0]
  group delete <group> [--yes]
  term list [--records] [--limit n] [--offset 0]
  term get <slug>
  term create --label L [--slug s] [--description D] [--parent p] [--pin recipe …]
              [--alias A …] [--image-url U] [--date d] | (--file term.json | --stdin)
  term update <slug> [--label L] [--description D] [--parent p | --clear-parent]
              [--pin recipe … | --clear-pinned] [--alias A … | --clear-aliases]
              [--image-url U | --clear-image] [--date d] | (--file patch.json | --stdin)
  term image <slug> (--url <image-url> | --file <path> | --clear)
  term assign <slug> [--add carrier …] [--remove carrier …] [--type recipe|group]
              [--force]
  term rename <slug> <new-slug-or-label> [--label L]
  term merge <slug> <into> [--yes]
  term delete <slug> [--unassign] [--yes]
  feature (--recipe s | --group s | --term s) [--note N] [--date d] [--slug s]
  unfeature <slug> [--yes]
  featured list [--limit 20] [--offset 0]
  reindex [contentType]
  inventory [list]
  inventory add <item…>
  inventory remove <item…>
  inventory set --file <list.txt|list.json>
  inventory make [<query…>] [--limit 20]
  shopping [list] [--store <id>]
  shopping add (--recipe <slug> | --group <slug>) [--scale 2] | <line…>
  shopping check <id|name…>
  shopping uncheck <id|name…>
  shopping remove <id…> | --recipe <slug> | --group <slug>
  shopping clear [--all] [--yes]
  shopping settings [set <key> <value…>]
  git status [--fetch]
  git fetch [<remote>]
  git pull [<remote>]
  git sync [<remote>] [--ssh-host <host> --mirror-dir <dir>]
  git log [--type recipe|group|featured|term] [--slug s] [--limit 30] [--offset 0]
  git show <hash> [--max-chars 50000]
  git file <type> <slug> <rev>
  git diff <from> [<to>] [--path p]
  git revert <hash> [--yes]
  git restore <type> <slug> <rev> [--yes]
  git push [<remote>] [--set-upstream]

Globals: --json  --content-dir <dir>  --author "Name <email>"  --help
Remote:  --remote <url>  |  --notify [--editor-url <url>]

Two ways to reach a running editor:

  --remote <url>       Send every command to that editor's JSON API. The server
                       does the write and revalidates its own caches, so the
                       site is up to date the moment the command returns. Reads
                       go there too, so you search the corpus you write to.
  --notify             After a *local* write, POST /api/revalidate to
                       --editor-url (or RECIPE_EDITOR_URL) so a running editor
                       drops its caches. A failed notify is a warning: the write
                       already landed, so the exit code stays 0.

Environment:
  RECIPE_API_URL       Base URL of a running editor; same as --remote
  RECIPE_API_TOKEN     rcp_… bearer token; required for remote writes and
                       --notify. Mint one with \`pnpm create-token\` in the
                       editor package. Never passed on argv.
  RECIPE_EDITOR_URL    Same as --editor-url
  RECIPE_ENV_FILE      The file RECIPE_API_TOKEN, RECIPE_EDITOR_URL, the
                       RECIPE_LLM_* variables, RECIPE_JOBS_DIR,
                       RECIPE_QUEUE_DIR and the RECIPE_GPU_* hooks are read
                       from when the environment lacks them (default
                       websites/recipe-website/editor/.env; nothing else in
                       it is read)
  RECIPE_LLM_URL       A local model server for imports (Ollama, e.g.
                       http://localhost:11434); unset, --llm auto does
                       nothing and --llm force fails
  RECIPE_LLM_MODEL     The model (default qwen3:8b)
  RECIPE_LLM_API       ollama (default) or openai (/v1/chat/completions)
  RECIPE_AUTHOR        "Name <email>" for local commits; same as --author
  CONTENT_DIRECTORY    Local content directory; same as --content-dir
  YTDLP_PATH           yt-dlp binary for video imports (else the Settings
                       page's path, else \`yt-dlp\` on the PATH)
  RECIPE_JOBS_DIR      Where import jobs keep their records and step logs
                       (default websites/recipe-website/editor/jobs); read
                       from editor/.env too. A relative path is the editor
                       package's (websites/recipe-website/editor), never the
                       shell's directory, so the editor and the CLI agree
  RECIPE_QUEUE_DIR     The machine-wide queue every import waits in for the
                       GPU, yt-dlp and each site (default
                       ~/.cache/discontent/queue); relative as
                       RECIPE_JOBS_DIR
  RECIPE_GPU_ACQUIRE_CMD
                       Shell command run before the first model call after
                       an idle spell (e.g. pause another GPU program); off
                       unless set, 30 s timeout
  RECIPE_GPU_RELEASE_CMD
                       Shell command run once the GPU has been idle for
                       RECIPE_GPU_IDLE_MS (by the editor when it runs, else
                       when the CLI exits)
  RECIPE_GPU_IDLE_MS   Idle time before the release command (default 60000)
  DISCONTENT_WRITE_LOCK_TIMEOUT_MS
                       How long a write waits for another write's lock on
                       the content repository (default 30000) before it
                       fails with code \`busy\`

Exit codes: 0 done; 1 failed (also \`term assign\` when a named carrier does
not exist: --force lets an --add through as \`missing\`, printed, exit 1);
2 slug_conflict; 75 busy — another write (or,
for git sync, another sync) held the repository's lock and nothing was
written: run the same command again after a few seconds. With --remote, a
bare 503 from a proxy in front of the editor is read as busy too; the
editor's own names what held the lock, a proxy's cannot promise that nothing
was written, so check (show, git log) before repeating a create.

A bearer token over plain HTTP is only safe on localhost or a trusted LAN. Put
the editor behind TLS before using --remote across the internet.

Author resolution: --author > RECIPE_AUTHOR > the content repo's git identity.
Content directory: --content-dir > CONTENT_DIRECTORY > ./content.

The tweak loop: \`inspect <url> --out d.json\` (or \`import <url> --dry-run --out
d.json\`), edit d.json, \`create --file d.json --dry-run\`, then \`create --file
d.json\`. Fix a picture later with \`image <slug> --url|--file|--clear\`.

A roundup ("40+ Thanksgiving Pies"): \`inspect-list <url>\` lists its recipes,
\`existing\` marked; \`import-list <url> --pick 1,3 [--term <slug>]\` imports
the picks one commit each, 15 s apart per site (images and 403 retries
count), at most --limit per run (3, or 6 for --dry-run; 6 at most). Re-run with
--pick <the remaining URLs> to continue; a run forgets the last one's clock,
so leave 15 s between runs against one site.

A local model (RECIPE_LLM_URL): --llm auto (the default) has it read a page
with no Recipe node; --llm force has it read every page, its lines replacing
the schema's; --llm off never asks it. The result's \`llm\` says how many
ingredient lines it found on the page — fewer than half and its reading is
dropped, fewer than 90% and the result stays partial. A call takes ~5–45 s.

A pasted recipe: \`import --text recipe.txt\` (or \`--text -\` for stdin) has the
local model read the text — a YouTube description, an email, a note — and
skip the links, sponsors and timestamps around it. \`--source <url>\` cites
where it came from (a video URL is also the recipe's video); it is never
fetched. With no model configured it fails (import_failed).

Several recipes in one video or paste (three side dishes, a recipe and the
sauce it refers to): each is read and checked on its own, and the import
refuses (usage) until you say which — --all, or --pick "Green Bean
Casserole" by name (positions, --pick 1,3, work too but can shift between
readings); --as-one reads it as one recipe instead. --dry-run lists them
all (--out d.json writes d-1.json, d-2.json, …). Each becomes its own
commit, its source starts at its video chapter, and a line that names
another recipe of the batch ("see recipe below") links to it. A recipe
already imported from the same source is skipped (existing), so --all
again after a partial run imports only what is missing.

Every import, inspect and roundup call runs as a job: its result carries
\`job\`, and its steps — the fetch, yt-dlp, each model call with its tokens,
rate and GPU share, the writes — go to the job's log, printed on stderr as
they happen when stderr is a terminal (or with --verbose). \`jobs show <id>\`
prints a job and its steps afterwards; <id> may be the eight characters the
step lines show. \`jobs list\` lists them newest first, \`jobs log <id>
--follow\` prints a running job's steps until it ends, \`jobs cancel <id>\`
stops one wherever it runs (the editor, another CLI), and \`jobs retry <id>\`
runs one again with this process's content directory and author — a job
recorded against another content directory is refused. With --remote they
read and act on the editor's jobs, and a retry runs there. A cancelled job
fails with code \`cancelled\` (Ctrl-C too, exit 130).

Piping --json: run it as \`pnpm --silent recipes …\`. Without --silent, pnpm
prints its own script banner on stdout ahead of the object, so the stream is
not a single JSON value.`;

export interface SplitArgv {
  head: string[];
  command?: string;
  subcommand?: string;
  tail: string[];
}

export function splitArgv(argv: string[]): SplitArgv {
  const head: string[] = [];
  let index = 0;
  let command: string | undefined;

  for (; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("-")) {
      head.push(token);
      if (
        GLOBAL_VALUE_FLAGS.has(token) &&
        index + 1 < argv.length &&
        !argv[index + 1].startsWith("-")
      ) {
        index += 1;
        head.push(argv[index]);
      }
      continue;
    }
    command = token;
    index += 1;
    break;
  }

  let subcommand: string | undefined;
  if (
    subcommandTableFor(command) &&
    index < argv.length &&
    !argv[index].startsWith("-")
  ) {
    subcommand = argv[index];
    index += 1;
  }

  return { head, command, subcommand, tail: argv.slice(index) };
}

/**
 * Let `search -tag:baked` mean what it says.
 *
 * A leading `-` is the query language's negation operator, and `parseArgs`
 * would read `-second` as the short flags `-s -e -c …` and fail. POSIX's answer
 * is `search -- -second`, which works and stays supported — but a negation is
 * ordinary query syntax rather than an escape hatch, so for the one command
 * whose positionals are a query, unrecognized dash tokens are moved behind an
 * inserted `--` instead of being rejected.
 *
 * Only *unrecognized* ones: `--limit 5` and `--json` still parse as flags, so
 * the transformation cannot swallow a real option, and a genuine typo
 * (`--limitt`) becomes a query word rather than an error — which is the price,
 * and a smaller one than being unable to type a negation at all.
 */
export function protectDashedPositionals(
  tail: string[],
  options: ParseArgsOptionsConfig,
): string[] {
  const flags: string[] = [];
  const rest: string[] = [];
  let sawSeparator = false;

  for (let index = 0; index < tail.length; index += 1) {
    const token = tail[index];
    if (sawSeparator) {
      rest.push(token);
      continue;
    }
    if (token === "--") {
      sawSeparator = true;
      continue;
    }
    const named = /^--([^=]+)(=.*)?$/.exec(token);
    const definition = named ? options[named[1]] : undefined;
    if (!definition) {
      rest.push(token);
      continue;
    }
    flags.push(token);
    if (
      definition.type === "string" &&
      !named?.[2] &&
      index + 1 < tail.length
    ) {
      index += 1;
      flags.push(tail[index]);
    }
  }

  return rest.length > 0 ? [...flags, "--", ...rest] : flags;
}

function isParseArgsError(error: unknown): boolean {
  return (
    typeof (error as NodeJS.ErrnoException)?.code === "string" &&
    (error as NodeJS.ErrnoException).code!.startsWith("ERR_PARSE_ARGS_")
  );
}

export async function main(argv: string[]): Promise<number> {
  /* pnpm and npm both hand a bare `--` through when a script is called with one. */
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { head, command, subcommand, tail } = splitArgv(args);

  /*
   * Read before either parse, not from their results: a usage error thrown by
   * stage 2 (`recipes list --bogus --json`) would otherwise fall back to prose,
   * and the one line of contract the CLI has is that `--json` means one object
   * on stdout no matter what happened.
   */
  const json = args.includes("--json");
  let backend: CuratorBackend | undefined;

  try {
    const headParse = parseArgs({
      args: head,
      options: GLOBAL_OPTIONS,
      strict: true,
      allowPositionals: false,
    });
    if (!command) {
      if (headParse.values.help === true) {
        process.stdout.write(`${USAGE}\n`);
        return 0;
      }
      throw new UsageError("No command given.");
    }

    const table = subcommandTableFor(command);
    const chosen =
      subcommand ??
      (Object.hasOwn(DEFAULT_SUBCOMMANDS, command)
        ? DEFAULT_SUBCOMMANDS[command]
        : undefined);
    const definition = table
      ? chosen && Object.hasOwn(table, chosen)
        ? table[chosen]
        : undefined
      : COMMANDS[command];

    if (!definition) {
      throw new UsageError(
        table
          ? `Unknown ${command} subcommand: ${subcommand ?? "(none)"}`
          : `Unknown command: ${command}`,
      );
    }

    const commandOptions = { ...GLOBAL_OPTIONS, ...definition.options };
    const { values, positionals } = parseArgs({
      args: definition.takesDashedPositionals
        ? protectDashedPositionals(tail, commandOptions)
        : tail,
      options: commandOptions,
      strict: true,
      allowPositionals: true,
    });
    if (headParse.values.help === true || values.help === true) {
      process.stdout.write(`${definition.usage}\n`);
      return 0;
    }

    /* A global may sit on either side of the command; the tail wins. */
    const global = (name: string) =>
      (values[name] ?? headParse.values[name]) as string | undefined;

    /*
     * A job's step lines (epic 37, D7): on stderr when it is a terminal, or
     * with `--verbose` — never on stdout, which `--json` keeps for its one
     * object.
     */
    setJobMirror(
      values.verbose === true || process.stderr.isTTY
        ? (text) => process.stderr.write(`${text}\n`)
        : null,
    );

    /*
     * One function, shared with the MCP server (D11), so the two entry points
     * cannot disagree about which corpus a bare invocation talks to.
     */
    backend = await resolveBackend({
      remote: global("remote"),
      contentDir: global("content-dir"),
      author: global("author"),
      notify: values.notify === true || headParse.values.notify === true,
      editorUrl: global("editor-url"),
    });

    const result = await definition.run({
      backend,
      positionals,
      options: values,
      json,
    });

    emit(definition, result, json);

    /* A dry run wrote nothing: no stale-editor hint, no `--notify` (26b). */
    const dryRun = (result as { dryRun?: unknown } | null)?.dryRun === true;
    if (definition.write && !dryRun && backend.afterWrite) {
      const hint = await backend.afterWrite();
      if (hint) warn(hint);
    }
    /* Warnings ride the result object for JSON callers; humans get them on stderr. */
    const warnings = (result as { warnings?: string[] })?.warnings;
    if (Array.isArray(warnings) && json) {
      for (const message of warnings) warn(message);
    }
    return definition.exitCode?.(result) ?? 0;
  } catch (error) {
    const mapped = isParseArgsError(error)
      ? new UsageError((error as Error).message)
      : error;
    if (mapped instanceof CurationError && mapped.code === "usage" && !json) {
      warn(USAGE);
    }
    emitError(mapped, json);
    return exitCodeFor(mapped);
  } finally {
    await backend?.close();
  }
}

/*
 * `require.main === module` rather than an import.meta check: tsx runs this
 * file as CJS (the editor package has no `"type": "module"`), the same way
 * `scripts/create-user.ts` does. Setting `process.exitCode` rather than calling
 * `process.exit` lets the stdout write flush — a piped `--json` run loses its
 * object otherwise.
 *
 * `editor/.env`'s token and editor URL are loaded here, for a real run only
 * (35-D11): a test that imports `main` keeps the environment it set up.
 */
if (require.main === module) {
  loadEditorEnv();
  /* The job store's default home, `editor/jobs/` (epic 37, D1). */
  setJobsRoot(EDITOR_DIRECTORY);
  const finished = main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      emitError(error, false);
      process.exitCode = 1;
    })
    /*
     * D6 (37b): a run that used the GPU and finds no editor alive to keep
     * the release closes the spell before it exits. Loaded only then.
     */
    .then(settleGpu);
  exitOnSignals(finished);
}

/** D6: close a GPU spell this run began, if no editor keeps it. */
async function settleGpu(): Promise<void> {
  if (!gpuUsedHere()) return;
  const { settleGpuAtExit } = await import("../controller/jobs/gpuHooks");
  await settleGpuAtExit();
}

/** How long a Ctrl-C waits for the command to wind down, the GPU's release included. */
const SIGNAL_GRACE_MS = 10_000;

/** 37a's registry of this process's running jobs, there only once one ran. */
function jobsRanHere(): boolean {
  return (
    (globalThis as { __discontentRunningJobs?: Map<string, unknown> })
      .__discontentRunningJobs !== undefined
  );
}

/**
 * D6 (37b review): Ctrl-C (SIGINT) or SIGTERM must not leave the other GPU
 * program paused when no editor keeps the release. The running jobs are
 * cancelled through their own aborts (37a's registry), so the model call or
 * yt-dlp stops, the queue's slot is let go and the record ends `cancelled`;
 * the command winds down (its `finally`s close the backend), the spell is
 * closed (`settleGpuAtExit`, the same path as a normal exit), and the
 * process exits 130 or 143. The wait is capped at `SIGNAL_GRACE_MS`, then
 * the release is tried once more and the exit forced; a second signal exits
 * at once. SIGKILL cannot be caught: the spell it leaves is closed by the
 * next grant (D6, step 4).
 */
function exitOnSignals(finished: Promise<void>): void {
  let stopping = false;
  const capped = (work: Promise<unknown>, ms: number) =>
    Promise.race([
      work.then(() => true),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), ms).unref(),
      ),
    ]);
  const onSignal = (signal: NodeJS.Signals): void => {
    const code = signal === "SIGINT" ? 130 : 143;
    if (stopping) process.exit(code);
    stopping = true;
    void (async () => {
      try {
        if (jobsRanHere()) {
          const { cancelJob, runningJobIds } =
            await import("../controller/jobs/run");
          const reason = new Error(`interrupted (${signal})`);
          for (const id of runningJobIds()) cancelJob(id, reason);
        }
        if (await capped(finished, SIGNAL_GRACE_MS)) {
          /* Wound down: a natural exit, so a piped `--json` object flushes. */
          process.exitCode = code;
          return;
        }
        await capped(
          settleGpu().catch(() => undefined),
          SIGNAL_GRACE_MS,
        );
      } catch {
        /* Exiting all the same. */
      }
      process.exit(code);
    })();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

export default main;
