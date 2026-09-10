import Link from "next/link";
import { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { tagSearchHref } from "../SearchForm/queryLanguage";

/** Max tag chips a plain (non-search) card shows before collapsing to "+N". */
const MAX_CARD_TAG_HINTS = 2;

/**
 * A quiet one-row tag hint for the plain recipe cards (homepage / index /
 * bookmarks). Non-interactive chips that link into tag-filtered search — the
 * server-safe counterpart to the search page's interactive `CardTags`. Kept to a
 * single clamped row so card heights stay uniform.
 */
export function RecipeCardTagHint({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  const shown = tags.slice(0, MAX_CARD_TAG_HINTS);
  const extra = tags.length - shown.length;
  return (
    <div className="flex flex-row flex-nowrap items-center gap-1 overflow-hidden px-2 pb-2">
      {shown.map((tag) => (
        <Badge key={tag} asChild variant="secondary" className="max-w-full">
          <Link href={tagSearchHref(tag)}>{tag}</Link>
        </Badge>
      ))}
      {extra > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">+{extra}</span>
      )}
    </div>
  );
}

// Shared card container for recipe list items
export function RecipeCard({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Optional `data-testid` on the card itself (22g, for the featured group
   * card). Omitted renders no attribute at all, so every existing card's markup
   * is unchanged — which is what keeps the visual baselines still.
   */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-lg bg-card text-card-foreground border border-border overflow-hidden w-full h-full text-sm ${className}`}
    >
      {children}
    </div>
  );
}

// Link wrapper for recipe cards with hover group
export function RecipeCardLink({
  href,
  children,
  className = "",
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Fires before navigation — search uses it to record the committed query. */
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block group flex flex-col flex-nowrap ${className}`}
    >
      {children}
    </Link>
  );
}

// Image container with consistent aspect ratio and hover effects
export function RecipeCardImageContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="w-full aspect-[2/3] overflow-hidden bg-muted">
      {children}
    </div>
  );
}

/**
 * Bench-toned stand-in for a card with no photo — a monogram of the recipe's
 * initial in the display face over a subtle diagonal-hatch tint, so an
 * image-less card reads as intentional rather than a broken/empty gray box.
 */
export function RecipeCardPlaceholder({ name }: { name?: string }) {
  const initial = (name?.trim()?.[0] ?? "•").toUpperCase();
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-accent/40"
    >
      <span className="font-display text-4xl font-bold text-muted-foreground/60">
        {initial}
      </span>
    </div>
  );
}

// Shared image className for hover zoom effect
export const recipeCardImageClassName =
  "w-full h-full object-cover group-hover:scale-105 transition duration-300";

// Recipe name display
export function RecipeCardName({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`font-display text-sm font-semibold my-1 mx-2 ${className}`}>
      {children}
    </h3>
  );
}

// Recipe date display with formatting — mono/tabular, matching the house
// instrument treatment used for every other quantity/date in the app.
export function RecipeCardDate({
  date,
  showTime = false,
}: {
  date: string | number | Date;
  showTime?: boolean;
}) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const formattedDate = showTime
    ? dateObj.toLocaleString()
    : dateObj.toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

  return (
    <time
      dateTime={dateObj.toISOString()}
      className="block px-2 mb-1 font-mono text-xs tabular-nums text-muted-foreground"
    >
      {formattedDate}
    </time>
  );
}

// Grid container for recipe lists
export function RecipeGrid({ children }: { children: ReactNode }) {
  return (
    <ul
      data-testid="recipe-list"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
    >
      {children}
    </ul>
  );
}

// Standard image props for recipe cards
export const standardRecipeImageProps = {
  width: 400,
  height: 600,
  sizes: "(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw",
};
