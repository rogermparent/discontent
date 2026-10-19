import Link from "next/link";
import getMenuBySlug from "@discontent/menus-collection/controller/data/read";
import { MenuItem } from "@discontent/menus-collection/controller/types";
import { ComponentType, ReactNode } from "react";
import {
  Mail,
  Globe,
  Instagram,
  Youtube,
  Twitter,
  Facebook,
  Github,
} from "lucide-react";
import {
  serializeThemeCss,
  type Theme,
} from "@discontent/component-library/theming";
// Promoted in portfolio-rebuild PR 01b so both sites get the same flash-free
// injection rather than each hand-rolling the script.
import { themePrePaintScript } from "@discontent/component-library/components/theming/prePaint";
import { AppProviders } from "./AppProviders";
import { stickyChromePrePaintScript } from "./stickyChrome";
import {
  getSiteConfig,
  type ContactLinks,
  type SiteFooterConfig,
} from "../../config/site";
import { HeaderNav, FooterNav, PhoneTabBar, type FooterColumn } from "./nav";
import { fontVariables } from "./fonts";
import { HOLIDAYS_HREF, SITE_NAV } from "./siteNav";
import { recipePages } from "../../controller/data/readRecipePages";
import { tagTermReads } from "../../controller/data/readTagTerms";
import { holidayChildren } from "../../controller/holidaysPage";

// Reader-facing default footer menu. Owner/management links (New Recipe,
// Settings, Content Sync, Sign In/Out) no longer live here — they render in the
// editor-only "Manage" column via `footerNavItems`, so the export footer stays
// reader-only by construction. Since the usability pass (U2) it is the
// masthead's destinations under the same labels, plus Search: no "Home" (the
// wordmark links home) and no owner-only Shopping.
const defaultFooterItems: MenuItem[] = [
  ...SITE_NAV.filter((item) => !item.ownerOnly).map(({ name, href }) => ({
    name,
    href,
  })),
  { name: "Search", href: "/search" },
];

/**
 * How many recipes the masthead's search field offers to search, or
 * `undefined` when there is no recipe index to ask — a reader never creates
 * one (F30), and a masthead must not take the page down over a label.
 */
async function readRecipeCount(): Promise<number | undefined> {
  try {
    return (await recipePages.readMeta()).total;
  } catch {
    return undefined;
  }
}

interface SiteHeaderProps {
  extraNavItems?: ReactNode;
  /** The signed-in owner also sees Shopping (U2). */
  isOwner?: boolean;
}

/*
 * The destinations themselves are `SITE_NAV` (U2): Recipes, Drinks, What can
 * I make?, Plans, Shopping (owner) and Saved. Groups (22f) and Bookmarks were
 * the masthead's two links before; every masthead change regenerates every
 * full-page visual baseline, because the masthead is on every page.
 */
async function SiteHeader({ extraNavItems, isOwner = false }: SiteHeaderProps) {
  const [headerMenu, recipeCount] = await Promise.all([
    getMenuBySlug<MenuItem>("header"),
    readRecipeCount(),
  ]);
  const { title } = getSiteConfig();

  // `sticky-chrome`, never `sticky` — the class reads the reader's
  // sticky-header policy from theme.css, and a `sticky` utility beside it would
  // out-rank the components layer and silently pin this forever.
  return (
    <header className="sticky-chrome top-0 z-40 h-[var(--header-height)] w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 print:hidden">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 md:justify-start sm:px-4 lg:gap-5">
        {/* Wordmark stays the page's h1 (kept from the old centered masthead so
            every index page still owns an h1), now left-aligned and inline with
            a lightweight ember-square mark instead of a logo asset. */}
        <h1 className="min-w-0 shrink-0 text-lg leading-none">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-display font-bold tracking-tight hover:text-primary"
          >
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-[0.25rem] bg-primary shadow-xs"
            />
            {title}
          </Link>
        </h1>
        <HeaderNav
          menuItems={headerMenu?.items ?? []}
          extraNavItems={extraNavItems}
          isOwner={isOwner}
          recipeCount={recipeCount}
        />
      </div>
    </header>
  );
}

/**
 * Turn the owner-editable footer menu into titled columns. A top-level item
 * *with children* becomes a column (its name → the heading, children → links);
 * flat items collect under a default "Browse" column, which is emitted first so
 * the primary reader destinations lead. Reuses the menus collection's existing
 * nested `children` — columns are an owner customization for free, no new model.
 */
function buildFooterColumns(items: MenuItem[]): FooterColumn[] {
  const browse: MenuItem[] = [];
  const columns: FooterColumn[] = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      columns.push({ title: item.name, links: item.children });
    } else {
      browse.push(item);
    }
  }
  return browse.length
    ? [{ title: "Browse", links: browse }, ...columns]
    : columns;
}

/** Known contact keys → their lucide icon, label, and href builder. */
const CONTACT_META: Record<
  keyof ContactLinks,
  {
    Icon: ComponentType<{ className?: string }>;
    label: string;
    href: (value: string) => string;
  }
> = {
  email: { Icon: Mail, label: "Email", href: (v) => `mailto:${v}` },
  website: { Icon: Globe, label: "Website", href: (v) => v },
  instagram: { Icon: Instagram, label: "Instagram", href: (v) => v },
  youtube: { Icon: Youtube, label: "YouTube", href: (v) => v },
  twitter: { Icon: Twitter, label: "Twitter / X", href: (v) => v },
  facebook: { Icon: Facebook, label: "Facebook", href: (v) => v },
  github: { Icon: Github, label: "GitHub", href: (v) => v },
};

