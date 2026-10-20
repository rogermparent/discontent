"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { MenuIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@discontent/component-library/components/ui/sheet";
import { MenuItem } from "@discontent/menus-collection/controller/types";
import {
  AppearanceControls,
  AppearanceField,
  AppearanceMenu,
} from "./Appearance";
import { PaletteTrigger } from "../CommandPalette/PaletteTrigger";
import { StickyChromeToggle } from "./useStickyChrome";
import { WideRecipeToggle } from "./useWideRecipe";
import {
  isCurrentPath,
  navCurrent,
  NAV_ICONS,
  SITE_NAV,
  siteNavFor,
  type SiteNavItem,
} from "./siteNav";

/**
 * A navigation link that marks itself current when the path matches, so screen
 * readers and styling can reflect the active page. Internal to this module so
 * its `onNavigate` function prop never crosses the server/client boundary — the
 * footer's server-rendered "Manage" column reuses `FooterLink` (serializable
 * props only) instead.
 */
function NavLink({
  item,
  className,
  onNavigate,
  icon = true,
}: {
  item: MenuItem;
  className?: string;
  onNavigate?: () => void;
  /** Lead with the destination's glyph when it has one. */
  icon?: boolean;
}) {
  const pathname = usePathname();
  const Icon = icon ? NAV_ICONS[item.href] : undefined;
  return (
    <Link
      href={item.href}
      aria-current={navCurrent(pathname, item.href)}
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md hover:text-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary aria-[current=true]:font-semibold aria-[current=true]:text-primary",
        className,
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      {item.name}
    </Link>
  );
}

/**
 * One masthead destination (U2): text only, as the design draws it; the
 * promoted one ("What can I make?") in the accent; the current page on an
 * accent pill. Below `lg` a long label gives way to its short one, so the
 * row fits a small tablet — and the hidden span leaves the accessible name
 * to whichever label shows.
 */
function MastheadLink({ item }: { item: SiteNavItem }) {
  const pathname = usePathname();
  return (
    <Link
      href={item.href}
      aria-current={navCurrent(pathname, item.href)}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-1.5 font-medium transition-colors hover:text-primary aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground",
        item.promoted && "font-semibold text-primary",
      )}
    >
      {item.shortName ? (
        <>
          <span className="lg:hidden">{item.shortName}</span>
          <span className="hidden lg:inline">{item.name}</span>
        </>
      ) : (
        item.name
      )}
    </Link>
  );
}

/**
 * Header navigation (U2): the site's destinations inline from `md` up, then
 * the search field, `extraNavItems` and Appearance; below `md` the masthead
 * keeps a search icon and the sheet. On a phone the four thumb-reach
 * destinations move to `PhoneTabBar` and the sheet holds the rest — Plans,
 * Shopping, the owner's menu items. Between `sm` and `md` (a small tablet,
 * where the signed-in row of six collided with the search field at 640 px)
 * there is no tab bar, so the sheet holds every destination.
 *
 * `menuItems` is the owner-editable `header` menu, appended after the
 * defaults (a link the defaults already have is not repeated, and `/search`
 * is the palette's). `extraNavItems` is server-rendered content passed
 * through. `recipeCount` labels the search field.
 */
