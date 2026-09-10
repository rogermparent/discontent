import { UsageError } from "../../controller/curation/errors";
import type { DeleteResult } from "../backend/types";
import { booleanOption, type CommandDef } from "./types";

/**
 * A destructive command needs a confirmation that a pipe cannot supply.
 *
 * On a TTY without `--yes`, ask. Off a TTY without `--yes`, refuse — a script
 * or an agent that meant to delete something can say so, and one that did not
 * must not have the prompt silently answered for it by an empty stdin.
 */
export async function confirmDeletion(
  label: string,
  slug: string,
  yes: boolean,
): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new UsageError(
      `Refusing to delete ${label} "${slug}" without --yes (stdin is not a terminal).`,
    );
  }
  const { read } = await import("read");
  const answer = await read({
    prompt: `Delete ${label} "${slug}"? [y/N] `,
  });
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new UsageError("Cancelled.");
  }
}

export const deleteCommand: CommandDef<DeleteResult> = {
  name: "delete",
  usage: "recipes delete <slug> [--yes]",
  options: {
    yes: { type: "boolean", short: "y" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("delete needs a slug.");
    await confirmDeletion("recipe", slug, booleanOption(options, "yes"));
    return backend.deleteRecipe(slug);
  },
  format(result) {
    return `Deleted ${result.slug}`;
  },
};

export default deleteCommand;
