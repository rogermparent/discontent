import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { resolveWithin } from "@discontent/cms/fs/resolveWithin";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";
import { ReadStream } from "fs";
import { open } from "fs/promises";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { resolve } from "path";

/**
 * Serve a project's uploaded file.
 *
 * The second uploads route, and not a duplicate of the first: @discontent/cms
 * stores a collection's uploads at
 * `<content>/uploads/project/<slug>/uploads/<filename>`, and the existing
 * single-segment `/uploads/[filename]` handler cannot match a four-segment path
 * — so before this, every project image URL 404'd no matter how correctly it
 * was built. Recipe carries the same pair for the same reason.
 *
 * `slug` and `filename` are both attacker-controlled route params going into
 * `resolve()`, so both are confined with `resolveWithin` — one call per segment,
 * because a guard on the filename alone still lets the slug walk out of the
 * tree. A refusal is reported as 404, not 500: this is an unauthenticated read
 * endpoint, and a distinct status would confirm the guard had fired.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; filename: string }> },
) {
  const { slug, filename } = await params;

  let uploadFilePath: string;
  try {
    const uploadsRoot = resolve(
      getContentDirectory(),
      projectContentConfig.uploadsDirectory ?? "uploads/project",
    );
    const projectUploads = resolve(
      resolveWithin(uploadsRoot, slug, "project slug"),
      "uploads",
    );
    uploadFilePath = resolveWithin(projectUploads, filename, "upload path");
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
