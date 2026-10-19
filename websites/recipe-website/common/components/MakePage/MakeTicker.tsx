"use client";

import { useEffect, useRef, useState } from "react";
import type { MakeKind } from "./kinds";

const TICK_MS = 380;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * `value`, ticking from what was shown to what is (41h): an ease-out count
 * over ~0.4 s when it changes, straight to the number under reduced motion
 * and on the first render.
 */
function useTicked(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || reducedMotion()) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / TICK_MS);
      setShown(Math.round(start + (value - start) * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

function Num({ value }: { value: number }) {
  return <b className="font-medium text-foreground">{useTicked(value)}</b>;
}

/**
 * `/make`'s read-out, in the search ticker's voice, in the kind's word:
 *
 *   72 DRINKS · 14 CAN MAKE · 10 ONE AWAY · 17 TWO AWAY
 *
 * and, when beans can stand in for each other and some recipe needs that
 * (42m), "· 6 WITH A BEAN SWAP" — those recipes are among the one-, two-
 * and further-away ones, never added to them.
 *
 * Twice: the numbers tick for the eye (`aria-hidden`), and a plain copy —
 * the `make-ticker` the specs read — is the live region, so adding an item
 * announces what it changed once, not every frame of the count.
 */
export function MakeTicker({
  total,
  canMake,
  oneAway,
  twoAway,
  beanSwap = 0,
  kind,
  pending,
}: {
  total: number;
  canMake: number;
  oneAway: number;
  twoAway: number;
  /** Recipes in "With a bean swap" (42m); not shown at 0. */
  beanSwap?: number;
  kind: MakeKind;
  pending: boolean;
}) {
  const noun = total === 1 ? kind.one : kind.word;
  const plain = pending
    ? "Loading recipes…"
    : [
        `${total} ${noun}`,
        `${canMake} can make`,
        `${oneAway} one away`,
        `${twoAway} two away`,
        ...(beanSwap > 0 ? [`${beanSwap} with a bean swap`] : []),
      ].join(" · ");
  const shared =
    "font-mono text-[0.72rem] leading-snug tracking-[0.07em] text-muted-foreground uppercase tabular-nums";
  return (
    <>
      <p aria-live="polite" data-testid="make-ticker" className="sr-only">
        {plain}
      </p>
      <p aria-hidden className={shared}>
        {pending ? (
          plain
        ) : (
          <>
            <Num value={total} /> {noun} · <Num value={canMake} /> can make ·{" "}
            <Num value={oneAway} /> one away · <Num value={twoAway} /> two away
            {beanSwap > 0 && (
              <>
                {" "}
                · <Num value={beanSwap} /> with a bean swap
              </>
            )}
          </>
        )}
      </p>
    </>
  );
}
