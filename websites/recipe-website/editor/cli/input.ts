/**
 * JSON in, from a file or from stdin.
 *
 * Exactly one of the two, always. Defaulting to stdin when no `--file` was
 * given would make a mistyped flag hang the terminal on a pipe that never
 * closes, and accepting both would silently pick one.
 */
import { readFile } from "fs-extra";
import path from "node:path";
import { UsageError, ValidationError } from "../controller/curation/errors";

/** Relative paths resolve where the user typed them, not where pnpm ran the script. */
export function resolveUserPath(file: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonInput({
  file,
  stdin,
}: {
  file?: string;
  stdin?: boolean;
}): Promise<unknown> {
  if (file && stdin) {
    throw new UsageError("Pass either --file or --stdin, not both.");
  }
  if (!file && !stdin) {
    throw new UsageError("Pass --file <path> or --stdin.");
  }
  const text = file
    ? await readFile(resolveUserPath(file), "utf8")
    : await readStdin();
  if (!text.trim()) {
    throw new ValidationError(
      file ? `${file} is empty.` : "No JSON arrived on stdin.",
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ValidationError(
      `Could not parse JSON from ${file ?? "stdin"}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
