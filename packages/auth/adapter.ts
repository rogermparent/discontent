import { createAdapterFactory } from "better-auth/adapters";
import type { Where } from "better-auth";

type CleanedWhere = Required<Where>;
import { listStoredUsers, type StoredUser } from "./userFiles";

/**
 * Better Auth's database, as the users directory (47e).
 *
 * Two models live here, both derived from the user files on every query:
 *
 * - `user` — `{id: <file name>, email, name: email, emailVerified: true}`;
 * - `account` — the one `credential` account per user, whose `password` is
 *   the file's bcrypt hash and whose `accountId` is the user id (what
 *   `signInEmail` looks for).
 *
 * Read-only by design. Sign-up is off, there is no password change in the
 * editor, and every other model (sessions, verification rows, rate-limit
 * counters) goes to `secondaryStorage` (`storage.ts`), outside the content
 * repo. A write that still reaches this adapter is a configuration mistake,
 * so it throws rather than silently inventing a row that would vanish on the
 * next read — and it can never rewrite a user file and lose its API tokens.
 *
 * A scan on every query is fine: the user set is a handful of files, and the
 * alternative — an index — is a second thing to keep in sync with the files
 * (the recipe editor's D10 lesson).
 */

type Row = Record<string, unknown>;

function userRow(user: StoredUser): Row {
  return {
    id: user.id,
    /* Better Auth looks users up by `email.toLowerCase()`. */
    email: user.email.toLowerCase(),
    name: user.email,
    emailVerified: true,
    image: null,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
  };
}

function accountRow(user: StoredUser): Row | null {
  if (!user.password) return null;
  return {
    id: `credential:${user.id}`,
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: user.password,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scope: null,
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
  };
}

const READ_ONLY_MODELS = new Set(["user", "account"]);

function compare(
  actual: unknown,
  expected: CleanedWhere["value"],
  operator: CleanedWhere["operator"],
  insensitive: boolean,
): boolean {
  const norm = (value: unknown) =>
    insensitive && typeof value === "string" ? value.toLowerCase() : value;
  const left = norm(actual);
  const toComparable = (value: unknown) =>
    value instanceof Date ? value.getTime() : value;
  switch (operator) {
    case "eq":
      return toComparable(left) === toComparable(norm(expected));
    case "ne":
      return toComparable(left) !== toComparable(norm(expected));
    case "in":
      return Array.isArray(expected)
        ? (expected as unknown[]).map(norm).includes(left)
        : false;
    case "not_in":
      return Array.isArray(expected)
        ? !(expected as unknown[]).map(norm).includes(left)
        : true;
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const a = toComparable(left) as number;
      const b = toComparable(expected) as number;
      if (a == null || b == null) return false;
      if (operator === "lt") return a < b;
      if (operator === "lte") return a <= b;
      if (operator === "gt") return a > b;
      return a >= b;
    }
    case "contains":
      return typeof left === "string" && left.includes(String(norm(expected)));
    case "starts_with":
      return (
        typeof left === "string" && left.startsWith(String(norm(expected)))
      );
    case "ends_with":
      return typeof left === "string" && left.endsWith(String(norm(expected)));
    default:
      return false;
  }
}

/** Better Auth's where semantics: ANDs bind tighter than ORs. */
export function matchesWhere(row: Row, where: CleanedWhere[] = []): boolean {
  if (where.length === 0) return true;
  const ands = where.filter((clause) => clause.connector !== "OR");
  const ors = where.filter((clause) => clause.connector === "OR");
  const test = (clause: CleanedWhere) =>
    compare(
      row[clause.field],
      clause.value,
      clause.operator,
      clause.mode === "insensitive",
    );
  const andOk = ands.every(test);
  if (ors.length === 0) return andOk;
  return andOk && ors.some(test);
}

function pick(row: Row, select?: string[]): Row {
  if (!select || select.length === 0) return row;
  return Object.fromEntries(select.map((field) => [field, row[field]]));
}

export interface UsersDirectoryAdapterOptions {
  /** Read on every query, so a test or a CONTENT_DIRECTORY change is seen. */
  usersDirectory: () => string;
}

export function usersDirectoryAdapter({
  usersDirectory,
}: UsersDirectoryAdapterOptions) {
  async function rowsFor(model: string): Promise<Row[]> {
    if (!READ_ONLY_MODELS.has(model)) {
      throw new Error(
        `The users-directory adapter has no "${model}" model: sessions, verification and rate limits belong in secondaryStorage.`,
      );
    }
    const users = await listStoredUsers(usersDirectory());
    if (model === "user") return users.map(userRow);
    return users.map(accountRow).filter((row): row is Row => row !== null);
  }

  function refuseWrite(model: string): never {
    throw new Error(
      `The users-directory adapter is read-only (tried to write "${model}"). User files are written by create-user, never by sign-in.`,
    );
  }

  return createAdapterFactory({
    config: {
      adapterId: "discontent-users",
      adapterName: "users directory",
      supportsDates: true,
      supportsBooleans: true,
      supportsJSON: true,
      supportsArrays: true,
      supportsNumericIds: false,
      transaction: false,
    },
    adapter: () => ({
      async create({ model }) {
        return refuseWrite(model);
      },
      async update({ model }) {
        return refuseWrite(model);
      },
      async updateMany({ model }) {
        return refuseWrite(model);
      },
      async delete({ model }) {
        return refuseWrite(model);
      },
      async deleteMany({ model }) {
        return refuseWrite(model);
      },
      async findOne({ model, where, select }) {
        const row = (await rowsFor(model)).find((candidate) =>
          matchesWhere(candidate, where),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (row ? pick(row, select) : null) as any;
      },
      async findMany({ model, where, limit, offset, sortBy, select }) {
        let rows = (await rowsFor(model)).filter((row) =>
          matchesWhere(row, where),
        );
        if (sortBy) {
          const { field, direction } = sortBy;
          rows = [...rows].sort((a, b) => {
            const left = String(a[field] ?? "");
            const right = String(b[field] ?? "");
            return direction === "asc"
              ? left.localeCompare(right)
              : right.localeCompare(left);
          });
        }
        const start = offset ?? 0;
        rows = rows.slice(start, limit ? start + limit : undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rows.map((row) => pick(row, select)) as any;
      },
      async count({ model, where }) {
        return (await rowsFor(model)).filter((row) => matchesWhere(row, where))
          .length;
      },
    }),
  });
}
