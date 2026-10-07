/**
 * Revoke a user's API tokens, by id or by name.
 *
 *     CONTENT_DIRECTORY=<dir> pnpm revoke-token -e you@example.com --id 1a2b3c4d
 *     CONTENT_DIRECTORY=<dir> pnpm revoke-token -e you@example.com --name laptop
 *
 * The id is the 8 hex characters after `rcp_` in the token itself, and the
 * `id` field of the row in `<dir>/users/<email>`. By name removes every token
 * with that name. Takes effect on the next request: tokens are checked against
 * the user file each time, with no cache in between.
 *
 * The pair of `create-token.ts` (27b), with the same `parseArgs` shape.
 */
import process from "node:process";
import { parseArgs, ParseArgsOptionsConfig } from "node:util";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { removeTokensFromUser, userFilePath } from "../src/users";

const options: ParseArgsOptionsConfig = {
  email: { type: "string", short: "e" },
  id: { type: "string" },
  name: { type: "string", short: "n" },
  help: { type: "boolean", short: "h" },
} as const;

const USAGE = `
Usage: pnpm revoke-token -e <email> (--id <id> | --name <name>)

Options:
  -e, --email <email>  The user whose token to revoke
      --id <id>        The token's 8-hex-character id (rcp_<id>_…)
  -n, --name <name>    Every token with this name
  -h, --help           Show this help message

The content directory comes from CONTENT_DIRECTORY (or ./content).
`;

export async function revokeToken(): Promise<void> {
  try {
    const { values } = parseArgs({ options });
    const typed = values as {
      email?: string;
      id?: string;
      name?: string;
      help?: boolean;
    };
    if (typed.help) {
      console.log(USAGE);
      process.exit(0);
    }

    const email = typed.email?.trim().toLowerCase();
    if (!email) throw new Error(`An email is required.\n${USAGE}`);
    const id = typed.id?.trim();
    const name = typed.name?.trim();
    if (!id === !name) {
      throw new Error(`Name exactly one of --id or --name.\n${USAGE}`);
    }

    const contentDirectory = getContentDirectory();
    const removed = await removeTokensFromUser(
      contentDirectory,
      email,
      id ? { id } : { name },
    );
    if (removed.length === 0) {
      console.error(
        `❌ No token ${id ? `with id ${id}` : `named "${name}"`} on ${email}.`,
      );
      process.exit(1);
    }
    for (const token of removed) {
      console.log(
        `✅ Revoked ${token.id} (${token.name}, ${token.scope ?? "write"}, created ${token.createdAt})`,
      );
    }
    console.log(`📁 Updated: ${userFilePath(contentDirectory, email)}`);
  } catch (error) {
    console.error("❌ Error revoking token:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  revokeToken();
}
