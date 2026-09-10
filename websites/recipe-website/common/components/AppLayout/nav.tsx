"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentType, ReactNode, useState } from "react";
import { BookmarkIcon, LayersIcon, MenuIcon, SearchIcon } from "lucide-react";
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

/**
 * Leading glyphs for well-known destinations, keyed by href. Lets the masthead
 * give Bookmarks / Search the conventional recipe-site icon+label treatment
 * without threading icon data through the menus collection.
 */
const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/bookmarks": BookmarkIcon,
  "/groups": LayersIcon,
  "/search": SearchIcon,
};

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
}: {
  item: MenuItem;
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const Icon = NAV_ICONS[item.href];
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md hover:text-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary",
        className,
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      {item.name}
    </Link>
  );
}

/**
 * The masthead's destination links: menu-configured items plus the defaults,
 * minus `/search` — the Search affordance is now the ⌘K `PaletteTrigger` (which
 * also reaches `/search` via a "Go to" palette item), so a plain Search link here
 * would double it up.
 */
function navLinks(items: MenuItem[]): MenuItem[] {
  return items.filter((item) => item.href !== "/search");
}

/**
 * Header navigation: a single inline row on desktop (wordmark lives in the
 * server SiteHeader beside this), a Sheet drawer on small screens.
 * `extraNavItems` is server-rendered content (e.g. auth buttons) passed through.
 */
export function HeaderNav({
  items,
  extraNavItems,
}: {
  items: MenuItem[];
  extraNavItems?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const links = navLinks(items);

  /*
   * Built once and handed to *both* surfaces. The desktop popover and the
   * mobile sheet are separate call sites — `AppearanceMenu`'s prop does not
   * reach the sheet's `AppearanceControls` — and the sheet is the easy miss.
   * Sharing one element is safe: the desktop nav is `hidden sm:flex`, the sheet
   * is `sm:hidden`, and both Radix surfaces unmount when closed.
   */
  const stickyChromeField = (
    <AppearanceField label="Sticky headers">
      <StickyChromeToggle />
    </AppearanceField>
  );

  return (
    <>
      <nav className="hidden items-center gap-1 text-sm sm:flex">
        {links.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            className="px-2 py-1.5 font-medium"
          />
        ))}
        <PaletteTrigger />
        {extraNavItems}
        <AppearanceMenu className="ml-1" extraControls={stickyChromeField} />
      </nav>

      <div className="sm:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-4">
            <SheetTitle className="mb-2">Menu</SheetTitle>
            <nav className="flex flex-col gap-1 text-lg">
              {links.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  className="p-2"
                  onNavigate={close}
                />
              ))}
              {/* Close the sheet before opening the palette so two Radix dialogs
                  don't stack. */}
              <PaletteTrigger variant="mobile" onNavigate={close} />
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