const CONTACT_ORDER = Object.keys(CONTACT_META) as (keyof ContactLinks)[];

/** A small icon row of the owner's configured social/contact links. */
function FooterSocial({ contact }: { contact: ContactLinks }) {
  const entries = CONTACT_ORDER.filter((key) => contact[key]);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map((key) => {
        const { Icon, label, href } = CONTACT_META[key];
        return (
          <a
            key={key}
            href={href(contact[key] as string)}
            aria-label={label}
            title={label}
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
          >
            <Icon className="size-4" />
          </a>
        );
      })}
    </div>
  );
}

interface SiteFooterProps {
  /** Owner-only "Manage" column (editor app). Absent → reader-only footer. */
  ownerLinks?: ReactNode;
  /** Owner-configured footer note + contact links. */
  footer?: SiteFooterConfig;
}

/**
 * Whether the site has holidays (42e) — a `holidays` root with a child — so
 * the default footer links the almanac. A tree read the term pages already
 * cache; a site that has no tag index yet has no holidays, and a footer must
 * not take the page down over a link (F30: the read creates nothing).
 */
async function readHasHolidays(): Promise<boolean> {
  try {
    return holidayChildren(await tagTermReads.tree.read()).length > 0;
  } catch {
    return false;
  }
}

/**
 * The reader's default Browse column: `defaultFooterItems`, plus Holidays
 * after Drinks on a site that has them — so every fixture and site without
 * a `holidays` root keeps the footer it had.
 */
function withHolidays(items: MenuItem[], hasHolidays: boolean): MenuItem[] {
  if (!hasHolidays) return items;
  const at = items.findIndex((item) => item.href === "/drinks") + 1;
  return [
    ...items.slice(0, at),
    { name: "Holidays", href: HOLIDAYS_HREF },
    ...items.slice(at),
  ];
}

async function SiteFooter({ ownerLinks, footer }: SiteFooterProps) {
  const [footerMenu, hasHolidays] = await Promise.all([
    getMenuBySlug<MenuItem>("footer"),
    readHasHolidays(),
  ]);
  const footerItems =
    footerMenu?.items || withHolidays(defaultFooterItems, hasHolidays);
  const columns = buildFooterColumns(footerItems);
  const { title, description } = getSiteConfig();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto w-full border-t border-border bg-card print:hidden">
      <div className="mx-auto w-full max-w-6xl px-3 py-10 sm:px-4">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand block: ember mark + wordmark + clamped description + socials */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight hover:text-primary"
            >
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-[0.25rem] bg-primary shadow-xs"
              />
              {title}
            </Link>
            <p className="mt-3 line-clamp-3 max-w-xs text-sm text-muted-foreground">
              {description}
            </p>
            {footer?.contact && (
              <div className="mt-4">
                <FooterSocial contact={footer.contact} />
              </div>
            )}
          </div>

          <FooterNav columns={columns} />
          {ownerLinks}
        </div>

        {/* Colophon bar */}
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {title}
            {footer?.note ? <> · {footer.note}</> : null}
          </p>
          <p className="font-mono uppercase tracking-wider">
            Built on Content Engine
          </p>
        </div>
      </div>
    </footer>
  );
}

export interface AppLayoutProps {
  children: React.ReactNode;
  headerNavItems?: ReactNode;
  /** Owner-only "Manage" column for the footer (editor app only). */
  footerNavItems?: ReactNode;
  /** Owner-configured footer note + contact links (shared plumbing, PR 13). */
  footer?: SiteFooterConfig;
  /** Site-default theme (owner-persisted). SSR-injected flash-free. */
  theme?: Theme;
  /**
   * Whether the viewer is the site owner (signed-in editor). Drives the ⌘K
   * palette's owner "Go to" destinations. Serializable boolean → safe across the
   * server/client boundary. Export omits it → `false`, and owner destinations are
   * structurally impossible in the static build.
   */
  isOwner?: boolean;
  /** Editor-injected Sign In/Out palette item (absent in the reader export). */
  commandPaletteAuth?: ReactNode;
}

export async function AppLayout({
  children,
  headerNavItems,
  footerNavItems,
  footer,
  theme,
  isOwner = false,
  commandPaletteAuth,
}: AppLayoutProps) {
  const defaultMode = theme?.defaultMode ?? "system";
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="bg-background flex flex-col flex-nowrap items-center min-w-fit w-full">
        {/*
         * Site-default token overrides as the first child of <body> so they win
         * over styles/theme.css (same specificity, later in source order) for
         * both light and dark with no JS. Deterministic markup → no hydration
         * mismatch. The pre-paint script then layers any per-visitor override.
         */}
        {theme && (
          <style
            data-theme-default
            dangerouslySetInnerHTML={{ __html: serializeThemeCss(theme) }}
          />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: themePrePaintScript(defaultMode),
          }}
        />
        {/*
         * A second, separate script rather than one concatenated string, so the
         * two can be reviewed — and can fail — independently. This one exists
         * for scroll restoration, not flash: see stickyChrome.ts.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: stickyChromePrePaintScript(),
          }}
        />
        <AppProviders
          defaultMode={defaultMode}
          isOwner={isOwner}
          commandPaletteAuth={commandPaletteAuth}
        >
          <SiteHeader extraNavItems={headerNavItems} isOwner={isOwner} />
          {children}
          <SiteFooter ownerLinks={footerNavItems} footer={footer} />
          <PhoneTabBar />
        </AppProviders>
      </body>
    </html>
  );
}

export { SiteHeader, SiteFooter };
