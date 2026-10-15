import type { ParseArgsOptionsConfig } from "node:util";
import type { CuratorBackend } from "../backend/types";
import { UsageError } from "../../controller/curation/errors";
import { LLM_MODES, isLlmMode, type LlmMode } from "../../controller/llm/mode";

export interface CommandRunContext {
  backend: CuratorBackend;
  positionals: string[];
  options: Record<string, string | boolean | (string | boolean)[] | undefined>;
  json: boolean;
}

/**
 * One command, declared rather than dispatched by hand.
 *
 * `options` feeds stage 2 of the `parseArgs` split in `index.ts`, `usage` feeds
 * `--help`, and the `run`/`format` pair is the whole reason `--json` needs no
 * branching inside a command: `run` returns the object the JSON contract
 * promises, and `format` is only reached when the caller is a human.
 *
 * `write: true` means "this touched the content directory", which is what makes
 * `index.ts` call `backend.afterWrite()` afterwards.
 */
export interface CommandDef<TResult = unknown> {
  name: string;
  usage: string;
  options: ParseArgsOptionsConfig;
  write?: boolean;
  /**
   * The command's positionals may start with `-` and are not options.
   * Only `search` sets it: a leading `-` there is the query language's
   * negation operator (`index.ts`'s `protectDashedPositionals`).
   */
  takesDashedPositionals?: boolean;
  run(context: CommandRunContext): Promise<TResult>;
  format(result: TResult): string;
  /**
   * A non-zero exit for a result that is not an error but did not do all it
   * was asked (35-D10: `term assign --force` naming a carrier that does not
   * exist). The result is still printed; absent, a returned result exits 0.
   */
  exitCode?(result: TResult): number;
}

/** Narrow a `parseArgs` value to a string, so a repeated flag cannot leak an array. */
export function stringOption(
  options: CommandRunContext["options"],
  name: string,
): string | undefined {
  const value = options[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    if (typeof last === "string") return last;
  }
  return undefined;
}

export function stringListOption(
  options: CommandRunContext["options"],
  name: string,
): string[] {
  const value = options[name];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export function numberOption(
  options: CommandRunContext["options"],
  name: string,
): number | undefined {
  const raw = stringOption(options, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function booleanOption(
  options: CommandRunContext["options"],
  name: string,
): boolean {
  return options[name] === true;
}

/**
 * `--verbose` (epic 37, D7): the job's step lines on stderr even when it is
 * not a terminal (`index.ts` reads it). Taken by the commands that run a
 * job: `import`, `inspect`, `import-list`, `inspect-list`.
 */
export const VERBOSE_OPTION = { verbose: { type: "boolean" } } as const;

/** `--llm auto|force|off` (epic 36, D3): the local model's part in an import. */
export const LLM_OPTION = { llm: { type: "string" } } as const;

/** The usage text's spelling of `--llm`. */
export const LLM_USAGE = `[--llm ${LLM_MODES.join("|")}]`;

export function llmOption(
  options: CommandRunContext["options"],
): LlmMode | undefined {
  const value = stringOption(options, "llm");
  if (value === undefined) return undefined;
  if (!isLlmMode(value)) {
    throw new UsageError(
      `--llm takes ${LLM_MODES.join(", ")} — not "${value}".`,
    );
  }
  return value;
}
