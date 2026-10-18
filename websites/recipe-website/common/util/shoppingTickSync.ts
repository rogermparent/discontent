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
 * **Held ticks** (38d, the `holdTicks` switch, 38-D4): nothing is sent until
 * `done()` — "Done shopping" — which sends every pending tick as one PATCH.
 * Until then the ticks live in `heldStorage` (the page's `localStorage`, so
 * a reload, a locked phone or a closed tab keeps them), and hiding or leaving
 * the page sends nothing. A held tick expires `HELD_TICKS_MAX_AGE_MS` (a
 * week, 39-D3) after it was made: it is dropped when the storage is next
 * read, and the snapshot's `expired` names it for the page to say so. A
 * failed `done()` keeps them and says so; it does not retry by itself.
 * Turning the switch off sends what was held, the usual way. Every tab of
 * the browser shares that storage: each change is read-change-write
 * (`mutate`), a tab takes up another's ticks on the `storage` event
 * (`refresh`), "Done shopping" sends them all, and a tab that is not
 * holding touches it only to take its ticks and send them.
 *
 * Pure apart from the injected `fetch`, storage and timers.
 */
import {
  FLUSH_DELAY_MS,
  HELD_TICKS_MAX_AGE_MS,
  parseHeld,
  parsePending,
  queueTicks,
  retryDelay,
  serializeHeld,
  serializePending,
  settle,
  toPatch,
  type HeldTicks,
  type PendingTicks,
} from "./shoppingTickQueue";
import type { ShoppingItem } from "./shoppingTypes";

/** `held`: ticks waiting for "Done shopping" (38d). */
export type SyncStatus =
  "idle" | "pending" | "held" | "saving" | "retrying" | "error";

export interface TickSyncSnapshot {
  pending: PendingTicks;
  status: SyncStatus;
  error?: string;
  /**
   * 39-D3: the item ids of held ticks dropped for being over a week old
   * since the page last dismissed the notice; absent when none were.
   */
  expired?: string[];
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
  /** Where held ticks wait for "Done shopping" (38d); kept for a week (39-D3). */
  heldStorage?: TickSyncStorage;
  /** Start holding ticks (the `holdTicks` switch); `setHold` changes it. */
  hold?: boolean;
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
  private hold: boolean;
  /** `false` once the held storage failed to keep a write (38d). */
  private heldWorks: boolean | undefined;
  /** Holding: item id → when its tick was made, for the week's limit (39-D3). */
  private times = new Map<string, number>();
  /** Held ticks dropped as expired, not yet dismissed (39-D3). */
  private expired: string[] = [];

  constructor(private readonly options: TickSyncOptions) {
    this.hold = Boolean(options.hold);
  }

  snapshot(): TickSyncSnapshot {
    return {
      pending: this.pending,
      status: this.status,
      error: this.error,
      ...(this.expired.length > 0 ? { expired: this.expired } : {}),
    };
  }

  /** The page dismissed the "older than a week" notice (39-D3). */
  dismissExpired(): void {
    if (this.expired.length === 0) return;
    this.expired = [];
    this.emit();
  }

  /**
   * The page mounted: pick up ticks a hidden tab left — and ticks held for
   * "Done shopping" — and send them, unless they are still to be held.
   */
  attach(): void {
    this.attachStored();
    /* Expired held ticks were dropped on the way: let the page say so. */
    if (this.expired.length > 0) this.emit();
  }

  private attachStored(): void {
    this.attached = true;
    const stored = parsePending(
      this.options.storage?.read() ?? null,
      this.now(),
    );
    const mine = this.pending;
    if (this.hold) {
      /* Held storage is shared by every tab: add to it, never replace it. */
      this.mutate((held) => {
        for (const [id, checked] of [...stored, ...mine]) held.set(id, checked);
        return held;
      });
      if (this.pending.size > 0) this.setStatus("held");
      return;
    }
    const held = this.takeHeld();
    if (stored.size === 0 && held.size === 0 && mine.size === 0) {
      this.options.storage?.clear();
      return;
    }
    /* What this page ticked since wins over what was stored. */
    this.mutate(() => new Map([...held, ...stored, ...mine]));
    this.setStatus("pending");
    this.schedule(FLUSH_DELAY_MS);
  }

  /**
   * The page is going away (unmount, client navigation): send now — or,
   * holding, leave the ticks stored for the next visit.
   */
  detach(): void {
    this.clearTimer();
    this.flushNow();
    this.attached = false;
  }