export function HeaderNav({
  menuItems = [],
  extraNavItems,
  isOwner = false,
  recipeCount,
}: {
  menuItems?: MenuItem[];
  extraNavItems?: ReactNode;
  isOwner?: boolean;
  recipeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const items = siteNavFor(isOwner);
  const known = new Set(SITE_NAV.map((item) => item.href));
  const extras = menuItems.filter(
    (item) => item.href !== "/search" && !known.has(item.href),
  );
  const sheetItems: (MenuItem & { tab?: boolean })[] = [...items, ...extras];

  /*
   * Built once and handed to *both* surfaces. The desktop popover and the
   * mobile sheet are separate call sites — `AppearanceMenu`'s prop does not
   * reach the sheet's `AppearanceControls` — and the sheet is the easy miss.
   * Sharing one element is safe: the desktop controls are `hidden md:flex`,
   * the sheet is `md:hidden`, and both Radix surfaces unmount when closed.
   */
  const stickyChromeField = (
    <>
      <AppearanceField label="Sticky headers">
        <StickyChromeToggle />
      </AppearanceField>
      {/* 42c1: the recipe page's three columns at 1600px and wider. */}
      <AppearanceField label="Wide recipe columns">
        <WideRecipeToggle />
      </AppearanceField>
    </>
  );

  return (
    <>
      <nav
        aria-label="Site"
        className="hidden min-w-0 flex-1 items-center gap-0.5 text-sm md:flex"
      >
        {items.map((item) => (
          <MastheadLink key={item.href} item={item} />
        ))}
        {extras.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            icon={false}
            className="whitespace-nowrap px-2 py-1.5 font-medium"
          />
        ))}
      </nav>
      <div className="hidden shrink-0 items-center gap-1 text-sm md:flex">
        <PaletteTrigger count={recipeCount} />
        {extraNavItems}
        <AppearanceMenu className="ml-1" extraControls={stickyChromeField} />
      </div>

      <div className="flex items-center md:hidden">
        <PaletteTrigger variant="icon" count={recipeCount} />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              className="size-11"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-4">
            <SheetTitle className="mb-2">Menu</SheetTitle>
            <nav aria-label="Menu" className="flex flex-col gap-1 text-lg">
              {sheetItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  /* The tab bar's four are its own below `sm`. */
                  className={cn("p-2", item.tab && "hidden sm:inline-flex")}
                  onNavigate={close}
                />
              ))}
              {extraNavItems}
              <div className="mt-3 border-t border-border pt-3">
                <AppearanceControls extraControls={stickyChromeField} />
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

/**
 * The phone's tab bar (U2): Recipes · Drinks · Make · Saved within thumb
 * reach, `sm:hidden`; between `sm` and `md` the sheet carries them instead.
 *
 * Rendered after the footer as the body's last child and **sticky** to the
 * bottom rather than fixed, through `.sticky-chrome` — the reader's
 * sticky-header setting. Pinned, it rides the viewport's bottom edge; at the
 * end of the page it sits in its own place in the flow, below the footer, so
 * it never covers the last of the content and needs no padding to make room.
 * With sticky headers off (or a short viewport under "auto") it releases
 * like the masthead and simply ends the page. Never also give it `sticky`:
 * see theme.css.
 */
export function PhoneTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      data-testid="phone-tab-bar"
      className="sticky-chrome bottom-0 z-40 w-full border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:hidden print:hidden"
    >
      {/* A `<div>`, not a list: this is on every page, and listitems here
          would pollute the unscoped `getByRole('listitem')` recipe counts
          the mobile specs rely on (the footer's reason, below). */}
      <div className="grid grid-cols-4">
        {SITE_NAV.filter((item) => item.tab).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={
                isCurrentPath(pathname, item.href) ? "page" : undefined
              }
              className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-primary"
            >
              <Icon className="size-5" />
              {item.shortName ?? item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Shared footer styling, exported so the owner-only "Manage" column (a
 * server component in the editor app) reads identically to the menu columns.
 */
export const footerColumnHeadingClass =
  "mb-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground";
export const footerLinkClass =
  "inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-primary aria-[current=page]:font-medium aria-[current=page]:text-primary";

export interface FooterColumn {
  title: string;
  links: MenuItem[];
}

/**
 * A footer link with active-state marking. Serializable props only (no
 * callbacks), so the editor's server-rendered "Manage" column can import it
 * across the server/client boundary. Defaults to the shared footer link style.
 */
export function FooterLink({
  item,
  className = footerLinkClass,
}: {
  item: MenuItem;
  className?: string;
}) {
  return <NavLink item={item} className={className} />;
}

/**
 * Footer navigation, rebuilt as titled link columns (PR 13). Each column is a
 * vertical stack of block-level links, so an icon+label never wraps to a broken
 * line mid-item the way the old single wrapping row did. Returns a fragment of
 * `<div>` columns so they sit as siblings in the footer's grid alongside the
 * server-rendered brand block and owner "Manage" column.
 *
 * The link stacks are plain `<div>`s, not `<ul>/<li>` — footer links appear on
 * every page, and `role=listitem` markup here would pollute the unscoped
 * `getByRole('listitem')` recipe counts several specs rely on.
 */
export function FooterNav({ columns }: { columns: FooterColumn[] }) {
  return (
    <>
      {columns.map((column) => (
        <div key={column.title}>
          <h2 className={footerColumnHeadingClass}>{column.title}</h2>
          <div className="flex flex-col gap-2">
            {column.links.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                className={footerLinkClass}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
