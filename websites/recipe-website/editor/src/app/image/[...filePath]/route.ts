import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";
import { ReadStream } from "fs";
import { open } from "fs/promises";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { join, resolve } from "path";

/**
 * Serve a transformed image. Same traversal guard as the uploads route —
 * `filePath` is attacker-controlled and `join`/`resolve` will happily walk up
 * out of the transformed-images tree.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ filePath: string[] }>;
  },
) {
  const { filePath } = await params;
  const filename = join(...filePath);
  const imagesDirectory = resolve(getContentDirectory(), "transformed-images");

  let transformedImagePath: string;
  try {
    transformedImagePath = resolveWithin(
      imagesDirectory,
      filename,
      "image path",
    );
  } catch {
    notFound();
  }

  try {
    const handle = await open(transformedImagePath);
    const stream = ReadStream.toWeb(
      handle.createReadStream(),
    ) as ReadableStream;
    return new NextResponse(stream);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    } else {
      throw e;
    }
  }
}
