// @vitest-environment node
//
// `fetchImageFile` (26a): the image download the engine used to do blind. Each
// case is a way the engine's bare `fetch` wrote garbage, or a name with no
// extension, into a recipe's uploads — all with `fetch` stubbed, no network.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchImageFile,
  imageFilename,
  LARGE_IMAGE_BYTES,
  largeImageWarning,
  MAX_IMAGE_BYTES,
  probeImageFile,
} from "../websites/recipe-website/editor/controller/imageImport";
import {
  DEFAULT_403_DELAY_MS,
  RECIPE_FETCH_HEADERS,
} from "recipe-website-common/util/importRecipeData";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(
  body: BodyInit | null,
  {
    status = 200,
    type = "image/jpeg",
    length,
  }: {
    status?: number;
    type?: string | null;
    length?: number;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (type) headers["content-type"] = type;
  if (length !== undefined) headers["content-length"] = String(length);
  return new Response(body, { status, headers });
}

describe("imageFilename", () => {
  it("keeps a plain basename and drops the query", () => {
    expect(
      imageFilename("https://x.com/img/naan.jpg?w=1200", "image/jpeg"),
    ).toBe("naan.jpg");
  });

  it("takes what follows the last encoded %2F and adds the type's extension", () => {
    expect(
      imageFilename(
        "https://cdn.x.com/image/upload/w_1500/k%2FPhoto%2FRecipes%2F2024%2Fbloody-mary-441_1",
        "image/jpeg",
      ),
    ).toBe("bloody-mary-441_1.jpg");
  });

  it("sanitizes to [\\w.-] and keeps an extension it already has", () => {
    expect(
      imageFilename("https://x.com/My%20Photo%20(1).PNG", "image/png"),
    ).toBe("My-Photo-1.PNG");
    expect(imageFilename("https://x.com/", "image/webp")).toBe("image.webp");
  });
});

describe("fetchImageFile", () => {
  it("returns a File named from the URL, typed from the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond("png bytes", { type: "image/png" })),
    );
    const file = await fetchImageFile("https://x.com/a/cover");
    expect(file.name).toBe("cover.png");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("png bytes");
  });

  it("refuses a non-2xx answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond("nope", { status: 404 })),
    );
    await expect(fetchImageFile("https://x.com/a.jpg")).rejects.toMatchObject({
      code: "import_failed",
      message: expect.stringContaining("HTTP 404"),
    });
  });

  it("refuses HTML served at an image URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond("<html>", { type: "text/html; charset=utf-8" }),
      ),
    );
    await expect(fetchImageFile("https://x.com/a.jpg")).rejects.toMatchObject({
      code: "import_failed",
      message: expect.stringContaining("text/html"),
    });
  });

  it("accepts an untyped response only when the URL names an image file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(new TextEncoder().encode("bytes"), { type: null }),
      ),
    );
    expect((await fetchImageFile("https://x.com/a.webp")).name).toBe("a.webp");
    await expect(fetchImageFile("https://x.com/a")).rejects.toMatchObject({
      code: "import_failed",
    });
  });

  it("refuses a body over the cap, declared or not", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond("x", { length: MAX_IMAGE_BYTES + 1 })),
    );
    await expect(fetchImageFile("https://x.com/a.jpg")).rejects.toMatchObject({
      message: expect.stringContaining("cap"),
    });

    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(big)),
    );
    await expect(fetchImageFile("https://x.com/a.jpg")).rejects.toMatchObject({
      message: expect.stringContaining("cap"),
    });
  });

  it("asks again as a browser after a 403, and only then — 15 s later", async () => {
    vi.useFakeTimers();
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        respond("Forbidden", { status: 403, type: "text/html" }),
      )
      .mockResolvedValueOnce(respond("jpeg"));
    vi.stubGlobal("fetch", fetchStub);
    const pending = fetchImageFile("https://x.com/a.jpg");
    await vi.advanceTimersByTimeAsync(DEFAULT_403_DELAY_MS - 1);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const file = await pending;
    vi.useRealTimers();
    expect(file.name).toBe("a.jpg");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[0][1]?.headers).toBeUndefined();
    expect(fetchStub.mock.calls[1][1]?.headers).toMatchObject({
      "user-agent": RECIPE_FETCH_HEADERS["user-agent"],
    });
  });

  it("retries at once when asked to (the browser form)", async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        respond("Forbidden", { status: 403, type: "text/html" }),
      )
      .mockResolvedValueOnce(respond("jpeg"));
    vi.stubGlobal("fetch", fetchStub);
    const file = await fetchImageFile("https://x.com/a.jpg", {
      retry: { delayMs: 0 },
    });
    expect(file.name).toBe("a.jpg");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 403 when retrying is off", async () => {
    const fetchStub = vi.fn(async () =>
      respond("Forbidden", { status: 403, type: "text/html" }),
    );
    vi.stubGlobal("fetch", fetchStub);
    await expect(
      fetchImageFile("https://x.com/a.jpg", { retry: { enabled: false } }),
    ).rejects.toMatchObject({ message: expect.stringContaining("403") });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("refuses something that is not a URL without fetching", async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
    await expect(fetchImageFile("not a url")).rejects.toMatchObject({
      code: "import_failed",
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("largeImageWarning", () => {
  it("warns above 2 MB and says by how much", () => {
    expect(largeImageWarning(undefined)).toBeUndefined();
    expect(largeImageWarning(LARGE_IMAGE_BYTES)).toBeUndefined();
    expect(largeImageWarning(9.7 * 1024 * 1024, "https://x.com/a.jpg")).toBe(
      "Image https://x.com/a.jpg is 9.7 MB, over 2.0 MB — a smaller candidate would load faster",
    );
  });
});

describe("probeImageFile", () => {
  it("reports the declared size, and warns above 2 MB (epic 31)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(null, { length: 512_000 })),
    );
    const small = await probeImageFile("https://x.com/a.jpg");
    expect(small.bytes).toBe(512_000);
    expect(small.warning).toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(null, { length: LARGE_IMAGE_BYTES + 1 })),
    );
    const large = await probeImageFile("https://x.com/a.jpg");
    expect(large.bytes).toBe(LARGE_IMAGE_BYTES + 1);
    expect(large.error).toBeUndefined();
    expect(large.warning).toMatch(/^Image is 2\.0 MB, over 2\.0 MB/);
  });

  it("names the file from a HEAD request without downloading", async () => {
    const fetchStub = vi.fn(async () => respond(null, { type: "image/webp" }));
    vi.stubGlobal("fetch", fetchStub);
    expect(await probeImageFile("https://x.com/k%2Fdish")).toEqual({
      importUrl: "https://x.com/k%2Fdish",
      filename: "dish.webp",
      status: 200,
      contentType: "image/webp",
    });
    expect(fetchStub.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
  });

  it("reports, rather than throws, what a real write would refuse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(null, { status: 404, type: "text/html" })),
    );
    expect(await probeImageFile("https://x.com/a.jpg")).toMatchObject({
      filename: "a.jpg",
      error: "Image answered HTTP 404",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ENOTFOUND");
      }),
    );
    expect(await probeImageFile("https://x.com/a.jpg")).toMatchObject({
      error: expect.stringContaining("ENOTFOUND"),
    });
  });
});
