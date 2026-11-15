// @vitest-environment node
//
// 47b: the engine's `fileImportUrl` download. It used to be a plain
// `fetch(fileImportUrl)` — redirects followed anywhere, no host check, and
// no status check, so a 404 page was written as the image. Now it goes only
// through the write's injected `uploadFetch`:
//
// - no fetcher: the import is refused (fail closed, Gb1);
// - through the shared SSRF guard (`@discontent/url-guard`), a private URL,
//   a name that resolves privately and a redirect inside are refused before
//   anything is written;
// - an answer that is not a success is not written, and says its status;
// - a refused import on update leaves the existing file where it was.
//
// `fetch` is stubbed (`vi.stubGlobal`): nothing here touches the network.

import { mkdtemp, outputFile, pathExists, readFile, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { UploadImportError } from "@discontent/cms/content/errors";
import { getUploadFilePath } from "@discontent/cms/content/filesystem";
import type {
  ContentTypeConfig,
  UploadFetch,
} from "@discontent/cms/content/types";
import { updateContent } from "@discontent/cms/content/updateContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import {
  guardedFetch,
  refusalSentence,
} from "@discontent/url-guard/guardedFetch";

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

/** The shared guard as an `UploadFetch`, refusals in the engine's error. */
const guarded =
  (lookup?: (host: string) => Promise<string[]>): UploadFetch =>
  (url, init) =>
    guardedFetch(url, init, {
      ...(lookup ? { lookup } : {}),
      refused: (refusal) =>
        new UploadImportError(refusalSentence(refusal), url),
    });

