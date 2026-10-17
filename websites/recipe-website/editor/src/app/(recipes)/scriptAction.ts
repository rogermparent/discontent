"use server";

import { runCommand, type StreamActionResult } from "./runCommand";

export type { StreamActionResult };

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
