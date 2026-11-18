/**
 * Polite fetching (30-D5), for every seat in this process that reads a
 * recipe site: roundup import (34f), `inspect` and `import` (epic 26).
 *
 * - **One queue per site.** A request to a site waits for the one before it
 *   to finish, then for 15 s after it ended, then runs. The queue is per
 *   process and per `paceKey` — the registrable domain (39e De1, after
 *   38-Db6: `cdn.example.com` is `example.com`; `example.co.uk` and
 *   `i0.wp.com` are not lumped with every other `.co.uk` or `wp.com`
 *   host) — so two calls at once — two `page_inspect_list`s, a
 *   client that retried `/api/import-list` after its own timeout, a
 *   `recipe_import` right after a list call — are spaced against each other,
 *   not just within themselves. A 403 retry holds the queue: it waits the gap
 *   and counts as a request. **The line honours tiers** (38b), as the shared
 *   one does: an `interactive` request (the form, the API, MCP) goes ahead
 *   of every queued `batch` one (a roundup's), first come first served
 *   within a tier.
 * - **A site that refuses twice is dropped** for an hour: the retry also
 *   answered 403, or failed outright. A 403 whose retry succeeded drops
 *   nothing, whatever the caller then thinks of the body. **An image never
 *   drops a site** (`{image: true}`, 38b review, Db7): a hotlink guard
 *   refusing a picture says nothing about the pages — often on the same
 *   host — so a refused image is only that image, done without. On the real clock
 *   the drop is the machine's (38b): written beside the site's slot in the
 *   global queue (`writeSiteDrop`), so the CLI, the stdio MCP server and the
 *   editor stop asking a site that refused any one of them.
 * - **Loopback is not paced** (`127.x`, `::1`, `localhost`): a fixture server
 *   is not a site to be polite to. The vitest suite asks for pacing anyway
 *   (`paceLoopback`) with a fake clock, and `RECIPE_POLITE_GAP_MS` sets the
 *   real clock's gap — tests set it to 0 for the epic-26 seats, which they
 *   drive with stubbed `fetch` against `example.com` URLs.
 *
 * Redirects: a request is queued under the URL it was asked for; when the
 * caller can say where it ended up (`finalUrl`), the final site's clock is
 * advanced too. A redirect to a third site is not paced before it happens.
 *
 * **A page's own picture follows its page** (48c, Dc1 — Roger's amendment
 * to 30-D5, 2026-11-17, 47h row 7): once a page is read, the picture that
 * page named (`namePictures`, from its parse) may be downloaded right after
 * it without the polite gap — one picture per page fetch, the very URL the
 * page named, on the page's own site (`paceKey`). It is still one request
 * at a time (the line and the shared slot are taken as ever), it still
 * counts — the next request to the site waits the gap after the picture —
 * and the pass is void once anything else asked the site, in this process
 * or (on the real clock) in any other: the shared slot's clock must still
 * read the page's own release (`waiveGapAfter`). A 403's retry of the
 * picture waits the gap. Logged as a `pace.follow` note.
 *
 * In a job (epic 37) a wait is a `pace.wait` step, and the job's signal
 * ends a wait — in the queue or for the gap — with the abort's reason; a
 * request given up while queued leaves the line, and the rest keep their
 * order.
 *
 * **Across processes (37b, D4).** On the real clock (`realPacing`, which
 * every seat uses) a request also holds the global queue's `site:<site>`
 * slot, whose grant waits for the polite gap since the previous holder —
 * in *any* process — let go. So the CLI, the stdio MCP server and the editor
 * space their requests to one site as one process would; such a wait is a
 * `queue.wait` step. The per-process queue and clock above stay: they keep
 * this process's order and the 403 retry's gap (inside the held slot), and
 * they are all a fake clock (`Pacing` without `shared`) uses. Loopback is
 * never queued, as it is never paced. A fake clock's dropped sites stay
 * in its `SiteState`.
 */
import type { ForbiddenRetry } from "recipe-website-common/util/importRecipeData";
import { paceKey } from "recipe-website-common/util/roundupPage";
import {
  jobContext,
  type JobContext,
  type JobRun,
  type JobTier,
} from "../jobs/context";
import {
  acquire,
  readSiteDrop,
  siteResource,
  touchResource,
  writeSiteDrop,
  type ResourceGrant,
  type SiteDrop,
} from "../jobs/queue";
import { ImportError } from "./errors";

/** `promise`, or the signal's reason once it aborts first. */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener("abort", stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", stop);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", stop);
        reject(error);
      },
    );
  });
}

/** 30-D5: the least time between two requests to one site. */
export const POLITE_GAP_MS = 15_000;

