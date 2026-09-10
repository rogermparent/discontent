import { AppLayout } from "portfolio-website-common/components/AppLayout";
import { EditorNavExtras } from "@/components/EditorNavExtras";
import { readSettings } from "@/settings";

/**
 * Reader-facing chrome in the editor app. Same AppLayout the export renders,
 * plus the owner-only affordances — which are passed in as a slot rather than
 * imported inside `common/`, because `next-auth` is editor-only and `common/`
 * is compiled by the export app too.
 *
 * The saved theme is passed explicitly: the export reads the baked `SITE_THEME`,
 * but in the editor the owner needs to see what they just saved.
 */
export default async function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, contactLinks } = await readSettings();
  return (
    <AppLayout
      theme={theme}
      contactLinks={contactLinks}
      extraNavItems={<EditorNavExtras />}
    >
      {children}
    </AppLayout>
  );
}
