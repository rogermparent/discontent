import { execa } from "execa";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { unstable_noStore } from "next/cache";
import { auth, signIn } from "@/auth";
import { Readable } from "stream";
import {
  exportUnavailableReason,
  getExportDirectory,
} from "@/app/(editor)/(settings)/export/availability";

/**
 * The one build or deploy running in this process. On `globalThis`, so the
 * Export page's Build (`exportAction.ts`) and Deploy (`commandAction`) see the
 * same one even if Next loads this module once per action bundle.
 */
const RUNNING = Symbol.for("discontent.export.currentStream");
const running = globalThis as unknown as Record<
  symbol,
  ReadableStream | undefined
>;

export type StreamActionResult = string | ReadableStream<Uint8Array>;

/**
 * Run `pnpm run <command>` in the export package and stream its output.
 * `onSuccess` runs once the command exits 0 (the Export page's Build records
 * the commit it built, epic 39 D6). Not a server action itself (39d review):
 * a `"use server"` export would take that function from a client; only
 * server code calls this — `commandAction` without one, `buildExport` with.
 */
export async function runCommand(
  command: string,
  extraEnv?: Record<string, string>,
  onSuccess?: () => Promise<void>,
): Promise<StreamActionResult> {
  unstable_noStore();
  const user = await auth();
  if (!user) {
    return signIn();
  }
  if (running[RUNNING]) {
    return "A build is already currently running!";
  }
  const unavailable = await exportUnavailableReason();
  if (unavailable) {
    return unavailable;
  }
  const contentDirectory = getContentDirectory();
  const cwd = getExportDirectory();
  const newBuild = execa({
    cwd: cwd,
    all: true,
    env: {
      NODE_ENV: "production",
      CONTENT_DIRECTORY: contentDirectory,
      ...extraEnv,
    },
  })`pnpm run ${command}`;
  if (!newBuild.all) {
    throw new Error("Run has no all stream");
  }
  const webStream = Readable.toWeb(newBuild.all) as ReadableStream;
  running[RUNNING] = webStream;
  /* Both sides handled (39d, Td3): a failed build is no unhandled rejection. */
  newBuild
    .then(
      async () => {
        await onSuccess?.();
      },
      () => undefined,
    )
    .catch(() => undefined)
    .finally(() => {
      running[RUNNING] = undefined;
    });

  return webStream;
}