/** How long a site that refused twice stays dropped (machine-wide, 38b). */
export const DROP_MS = 60 * 60 * 1000;

const TIER_RANK: Record<JobTier, number> = { interactive: 0, batch: 1 };

/**
 * The last page read from a site, while it is the last request there (48c):
 * when it ended, the shared slot's stamp it left, and the pictures it named.
 */
interface PageMark {
  url: string;
  end: number;
  release?: number;
  pictures: Set<string>;
}

/** One site's line in this process, while a request to it runs: who waits. */
interface SiteLine {
  waiters: { tier: JobTier; grant: () => void }[];
}

/** Per-process queues, clocks and dropped sites. */
export class SiteState {
  readonly lastEnd = new Map<string, number>();
  readonly droppedUntil = new Map<string, SiteDrop>();
  /** Per site, the page its last request read (48c's picture pass). */
  readonly pages = new Map<string, PageMark>();
  /** A site is here while a request to it runs; its waiters, in grant order. */
  private readonly lines = new Map<string, SiteLine>();

  /** Another request to the site is queued or running: an `acquire` would wait. */
  busy(site: string): boolean {
    return this.lines.has(site);
  }

  /**
   * Wait for the site's queue; the returned function releases it. Waiters
   * are granted by tier, then in order (38b): an `interactive` one goes
   * ahead of every `batch` one still waiting. An abort while waiting
   * rejects and leaves the line.
   */
  async acquire(
    site: string,
    signal?: AbortSignal,
    tier: JobTier = "interactive",
  ): Promise<() => void> {
    signal?.throwIfAborted();
    const line = this.lines.get(site);
    if (!line) {
      const fresh: SiteLine = { waiters: [] };
      this.lines.set(site, fresh);
      return this.releaser(site, fresh);
    }
    let grant!: () => void;
    const granted = new Promise<void>((resolve) => {
      grant = resolve;
    });
    const waiter = { tier, grant };
    /* After every waiter of this tier or a better one. */
    const at = line.waiters.findIndex(
      (other) => TIER_RANK[other.tier] > TIER_RANK[tier],
    );
    if (at < 0) line.waiters.push(waiter);
    else line.waiters.splice(at, 0, waiter);
    try {
      await untilAborted(granted, signal);
    } catch (error) {
      const index = line.waiters.indexOf(waiter);
      if (index >= 0) {
        line.waiters.splice(index, 1);
      } else {
        /* Granted in the same instant as the abort: hand it on. */
        this.releaser(site, line)();
      }
      throw error;
    }
    return this.releaser(site, line);
  }

  /** Let go of the site: the next waiter runs, or the line is forgotten. */
  private releaser(site: string, line: SiteLine): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = line.waiters.shift();
      if (next) next.grant();
      else if (this.lines.get(site) === line) this.lines.delete(site);
    };
  }
}

const processState = new SiteState();

/** The clock pacing runs on: the real one, or a test's. */
export interface Pacing {
  now(): number;
  /** `signal`: a real clock clears its timer when it aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Least milliseconds between two requests to one site; default 15 000. */
  gapMs?: number;
  /** Pace loopback hosts too (tests, with a fake clock). */
  paceLoopback?: boolean;
  /** Queues and clocks; default this process's. Tests pass a fresh one. */
  state?: SiteState;
  /**
   * Also hold the global queue's `site:<site>` slot (37b): the gap across
   * processes. The real clock's; a fake clock leaves it off.
   */
  shared?: boolean;
}

/**
 * `RECIPE_POLITE_GAP_MS`, for tests: a number of milliseconds ≥ 0, else the
 * 15 s default. Read on every call, so a test can stub it.
 */
function envGapMs(): number | undefined {
  const raw = process.env.RECIPE_POLITE_GAP_MS?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function realPacing(): Pacing {
  return {
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const stop = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", stop);
          resolve();
        }, ms);
        signal?.addEventListener("abort", stop, { once: true });
      }),
    gapMs: envGapMs(),
    shared: true,
  };
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isLoopback(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    return true;
  }
  return IPV4.test(host) && host.startsWith("127.");
}

/** How one request is made (`SitePacer#request`). */
export interface RequestOptions {
  /** A picture's download or probe: paced, but it never drops the site. */
  image?: boolean;
}

/** Thrown before a request to a dropped site; nothing was fetched. */
export class SiteDroppedError extends ImportError {}

/**
 * One call's view of the pacing: it counts the call's requests and the sites
 * that were dropped — now or earlier — while it ran.
 */
export class SitePacer {
  private readonly state: SiteState;
  requests = 0;
  readonly dropped = new Map<string, string>();

