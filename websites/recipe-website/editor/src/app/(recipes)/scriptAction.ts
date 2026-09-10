"use server";

import { execa } from "execa";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { unstable_noStore } from "next/cache";
import { auth, signIn } from "@/auth";
import { resolve } from "path";
import { Readable } from "stream";

let currentStream: ReadableStream | undefined;

export type StreamActionResult = string | ReadableStream<Uint8Array>;

export async function commandAction(
  command: string,
  extraEnv?: Record<string, string>,
): Promise<StreamActionResult> {
  unstable_noStore();
  const user = await auth();
  if (!user) {
    return signIn();
  }
  if (currentStream) {
    return "A build is already currently running!";
  }
  const contentDirectory = getContentDirectory();
  const cwd = resolve("..", "export");
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
  const webStream = Readable.toWeb(newBuild.all);
  currentStream = webStream as ReadableStream;
  newBuild.finally(() => {
    currentStream = undefined;
  });

  return currentStream;
}
