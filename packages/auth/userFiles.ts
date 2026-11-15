import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The user files, read-only.
 *
 * A user is one JSON file at `<content>/users/<email>` — no extension — and
 * that file stays the source of truth (47e): it syncs to the Pi with the
 * content, `create-user` writes it, and the recipe editor's API tokens live in
 * it beside the bcrypt hash. Nothing in this package ever writes one, so a
 * sign-in can never drop a token.
 *
 * Only the fields sign-in needs are read; anything else in the file (tokens,
 * notes) is carried along untouched and never leaves this module.
 */
export interface StoredUser {
  /** The file name: the user's id for Better Auth. */
  id: string;
  /** As the file has it (the adapter lower-cases it for lookups). */
  email: string;
  /** bcrypt, or absent (a file with no password signs nobody in). */
  password?: string;
  createdAt: Date;
}

const EPOCH = new Date(0);

function parseDate(value: unknown): Date {
  if (typeof value !== "string") return EPOCH;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EPOCH : date;
}

/** One user file, or `null` when it is absent, unreadable or not JSON. */
export async function readStoredUser(
  usersDirectory: string,
  fileName: string,
): Promise<StoredUser | null> {
  /* A file name is an email: never a path. */
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  if (fileName.startsWith(".")) return null;
  let raw: string;
  try {
    raw = await readFile(
      join(/*turbopackIgnore: true*/ usersDirectory, fileName),
      "utf8",
    );
  } catch {
    return null;
  }
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object") return null;
  const { email, password, createdAt } = record as Record<string, unknown>;
  return {
    id: fileName,
    email: (typeof email === "string" && email ? email : fileName).trim(),
    password: typeof password === "string" && password ? password : undefined,
    createdAt: parseDate(createdAt),
  };
}

/** Every readable user file. A handful of files: a scan, not an index. */
export async function listStoredUsers(
  usersDirectory: string,
): Promise<StoredUser[]> {
  let names: string[];
  try {
    const entries = await readdir(/*turbopackIgnore: true*/ usersDirectory, {
      withFileTypes: true,
    });
    names = entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  const users = await Promise.all(
    names.map((name) => readStoredUser(usersDirectory, name)),
  );
  return users.filter((user): user is StoredUser => user !== null);
}
