"use server";

import { runCommand, type StreamActionResult } from "./runCommand";

/*
 * No `export type { StreamActionResult }` here (40c): Next's "use server"
 * transform registered the re-export as an action, and every server action
 * on /export failed with "StreamActionResult is not defined". Import the
 * type from `./runCommand`.
 */

/**
 * Run `pnpm run <command>` in the export package and stream its output (the
 * Export page's Deploy). The work is `runCommand`'s; this action takes no
 * callback, so a client can hand it none (39d review).
 */
export async function commandAction(
  command: string,
  extraEnv?: Record<string, string>,
): Promise<StreamActionResult> {
  return runCommand(command, extraEnv);
}
