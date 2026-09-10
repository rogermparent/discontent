"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@discontent/component-library/components/ui/sheet";

export interface SidebarLayoutProps {
  /** aria-label on the aside, the mobile trigger text, and the sr-only title. */
  label: string;
  /** Nav content, rendered in both the desktop aside and the mobile drawer. */
  sidebar: ReactNode;
  children: ReactNode;
}

/**
 * Reusable two-pane section layout: an instrument-rack sidebar (a mobile
 * `ui/sheet` drawer below `lg`) beside a wide content column, both contained in a
 * single centered box that matches the masthead. The outer container reuses the
 * header/footer's `mx-auto max-w-6xl px-3 sm:px-4` recipe, so the aside's left
 * edge lines up under the wordmark and the whole layout stays centered with a
 * gutter on each side (no full-bleed reach to the screen edge). If a future
 * section needs to break out wide, add a `maxWidth`/`fullBleed` prop then — the
 * primitive is intentionally kept single-purpose for now.
 *
 * The desktop aside keeps that contained *position* but bleeds its `bg-sidebar`
 * left to the screen edge via a `right-full w-screen` pseudo-element, so the rail
 * reads as attached to the window instead of floating in the centered box. The
 * full-width wrapper's `overflow-x-clip` (not `hidden` — that would create a
 * scroll container and break the sticky header/aside) crops the overhang so it
 * never adds a horizontal scrollbar. The right gutter stays `bg-background`.
 *
 * The `sidebar` node stays decoupled — it needs no `onNavigate` prop because the
 * drawer auto-closes here on pathname change. `lg:items-start` keeps the main
 * column at its content height so tall content doesn't get capped to the aside's
 * height (which would let the sticky footer overlap it).
 */
export function SidebarLayout({
  label,
  sidebar,
  children,
}: SidebarLayoutProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close the mobile drawer whenever the route changes, so a nav link click
  // dismisses it without the sidebar content needing to know about the drawer.
  // Adjusting state during render (the React-recommended pattern for resetting
  // state on a prop change) instead of an effect — no cascading-render lint, and
  // the drawer is closed in the same pass the new pathname renders.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (pathname !== drawerPath) {
    setDrawerPath(pathname);
    setOpen(false);
  }

  return (
    <div className="flex w-full grow flex-col overflow-x-clip">
      <div className="mx-auto flex w-full max-w-6xl grow flex-col px-3 sm:px-4 lg:flex-row lg:items-start">
        {/* Below lg, the aside collapses into a labeled drawer trigger. */}
        <div className="border-b border-border bg-card px-3 py-2 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Menu className="size-4" />
                {label} menu
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">{label} navigation</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>
        </div>

        <aside
          aria-label={label}
          className="relative hidden w-56 shrink-0 self-stretch border-r border-sidebar-border bg-sidebar text-sidebar-foreground before:absolute before:inset-y-0 before:right-full before:w-screen before:bg-sidebar before:content-[''] lg:block"
        >
          {/* Deliberately still `--header-height`, not the reader chrome pass's
              `--sticky-chrome-offset`: this kit component serves both sites, and
              only recipe's masthead follows that policy. Offsetting by the
              policy var would drop portfolio's sidebar to 0 under a masthead
              that is still pinned. Whoever gives portfolio's masthead
              `.sticky-chrome` should switch this in the same change. */}
          <div className="sticky top-[var(--header-height)]">{sidebar}</div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
