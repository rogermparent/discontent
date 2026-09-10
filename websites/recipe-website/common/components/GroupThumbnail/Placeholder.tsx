import { Layers } from "lucide-react";

/**
 * What a group with no picture of its own and no member photo shows.
 *
 * The same bench-toned box `RecipeCardPlaceholder` uses, with the layers mark
 * instead of a monogram: a group is a stack of things, and an initial would
 * read as a recipe card that had lost its photo.
 *
 * Its own module since 22h, and **synchronous with no server imports** — the
 * client-rendered `/search` group cards need exactly this box for a group whose
 * image the corpus does not carry, and they cannot import `GroupThumbnail`,
 * which reaches the cached item reads.
 */
export function GroupThumbnailPlaceholder({
  className,
}: {
  /** Replaces the default `h-full w-full` box, for a fixed-size header crop. */
  className?: string;
}) {
  return (
    <div
      data-testid="group-thumbnail-placeholder"
      aria-hidden
      className={`flex items-center justify-center bg-gradient-to-br from-muted to-accent/40 ${className ?? "h-full w-full"}`}
    >
      <Layers className="size-8 text-muted-foreground/60" aria-hidden="true" />
    </div>
  );
}

export default GroupThumbnailPlaceholder;
