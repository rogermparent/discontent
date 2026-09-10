import type { ParseArgsOptionsConfig } from "node:util";
import type { CuratorBackend } from "../backend/types";

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
