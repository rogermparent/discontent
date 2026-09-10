import Link from "next/link";
import { ComponentType, ReactNode } from "react";
import getMenuBySlug from "@discontent/menus-collection/controller/data/read";
import { MenuItem } from "@discontent/menus-collection/controller/types";
import { type Theme } from "@discontent/component-library/theming";
import { AppearanceMenu } from "@discontent/component-library/components/theming/Appearance";
import {
  getSiteConfig,
  getSiteContactLinks,
  type ContactLink,
} from "../../config/site";
import { PORTFOLIO_PRESETS } from "../../theme/presets";
import { ThemeShell } from "./ThemeShell";
import { CommandPaletteProvider } from "../CommandPalette";
import { PaletteTrigger } from "../CommandPalette/PaletteTrigger";

/**
 * Portfolio's masthead + footer.
 *
 * Replaces three overlapping chrome components (a SiteHeader, a SiteFooter
 * rendered by *both* the root and group layouts, and a separate settings
 * footer). One masthead, one footer.
 *
 * The design rule this armature exists to serve: personality lives here, not in
 * the content presentation. The masthead is where the wordmark, the mono
 * labels and the accent mark live, so the works themselves can be shown plainly
 * — untinted and unscrimmed. A gallery has architecture; the walls are white.
 */

const defaultHeaderItems: MenuItem[] = [
  { name: "Work", href: "/" },
  { name: "About", href: "/about" },
];

async function SiteMasthead({ extraNavItems }: { extraNavItems?: ReactNode }) {
  const headerMenu = await getMenuBySlug<MenuItem>("header");
  const headerItems = [...defaultHeaderItems, ...(headerMenu?.items || [])];
  const { title } = getSiteConfig();

  return (
    <header className="sticky top-0 z-40 h-[var(--header-height)] w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm font-display text-base font-semibold tracking-tight hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {/* The accent's one structural appearance in the chrome. Per the
              annotation-colour rule, accent marks — it never fills. */}
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[0.15rem] bg-primary"
          />
          {title}
        </Link>

        <nav className="flex items-center gap-1">
          {/* Plain <div>/<a> stack, deliberately not a <ul>: role="listitem"
              here would pollute unscoped getByRole("listitem") counts, which is
              the same trap documented in recipe's nav. */}
          {headerItems.map(({ href, name }) => (
            <Link
              key={href}
              href={href}
              className="rounded-sm px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {name}
            </Link>
          ))}
          <PaletteTrigger />
          {extraNavItems}
          <AppearanceMenu presets={PORTFOLIO_PRESETS} className="ml-1" />
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({
  children,
  contactLinks,
}: {
  children?: ReactNode;
  contactLinks?: ContactLink[];
}) {
  const { title } = getSiteConfig();
  const links = contactLinks ?? getSiteContactLinks();
  return (
    <footer className="mt-16 w-full border-t border-border print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        {links.length > 0 && (
          <nav
            aria-label="Contact"
            className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1"
          >
            {/*
              Plain labelled links. The version this replaces rendered an inline
              SVG read off disk by a form-supplied filename — an arbitrary file
              read and a stored-XSS sink at once. `rel="noopener noreferrer"`
              because these are owner-authored outbound links.
            */}
            {links.map(({ label, url }) => (
              <a
                key={`${label}-${url}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs uppercase tracking-widest text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {label}
              </a>
            ))}
          </nav>
        )}
        {children}
      </div>
    </footer>
  );
}

export interface AppLayoutProps {
  children: ReactNode;
  /**
   * Editor-only header extras. Absent in the export.
   *
   * Today that is sign in/out plus a "Manage" link (`EditorNavExtras`). This
   * used to promise "New Project" as well; no such affordance exists in the
   * masthead, and creating one lives behind Manage.
   */
  extraNavItems?: ReactNode;
  /** Editor-only footer extras. */
  footerExtras?: ReactNode;
  /** Injected so `next-auth` stays out of `common/`, which export also builds. */
  AuthSlot?: ComponentType;
  /**
   * The owner's saved theme. The editor passes it so a theme change is visible
   * immediately; the export passes nothing and falls back to the baked
   * `SITE_THEME`, which is what a published site should read.
   */
  theme?: Theme;
  /**
   * The owner's saved contact links. Same split as `theme`: the editor passes
   * what is saved, the export falls back to the baked `SITE_CONTACT`.
   */
  contactLinks?: ContactLink[];
}

/**
 * The shell both apps render.
 *
 * The theme is injected twice on purpose: an SSR <style> carrying the owner's
 * default so the first paint is already correct, and a blocking pre-paint script
 * that applies a *visitor's* saved override before paint. Without the script the
 * page paints the owner's theme and then flips.
 */
export async function AppLayout({
  children,
  extraNavItems,
  footerExtras,
  theme,
  contactLinks,
}: AppLayoutProps) {
  // No `getProjects()` here on purpose. Reading the index in the layout put it
  // on the critical path of *every* page — serialized into the HTML of every
  // exported page, and an LMDB open/close per request in the editor — to serve
  // a palette most readers never open. It fetches `/search/all` itself now.
  return (
    <ThemeShell theme={theme}>
      <CommandPaletteProvider>
        <SiteMasthead extraNavItems={extraNavItems} />
        <div className="flex w-full flex-1 flex-col">{children}</div>
        <SiteFooter contactLinks={contactLinks}>{footerExtras}</SiteFooter>
      </CommandPaletteProvider>
    </ThemeShell>
  );
}

export default AppLayout;
