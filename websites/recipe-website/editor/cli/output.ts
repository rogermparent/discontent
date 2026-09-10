/**
 * What reaches stdout, and what does not.
 *
 * **The whole contract is one line:** with `--json`, stdout carries exactly one
 * JSON object and nothing else — no warnings, no usage, no hints, not even on
 * failure, where the object is `{"error": {...}}`. Everything diagnostic goes
 * to stderr. That is what lets an agent run `... --json | jq` and lets a shell
 * branch on the exit code without parsing prose.
 */
import { toErrorObject } from "../controller/curation/errors";
import type { CommandDef } from "./commands/types";

export function emit<TResult>(
  command: CommandDef<TResult>,
  result: TResult,
  json: boolean,
): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const text = command.format(result);
  if (text) process.stdout.write(`${text}\n`);
}

export function emitError(error: unknown, json: boolean): void {
  const object = toErrorObject(error);
  if (json) {
    process.stdout.write(`${JSON.stringify(object)}\n`);
    return;
  }
  process.stderr.write(`error: ${object.error.message}\n`);
  for (const issue of object.error.issues ?? []) {
    process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
  }
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

/* --- human formats ------------------------------------------------------- */

export function formatDate(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length);
}

export interface Row {
  slug: string;
  name: string;
  date: number;
  tags?: string[];
}

/**
 * `slug  name  [tags]  (date)`, columns sized to the widest row.
 *
 * Fixed-width rather than a table library: the output is meant to be read by a
 * person *and* piped through `grep`/`awk`, and a box-drawing table is worse at
 * both.
 */
export function formatRows(rows: Row[]): string {
  if (rows.length === 0) return "No results.";
  const slugWidth = Math.max(...rows.map((row) => row.slug.length));
  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  return rows
    .map((row) => {
      const tags = row.tags?.length ? `[${row.tags.join(", ")}]` : "";
      return [
        pad(row.slug, slugWidth),
        pad(row.name, nameWidth),
        tags ? `${tags}  ` : "",
        `(${formatDate(row.date)})`,
      ]
        .join("  ")
        .replace(/\s+$/, "");
    })
    .join("\n");
}

export function formatJsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
