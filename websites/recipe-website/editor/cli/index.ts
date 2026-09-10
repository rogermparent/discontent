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
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import path from "node:path";
import process from "node:process";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { resolveAuthor } from "../controller/curation/author";
import {
  CurationError,
  UsageError,
  exitCodeFor,
} from "../controller/curation/errors";
import { createLocalBackend } from "./backend/local";
import type { CuratorBackend } from "./backend/types";
import { createCommand } from "./commands/create";
import { deleteCommand } from "./commands/delete";
import { groupCommands } from "./commands/group";
import { importCommand } from "./commands/import";
import { listCommand } from "./commands/list";
import { reindexCommand } from "./commands/reindex";
import { searchCommand } from "./commands/search";
import { showCommand } from "./commands/show";
import type { CommandDef } from "./commands/types";
import { updateCommand } from "./commands/update";
import { emit, emitError, warn } from "./output";

const GLOBAL_OPTIONS: ParseArgsOptionsConfig = {
  json: { type: "boolean" },
  "content-dir": { type: "string" },
  author: { type: "string" },
  help: { type: "boolean", short: "h" },
};

/** Flags whose operand is a separate token, so it must not be read as a command. */
const GLOBAL_VALUE_FLAGS = new Set(["--content-dir", "--author"]);

const COMMANDS: Record<string, CommandDef<unknown>> = {
  import: importCommand,
  create: createCommand,
  update: updateCommand,
  show: showCommand,
  list: listCommand,
  search: searchCommand,
  delete: deleteCommand,
  reindex: reindexCommand,
};

const USAGE = `Usage: pnpm recipes <command> [options]

  import <url> [--tags a,b] [--slug s] [--name N] [--dry-run] [--overwrite]
  create (--file recipe.json | --stdin) [--overwrite]
  update <slug> (--file patch.json | --stdin)
  show <slug>
  list [--tag t] [--limit 20] [--offset 0]
  search <query…>
  delete <slug> [--yes]
  group create --name N [--kind meal-plan|collection] [--description D] [--slug s]
               [--date d] (--file items.json | --item slug[:label] …) [--force]
  group add <group> <recipe> [--label L] [--note N] [--force]
  group remove <group> <recipe>
  group set-items <group> (--file items.json | --stdin) [--force]
  group show <group>
  group list [--limit 20] [--offset 0]
  group delete <group> [--yes]
  reindex [contentType]

Globals: --json  --content-dir <dir>  --author "Name <email>"  --help

Author resolution: --author > RECIPE_AUTHOR > the content repo's git identity.
Content directory: --content-dir > CONTENT_DIRECTORY > ./content.

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
    command === "group" &&
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

function resolveContentDirectory(flag?: string): string {
  const raw = flag ?? process.env.CONTENT_DIRECTORY;
  if (!raw) return getContentDirectory();
  /*
   * `INIT_CWD` rather than `cwd()`: pnpm runs a package script with the *package*
   * directory as cwd, so `pnpm recipes list --content-dir ./fixtures/x` typed at
   * the repo root would otherwise resolve against `websites/recipe-website/editor`
   * (fact 1).
   */
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), raw);
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

    const definition =
      command === "group"
        ? subcommand
          ? groupCommands[subcommand]
          : undefined
        : COMMANDS[command];

    if (!definition) {
      throw new UsageError(
        command === "group"
          ? `Unknown group subcommand: ${subcommand ?? "(none)"}`
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

    const contentDirectory = resolveContentDirectory(
      (values["content-dir"] ?? headParse.values["content-dir"]) as
        | string
        | undefined,
    );
    const author = resolveAuthor(
      (values.author ?? headParse.values.author) as string | undefined,
    );

    backend = createLocalBackend({ contentDirectory, author });

    const result = await definition.run({
      backend,
      positionals,
      options: values,
      json,
    });

    emit(definition, result, json);

    if (definition.write && backend.afterWrite) {
      const hint = await backend.afterWrite();
      if (hint) warn(hint);
    }
    /* Warnings ride the result object for JSON callers; humans get them on stderr. */
    const warnings = (result as { warnings?: string[] })?.warnings;
    if (Array.isArray(warnings) && json) {
      for (const message of warnings) warn(message);
    }
    return 0;
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
 */
if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      emitError(error, false);
      process.exitCode = 1;
    });
}

export default main;
