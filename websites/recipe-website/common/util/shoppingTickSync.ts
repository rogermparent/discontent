/**
 * The `/shopping` page's tick sync (epic 35, D9), outside React so it can be
 * tested with a fake `fetch` and fake timers.
 *
 * The rule is **never lose a tick**:
 *
 * - A tick joins `pending` (and `sessionStorage`, stamped with the time) and
 *   is sent with the rest as one `PATCH` after `FLUSH_DELAY_MS` of quiet.
 * - `flush()` waits for a request already on its way, then keeps sending
 *   while anything is pending — so nothing ticked during a flight is left
 *   behind, and "Clear checked" can wait for the list to be current.
 * - `flushNow()` — the page hidden, the phone locked, the tab closed, or a
 *   client-side navigation away (`detach`) — sends what is pending at once
 *   with `keepalive`, even while another request is in flight: a PATCH of
 *   ticks is idempotent. It then clears `sessionStorage`, so a stale copy
 *   cannot replay over another device's later changes.
 * - A 5xx or a dropped connection retries with backoff; a 4xx (signed out)
 *   reports the error and keeps the ticks for the next try.
 *
 * Pure apart from the injected `fetch`, storage and timers.
 */
import {
  FLUSH_DELAY_MS,
  parsePending,
  queueTicks,
  retryDelay,
  serializePending,
  settle,
  toPatch,
  type PendingTicks,
} from "./shoppingTickQueue";
import type { ShoppingItem } from "./shoppingTypes";

export type SyncStatus = "idle" | "pending" | "saving" | "retrying" | "error";

export interface TickSyncSnapshot {
  pending: PendingTicks;
  status: SyncStatus;
  error?: string;
}

export interface TickSyncStorage {
  read(): string | null;
  write(value: string): void;
  clear(): void;
}

export interface TickSyncOptions {
  patchUrl: string;
  fetch: typeof fetch;
  storage?: TickSyncStorage;
  now?: () => number;
  /** The server's items after a successful PATCH. */
  onItems(items: ShoppingItem[]): void;
  onChange(snapshot: TickSyncSnapshot): void;
}

interface PatchBody {
  items?: ShoppingItem[];
  unknown?: string[];
  error?: { message?: string };
}

export class TickSync {
  private pending: PendingTicks = new Map();
  private inFlight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private status: SyncStatus = "idle";
  private error: string | undefined;
  private attached = false;

  constructor(private readonly options: TickSyncOptions) {}

  snapshot(): TickSyncSnapshot {
    return { pending: this.pending, status: this.status, error: this.error };
  }

  /** The page mounted: pick up ticks a hidden tab left, and send them. */
  attach(): void {
    this.attached = true;
    const stored = parsePending(
      this.options.storage?.read() ?? null,
      this.now(),
    );
    if (stored.size === 0) {
      this.options.storage?.clear();
      return;
    }
    /* What this page ticked since wins over what was stored. */
    const pending = new Map(stored);
    for (const [id, checked] of this.pending) pending.set(id, checked);
    this.pending = pending;
    this.setStatus("pending");
    this.schedule(FLUSH_DELAY_MS);
  }

  /** The page is going away (unmount, client navigation): send now. */
  detach(): void {
    this.clearTimer();
    this.flushNow();
    this.attached = false;
  }

  tick(ids: readonly string[], checked: boolean): void {
    this.pending = queueTicks(this.pending, ids, checked);
    this.persist();
    if (this.status !== "retrying") this.status = "pending";
    this.emit();
    if (this.attempts === 0) this.schedule(FLUSH_DELAY_MS);
  }

  /** Items the list no longer has (cleared): nothing to send for them. */
  forget(ids: readonly string[]): void {
    const gone = new Set(ids);
    const next = new Map<string, boolean>();
    for (const [id, checked] of this.pending) {
      if (!gone.has(id)) next.set(id, checked);
    }
    if (next.size === this.pending.size) return;
    this.pending = next;
    this.persist();
    if (next.size === 0 && this.status === "pending") this.status = "idle";
    this.emit();
  }

  /**
   * Send until nothing is pending: wait for a request in flight, then send
   * what was ticked meanwhile. Stops at a failure (a retry is scheduled, or
   * the error reported).
   */
  async flush(): Promise<void> {
    this.clearTimer();
    while (this.pending.size > 0) {
      const ok = this.inFlight ? await this.inFlight : await this.send(false);
      if (!ok) return;
    }
  }

  /** Send what is pending at once, with `keepalive`, flight or no flight. */
  flushNow(): void {
    if (this.pending.size === 0) return;
    void this.send(true);
    this.options.storage?.clear();
  }

  private send(keepalive: boolean): Promise<boolean> {
    const batch: PendingTicks = new Map(this.pending);
    if (!keepalive) this.setStatus("saving");
    const promise = this.request(batch, keepalive);
    if (!keepalive) {
      this.inFlight = promise;
      void promise.finally(() => {
        if (this.inFlight === promise) this.inFlight = null;
      });
    }
    return promise;
  }

  private async request(
    batch: PendingTicks,
    keepalive: boolean,
  ): Promise<boolean> {
    let response: Response;
    let body: PatchBody | null;
    try {
      response = await this.options.fetch(this.options.patchUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(toPatch(batch)),
        keepalive,
      });
      body = (await response.json().catch(() => null)) as PatchBody | null;
    } catch {
      /* Offline in the store: keep the ticks and try again. */
      this.retry();
      return false;
    }
    if (response.ok && body?.items) {
      this.attempts = 0;
      this.error = undefined;
      this.pending = settle(this.pending, batch, body.unknown);
      this.persist();
      this.options.onItems(body.items);
      this.status = this.pending.size > 0 ? "pending" : "idle";
      this.emit();
      /* Ticked while this was on its way: the next batch (a running
       * `flush()` sends it sooner, and then this timer finds nothing). */
      if (this.pending.size > 0) this.schedule(FLUSH_DELAY_MS);
      return true;
    }
    if (response.status >= 500) {
      this.retry();
      return false;
    }
    /* Refused (signed out, a bad request): say so, keep the ticks. */
    this.attempts = 0;
    this.error =
      body?.error?.message ??
      `Could not save ticks (${response.status} ${response.statusText})`;
    this.setStatus("error");
    return false;
  }

  private retry(): void {
    if (!this.attached) return;
    this.setStatus("retrying");
    this.schedule(retryDelay(this.attempts));
    this.attempts += 1;
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (!this.attached) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private persist(): void {
    const storage = this.options.storage;
    if (!storage) return;
    if (this.pending.size === 0) storage.clear();
    else storage.write(serializePending(this.pending, this.now()));
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.emit();
  }

  private emit(): void {
    this.options.onChange(this.snapshot());
  }
}
