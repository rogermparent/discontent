"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentType } from "react";
import {
  Store,
  Palette,
  ListTree,
  FileText,
  FolderOpen,
  Download,
} from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Setup",
    items: [
      { name: "Site details", href: "/settings", icon: Store },
      { name: "Appearance", href: "/settings/theme", icon: Palette },
    ],
  },
  {
    label: "Content",
    items: [
      { name: "Works", href: "/projects", icon: FolderOpen },
      { name: "Pages", href: "/pages", icon: FileText },
      { name: "Navigation", href: "/menus", icon: ListTree },
    ],
  },
  {
    label: "System",
    items: [{ name: "Export", href: "/export", icon: Download }],
  },
];

/**
 * `/settings` must only be active on its exact path — otherwise it also lights
 * up on `/settings/theme` — while every other area matches its path or any
 * nested route, so `/menus/edit/header` keeps Navigation active.
 *
 * This replaces the old footer nav's `href.startsWith(pathname)`, which had the
 * operands the wrong way round: on `/` every item matched, and on
 * `/projects/edit/x` none did.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const labelClass =
  "px-3 font-mono text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground";
const rowClass =
  "flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60";

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col py-4">
      <p className={cn(labelClass, "mb-4")}>Settings</p>
      <nav className="flex-1 space-y-6 px-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className={labelClass}>{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      rowClass,
                      active &&
                        "border-primary bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