  private readonly job: JobContext;

  /**
   * `job` (epic 37): a wait — behind another request to the site, or for
   * the polite gap — is a `pace.wait` step, and the job's signal ends it.
   */
  constructor(
    private readonly pacing: Pacing = realPacing(),
    job?: JobRun,
  ) {
    this.state = pacing.state ?? processState;
    this.job = jobContext(job);
  }

  site(url: string): string {
    return paceKey(url) ?? url;
  }

  /**
   * The reason `url`'s site is dropped, if it is (and notes it): this
   * process's drop, else — on the real clock — the machine's (38b), which
   * another process may have written.
   */
  async droppedReason(url: string): Promise<string | undefined> {
    const site = this.site(url);
    let entry = this.state.droppedUntil.get(site);
    if (!entry && this.shared(url)) {
      entry = await readSiteDrop(siteResource(site)).catch(() => undefined);
      if (entry) this.state.droppedUntil.set(site, entry);
    }
    if (!entry) return undefined;
    if (entry.until <= this.pacing.now()) {
      this.state.droppedUntil.delete(site);
      return undefined;
    }
    this.dropped.set(site, entry.reason);
    return entry.reason;
  }

  /** Drop `url`'s site for `DROP_MS`: here, and for the machine (38b). */
  async drop(url: string, reason: string): Promise<void> {
    const site = this.site(url);
    if (!this.state.droppedUntil.has(site)) {
      this.state.droppedUntil.set(site, {
        until: this.pacing.now() + DROP_MS,
        reason,
      });
    }
    const entry = this.state.droppedUntil.get(site)!;
    this.dropped.set(site, entry.reason);
    if (this.shared(url)) {
      /* The machine's copy is a courtesy: this process has its own. */
      await writeSiteDrop(siteResource(site), entry).catch(() => undefined);
    }
  }

  /**
   * The pictures `pageUrl` named (48c): one of them may follow the page
   * without the polite gap, while the page is still the site's last
   * request. Only pictures on the page's own site count; a page that is
   * not its site's last request names nothing.
   */
  namePictures(pageUrl: string, pictures: Iterable<string>): void {
    if (!URL.canParse(pageUrl)) return;
    const site = this.site(pageUrl);
    const mark = this.state.pages.get(site);
    if (!mark || mark.url !== pageUrl) return;
    for (const picture of pictures) {
      if (URL.canParse(picture) && this.site(picture) === site) {
        mark.pictures.add(picture);
      }
    }
  }

  /** The page this picture may follow without the gap, if it may (48c). */
  private picturePass(url: string): PageMark | undefined {
    const site = this.site(url);
    const mark = this.state.pages.get(site);
    if (!mark || !mark.pictures.has(url)) return undefined;
    /* Anything else asked the site since: the gap is owed. */
    if (this.state.lastEnd.get(site) !== mark.end) return undefined;
    return mark;
  }

  private gap(url: string): number {
    if (!this.pacing.paceLoopback && isLoopback(url)) return 0;
    return this.pacing.gapMs ?? POLITE_GAP_MS;
  }

  private async waitGap(url: string, retry = false): Promise<void> {
    const site = this.site(url);
    const last = this.state.lastEnd.get(site);
    if (last === undefined) return;
    const wait = last + this.gap(url) - this.pacing.now();
    if (wait > 0) {
      await this.job.log.step(
        "pace.wait",
        {
          site,
          gapMs: this.gap(url),
          waitMs: wait,
          ...(retry ? { retry } : {}),
        },
        () =>
          untilAborted(
            this.pacing.sleep(wait, this.job.signal),
            this.job.signal,
          ),
      );
    }
  }

  private end(url: string): void {
    this.state.lastEnd.set(this.site(url), this.pacing.now());
  }