let contentDirectory: string;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "upload-import-"));
  fetchSpy = vi.fn(async () => new Response("PNGDATA", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

const uploadPath = (slug: string, file: string) =>
  getUploadFilePath(photoConfig, slug, file, contentDirectory);
const dataPath = (slug: string) =>
  join(contentDirectory, "photos/data", slug, "photo.json");

const createWithImport = (
  slug: string,
  fileImportUrl: string,
  uploadFetch?: UploadFetch,
) =>
  createContent({
    config: photoConfig,
    slug,
    data: { name: slug, date: 1, image: "x.png" },
    contentDirectory,
    uploads: { image: { fileImportUrl } },
    ...(uploadFetch ? { uploadFetch } : {}),
  });

describe("an upload's fileImportUrl (47b)", () => {
  it("is refused without a fetcher, and nothing is fetched or written", async () => {
    const write = createWithImport("plain", "https://203.0.113.10/x.png");
    await expect(write).rejects.toBeInstanceOf(UploadImportError);
    await expect(write).rejects.toThrow(
      /does not import files from a URL; upload the file instead/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pathExists(uploadPath("plain", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("plain"))).toBe(false);
  });

  it("refuses a private URL through the injected guard, before any fetch", async () => {
    const write = createWithImport(
      "inside",
      "http://127.0.0.1:8080/x.png",
      guarded(),
    );
    await expect(write).rejects.toBeInstanceOf(UploadImportError);
    await expect(write).rejects.toThrow(
      "http://127.0.0.1:8080/x.png points inside your network; imports only read public sites.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pathExists(uploadPath("inside", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("inside"))).toBe(false);
  });

  it("refuses a name that resolves privately (the guard's DNS step)", async () => {
    const lookup = vi.fn(async () => ["10.0.0.7"]);
    await expect(
      createWithImport(
        "rebind",
        "https://images.example/x.png",
        guarded(lookup),
      ),
    ).rejects.toThrow(
      /points inside your network \(images\.example resolves to 10\.0\.0\.7\)/,
    );
    expect(lookup).toHaveBeenCalledWith("images.example");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("follows a redirect by hand and refuses one that leads inside", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
    await expect(
      createWithImport("hop", "http://203.0.113.10/x.png", guarded()),
    ).rejects.toThrow(
      "It redirects to http://169.254.169.254/latest/meta-data, which points inside your network; imports only read public sites.",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("manual");
    expect(await pathExists(uploadPath("hop", "x.png"))).toBe(false);
  });

  it("does not write an answer that is not a success, and says its status", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("<html>not here</html>", {
        status: 404,
        statusText: "Not Found",
      }),
    );
    const write = createWithImport(
      "missing",
      "http://203.0.113.10/x.png",
      guarded(),
    );
    await expect(write).rejects.toBeInstanceOf(UploadImportError);
    await expect(write).rejects.toThrow(
      "http://203.0.113.10/x.png answered 404 Not Found, not the file; nothing was saved.",
    );
    expect(await pathExists(uploadPath("missing", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("missing"))).toBe(false);
  });

  it("wraps anything else the fetcher throws", async () => {
    const failing: UploadFetch = async () => {
      throw new TypeError("fetch failed");
    };
    const write = createWithImport(
      "down",
      "http://203.0.113.10/x.png",
      failing,
    );
    await expect(write).rejects.toBeInstanceOf(UploadImportError);
    await expect(write).rejects.toThrow(
      "Could not download http://203.0.113.10/x.png: fetch failed.",
    );
  });

  it("says a body that fails mid-stream is a failed download, and leaves no file", async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode("PNG"));
          return;
        }
        controller.error(new Error("socket hang up"));
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }));
    const write = createWithImport(
      "reset",
      "http://203.0.113.10/x.png",
      guarded(),
    );
    await expect(write).rejects.toBeInstanceOf(UploadImportError);
    await expect(write).rejects.toThrow(
      "Could not download http://203.0.113.10/x.png: socket hang up.",
    );
    expect(await pathExists(uploadPath("reset", "x.png"))).toBe(false);
    expect(await pathExists(dataPath("reset"))).toBe(false);
  });

  it("writes a public image through the guard, with a deadline", async () => {
    await createWithImport("public", "http://203.0.113.10/x.png", guarded());
    expect(await readFile(uploadPath("public", "x.png"), "utf8")).toBe(
      "PNGDATA",
    );
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://203.0.113.10/x.png");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the existing file when an import on update is refused", async () => {
    await createContent({
      config: photoConfig,
      slug: "kept",
      data: { name: "kept", date: 1, image: "old.png" },
      contentDirectory,
      uploads: { image: { file: new File(["OLD"], "old.png") } },
    });
    expect(await readFile(uploadPath("kept", "old.png"), "utf8")).toBe("OLD");

    await expect(
      updateContent({
        config: photoConfig,
        slug: "kept",
        currentSlug: "kept",
        currentIndexKey: [1, "kept"],
        data: { name: "kept", date: 1, image: "new.png" },
        contentDirectory,
        uploads: {
          image: {
            fileImportUrl: "http://10.0.0.1/new.png",
            existingFile: "old.png",
          },
        },
        uploadFetch: guarded(),
      }),
    ).rejects.toBeInstanceOf(UploadImportError);
    expect(await readFile(uploadPath("kept", "old.png"), "utf8")).toBe("OLD");
    expect(await pathExists(uploadPath("kept", "new.png"))).toBe(false);
  });

  it("still replaces the existing file on a successful import, and on a same-name upload", async () => {
    await outputFile(uploadPath("swap", "old.png"), "OLD");
    await createContent({
      config: photoConfig,
      slug: "swap",
      data: { name: "swap", date: 1, image: "old.png" },
      contentDirectory,
    });
    await updateContent({
      config: photoConfig,
      slug: "swap",
      currentSlug: "swap",
      currentIndexKey: [1, "swap"],
      data: { name: "swap", date: 1, image: "new.png" },
      contentDirectory,
      uploads: {
        image: {
          fileImportUrl: "http://203.0.113.10/new.png",
          existingFile: "old.png",
        },
      },
      uploadFetch: guarded(),
    });
    expect(await pathExists(uploadPath("swap", "old.png"))).toBe(false);
    expect(await readFile(uploadPath("swap", "new.png"), "utf8")).toBe(
      "PNGDATA",
    );

    await updateContent({
      config: photoConfig,
      slug: "swap",
      currentSlug: "swap",
      currentIndexKey: [1, "swap"],
      data: { name: "swap", date: 1, image: "new.png" },
      contentDirectory,
      uploads: {
        image: {
          file: new File(["NEWER"], "new.png"),
          existingFile: "new.png",
        },
      },
    });
    expect(await readFile(uploadPath("swap", "new.png"), "utf8")).toBe("NEWER");
  });
});
