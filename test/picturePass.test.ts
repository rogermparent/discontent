// @vitest-environment node
//
// 48c (Dc1, Roger's amendment to 30-D5, 2026-11-17): a page's own picture
// may follow its page without the per-site polite gap — one picture per
// page fetch, the image URL that page named, on its registrable domain —
// still one request at a time, and still counted for the next page's gap.
// `editor/controller/curation/sitePacing.ts` on a fake clock, then on the
// real clock through the shared queue (`site:` slots, `waiveGapAfter`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import {
  SitePacer,
  SiteState,
  realPacing,
  type Pacing,
} from "../websites/recipe-website/editor/controller/curation/sitePacing";
import type { ForbiddenRetry } from "../websites/recipe-website/common/util/politeFetch";

const PAGE = "https://www.example.com/r/pie";
const PICTURE = "https://cdn.example.com/pie.jpg";

describe("a page's own picture on a fake clock", () => {
  let now: number;
  /** The fake clock when each request ran. */
  let at: Record<string, number[]>;
  let pacing: Pacing;

  beforeEach(() => {
    now = 1_000_000;
    at = {};
    pacing = {
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      state: new SiteState(),
    };
  });

  /** A request that takes `ms` of the fake clock and notes when it ran. */
  const run =
    (url: string, ms = 1_000) =>
    async () => {
      (at[url] ??= []).push(now);
      now += ms;
      return url;
    };

  const page = (pacer: SitePacer, url = PAGE) => pacer.request(url, run(url));
  const picture = (pacer: SitePacer, url = PICTURE) =>
    pacer.request(url, run(url), undefined, { image: true });

  it("follows its page at once, and the next page waits the gap after it", async () => {
    const pacer = new SitePacer(pacing);
    await page(pacer);
    pacer.namePictures(PAGE, [PICTURE]);
    const pageEnd = now;
    await picture(pacer);
    /* No gap before the picture: it ran the moment the page ended. */
    expect(at[PICTURE]).toEqual([pageEnd]);
    const pictureEnd = now;
    await page(pacer, "https://example.com/r/tart");
    /* The picture counted: the next page waited 15 s after it. */
    expect(at["https://example.com/r/tart"]).toEqual([pictureEnd + 15_000]);
    expect(pacer.requests).toBe(3);
  });

  it("passes one picture per page fetch: a second named picture waits", async () => {
    const pacer = new SitePacer(pacing);
    const second = "https://www.example.com/pie-2.jpg";
    await page(pacer);
    pacer.namePictures(PAGE, [PICTURE, second]);
    await picture(pacer);
    const firstEnd = now;
    await picture(pacer, second);
    expect(at[second]).toEqual([firstEnd + 15_000]);
  });

  it("passes only the URL the page named, on the page's own site", async () => {
    const pacer = new SitePacer(pacing);
    await page(pacer);
    /* Another site's picture is no pass for this one (it is not named). */
    pacer.namePictures(PAGE, ["https://other.test/pie.jpg"]);
    const pageEnd = now;
    await picture(pacer);
    expect(at[PICTURE]).toEqual([pageEnd + 15_000]);
  });

  it("is void once anything else asked the site in between", async () => {
    const pacer = new SitePacer(pacing);
    await page(pacer);
    pacer.namePictures(PAGE, [PICTURE]);
    await page(pacer, "https://example.com/r/tart");
    const tartEnd = now;
    await picture(pacer);
    expect(at[PICTURE]).toEqual([tartEnd + 15_000]);
  });

  it("names nothing for a page that is not its site's last request", async () => {
    const pacer = new SitePacer(pacing);
    await page(pacer);
    await page(pacer, "https://example.com/r/tart");
    pacer.namePictures(PAGE, [PICTURE]);
    const tartEnd = now;
    await picture(pacer);
    expect(at[PICTURE]).toEqual([tartEnd + 15_000]);
  });

  it("makes a picture's 403 retry wait the gap", async () => {
    const pacer = new SitePacer(pacing);
    await page(pacer);
    pacer.namePictures(PAGE, [PICTURE]);
    const pageEnd = now;
    const tries: number[] = [];
    await pacer.request(
      PICTURE,
      async (retry: ForbiddenRetry) => {
        tries.push(now);
        now += 100;
        await retry.beforeRetry!();
        tries.push(now);
        retry.afterRetry!({ status: 200 } as Response);
        return "ok";
      },
      undefined,
      { image: true },
    );
    expect(tries).toEqual([pageEnd, pageEnd + 100 + 15_000]);
  });

  it("says so in the job's log", async () => {
    const { log, lines } = memoryJobLog();
    const pacer = new SitePacer(pacing, { log });
    await page(pacer);
    pacer.namePictures(PAGE, [PICTURE]);
    await picture(pacer);
    expect(lines.map((line) => line.step)).toEqual(["pace.follow"]);
    expect(lines[0].data).toEqual({ site: "example.com" });
  });
});

describe("a page's own picture across processes (the shared slot)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "picture-pass-"));
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    vi.stubEnv("RECIPE_QUEUE_DIR", join(dir, "queue"));
    vi.stubEnv("RECIPE_QUEUE_POLL_MS", "10");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  /** One process's pacer on the real clock: its own state, the shared queue. */
  const pacerOf = () =>
    new SitePacer({ ...realPacing(), gapMs: 400, state: new SiteState() });

  const timed = (starts: number[]) => async () => {
    starts.push(Date.now());
    return "ok";
  };

  it("lets the picture follow at once, and holds the next page the gap after it", async () => {
    const pacer = pacerOf();
    const starts: number[] = [];
    await pacer.request(PAGE, timed(starts));
    pacer.namePictures(PAGE, [PICTURE]);
    await pacer.request(PICTURE, timed(starts), undefined, { image: true });
    await pacer.request("https://example.com/r/tart", timed(starts));
    expect(starts[1] - starts[0]).toBeLessThan(300);
    /* A few ms of timer slack allowed. */
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(390);
  });

  it("owes the gap when another process asked the site in between", async () => {
    const mine = pacerOf();
    const theirs = pacerOf();
    const starts: number[] = [];
    await mine.request(PAGE, timed(starts));
    mine.namePictures(PAGE, [PICTURE]);
    await theirs.request("https://example.com/r/theirs", timed(starts));
    await mine.request(PICTURE, timed(starts), undefined, { image: true });
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(390);
  });
});
