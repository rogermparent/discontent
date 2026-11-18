// @vitest-environment node
//
// 47h (rows 18–19): the engine's `fileImportUrl` download takes only what
// its spec accepts — `accept: "image"` refuses an HTML page saved as the
// picture — and at most a byte cap, counted as the body streams (a lying or
// missing `content-length` cannot get past it), failing closed with 47b's
// `UploadImportError` and nothing written. A value that is not a URL is
// refused the same way, not a `TypeError`.
//
// `fetch` is never called: each write gets its own `uploadFetch` stub.

import { mkdtemp, pathExists, readFile, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { UploadImportError } from "@discontent/cms/content/errors";
import {
  UPLOAD_IMPORT_MAX_BYTES,
  getUploadFilePath,
} from "@discontent/cms/content/filesystem";
import type {
  ContentTypeConfig,
  UploadFetch,
  UploadSpec,
} from "@discontent/cms/content/types";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

interface Photo {
  name: string;
  date: number;
  image?: string;
}
type PhotoKey = [number, string];

const photoConfig: ContentTypeConfig<Photo, { name: string }, PhotoKey> = {
  contentType: "photos",
  dataDirectory: "photos/data",
  indexDirectory: "photos/index",
  dataFilename: "photo.json",
  uploadsDirectory: "uploads/photo",
  buildIndexValue: (data) => ({ name: data.name }),
  buildIndexKey: (slug, data) => [data.date, slug],
};

let contentDirectory: string;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "upload-limits-"));
});

afterEach(async () => {
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const uploadPath = (slug: string, file: string) =>
  getUploadFilePath(
    photoConfig as unknown as ContentTypeConfig,
    slug,
    file,
    contentDirectory,
  );
const dataPath = (slug: string) =>
  join(contentDirectory, "photos/data", slug, "photo.json");

function answering(response: () => Response): {
  uploadFetch: UploadFetch;
  calls: ReturnType<typeof vi.fn>;
} {
  const calls = vi.fn(async () => response());
  return { uploadFetch: calls as unknown as UploadFetch, calls };
}

const write = (slug: string, upload: UploadSpec, uploadFetch: UploadFetch) =>
  createContent({
    config: photoConfig,
    slug,
    data: { name: slug, date: 1, image: "x.png" },
    contentDirectory,
    uploads: { image: upload },
    uploadFetch,
  });

/** A body that streams `chunks` × `size` bytes with no `content-length`. */
function streamed(chunks: number, size: number, type = "image/png") {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= chunks) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(new Uint8Array(size));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": type } });
}

describe("what an upload's fileImportUrl may answer (47h)", () => {
  it("refuses an HTML page for an image field, before reading it", async () => {
    const { uploadFetch } = answering(
      () =>
        new Response("<html>not a picture</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const attempt = write(
      "page",
      { fileImportUrl: "https://example.com/x.png", accept: "image" },
      uploadFetch,
    );
    await expect(attempt).rejects.toBeInstanceOf(UploadImportError);
    await expect(attempt).rejects.toThrow(
      "https://example.com/x.png is not an image (content-type text/html); nothing was saved.",
    );
    expect(await pathExists(uploadPath("page", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("page"))).toBe(false);
  });

  it("takes an image, and an unlabelled body only at an image file's URL", async () => {
    const png = answering(
      () =>
        new Response("PNGDATA", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    await write(
      "png",
      { fileImportUrl: "https://example.com/x.png", accept: "image" },
      png.uploadFetch,
    );
    expect(await readFile(uploadPath("png", "x.png"), "utf8")).toBe("PNGDATA");

    const octets = () =>
      new Response("JPEGDATA", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    await write(
      "named",
      { fileImportUrl: "https://example.com/x.jpg", accept: "image" },
      answering(octets).uploadFetch,
    );
    expect(await readFile(uploadPath("named", "x.jpg"), "utf8")).toBe(
      "JPEGDATA",
    );
    await expect(
      write(
        "unnamed",
        { fileImportUrl: "https://example.com/download", accept: "image" },
        answering(octets).uploadFetch,
      ),
    ).rejects.toThrow(
      /is not an image \(content-type application\/octet-stream\)/,
    );
  });

  it("takes any type for a field that does not say", async () => {
    const { uploadFetch } = answering(
      () =>
        new Response("%PDF", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
    );
    await write(
      "any",
      { fileImportUrl: "https://example.com/notes.pdf" },
      uploadFetch,
    );
    expect(await readFile(uploadPath("any", "notes.pdf"), "utf8")).toBe("%PDF");
  });

  it("refuses a declared size over the cap without reading the body", async () => {
    const { uploadFetch } = answering(
      () =>
        new Response("small really", {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(UPLOAD_IMPORT_MAX_BYTES + 1),
          },
        }),
    );
    const attempt = write(
      "declared",
      { fileImportUrl: "https://example.com/x.png", accept: "image" },
      uploadFetch,
    );
    await expect(attempt).rejects.toBeInstanceOf(UploadImportError);
    await expect(attempt).rejects.toThrow(
      /is 15\.0 MB, more than an import takes \(15\.0 MB\); nothing was saved\./,
    );
    expect(await pathExists(uploadPath("declared", "x.png"))).toBe(false);
  });

  it("counts a body with no content-length as it streams, and stops at the cap", async () => {
    const { uploadFetch } = answering(() => streamed(5, 1024));
    const attempt = write(
      "streamed",
      {
        fileImportUrl: "https://example.com/x.png",
        accept: "image",
        maxBytes: 3000,
      },
      uploadFetch,
    );
    await expect(attempt).rejects.toBeInstanceOf(UploadImportError);
    await expect(attempt).rejects.toThrow(
      "https://example.com/x.png is over 3 KB, more than an import takes; nothing was saved.",
    );
    expect(await pathExists(uploadPath("streamed", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("streamed"))).toBe(false);

    /* Under the cap, the same stream is written whole. */
    await write(
      "under",
      {
        fileImportUrl: "https://example.com/x.png",
        accept: "image",
        maxBytes: 8192,
      },
      answering(() => streamed(5, 1024)).uploadFetch,
    );
    expect((await readFile(uploadPath("under", "x.png"))).byteLength).toBe(
      5 * 1024,
    );
  });

  it("refuses a value that is not a web address, fetching nothing", async () => {
    const { uploadFetch, calls } = answering(() => new Response("x"));
    const attempt = write(
      "nonsense",
      { fileImportUrl: "not a url", accept: "image" },
      uploadFetch,
    );
    await expect(attempt).rejects.toBeInstanceOf(UploadImportError);
    await expect(attempt).rejects.toThrow(
      "not a url is not a web address; nothing was saved.",
    );
    expect(calls).not.toHaveBeenCalled();
    expect(await pathExists(dataPath("nonsense"))).toBe(false);
  });
});
