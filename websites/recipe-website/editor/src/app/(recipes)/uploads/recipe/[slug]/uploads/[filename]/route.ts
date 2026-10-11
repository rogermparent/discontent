import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";
import { ReadStream } from "fs";
import { open } from "fs/promises";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "path";
import { uploadHeaders } from "recipe-editor/controller/uploadContentType";

/**
 * Serve a recipe's uploaded file:
 * `<content>/uploads/recipe/<slug>/uploads/<filename>`.
 *
 * `slug` and `filename` are both decoded route params, and Next decodes `%2F`,
 * so `/uploads/recipe/x/uploads/..%2F..%2F..%2F..%2Fetc%2Fhostname` used to
 * walk out of the content directory: an unauthenticated read of any file the
 * editor's process could open (found at 32-close). Both segments are now
 * confined with `resolveWithin`, one call each, the shape portfolio's project
 * uploads route already had: a guard on the filename alone still lets the slug
 * walk out. A refusal is a 404, not a 500, so the guard firing can't be told
 * apart from a missing file.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; filename: string }> },
) {
  const { slug, filename } = await params;

  let uploadFilePath: string;
  try {
    const uploadsRoot = resolve(getContentDirectory(), "uploads", "recipe");
    const recipeUploads = resolve(
      resolveWithin(uploadsRoot, slug, "recipe slug"),
      "uploads",
    );
    uploadFilePath = resolveWithin(recipeUploads, filename, "upload path");
  } catch {
    notFound();
  }

  try {
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
