import { getRecipeUploadPath } from "recipe-website-common/controller/filesystemDirectories";
import { ReadStream } from "fs";
import { open } from "fs/promises";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { uploadHeaders } from "recipe-editor/controller/uploadContentType";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; filename: string }> },
) {
  const { slug, filename } = await params;
  try {
    const uploadFilePath = getRecipeUploadPath(
      getContentDirectory(),
      slug,
      filename,
    );
    const handle = await open(uploadFilePath);
    const stream = ReadStream.toWeb(
      handle.createReadStream(),
    ) as ReadableStream;
    return new NextResponse(stream, { headers: uploadHeaders(filename) });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    } else {
      throw e;
    }
  }
}
