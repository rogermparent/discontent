/**
 * `recipes tags` — the corpus's vocabulary (23b/D12).
 *
 * The CLI half of the seat the MCP `tag_list` tool needs. Parity rather than
 * novelty: every other backend method has a command, and a curator deciding
 * what to tag a new import wants to see what the corpus already calls things
 * before inventing a synonym.
 *
 * `--json` prints `{tags}` rather than a bare array, because the CLI's contract
 * is one JSON *object* on stdout.
 */
import type { CommandDef } from "./types";

export interface TagListResult {
  tags: string[];
}

export const tagsCommand: CommandDef<TagListResult> = {
  name: "tags",
  usage: "recipes tags",
  options: {},
  async run({ backend }) {
    return { tags: await backend.listTags() };
  },
  format: (result) =>
    result.tags.length > 0 ? result.tags.join("\n") : "No tags.",
};

export default tagsCommand;
