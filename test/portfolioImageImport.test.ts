// @vitest-environment node
//
// 47b: the portfolio editor's project image import (`imageImportUrl` →
// the engine's `fileImportUrl`) goes through the shared SSRF guard, and a
// refused URL comes back to the form as a plain sentence — not "Failed to
// create project", and with nothing fetched or written. Before 47b the
// engine fetched it with plain `fetch`: a signed-in portfolio user could
// make the server read a private address.
//
// `fetch` is stubbed (`vi.stubGlobal`); the content directory is a tmpdir,
// not a git repository, so the write's commit no-ops.

import { mkdtemp, pathExists, readFile, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { createProject } from "../websites/portfolio/editor/controller/actions/projects";
import { portfolioUploadFetch } from "../websites/portfolio/editor/controller/uploadFetch";
import { auth } from "./stub_auth.js";

const INSIDE = "imports only read public sites.";

let contentDirectory: string;
let previousContentDirectory: string | undefined;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "portfolio-import-"));
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
  auth.mockReset();
  auth.mockResolvedValue({ user: { email: "author@test.local" } });
  fetchSpy = vi.fn(
    async () =>
      new Response("PNGDATA", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
});

function projectForm(slug: string, imageImportUrl: string): FormData {
  const formData = new FormData();
  formData.set("name", `Project ${slug}`);
  formData.set("slug", slug);
  formData.set("content", "");
  formData.set("imageImportUrl", imageImportUrl);
  return formData;
}

const projectData = (slug: string) =>
  join(contentDirectory, "projects/data", slug);
const projectUpload = (slug: string, file: string) =>
  join(contentDirectory, "uploads/project", slug, "uploads", file);

describe("the portfolio editor's image import URL (47b)", () => {
  it("refuses a private address with a plain message, fetching and writing nothing", async () => {
    const state = await createProject(
      null,
      projectForm("inside", "http://127.0.0.1:3000/api/secret.png"),
    );
    expect(state.message).toBe(
      `http://127.0.0.1:3000/api/secret.png points inside your network; ${INSIDE}`,
    );
    expect(state.formData?.name).toBe("Project inside");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pathExists(projectData("inside"))).toBe(false);
  });

  it("refuses a public URL that redirects inside, after one fetch", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
    const state = await createProject(
      null,
      projectForm("hop", "http://203.0.113.10/photo.png"),
    );
    expect(state.message).toBe(
      `It redirects to http://169.254.169.254/latest/meta-data, which points inside your network; ${INSIDE}`,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await pathExists(projectData("hop"))).toBe(false);
  });

  it("says what a failed download answered", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("gone", { status: 404, statusText: "Not Found" }),
    );
    const state = await createProject(
      null,
      projectForm("missing", "http://203.0.113.10/missing.png"),
    );
    expect(state.message).toBe(
      "http://203.0.113.10/missing.png answered 404 Not Found, not the file; nothing was saved.",
    );
    expect(await pathExists(projectData("missing"))).toBe(false);
  });

  it("imports a public image", async () => {
    await createProject(
      null,
      projectForm("public", "http://203.0.113.10/photo.png"),
    );
    expect(await readFile(projectUpload("public", "photo.png"), "utf8")).toBe(
      "PNGDATA",
    );
    expect(await pathExists(projectData("public"))).toBe(true);
  });

  /* 47h: the project's picture field takes only an image. */
  it("refuses a page that is not an image, writing nothing", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("<html>a page</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const state = await createProject(
      null,
      projectForm("page", "http://203.0.113.10/photo.png"),
    );
    expect(state.message).toBe(
      "http://203.0.113.10/photo.png is not an image (content-type text/html); nothing was saved.",
    );
    expect(await pathExists(projectData("page"))).toBe(false);
  });

  /* 47h: `buildProjectData`'s `new URL` threw before the write. */
  it("refuses an image URL that is not a web address, plainly", async () => {
    for (const value of ["not a url", "ftp://203.0.113.10/x.png"]) {
      const state = await createProject(null, projectForm("odd", value));
      expect(state.message).toBe(
        "The image URL is not a web address: give one starting with http:// or https://, or upload the file.",
      );
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await pathExists(projectData("odd"))).toBe(false);
  });

  /* No test allowance: under vitest (`VITEST` set) the recipe editor's
   * environment allowance could apply; the portfolio's fetch has none. */
  it("has no test allowance, even under a test run", async () => {
    expect(process.env.VITEST).toBeTruthy();
    await expect(
      portfolioUploadFetch("http://localhost:3029/x.png", {
        signal: AbortSignal.timeout(1_000),
      }),
    ).rejects.toThrow(`points inside your network; ${INSIDE}`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