  /**
   * The `holdTicks` switch changed. On: what is pending joins the held ticks
   * and waits for `done()`. Off: this page takes what was held — removing
   * just that from the shared storage — and sends it the usual way.
   */
  setHold(hold: boolean): void {
    if (hold === this.hold) return;
    const mine = this.pending;
    this.hold = hold;
    this.clearTimer();
    this.attempts = 0;
    if (hold) {
      this.mutate((held) => {
        for (const [id, checked] of mine) held.set(id, checked);
        return held;
      });
    } else {
      const held = this.takeHeld();
      /*
       * 39-D3: what this tab held in memory ages as the storage does — a tab
       * open past a week must not send what the read above just dropped.
       */
      const kept = this.unexpired(mine);
      this.mutate(() => new Map([...held, ...kept]));
    }
    if (this.pending.size === 0) {
      if (this.status === "held") this.setStatus("idle");
      return;
    }
    if (hold) {
      this.error = undefined;
      this.setStatus("held");
    } else {
      this.setStatus("pending");
      this.schedule(FLUSH_DELAY_MS);
    }
  }

  tick(ids: readonly string[], checked: boolean): void {
    this.mutate((pending) => queueTicks(pending, ids, checked));
    if (this.hold) {
      if (this.status !== "saving") {
        this.status = this.pending.size > 0 ? "held" : "idle";
      }
      this.emit();
      return;
    }
    if (this.status !== "retrying") this.status = "pending";
    this.emit();
    if (this.attempts === 0) this.schedule(FLUSH_DELAY_MS);
  }

  /**
   * "Done shopping" (38d): send every held tick as one PATCH. `ok` is false
   * when it failed — the ticks are still held, and the snapshot's `error`
   * says why. Works when not holding too (it is then `flush()`).
   */
  async done(): Promise<{ ok: boolean; sent: number }> {
    /* Every tick held in this browser, another tab's too. */
    this.refresh();
    /* None over a week old (39-D3), held storage or only memory. */
    if (this.hold) this.dropExpired();
    const count = this.pending.size;
    await this.flush();
    const ok = this.pending.size === 0;
    return { ok, sent: ok ? count : 0 };
  }

  /**
   * Another tab changed the held ticks (the page's `storage` event): take
   * them up, so this tab shows them and its "Done shopping" sends them.
   */
  refresh(): void {
    if (!this.hold || this.heldWorks === false) return;
    const read = this.readHeldTicks();
    if (!read) return;
    this.pending = read.ticks;
    this.times = read.times;
    const held = read.ticks;
    if (this.status === "held" || this.status === "idle") {
      this.status = held.size > 0 ? "held" : "idle";
    }
    this.emit();
  }

  /** Items the list no longer has (cleared): nothing to send for them. */
  forget(ids: readonly string[]): void {
    const gone = new Set(ids);
    /* Holding, the shared storage may hold them for another tab. */
    if (!this.hold && ![...this.pending.keys()].some((id) => gone.has(id))) {
      return;
    }
    this.mutate((pending) => {
      for (const id of gone) pending.delete(id);
      return pending;
    });
    if (
      this.pending.size === 0 &&
      (this.status === "pending" || this.status === "held")
    ) {
      this.status = "idle";
    }
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

  /**
   * Send what is pending at once, with `keepalive`, flight or no flight.
   * Holding (38d), nothing: the ticks stay stored for "Done shopping".
   */
  flushNow(): void {
    if (this.hold || this.pending.size === 0) return;
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
      /* Holding, only what this request sent leaves the shared storage. */
      this.mutate((pending) => settle(pending, batch, body.unknown));
      this.options.onItems(body.items);
      this.status =
        this.pending.size === 0 ? "idle" : this.hold ? "held" : "pending";
      this.emit();
      /* Ticked while this was on its way: the next batch (a running
       * `flush()` sends it sooner, and then this timer finds nothing). */
      if (this.pending.size > 0 && !this.hold) this.schedule(FLUSH_DELAY_MS);
      return true;
    }
    if (response.status >= 500) {
      this.retry();
      return false;
    }
    /* Refused (signed out, a bad request): say so, keep the ticks. */
    this.attempts = 0;
    this.failHeld(
      body?.error?.message ??
        `Could not save ticks (${response.status} ${response.statusText})`,
    );
    return false;
  }

  /** Report a failure; held ticks are kept, and the message says so. */
  private failHeld(message: string): void {
    this.error = this.hold
      ? `${message.replace(/[.\s]+$/, "")}. Your ticks are kept on this device — press Done shopping to try again.`
      : message;
    this.setStatus("error");
  }

