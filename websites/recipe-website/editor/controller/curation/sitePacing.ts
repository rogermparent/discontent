/**
 * Polite fetching (30-D5), for every seat in this process that reads a
 * recipe site: roundup import (34f), `inspect` and `import` (epic 26).
 *
 * - **One queue per site.** A request to a site waits for the one before it
 *   to finish, then for 15 s after it ended, then runs. The queue is per
 *   process and per `siteKey` (`cdn.example.com` paces with
 *   `www.example.com`), so two calls at once — two `page_inspect_list`s, a
 *   client that retried `/api/import-list` after its own timeout, a
 *   `recipe_import` right after a list call — are spaced against each other,
 *   not just within themselves. A 403 retry holds the queue: it waits the gap
 *   and counts as a request.
 * - **A site that refuses twice is dropped** for an hour, process-wide: the
 *   retry also answered 403, or failed outright. A 403 whose retry succeeded
 *   drops nothing, whatever the caller then thinks of the body.
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
 * In a job (epic 37) a wait is a `pace.wait` step, and the job's signal
 * ends a wait — in the queue or for the gap — with the abort's reason; a
 * request given up while queued still holds its place until the one before
 * it finishes, so the queue's order is unchanged.
 *
 * **Across processes (37b, D4).** On the real clock (`realPacing`, which
 * every seat uses) a request also holds the global queue's `site:<site>`
 * slot, whose grant waits for the polite gap since the previous holder —
 * in *any* process — let go. So the CLI, the stdio MCP server and the editor
 * space their requests to one site as one process would; such a wait is a
 * `queue.wait` step. The per-process queue and clock above stay: they keep
 * this process's order and the 403 retry's gap (inside the held slot), and
 * they are all a fake clock (`Pacing` without `shared`) uses. Loopback is
 * never queued, as it is never paced. Dropped sites stay per process.
 */
import type { ForbiddenRetry } from "recipe-website-common/util/importRecipeData";
import { siteKey } from "recipe-website-common/util/roundupPage";
import { jobContext, type JobContext, type JobRun } from "../jobs/context";
import {
  acquire,
  siteResource,
  touchResource,
  type ResourceGrant,
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

/** How long a site that refused twice stays dropped, process-wide. */
export const DROP_MS = 60 * 60 * 1000;

/** Per-process queues, clocks and dropped sites. */
export class SiteState {
  readonly lastEnd = new Map<string, number>();
  readonly droppedUntil = new Map<string, { until: number; reason: string }>();
  private readonly tails = new Map<string, Promise<void>>();

  /** Another request to the site is queued or running: an `acquire` would wait. */
  busy(site: string): boolean {
    return this.tails.has(site);
  }

  /**
   * Wait for the site's queue; the returned function releases it. An abort
   * while waiting rejects, and the place is released when its turn comes.
   */
  async acquire(site: string, signal?: AbortSignal): Promise<() => void> {
    const previous = this.tails.get(site) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => mine);
    this.tails.set(site, tail);
    const done = () => {
      release();
      /* Forget an idle queue, so the map holds only busy sites. */
      if (this.tails.get(site) === tail) this.tails.delete(site);
    };
    try {
      await untilAborted(previous, signal);
    } catch (error) {
      void previous.then(done);
      throw error;
    }
    return done;
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
    return siteKey(url) ?? url;
  }

  /** The reason `url`'s site is dropped, if it is (and notes it). */
  droppedReason(url: string): string | undefined {
    const site = this.site(url);
    const entry = this.state.droppedUntil.get(site);
    if (!entry) return undefined;
    if (entry.until <= this.pacing.now()) {
      this.state.droppedUntil.delete(site);
      return undefined;
    }
    this.dropped.set(site, entry.reason);
    return entry.reason;
  }

  drop(url: string, reason: string): void {
    const site = this.site(url);
    if (!this.state.droppedUntil.has(site)) {
      this.state.droppedUntil.set(site, {
        until: this.pacing.now() + DROP_MS,
        reason,
      });
    }
    this.dropped.set(site, this.state.droppedUntil.get(site)!.reason);
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
   * request ended up, so a redirect's site is clocked too.
   */
  async request<T>(
    url: string,
    run: (retry: ForbiddenRetry) => Promise<T>,
    finalUrlOf?: (value: T) => string | undefined,
  ): Promise<T> {
    const site = this.site(url);
    const { log, signal } = this.job;
    signal?.throwIfAborted();
    const release = this.state.busy(site)
      ? await log.step("pace.wait", { site, queued: true }, () =>
          this.state.acquire(site, signal),
        )
      : await this.state.acquire(site, signal);
    let forbidden = false;
    let retryStatus: number | undefined;
    let started = false;
    let slot: ResourceGrant | undefined;
    try {
      const reason = this.droppedReason(url);
      if (reason) {
        throw new SiteDroppedError(`${site} is dropped for now: ${reason}`);
      }
      /* Every process's requests to the site, one at a time, the gap apart. */
      if (this.shared(url)) {
        slot = await acquire(siteResource(site), {
          ...this.job,
          gapMs: this.gap(url),
        });
      }
      await this.waitGap(url);
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
          !signal?.aborted &&
          (retryStatus === 403 || retryStatus === undefined)
        ) {
          this.drop(url, `refused twice (HTTP 403) at ${url}`);
        }
        throw error;
      }
      if (forbidden && retryStatus === 403) {
        this.drop(url, `refused twice (HTTP 403) at ${url}`);
      }
      const finalUrl = finalUrlOf?.(value);
      if (finalUrl && URL.canParse(finalUrl) && this.site(finalUrl) !== site) {
        this.end(finalUrl);
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
        await slot?.release({ used: started });
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
 * `SitePacer#request` on this process's real clock, for one-off seats;
 * `job` (epic 37) logs its waits and can abort them.
 */
export function pacedRequest<T>(
  url: string,
  run: (retry: ForbiddenRetry) => Promise<T>,
  finalUrlOf?: (value: T) => string | undefined,
  job?: JobRun,
): Promise<T> {
  return new SitePacer(realPacing(), job).request(url, run, finalUrlOf);
}
