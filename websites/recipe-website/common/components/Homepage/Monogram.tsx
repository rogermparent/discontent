import { cn } from "@discontent/component-library/lib/utils";

/**
 * A picture-less tile's stand-in: the label's first letter, large, on a tint
 * of the accent. Decorative — the card's own text names the thing — so it is
 * hidden from assistive technology. The tint and letter both derive from
 * `--primary`, so a custom theme recolours it with everything else.
 *
 * `small` for the thumbnails of 42f's lists and strips (40–72 px), where the
 * card-sized letter would not fit.
 */
export function Monogram({
  label,
  small = false,
}: {
  label: string;
  small?: boolean;
}) {
  const letter = label.trim().charAt(0).toUpperCase() || "·";
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full w-full items-center justify-center bg-primary/10 font-display font-extrabold text-primary",
        small ? "text-lg" : "text-7xl",
      )}
    >
      {letter}
    </div>
  );
}

export default Monogram;
