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
    const total = result.timings?.total;
    return (
      `Rebuilt: ${result.rebuilt.join(", ")}` +
      (total !== undefined ? ` in ${(total / 1000).toFixed(1)} s` : "") +
      /* Epic 39 D2: a job, so `recipes jobs show` has its per-type steps. */
      (result.job ? ` (job ${result.job})` : "")
    );
  },
};

export default reindexCommand;
