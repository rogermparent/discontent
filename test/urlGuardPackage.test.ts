// @vitest-environment node
//
// 47b: the fetch guard's pure part as a package both editors use,
// `@discontent/url-guard` — the host and address checks, the DNS step,
// per-hop manual redirects and 47a's pinned connect. The recipe editor's
// modules re-export it (so 46a's and 47a's suites, which import the recipe
// paths, run against the package), and wrap it with what stays theirs: the
// `UrlRefusedError`, the test allowance and the `CheckedFetch` brand.

import { readdir, readFile } from "fs-extra";
import { join, resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FetchChainError,
  FetchRefusedError,
  guardedFetch,
  refusalSentence,
} from "@discontent/url-guard/guardedFetch";
import * as pinned from "@discontent/url-guard/pinnedDispatcher";
import { isPrivateHost } from "@discontent/url-guard/privateHost";
import * as guard from "@discontent/url-guard/urlGuard";

import { isPrivateHost as commonIsPrivateHost } from "../websites/recipe-website/common/util/privateHost";
import { UrlRefusedError } from "../websites/recipe-website/editor/controller/curation/errors";
import * as recipeFetch from "../websites/recipe-website/editor/controller/guardedFetch";
import * as recipePinned from "../websites/recipe-website/editor/controller/pinnedDispatcher";
import * as recipeGuard from "../websites/recipe-website/editor/controller/urlGuard";

const PACKAGE = resolve(__dirname, "../packages/url-guard");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("@discontent/url-guard (47b)", () => {
  it("is what the recipe editor's guard modules export", () => {
    expect(recipeGuard.checkUrl).toBe(guard.checkUrl);
    expect(recipeGuard.urlRefusal).toBe(guard.urlRefusal);
    expect(recipeGuard.isBlockedAddress).toBe(guard.isBlockedAddress);
    expect(recipeGuard.hostAllowed).toBe(guard.hostAllowed);
    expect(recipeGuard.DEFAULT_LOOKUP_OPTIONS).toBe(
      guard.DEFAULT_LOOKUP_OPTIONS,
    );
    expect(recipePinned.pinnedLookup).toBe(pinned.pinnedLookup);
    expect(recipePinned.checkingLookup).toBe(pinned.checkingLookup);
    expect(recipePinned.pinnedDispatcher).toBe(pinned.pinnedDispatcher);
    expect(recipeFetch.FetchChainError).toBe(FetchChainError);
    expect(recipeFetch.refusalSentence).toBe(refusalSentence);
    expect(commonIsPrivateHost).toBe(isPrivateHost);
  });

  it("refuses with FetchRefusedError by default: the refusal and a plain sentence", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const error = await guardedFetch("http://192.168.1.1/admin").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(FetchRefusedError);
    const refused = error as FetchRefusedError;
    expect(refused.message).toBe(
      "http://192.168.1.1/admin points inside your network; imports only read public sites.",
    );
    expect(refused.refusal).toMatchObject({
      code: "forbidden",
      reason: "private",
      hop: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws the caller's error for a refusal (`refused`), and the recipe editor's is UrlRefusedError", async () => {
    vi.stubGlobal("fetch", vi.fn());
    class Mine extends Error {}
    await expect(
      guardedFetch("file:///etc/passwd", {}, { refused: () => new Mine() }),
    ).rejects.toBeInstanceOf(Mine);
    await expect(
      recipeFetch.guardedFetch("http://[::1]/"),
    ).rejects.toBeInstanceOf(UrlRefusedError);
  });

  it("checks each redirect hop, and a name that does not resolve is a FetchChainError", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "https://cdn.example/a.png" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const lookup = vi.fn(async (host: string) =>
      host === "cdn.example" ? ["10.1.2.3"] : ["203.0.113.10"],
    );
    await expect(
      guardedFetch("http://203.0.113.10/a.png", {}, { lookup }),
    ).rejects.toMatchObject({
      refusal: { reason: "resolves-private", hop: 1, address: "10.1.2.3" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(
      guardedFetch(
        "https://gone.example/",
        {},
        {
          lookup: async () => {
            throw new Error("ENOTFOUND");
          },
        },
      ),
    ).rejects.toBeInstanceOf(FetchChainError);
  });

  /* The allowance is a caller's option, never the environment's: the
   * package must not be able to open itself up under a test run. */
  it("never reads the environment or names the recipe editor's test allowance", async () => {
    const files = (await readdir(PACKAGE)).filter((name) =>
      name.endsWith(".ts"),
    );
    expect(files.sort()).toEqual([
      "guardedFetch.ts",
      "pinnedDispatcher.ts",
      "privateHost.ts",
      "urlGuard.ts",
    ]);
    for (const file of files) {
      const source = await readFile(join(PACKAGE, file), "utf8");
      expect(source, file).not.toMatch(/process\.env/);
      expect(source, file).not.toMatch(
        /RECIPE_TEST_FETCH_ALLOW|RECIPE_TEST_DNS|setFetchGuardTesting|fetchGuardOptions\(/,
      );
    }
  });
});
