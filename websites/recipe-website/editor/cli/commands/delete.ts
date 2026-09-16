import { UsageError } from "../../controller/curation/errors";
import type { DeleteResult } from "../backend/types";
import { booleanOption, type CommandDef } from "./types";

/**
 * A destructive command needs a confirmation that a pipe cannot supply.
 *
 * On a TTY without `--yes`, ask. Off a TTY without `--yes`, refuse — a script
 * or an agent that meant to delete something can say so, and one that did not
 * must not have the prompt silently answered for it by an empty stdin.
 *
 * `action` is the verb phrase in both sentences ("delete recipe \"naan\"",
 * "revert commit abc1234"), so one function serves every command that needs
 * the gate. 23d generalised it from a delete-only helper: `git revert` and
 * `git restore` rewrite history and want exactly this prompt, and a second
 * copy of it saying "Delete" would have been the alternative.
 */
export async function confirm(action: string, yes: boolean): Promise<void> {
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new UsageError(
      `Refusing to ${action} without --yes (stdin is not a terminal).`,
    );
  }
  const { read } = await import("read");
  const answer = await read({
    prompt: `${action[0].toUpperCase()}${action.slice(1)}? [y/N] `,
  });
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new UsageError("Cancelled.");
  }
}

/** `confirm`, phrased for the three delete commands. */
export function confirmDeletion(
  label: string,
  slug: string,
  yes: boolean,
): Promise<void> {
  return confirm(`delete ${label} "${slug}"`, yes);
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
