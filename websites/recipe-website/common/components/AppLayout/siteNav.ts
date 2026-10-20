import type { ComponentType } from "react";
import {
  BookOpenIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CalendarHeartIcon,
  CookingPotIcon,
  MartiniIcon,
  SearchIcon,
  ShoppingCartIcon,
} from "lucide-react";

/**
 * The site's own destinations (usability pass, U2 — the design's new
 * navigation): what the masthead lists, what the phone tab bar picks from,
 * and what the footer's default Browse column links. One list, so the three
 * cannot drift.
 *
 * URLs never changed; labels did. `/groups` reads "Plans" (groups are meal
 * plans now) and `/bookmarks` reads "Saved" (the verb people use). "Home" is
 * gone: the wordmark links home.
 */
export interface SiteNavItem {
  /** The label in the masthead, the sheet and the footer. */
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** A shorter label for tight spots: the phone tab, the narrow masthead. */
  shortName?: string;
  /** In the phone tab bar (four, thumb reach). The rest live in the sheet. */
  tab?: boolean;
  /** Signed-in only — the page itself sends a guest to sign in. */
  ownerOnly?: boolean;
  /** Drawn in the accent: the one destination the design promotes. */
  promoted?: boolean;
}

export const SITE_NAV: SiteNavItem[] = [
  { name: "Recipes", href: "/recipes", icon: BookOpenIcon, tab: true },
  { name: "Drinks", href: "/drinks", icon: MartiniIcon, tab: true },
  {
    name: "What can I make?",
    shortName: "Make",
    href: "/make",
    icon: CookingPotIcon,
    tab: true,
    promoted: true,
  },
  { name: "Plans", href: "/groups", icon: CalendarDaysIcon },
  /* Editor only, and signed in: the shopping list lives in the content repo
   * and its page redirects a guest to sign in. The export never has an owner,
   * so it never shows this. */
  {
    name: "Shopping",
    href: "/shopping",
    icon: ShoppingCartIcon,
    ownerOnly: true,
  },
  { name: "Saved", href: "/bookmarks", icon: BookmarkIcon, tab: true },
];

/** The destinations a viewer sees: every item, less owner ones for a guest. */
export function siteNavFor(isOwner: boolean): SiteNavItem[] {
  return SITE_NAV.filter((item) => isOwner || !item.ownerOnly);
}

/**
 * The almanac (42e). Not in the masthead — six destinations already fill it
 * at `md`, and every masthead change moves every full-page baseline — but in
 * the footer's default Browse column, on a site that has holidays.
 */
export const HOLIDAYS_HREF = "/holidays";

/** Leading glyphs by href, for links built from menu data (the footer). */
export const NAV_ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  ...Object.fromEntries(SITE_NAV.map((item) => [item.href, item.icon])),
  "/search": SearchIcon,
  [HOLIDAYS_HREF]: CalendarHeartIcon,
};

/**
 * Is `href` the page at `pathname`? Its own numbered pages count
 * (`/recipes/3`, `/groups/2`); a recipe or a plan of its own (`/recipe/x`,
 * `/group/x`) does not — `aria-current="page"` claims the page, not a section.
 */
export function isCurrentPath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The pages a destination is the *section* of, though not the page (43p1,
 * 42j's finding): a plan of its own is in Plans.
 */
const SECTIONS: Record<string, readonly string[]> = {
  "/groups": ["/group/"],
};

/**
 * `aria-current` for a destination: `"page"` on its page (`isCurrentPath`),
 * `"true"` on a page in its section (`/group/x` in Plans), else nothing —
 * so the masthead marks where the reader is without claiming the page.
 */
export function navCurrent(
  pathname: string | null,
  href: string,
): "page" | "true" | undefined {
  if (isCurrentPath(pathname, href)) return "page";
  if (
    pathname &&
    SECTIONS[href]?.some((prefix) => pathname.startsWith(prefix))
  ) {
    return "true";
  }
  return undefined;
}
