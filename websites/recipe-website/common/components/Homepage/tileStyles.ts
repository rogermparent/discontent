import { cn } from "@discontent/component-library/lib/utils";

/**
 * One intent tile's box, shared by the server tiles and the client Make tile
 * so the two cannot drift apart. Every tile is the same size; the primary one
 * is the accent fill, the rest are cards.
 */
export function intentTileClassName(primary = false): string {
  return cn(
    "flex min-h-28 flex-col gap-2 rounded-xl p-4 transition-colors sm:min-h-32 sm:p-[18px]",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    primary
      ? "col-span-2 bg-primary text-primary-foreground hover:bg-primary/90 sm:col-span-1"
      : "border border-border bg-card text-card-foreground hover:border-primary/50",
  );
}