  private retry(): void {
    if (this.hold) {
      /* "Done shopping" is a press, not a background job: say so, keep them. */
      this.failHeld("Couldn't reach the editor");
      return;
    }
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

  /**
   * Change the pending ticks and store them. Not holding: in this tab's
   * `storage`, as before; the held storage is not touched. Holding (38d):
   * the held storage is shared by every tab of the browser, so the change
   * is applied to what it holds now — read, change, write — never this
   * tab's whole map over another's: a tick here keeps the other tab's, and
   * a Done here settles only what it sent. Where that storage does not keep
   * a write (blocked, full), the ticks live in memory.
   */
  private mutate(
    change: (pending: Map<string, boolean>) => Map<string, boolean>,
  ): void {
    if (!this.hold) {
      this.pending = change(new Map(this.pending));
      const storage = this.options.storage;
      if (!storage) return;
      if (this.pending.size === 0) storage.clear();
      else storage.write(serializePending(this.pending, this.now()));
      return;
    }
    this.options.storage?.clear();
    const held = this.options.heldStorage;
    const works = held !== undefined && this.heldWorks !== false;
    const before = works ? this.readHeldTicks() : undefined;
    const base = before?.ticks ?? new Map(this.pending);
    const baseTimes = before?.times ?? this.times;
    const now = this.now();
    this.pending = change(new Map(base));
    /* A tick keeps its time until it changes (39-D3: aged per tick). */
    this.times = new Map(
      [...this.pending].map(([id, checked]) => [
        id,
        base.get(id) === checked ? (baseTimes.get(id) ?? now) : now,
      ]),
    );
    if (!works || !held) return;
    if (this.pending.size === 0) {
      held.clear();
      return;
    }
    const value = serializeHeld(this.pending, this.times, now);
    held.write(value);
    if (held.read() !== value) this.heldWorks = false;
  }

  /**
   * `pending` without the ticks this tab knows are over a week old by its own
   * times (39-D3) — for ticks a read of the storage has not seen, such as
   * those that live only in memory. The dropped ids join `expired`.
   */
  private unexpired(pending: PendingTicks): Map<string, boolean> {
    const now = this.now();
    const kept = new Map<string, boolean>();
    const dropped: string[] = [];
    for (const [id, checked] of pending) {
      const at = this.times.get(id);
      if (at !== undefined && now - Math.min(at, now) > HELD_TICKS_MAX_AGE_MS) {
        dropped.push(id);
      } else {
        kept.set(id, checked);
      }
    }
    if (dropped.length > 0) {
      this.expired = [...new Set([...this.expired, ...dropped])];
    }
    return kept;
  }

  /** Holding: drop what is over a week old now, and tell the page (39-D3). */
  private dropExpired(): void {
    const before = this.expired.length;
    this.mutate((pending) => this.unexpired(pending));
    if (this.expired.length !== before) {
      if (this.pending.size === 0 && this.status === "held") {
        this.status = "idle";
      }
      this.emit();
    }
  }

  /** The held ticks as stored, up to a week old; `undefined` with no storage. */
  private readHeld(): Map<string, boolean> | undefined {
    return this.readHeldTicks()?.ticks;
  }

  /**
   * The held storage read, each tick with when it was made. Ticks over
   * `HELD_TICKS_MAX_AGE_MS` old are dropped here (39-D3) — counted for the
   * page's notice, and written out of the storage at once, so another read
   * (this tab's or another's) neither sends nor counts them again.
   */
  private readHeldTicks(): HeldTicks | undefined {
    const held = this.options.heldStorage;
    if (!held) return undefined;
    const read = parseHeld(held.read(), this.now());
    if (read.expired.length > 0) {
      this.expired = [...new Set([...this.expired, ...read.expired])];
    }
    /* A future time is stored as now, or every read would read it anew. */
    if (read.expired.length > 0 || read.clamped) {
      if (read.ticks.size === 0) held.clear();
      else held.write(serializeHeld(read.ticks, read.times, this.now()));
    }
    return read;
  }

  /**
   * Not holding: take the ticks held in the shared storage — this page now
   * sends them — and so empty it. Only then does a page that is not holding
   * touch it.
   */
  private takeHeld(): Map<string, boolean> {
    const taken = this.readHeld() ?? new Map<string, boolean>();
    if (taken.size > 0) this.options.heldStorage?.clear();
    return taken;
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
