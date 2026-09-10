import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";
import { ReadStream } from "fs";
import { open } from "fs/promises";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "path";

/**
 * Serve an uploaded file.
 *
 * `filename` is a decoded route param going straight into `resolve()`, which is
 * the same traversal shape fixed across the collections. Whether a `%2F` in the
 * URL survives to reach `params` is version-dependent in Next, so this does not
 * rely on the router normalizing it away — the guard costs nothing and the
 * behaviour it protects against is not ours to pin.
 *
 * A refused path is reported as 404 rather than 500: this is an unauthenticated
 * read endpoint, and a distinct error would confirm that the guard fired.
 *
 * The uploads directory is derived here rather than imported from
 * `homepage-controller/paths`, which computed it at import time — that module is
 * gone now, along with the rest of the retired homepage blob.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ filename: string }>;
  },
) {
  const { filename } = await params;
  const uploadsDirectory = resolve(getContentDirectory(), "uploads");

  let uploadFilePath: string;
  try {
    uploadFilePath = resolveWithin(uploadsDirectory, filename, "upload path");
  } catch {
    notFound();
  }

  try {
    const handle = await open(uploadFilePath);
    const stream = ReadStream.toWeb(
      handle.createReadStream(),
    ) as ReadableStream;
    return new NextResponse(stream);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
}
