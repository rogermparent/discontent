import type { Metadata } from "next";
import "./globals.css";
import { AppLayout } from "recipe-website-common/components/AppLayout";
import { getSiteConfig } from "recipe-website-common/config/site";
import { readSettings } from "@/settings";
import { auth } from "@/auth";
import { OwnerFooterLinks } from "./OwnerFooterLinks";
import { PaletteAuthItem } from "./PaletteAuthItem";

const { title, description } = getSiteConfig();

export const metadata: Metadata = {
  title,
  description,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme, footerNote, contact } = await readSettings();
  const session = await auth();
  const isOwner = !!session;
  return (
    <AppLayout
      theme={theme}
      footer={{ note: footerNote, contact }}
      footerNavItems={<OwnerFooterLinks />}
      isOwner={isOwner}
      commandPaletteAuth={<PaletteAuthItem isOwner={isOwner} />}
    >
      {children}
    </AppLayout>
  );
}
