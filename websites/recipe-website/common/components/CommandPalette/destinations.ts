import type { ComponentType } from "react";
import {
  Home,
  Search,
  Bookmark,
  UtensilsCrossed,
  Star,
  Layers,
  Store,
  Palette,
  ListTree,
  FileText,
  FolderSync,
  Download,
  Wrench,
  Database,
  FilePlus,
} from "lucide-react";

export type DestinationGroup = "Browse" | "Setup" | "Content" | "System";

export interface NavDestination {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  group: DestinationGroup;
  /** Rendered only when the viewer is the site owner (signed-in editor). */
  ownerOnly?: boolean;
  /** Extra terms folded into the palette's substring match. */
  keywords?: string[];
}

/**
 * The palette's static "Go to" destinations: reader routes always, owner routes
 * only when signed in. The owner entries intentionally *duplicate* editor's
 * `SettingsNav` `NAV_GROUPS` (same labels + icons) rather than importing them —
 * this module lives in `common/` (shared with the static `export` app), and
 * importing editor code here would invert the dependency so `export` couldn't
 * build. A later PR can flip it (editor→common is allowed) and have `SettingsNav`
 * read the owner subset from here. Keep the two lists in sync until then.
 */
export const NAV_DESTINATIONS: NavDestination[] = [
  // Reader destinations — present in both apps.
  { name: "Home", href: "/", icon: Home, group: "Browse", keywords: ["index"] },
  {
    name: "Search",
    href: "/search",
    icon: Search,
    group: "Browse",
    keywords: ["find", "recipes"],
  },
  {
    name: "Bookmarks",
    href: "/bookmarks",
    icon: Bookmark,
    group: "Browse",
    keywords: ["saved", "favorites"],
  },
  {
    name: "All recipes",
    href: "/recipes",
    icon: UtensilsCrossed,
    group: "Browse",
    keywords: ["list", "browse"],
  },
  {
    name: "Featured recipes",
    href: "/featured-recipes",
    icon: Star,
    group: "Browse",
    keywords: ["highlights"],
  },
  {
    name: "Groups",
    href: "/groups",
    icon: Layers,
    group: "Browse",
    keywords: ["meal plan", "meal plans", "collection", "collections"],
  },

  // Owner destinations — mirror editor's SettingsNav (NAV_GROUPS).
  {
    name: "New Recipe",
    href: "/new-recipe",
    icon: FilePlus,
    group: "Content",
    ownerOnly: true,
    keywords: ["create", "add"],
  },
  {
    name: "Site details",
    href: "/settings",
    icon: Store,
    group: "Setup",
    ownerOnly: true,
    keywords: ["settings"],
  },
  {
    name: "Appearance",
    href: "/settings/theme",
    icon: Palette,
    group: "Setup",
    ownerOnly: true,
    keywords: ["theme", "colors", "settings"],
  },
  {
    name: "Navigation",
    href: "/menus",
    icon: ListTree,
    group: "Content",
    ownerOnly: true,
    keywords: ["menus", "links"],
  },
  {
    name: "Pages",
    href: "/pages",
    icon: FileText,
    group: "Content",
    ownerOnly: true,
  },
  {
    name: "Content Sync",
    href: "/git",
    icon: FolderSync,
    group: "System",
    ownerOnly: true,
    keywords: ["git", "commit", "push"],
  },
  {
    name: "Export",
    href: "/export",
    icon: Download,
    group: "System",
    ownerOnly: true,
    keywords: ["static", "build"],
  },
  {
    name: "Tools",
    href: "/settings/tools",
    icon: Wrench,
    group: "System",
    ownerOnly: true,
    keywords: ["settings", "yt-dlp"],
  },
  {
    name: "Maintenance",
    href: "/settings/maintenance",
    icon: Database,
    group: "System",
    ownerOnly: true,
    keywords: ["settings", "database", "reindex"],
  },
];
