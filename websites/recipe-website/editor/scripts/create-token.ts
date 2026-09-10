/**
 * Mint an API token for an existing user.
 *
 *     CONTENT_DIRECTORY=<dir> pnpm create-token -e you@example.com -n laptop
 *
 * Prints the token **once** — only its SHA-256 is stored, so there is nothing
 * to print a second time. Revoke by deleting the matching `{id, …}` object from
 * the `tokens` array in `<dir>/users/<email>`.
 *
 * The shape follows `create-user.ts` deliberately (same `parseArgs` options,
 * same `read` prompts, same `require.main` guard): these are the two scripts an
 * operator runs by hand, and they should feel like one pair.
 */
import process from "node:process";
import { parseArgs, ParseArgsOptionsConfig } from "node:util";
import { read } from "read";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { addTokenToUser, userFilePath } from "../src/users";

const options: ParseArgsOptionsConfig = {
  email: { type: "string", short: "e" },
  name: { type: "string", short: "n" },
  help: { type: "boolean", short: "h" },
} as const;

export async function createToken(): Promise<void> {
  try {
    const { values } = parseArgs({ options });
    const typedValues = values as {
      email?: string;
      name?: string;
      help?: boolean;
    };

    if (typedValues.help) {
      console.log(`
Usage: pnpm create-token [options]

Options:
  -e, --email <email>  The user the token authenticates as
  -n, --name <name>    A label for the token (e.g. "laptop", "curator skill")
  -h, --help           Show this help message

The content directory comes from CONTENT_DIRECTORY (or ./content).

The token is printed once and stored only as a hash. Send it over HTTPS: a
bearer token on plain HTTP is acceptable only on localhost or a trusted LAN.
      `);
      process.exit(0);
    }

    let email = typedValues.email;
    if (!email) {
      email = await read<string>({ prompt: "User email: " });
    }
    email = email?.trim().toLowerCase();
    if (!email) throw new Error("Email is required");

    let name = typedValues.name;
    if (!name) {
      name = await read<string>({ prompt: "Token name: " });
    }
    name = name?.trim();
    if (!name) throw new Error("Token name is required");

    const contentDirectory = getContentDirectory();
    const token = await addTokenToUser(contentDirectory, email, name);

    console.log(`✅ Token created for ${email} (${name})`);
    console.log(
      `📁 Stored (hashed) in: ${userFilePath(contentDirectory, email)}`,
    );
    console.log("");
    console.log(token);
    console.log("");
    console.log(
      "This is the only time it is shown. Export it as RECIPE_API_TOKEN.",
    );
    console.log(
      "Use it over HTTPS only — plain HTTP is acceptable on localhost or a trusted LAN.",
    );
  } catch (error) {
    console.error("❌ Error creating token:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (require.main === module) {
  createToken();
}
