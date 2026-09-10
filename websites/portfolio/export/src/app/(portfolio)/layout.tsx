import { AppLayout } from "portfolio-website-common/components/AppLayout";

/**
 * Reader-facing chrome in the static export. The same AppLayout the editor
 * renders, without the owner slot — `next-auth` is editor-only, so nothing in
 * this tree may reach for it.
 */
export default async function PortfolioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
