import { ReactNode } from "react";

/**
 * The detail hero's canonical meta strip — Prep · Cook · Total · Yield in the
 * house instrument language (mono uppercase eyebrow over a mono tabular value),
 * filling what used to be the hero's dead right column. Hairline dividers come
 * from a `bg-border` grid gap so the strip reads as one instrument in both the
 * 4-across desktop layout and the 2×2 mobile wrap. Empty items are dropped by
 * the caller. Prints (no `print:hidden`) — the times belong on paper.
 */
export function MetaBar({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
      {items.map(({ label, value }, i) => (
        <div key={i} className="flex flex-col gap-0.5 bg-card px-3 py-2">
          <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            {label}
          </dt>
          <dd className="font-mono tabular-nums text-sm text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// `InfoCard` lived here too and had no callers left: PR 11's `MetaBar` replaced
// the loose info cards in the detail hero (see recipe.spec.ts:178). Three more
// byte-identical copies sat unused in menus-, pages- and projects-collection,
// carried along by whatever scaffolding created those packages. All four are
// gone.
