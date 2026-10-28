"use client";

/**
 * Stable keys for the rows of a list the form holds by place (45e2): a row
 * keeps its key while it is edited (a new object at the same place), moved
 * (the same object at another place) or while rows around it come and go,
 * so a React key, a tick, a note or a focus can follow the row rather than
 * its index. The keys live beside the form's values, never in them — the
 * values are what `changedFields` and the fill compare.
 */
import { useState } from "react";

/**
 * `next`'s keys from `prev`'s: the same object keeps its key wherever it
 * went; a new object at a place whose old object is gone takes that
 * place's key (an edit); anything else is new — `claimed` first (a key
 * handed out for that object before it reached the list), else `mint()`.
 */
export function reconcileKeys<T extends object>(
  prev: readonly T[],
  prevKeys: readonly string[],
  next: readonly T[],
  mint: () => string,
  claimed?: WeakMap<T, string>,
): string[] {
  const byObject = new Map<T, string>();
  prev.forEach((item, index) => {
    const key = prevKeys[index];
    if (key !== undefined && !byObject.has(item)) byObject.set(item, key);
  });
  const used = new Set<string>();
  const keys: (string | undefined)[] = next.map((item) => {
    const key = byObject.get(item) ?? claimed?.get(item);
    if (key === undefined || used.has(key)) return undefined;
    used.add(key);
    return key;
  });
  return keys.map((key, index) => {
    if (key !== undefined) return key;
    const inherited = prevKeys[index];
    if (inherited !== undefined && !used.has(inherited)) {
      used.add(inherited);
      return inherited;
    }
    let fresh = mint();
    while (used.has(fresh)) fresh = mint();
    used.add(fresh);
    return fresh;
  });
}

export interface StableKeys<T extends object> {
  /** One key per row of the list as it is now. */
  keys: string[];
  /** A key for a row not yet in the list, kept when it arrives. */
  claim: (item: T) => string;
}

/** The keys of one list across renders: `prefix-1`, `prefix-2`… */
class KeyStore<T extends object> {
  private list: readonly T[] = [];
  private keys: string[] = [];
  private count = 0;
  private claimed = new WeakMap<T, string>();

  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private mint = () => `${this.prefix}-${++this.count}`;

  /** Recomputed only for a new list, so a second render of the same list
   * (strict mode) gives the same keys. */
  keysFor(list: readonly T[]): string[] {
    if (list !== this.list) {
      this.keys = reconcileKeys(
        this.list,
        this.keys,
        list,
        this.mint,
        this.claimed,
      );
      this.list = list;
    }
    return this.keys;
  }

  claim = (item: T): string => {
    const existing = this.claimed.get(item);
    if (existing) return existing;
    const key = this.mint();
    this.claimed.set(item, key);
    return key;
  };
}

/** `reconcileKeys` across renders, for the list as it is now. */
export function useStableKeys<T extends object>(
  list: readonly T[],
  prefix: string,
): StableKeys<T> {
  const [store] = useState(() => new KeyStore<T>(prefix));
  return { keys: store.keysFor(list), claim: store.claim };
}
