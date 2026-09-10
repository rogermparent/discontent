import type { ReindexResult } from "../backend/types";
import type { CommandDef } from "./types";

export const reindexCommand: CommandDef<ReindexResult> = {
  name: "reindex",
  usage: "recipes reindex [contentType]",
  options: {},
  write: true,
  async run({ backend, positionals }) {
    return backend.reindex(positionals[0]);
  },
  format(result) {
    return `Rebuilt: ${result.rebuilt.join(", ")}`;
  },
};

export default reindexCommand;
