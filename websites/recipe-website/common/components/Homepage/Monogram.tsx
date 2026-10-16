/**
 * A picture-less tile's stand-in: the label's first letter, large, on a tint
 * of the accent. Decorative — the card's own text names the thing — so it is
 * hidden from assistive technology. The tint and letter both derive from
 * `--primary`, so a custom theme recolours it with everything else.
 */
export function Monogram({ label }: { label: string }) {
  const letter = label.trim().charAt(0).toUpperCase() || "·";
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-primary/10 font-display text-7xl font-extrabold text-primary"
    >
      {letter}
    </div>
  );
}

export default Monogram;
