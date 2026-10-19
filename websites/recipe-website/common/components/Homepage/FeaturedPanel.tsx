import Link from "next/link";
import type { ReactNode } from "react";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { TermSummary } from "../../controller/homepageComingUp";
import { countLabel } from "../../controller/homepageIntents";
import type { GroupItem, GroupKind } from "../../controller/types";
import { GroupThumbnail } from "../GroupThumbnail";
import { FeaturedList } from "./FeaturedList";
import { RecipeThumb, THUMB_IMAGE } from "./RecipeThumb";
import { TermPicture } from "./TermPicture";

/**
 * One entry of the homepage's featured list (22g).
 *
 * A discriminated union rather than a widened recipe entry, because the
 * three render nothing in common: a recipe carries an image filename, a
 * group picks its picture at render time, a term has a picture of its own.
 */
export type FeaturedStripEntry =
  | {
      kind: "recipe";
      recipe: MassagedRecipeEntry;
      /** The row's line under the name: the recipe's course, when it has one. */
      meta?: string;
    }
  | {
      kind: "group";
      slug: string;
      name: string;
      groupKind?: GroupKind;
      date: number;
      /**
       * The group's record, read by the route (cached, `item:groups:<slug>`):
       * its picture and items go to the thumbnail, which then reads nothing,
       * and the items give the row its recipe count.
       */
      image?: string;
      items?: GroupItem[];
    }
  /** A featured term record (24c). */
  | {
      kind: "term";
      slug: string;
      label: string;
      image?: string;
      date: number;
      /** Counts and a picture over the term's subtree (`termSummary`). */
      summary?: TermSummary;
      /** A dated holiday with a season row on some days (42f). */
      holiday?: boolean;
    };

/** How many recipes a group lists directly (sub-groups are not recipes). */
function recipeItems(items: GroupItem[] = []): number {
  return items.filter((item) => item.recipe !== undefined).length;
}

/**
 * A row's kind line, with its count only when there is one to show — "Tag ·
 * 12 recipes", or plain "Tag" for a term carried only by plans, a failed
 * group read, or any other zero. "Tag · 0 recipes" is not information.
 */
function kindMeta(label: string, count: number, noun: string): string {
  return count > 0 ? `${label} · ${countLabel(count, noun)}` : label;
}

/**
 * One featured row: a 44 px picture, the name, and the line that says what
 * it is. The `data-testid`s are the strip's cards' (`featured-group-card`,
 * `featured-term-card`, `card-meta`), which the featured, groups and
 * reference specs find them by.
 */
function FeaturedRow({
  href,
  name,
  meta,
  picture,
  testId,
}: {
  href: string;
  name: string;
  meta: string;
  picture: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <Link
        href={href}
        className="group grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 py-2.5"
      >
        <div className="size-11 overflow-hidden rounded-md bg-muted">
          {picture}
        </div>
        <div className="flex min-w-0 flex-col">
          <h3 className="font-display text-sm leading-5 font-semibold group-hover:underline group-hover:underline-offset-4">
            {name}
          </h3>
          <span
            className="font-mono text-xs text-muted-foreground tabular-nums"
            data-testid="card-meta"
          >
            {meta}
          </span>
        </div>
      </Link>
    </div>
  );
}

function featuredRow(entry: FeaturedStripEntry): ReactNode {
  if (entry.kind === "recipe") {
    return (
      <FeaturedRow
        href={`/recipe/${entry.recipe.slug}`}
        name={entry.recipe.name}
        meta={entry.meta ?? "Recipe"}
        picture={
          <RecipeThumb
            slug={entry.recipe.slug}
            image={entry.recipe.image}
            name={entry.recipe.name}
          />
        }
      />
    );
  }
  if (entry.kind === "term") {
    return (
      <FeaturedRow
        testId="featured-term-card"
        href={`/tags/${entry.slug}`}
        name={entry.label}
        meta={kindMeta("Tag", entry.summary?.recipes ?? 0, "recipe")}
        picture={
          <TermPicture
            slug={entry.slug}
            label={entry.label}
            summary={entry.summary ?? { image: entry.image }}
            {...THUMB_IMAGE}
            small
          />
        }
      />
    );
  }
  return (
    <FeaturedRow
      testId="featured-group-card"
      href={`/group/${entry.slug}`}
      name={entry.name}
      meta={kindMeta("Plan", recipeItems(entry.items), "recipe")}
      picture={
        <GroupThumbnail
          slug={entry.slug}
          image={entry.image}
          items={entry.items}
        />
      }
    />
  );
}

/**
 * The homepage's "Featured" list — recipes, plans and terms, newest first,
 * as compact rows in the right rail (42f, canvas B's "Pinned" panel; a grid
 * of equal cards since the 2026-10-15 redesign, which removed the hero).
 *
 * **The heading stays "Featured"** (Roger, 2026-10-15) rather than the
 * canvas's "Pinned": it names what the curator does, the link says
 * "Everything featured", and a dozen specs find the section by it.
 *
 * **A holiday with a season row is not listed here**: it shows once, as its
 * row marked "featured". Which holidays have rows is the browser's day's
 * question, so the rows are rendered here and `FeaturedList` (a client
 * island) hides the ones in season and cuts to `limit`.
 *
 * **No timestamps.** Each row's line says what it is: "Tag · 12 recipes",
 * "Plan · 6 recipes", or a recipe's course ("Mains"). `/featured-recipes`
 * keeps dates and the full cards: that page is the curator's.
 */
export function FeaturedPanel({
  featured,
  season,
  serverDay,
  limit,
}: {
  featured: FeaturedStripEntry[];
  /** The dated holidays with something under them, for the season's rows. */
  season: Array<{ slug: string }>;
  serverDay: string;
  /** How many rows to show once the season's holidays are hidden. */
  limit: number;
}) {
  if (featured.length === 0) return null;
  return (
    <FeaturedList
      season={season}
      serverDay={serverDay}
      limit={limit}
      rows={featured.map((entry, index) => ({
        /*
         * By position, not by slug: a recipe may be featured more than once
         * and both features can be in the newest six, so the slug is not a
         * key.
         */
        key:
          entry.kind === "recipe"
            ? `${index}-recipe-${entry.recipe.slug}`
            : `${index}-${entry.kind}-${entry.slug}`,
        ...(entry.kind === "term" && entry.holiday
          ? { holiday: entry.slug }
          : {}),
        row: featuredRow(entry),
      }))}
    />
  );
}

export default FeaturedPanel;