  /**
   * Run one request (and its 403 retry) in the site's queue. `run` gets the
   * `ForbiddenRetry` to hand `fetchRetrying403`; `finalUrlOf` names where the
   * request ended up, so a redirect's site is clocked too. `image`: a
   * picture's download or probe, which waits like any request but never
   * drops the site (Db7).
   */
  async request<T>(
    url: string,
    run: (retry: ForbiddenRetry) => Promise<T>,
    finalUrlOf?: (value: T) => string | undefined,
    { image = false }: RequestOptions = {},
  ): Promise<T> {
    const site = this.site(url);
    const { log, signal } = this.job;
    signal?.throwIfAborted();
    const { tier } = this.job;
    const release = this.state.busy(site)
      ? await log.step("pace.wait", { site, queued: true }, () =>
          this.state.acquire(site, signal, tier),
        )
      : await this.state.acquire(site, signal, tier);
    let forbidden = false;
    let retryStatus: number | undefined;
    let started = false;
    let slot: ResourceGrant | undefined;
    /* 48c: a page's own picture, right after the page; the line still held. */
    const pass = image ? this.picturePass(url) : undefined;
    try {
      const reason = await this.droppedReason(url);
      if (reason) {
        throw new SiteDroppedError(`${site} is dropped for now: ${reason}`);
      }
      /* Every process's requests to the site, one at a time, the gap apart. */
      if (this.shared(url)) {
        slot = await acquire(siteResource(site), {
          ...this.job,
          gapMs: this.gap(url),
          ...(pass?.release !== undefined
            ? { waiveGapAfter: pass.release }
            : {}),
        });
        /* Another process may have been refused while this one waited. */
        const late = await this.droppedReason(url);
        if (late) {
          throw new SiteDroppedError(`${site} is dropped for now: ${late}`);
        }
      }
      /*
       * Judged again now the slot is held: a redirect elsewhere may have
       * ended on this site meanwhile (the mark is gone then), and another
       * process's request makes the shared grant wait the gap — then the
       * picture did not follow at once, and the log does not say it did.
       */
      const followed =
        pass !== undefined &&
        this.picturePass(url) === pass &&
        (slot === undefined || slot.waitedMs < 50);
      if (followed) {
        this.job.log.info("pace.follow", "the page's own picture, no gap", {
          site,
        });
      } else {
        await this.waitGap(url);
      }
      started = true;
      this.requests += 1;
      let value: T;
      try {
        /* `enabled` is left to `RECIPE_FETCH_403_DELAY_MS` (`off` = no retry). */
        value = await run({
          beforeRetry: async () => {
            forbidden = true;
            this.end(url);
            await this.waitGap(url, true);
            this.requests += 1;
          },
          afterRetry: (response) => {
            retryStatus = response.status ?? 200;
          },
        });
      } catch (error) {
        /* The retry answered 403 again, or never answered at all — unless
         * the job was cancelled in the retry's gap or its fetch: the site
         * refused nothing then. */
        if (
          forbidden &&
          !image &&
          !signal?.aborted &&
          (retryStatus === 403 || retryStatus === undefined)
        ) {
          await this.drop(url, `refused twice (HTTP 403) at ${url}`);
        }
        throw error;
      }
      if (forbidden && !image && retryStatus === 403) {
        await this.drop(url, `refused twice (HTTP 403) at ${url}`);
      }
      const finalUrl = finalUrlOf?.(value);
      if (finalUrl && URL.canParse(finalUrl) && this.site(finalUrl) !== site) {
        this.end(finalUrl);
        /* That site was asked too: its last page's pass is spent. */
        this.state.pages.delete(this.site(finalUrl));
        if (this.shared(finalUrl)) {
          await touchResource(siteResource(this.site(finalUrl))).catch(
            () => undefined,
          );
        }
      }
      return value;
    } finally {
      if (started) this.end(url);
      try {
        /* A request never made (cancelled in the gap) does not move the clock. */
        const stamp = await slot?.release({ used: started });
        if (started) {
          /* 48c: a page may pass one picture on; a picture passes nothing. */
          if (image) {
            this.state.pages.delete(site);
          } else {
            this.state.pages.set(site, {
              url,
              end: this.state.lastEnd.get(site)!,
              ...(stamp !== undefined ? { release: stamp } : {}),
              pictures: new Set(),
            });
          }
        }
      } finally {
        release();
      }
    }
  }

  /** Whether `url`'s requests also hold the global queue's site slot. */
  private shared(url: string): boolean {
    return (
      this.pacing.shared === true &&
      (this.pacing.paceLoopback === true || !isLoopback(url))
    );
  }
}

/**
 * `SitePacer#namePictures` on this process's state (48c): the pictures a
 * page read by `pacedRequest` named, one of which may follow it.
 */
export function namePagePictures(
  pageUrl: string,
  pictures: Iterable<string>,
): void {
  new SitePacer(realPacing()).namePictures(pageUrl, pictures);
}

/**
 * `SitePacer#request` on this process's real clock, for one-off seats;
 * `job` (epic 37) logs its waits and can abort them.
 */
export function pacedRequest<T>(
  url: string,
  run: (retry: ForbiddenRetry) => Promise<T>,
  finalUrlOf?: (value: T) => string | undefined,
  job?: JobRun,
  options?: RequestOptions,
): Promise<T> {
  return new SitePacer(realPacing(), job).request(
    url,
    run,
    finalUrlOf,
    options,
  );
}
