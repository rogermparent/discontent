/**
 * `/make`'s read-out, in the search ticker's voice:
 *
 *   17 RECIPES · 5 CAN MAKE · 4 ONE AWAY · 3 TWO AWAY · "tag:drink"
 *
 * `aria-live` so adding an item announces what it changed.
 */
export function MakeTicker({
  total,
  canMake,
  oneAway,
  twoAway,
  query,
  pending,
}: {
  total: number;
  canMake: number;
  oneAway: number;
  twoAway: number;
  query: string;
  pending: boolean;
}) {
  const parts = pending
    ? ["Loading recipes…"]
    : [
        `${total} ${total === 1 ? "recipe" : "recipes"}`,
        `${canMake} can make`,
        `${oneAway} one away`,
        `${twoAway} two away`,
      ];
  if (query) parts.push(`“${query}”`);
  return (
    <p
      aria-live="polite"
      data-testid="make-ticker"
      className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
    >
      {parts.join(" · ")}
    </p>
  );
}
